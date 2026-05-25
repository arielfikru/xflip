import { decode, type ImageFormat, type XflipFile } from '@xflip/core';

/**
 * Tag name registered by {@link defineXflipCard} and {@link XflipCardElement.register}.
 *
 * The default custom element name. Consumers that need to avoid a clash with
 * an existing registration may pass a different tag to
 * {@link XflipCardElement.register}.
 */
export const XFLIP_CARD_TAG = 'xflip-card';

/** Detail payload of the `xflip-load` event. */
export interface XflipLoadEventDetail {
  file: XflipFile;
}

/** Detail payload of the `xflip-error` event. */
export interface XflipErrorEventDetail {
  error: Error;
}

/** Which face is currently presented on the stage. */
export type XflipFace = 'front' | 'back';

/** Built-in holographic overlay preset. */
export type XflipHoloPreset =
  | 'rainbow'
  | 'foil'
  | 'prism'
  | 'gold'
  | 'aurora'
  | 'galaxy'
  | 'emerald'
  | 'ruby'
  | 'ice'
  | 'pearl';

/** One stacked overlay slot. */
export interface XflipHoloLayer {
  preset: XflipHoloPreset;
  /** Multiplier on the slot's opacity (0..1). Default 1. */
  intensity?: number;
  /** Override the slot's CSS `mix-blend-mode`. Default = preset's own. */
  blend?: string;
}

const MAX_HOLO_SLOTS = 3;
const DEFAULT_HOLO_LAYERS: readonly XflipHoloLayer[] = [{ preset: 'rainbow', intensity: 1 }];
const HOLO_PRESETS: readonly XflipHoloPreset[] = [
  'rainbow',
  'foil',
  'prism',
  'gold',
  'aurora',
  'galaxy',
  'emerald',
  'ruby',
  'ice',
  'pearl',
];

function isHoloPreset(value: string): value is XflipHoloPreset {
  return (HOLO_PRESETS as readonly string[]).includes(value);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Read a holo layer config out of the file's META chunk, if present.
 *
 * META is expected to be a UTF-8 JSON object; the layered overlay spec
 * lives under the `holo` field as an array of `{ preset, intensity?,
 * blend? }` entries. Anything malformed returns `null` and the caller
 * falls back to the viewer default.
 */
function readHoloFromMeta(file: XflipFile): readonly XflipHoloLayer[] | null {
  const raw = file.ancillary?.get('META');
  if (!raw || raw.length === 0) return null;
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8').decode(raw));
  } catch {
    return null;
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const holo = (json as { holo?: unknown }).holo;
  if (!Array.isArray(holo)) return null;
  const out: XflipHoloLayer[] = [];
  for (const entry of holo) {
    if (!entry || typeof entry !== 'object') continue;
    const preset = (entry as { preset?: unknown }).preset;
    if (typeof preset !== 'string' || !isHoloPreset(preset)) continue;
    const layer: XflipHoloLayer = { preset };
    const intensity = (entry as { intensity?: unknown }).intensity;
    if (typeof intensity === 'number') layer.intensity = clamp01(intensity);
    const blend = (entry as { blend?: unknown }).blend;
    if (typeof blend === 'string') layer.blend = blend;
    out.push(layer);
  }
  // A valid `holo` array (even empty) is an explicit choice — honor it as
  // "no overlay" rather than falling back to the viewer default.
  return out;
}

const HEAD_FLAG_DEFAULT_BACK = 0x01;
const HEAD_FLAG_NO_FLIP_ANIM = 0x02;

/**
 * Normalization range (deg) for `deviceorientation` gamma/beta. A phone held
 * at ±this many degrees produces the full tilt magnitude; readings beyond
 * are clamped.
 */
const GYRO_RANGE_DEG = 30;

function makeBlobUrl(bytes: Uint8Array, format: ImageFormat): string {
  const mime = IMAGE_MIME[format] ?? 'application/octet-stream';
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
}

const IMAGE_MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  jxl: 'image/jxl',
  raw: 'application/octet-stream',
  custom: 'application/octet-stream',
};

const OBSERVED_ATTRIBUTES = ['src', 'holo'] as const;
type ObservedAttribute = (typeof OBSERVED_ATTRIBUTES)[number];

const TEMPLATE_HTML = `
<style>
  :host {
    display: inline-block;
    position: relative;
    aspect-ratio: var(--xflip-aspect-ratio, 5 / 7);
    width: var(--xflip-width, 240px);
    contain: layout;
    perspective: var(--xflip-perspective, 1200px);
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  :host([hidden]) { display: none; }
  :host([data-no-anim]) .flipper { transition: none; }
  .stage {
    width: 100%;
    height: 100%;
    position: relative;
    transform-style: preserve-3d;
  }
  .tilt {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    transform: rotateX(var(--xflip-tilt-x, 0deg)) rotateY(var(--xflip-tilt-y, 0deg));
    transition: transform var(--xflip-tilt-release, 400ms) ease-out;
    will-change: transform;
  }
  :host([data-tilting]) .tilt { transition: none; }
  .flipper {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    transition: transform var(--xflip-flip-duration, 600ms)
      var(--xflip-flip-easing, cubic-bezier(0.2, 0.8, 0.2, 1));
    transform: rotateY(0deg);
  }
  .flipper[data-face='back'] { transform: rotateY(180deg); }
  .face {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: var(--xflip-object-fit, cover);
    display: block;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    border-radius: var(--xflip-radius, 14px);
    overflow: hidden;
    background: var(--xflip-letterbox-bg, transparent);
  }
  .face.back { transform: rotateY(180deg); }
  .face[hidden] { display: none; }
  /* Built-in holographic overlay. Up to 3 stacked slots per face. Each slot
     picks its visual via data-preset and its intensity via per-element
     --xflip-holo-strength. Slot opacity follows tilt magnitude so a card
     at rest stays calm and reveals shine on motion. */
  .holo {
    position: absolute;
    inset: 0;
    pointer-events: none;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    border-radius: var(--xflip-radius, 14px);
    mix-blend-mode: var(--xflip-holo-blend, color-dodge);
    /* opacity = strength × (baseline + (1 − baseline) × tilt-magnitude).
       Slot stays partially visible at rest so intensity has an effect even
       without motion; tilt scales it the rest of the way to full. */
    opacity: calc(
      var(--xflip-holo-strength, 1) *
        (var(--xflip-holo-baseline, 0.25) + (1 - var(--xflip-holo-baseline, 0.25)) *
          var(--xflip-tilt-magnitude, 0))
    );
    transition: opacity var(--xflip-tilt-release, 400ms) ease-out;
  }
  :host([data-tilting]) .holo { transition: none; }
  .holo.back { transform: rotateY(180deg); }
  .holo[hidden] { display: none; }

  /* --- preset: rainbow (conic spectrum + sweep) --- */
  .holo[data-preset='rainbow'] {
    background:
      radial-gradient(
        circle at var(--xflip-pointer-px, 50%) var(--xflip-pointer-py, 50%),
        rgba(255, 255, 255, 0.85) 0%,
        rgba(255, 255, 255, 0.25) 18%,
        rgba(255, 255, 255, 0) 38%
      ),
      conic-gradient(
        from calc(var(--xflip-pointer-nx, 0) * 180deg) at 50% 50%,
        #ff5ad9 0deg,
        #ffd24a 60deg,
        #4ee0ff 120deg,
        #6effa6 180deg,
        #b18bff 240deg,
        #ff7a8a 300deg,
        #ff5ad9 360deg
      );
  }

  /* --- preset: foil (silver/white sweep, no chroma) --- */
  .holo[data-preset='foil'] {
    --xflip-holo-blend: screen;
    background:
      radial-gradient(
        circle at var(--xflip-pointer-px, 50%) var(--xflip-pointer-py, 50%),
        rgba(255, 255, 255, 0.9) 0%,
        rgba(255, 255, 255, 0.35) 30%,
        rgba(255, 255, 255, 0) 60%
      ),
      linear-gradient(
        calc(110deg + var(--xflip-pointer-nx, 0) * 25deg),
        rgba(40, 40, 50, 0) 0%,
        rgba(220, 220, 230, 0.5) 45%,
        rgba(255, 255, 255, 0.9) 50%,
        rgba(220, 220, 230, 0.5) 55%,
        rgba(40, 40, 50, 0) 100%
      );
  }

  /* --- preset: prism (spectrum bands shift across card with tilt) --- */
  .holo[data-preset='prism'] {
    --xflip-holo-blend: hard-light;
    background:
      radial-gradient(
        circle at var(--xflip-pointer-px, 50%) var(--xflip-pointer-py, 50%),
        rgba(255, 255, 255, 0.75) 0%,
        rgba(255, 255, 255, 0) 45%
      ),
      linear-gradient(
        115deg,
        rgba(255, 0, 128, 0) 0%,
        rgba(255, 0, 128, 0.85) 18%,
        rgba(255, 200, 0, 0.85) 32%,
        rgba(120, 255, 120, 0.85) 46%,
        rgba(0, 220, 255, 0.85) 60%,
        rgba(120, 80, 255, 0.85) 74%,
        rgba(255, 0, 128, 0) 92%
      );
    background-size:
      100% 100%,
      220% 220%;
    background-position:
      0 0,
      calc(50% + var(--xflip-pointer-nx, 0) * 60%)
        calc(50% + var(--xflip-pointer-ny, 0) * 60%);
  }

  /* --- preset: gold (warm copper sheen, dimmer mid) --- */
  .holo[data-preset='gold'] {
    --xflip-holo-blend: soft-light;
    background:
      radial-gradient(
        circle at var(--xflip-pointer-px, 50%) var(--xflip-pointer-py, 50%),
        rgba(255, 235, 175, 0.95) 0%,
        rgba(255, 200, 100, 0.4) 35%,
        rgba(120, 60, 20, 0) 70%
      ),
      conic-gradient(
        from calc(var(--xflip-pointer-nx, 0) * 90deg) at 50% 50%,
        #c98a2a 0deg,
        #ffd86b 90deg,
        #fff3b0 180deg,
        #b86a1a 270deg,
        #c98a2a 360deg
      );
  }

  /* --- preset: aurora (flowing green/teal/violet bands) --- */
  .holo[data-preset='aurora'] {
    --xflip-holo-blend: screen;
    background:
      radial-gradient(
        circle at var(--xflip-pointer-px, 50%) var(--xflip-pointer-py, 50%),
        rgba(220, 255, 240, 0.6) 0%,
        rgba(220, 255, 240, 0) 45%
      ),
      linear-gradient(
        calc(135deg + var(--xflip-pointer-nx, 0) * 40deg),
        rgba(0, 255, 170, 0) 0%,
        rgba(0, 255, 170, 0.55) 22%,
        rgba(0, 200, 255, 0.55) 42%,
        rgba(140, 100, 255, 0.55) 64%,
        rgba(0, 255, 170, 0) 88%
      );
    background-size:
      100% 100%,
      200% 200%;
    background-position:
      0 0,
      calc(50% + var(--xflip-pointer-nx, 0) * 50%)
        calc(50% + var(--xflip-pointer-ny, 0) * 50%);
  }

  /* --- preset: galaxy (deep nebula + bright core) --- */
  .holo[data-preset='galaxy'] {
    --xflip-holo-blend: screen;
    background:
      radial-gradient(
        circle at var(--xflip-pointer-px, 50%) var(--xflip-pointer-py, 50%),
        rgba(255, 255, 255, 0.85) 0%,
        rgba(190, 160, 255, 0.4) 14%,
        rgba(80, 40, 160, 0) 42%
      ),
      conic-gradient(
        from calc(var(--xflip-pointer-nx, 0) * 120deg) at
          calc(50% + var(--xflip-pointer-nx, 0) * 20%)
          calc(50% + var(--xflip-pointer-ny, 0) * 20%),
        #1a0b3d 0deg,
        #5b2a9e 70deg,
        #c14ad6 140deg,
        #3a6bd6 220deg,
        #1a0b3d 300deg,
        #1a0b3d 360deg
      );
  }

  /* --- preset: emerald (cool green sheen) --- */
  .holo[data-preset='emerald'] {
    --xflip-holo-blend: soft-light;
    background:
      radial-gradient(
        circle at var(--xflip-pointer-px, 50%) var(--xflip-pointer-py, 50%),
        rgba(210, 255, 225, 0.9) 0%,
        rgba(60, 220, 140, 0.4) 35%,
        rgba(10, 80, 50, 0) 70%
      ),
      conic-gradient(
        from calc(var(--xflip-pointer-nx, 0) * 90deg) at 50% 50%,
        #1f7a52 0deg,
        #4be0a0 90deg,
        #d6fff0 180deg,
        #157047 270deg,
        #1f7a52 360deg
      );
  }

  /* --- preset: ruby (deep red/magenta sheen) --- */
  .holo[data-preset='ruby'] {
    --xflip-holo-blend: soft-light;
    background:
      radial-gradient(
        circle at var(--xflip-pointer-px, 50%) var(--xflip-pointer-py, 50%),
        rgba(255, 215, 225, 0.9) 0%,
        rgba(255, 70, 120, 0.45) 35%,
        rgba(90, 10, 30, 0) 70%
      ),
      conic-gradient(
        from calc(var(--xflip-pointer-nx, 0) * 90deg) at 50% 50%,
        #8a1230 0deg,
        #ff4d7d 90deg,
        #ffd0dc 180deg,
        #b01030 270deg,
        #8a1230 360deg
      );
  }

  /* --- preset: ice (frosted blue glow + soft diagonal glint) --- */
  .holo[data-preset='ice'] {
    --xflip-holo-blend: screen;
    background:
      radial-gradient(
        ellipse 120% 90% at var(--xflip-pointer-px, 50%) var(--xflip-pointer-py, 50%),
        rgba(255, 255, 255, 0.9) 0%,
        rgba(180, 235, 255, 0.45) 22%,
        rgba(120, 200, 255, 0.15) 48%,
        rgba(80, 160, 230, 0) 75%
      ),
      linear-gradient(
        calc(105deg + var(--xflip-pointer-nx, 0) * 30deg),
        rgba(150, 220, 255, 0) 35%,
        rgba(220, 245, 255, 0.6) 49%,
        rgba(255, 255, 255, 0.85) 50%,
        rgba(220, 245, 255, 0.6) 51%,
        rgba(150, 220, 255, 0) 65%
      );
  }

  /* --- preset: pearl (soft iridescent white-pink-mint) --- */
  .holo[data-preset='pearl'] {
    --xflip-holo-blend: soft-light;
    background:
      radial-gradient(
        circle at var(--xflip-pointer-px, 50%) var(--xflip-pointer-py, 50%),
        rgba(255, 255, 255, 0.95) 0%,
        rgba(255, 255, 255, 0) 50%
      ),
      linear-gradient(
        calc(120deg + var(--xflip-pointer-nx, 0) * 30deg),
        rgba(255, 210, 235, 0.55) 0%,
        rgba(225, 235, 255, 0.55) 30%,
        rgba(210, 255, 240, 0.55) 55%,
        rgba(255, 240, 210, 0.55) 80%,
        rgba(255, 210, 235, 0.55) 100%
      );
    background-size:
      100% 100%,
      200% 200%;
    background-position:
      0 0,
      calc(50% + var(--xflip-pointer-nx, 0) * 45%)
        calc(50% + var(--xflip-pointer-ny, 0) * 45%);
  }
  .status {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font: 12px/1.4 system-ui, sans-serif;
    color: var(--xflip-status-color, #888);
    pointer-events: none;
  }
  .status[hidden] { display: none; }
  @media (prefers-reduced-motion: reduce) {
    .flipper, .tilt, .holo { transition: none; }
  }
</style>
<div class="stage" part="stage">
  <div class="tilt" part="tilt">
    <div class="flipper" part="flipper" data-face="front">
      <img class="face front" part="face face-front" alt="" hidden />
      <div class="holo front" part="holo holo-front" data-slot="0" hidden></div>
      <div class="holo front" part="holo holo-front" data-slot="1" hidden></div>
      <div class="holo front" part="holo holo-front" data-slot="2" hidden></div>
      <img class="face back" part="face face-back" alt="" hidden />
      <div class="holo back" part="holo holo-back" data-slot="0" hidden></div>
      <div class="holo back" part="holo holo-back" data-slot="1" hidden></div>
      <div class="holo back" part="holo holo-back" data-slot="2" hidden></div>
    </div>
  </div>
</div>
<div class="status" part="status" aria-live="polite"></div>
`;

/**
 * `<xflip-card>` web component.
 *
 * Renders a two-sided card decoded from an `.xflip` byte stream and applies a
 * built-in holographic sheen reactive to pointer / device tilt.
 *
 * @example
 * ```html
 * <xflip-card src="./hero.xflip"></xflip-card>
 * ```
 */
export class XflipCardElement extends HTMLElement {
  static readonly observedAttributes = OBSERVED_ATTRIBUTES;

  static register(tagName: string = XFLIP_CARD_TAG): void {
    const existing = customElements.get(tagName);
    if (existing === XflipCardElement) return;
    if (existing) {
      throw new Error(`<${tagName}> is already registered to a different constructor`);
    }
    if (XflipCardElement.#registeredTag !== null) {
      throw new Error(
        `XflipCardElement is already registered as <${XflipCardElement.#registeredTag}>`,
      );
    }
    customElements.define(tagName, XflipCardElement);
    XflipCardElement.#registeredTag = tagName;
  }

  static #registeredTag: string | null = null;

  /**
   * Maximum tilt magnitude (degrees) applied at the corners of the host on
   * pointer move. Set to 0 to disable tilt without removing listeners.
   */
  tiltMax = 8;

  #file: XflipFile | null = null;
  #flipper: HTMLDivElement;
  #frontImg: HTMLImageElement;
  #backImg: HTMLImageElement;
  #status: HTMLDivElement;
  #holoSlots: { front: HTMLDivElement[]; back: HTMLDivElement[] };
  #holoLayers: readonly XflipHoloLayer[] = DEFAULT_HOLO_LAYERS;
  #holoOverride = false;
  #abort: AbortController | null = null;
  #loadToken = 0;
  #currentFace: XflipFace = 'front';
  #blobUrls: { front: string | null; back: string | null } = {
    front: null,
    back: null,
  };
  #tiltRaf = 0;
  #tiltPending: { x: number; y: number } | null = null;
  #gyroAttached = false;
  #gyroGranted = false;
  #onDblClick = (): void => {
    if (this.#file) this.toggleFace();
  };
  #onPointerMove = (ev: PointerEvent): void => {
    if (this.tiltMax <= 0) return;
    if (this.#animationsDisabled()) return;
    const rect = this.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((ev.clientY - rect.top) / rect.height) * 2 - 1;
    this.#queueTilt(nx, ny);
  };
  #onPointerLeave = (): void => {
    this.#releaseTilt();
  };
  #onDeviceOrientation = (ev: DeviceOrientationEvent): void => {
    if (this.tiltMax <= 0) return;
    if (this.#animationsDisabled()) return;
    if (ev.gamma === null || ev.beta === null) return;
    const nx = ev.gamma / GYRO_RANGE_DEG;
    const ny = ev.beta / GYRO_RANGE_DEG;
    this.#queueTilt(nx, ny);
  };

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = TEMPLATE_HTML;
    this.#flipper = root.querySelector('.flipper') as HTMLDivElement;
    this.#frontImg = root.querySelector('.face.front') as HTMLImageElement;
    this.#backImg = root.querySelector('.face.back') as HTMLImageElement;
    this.#status = root.querySelector('.status') as HTMLDivElement;
    this.#holoSlots = {
      front: Array.from(root.querySelectorAll('.holo.front')) as HTMLDivElement[],
      back: Array.from(root.querySelectorAll('.holo.back')) as HTMLDivElement[],
    };
    this.#applyHoloLayers();
    this.#setStatus(null);
  }

  /**
   * Stacked holographic overlay layers (up to 3). Each layer picks a
   * preset and an optional intensity / blend override. Assigning a new
   * array re-renders the overlay slots; pass `[]` to disable. Assigning
   * `null` clears the override and lets the loaded file's META config (if
   * any) drive the overlay.
   */
  get holoLayers(): readonly XflipHoloLayer[] {
    return this.#holoLayers;
  }
  set holoLayers(layers: readonly XflipHoloLayer[] | null) {
    if (layers === null) {
      this.#holoOverride = false;
      // Re-read from the current file if loaded; otherwise fall back to
      // the static default so the viewer doesn't go blank.
      const fromMeta = this.#file ? readHoloFromMeta(this.#file) : null;
      this.#holoLayers = (fromMeta ?? DEFAULT_HOLO_LAYERS).slice(0, MAX_HOLO_SLOTS);
      this.#applyHoloLayers();
      return;
    }
    this.#holoOverride = true;
    this.#holoLayers = layers.slice(0, MAX_HOLO_SLOTS);
    this.#applyHoloLayers();
  }

  #applyHoloLayers(): void {
    // Holo overlay is a front-face treatment only; the card back stays matte.
    for (const face of ['front'] as const) {
      const slots = this.#holoSlots[face];
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (!slot) continue;
        const layer = this.#holoLayers[i];
        if (!layer) {
          slot.hidden = true;
          slot.removeAttribute('data-preset');
          slot.style.removeProperty('--xflip-holo-strength');
          slot.style.removeProperty('mix-blend-mode');
          continue;
        }
        slot.hidden = false;
        slot.dataset.preset = layer.preset;
        const intensity = clamp01(layer.intensity ?? 1);
        slot.style.setProperty('--xflip-holo-strength', intensity.toFixed(3));
        if (layer.blend) slot.style.setProperty('mix-blend-mode', layer.blend);
        else slot.style.removeProperty('mix-blend-mode');
      }
    }
  }

  get file(): XflipFile | null {
    return this.#file;
  }

  get face(): XflipFace {
    return this.#currentFace;
  }

  showFace(face: XflipFace): void {
    if (this.#currentFace === face) return;
    this.#currentFace = face;
    this.#flipper.dataset.face = face;
  }

  toggleFace(): void {
    this.showFace(this.#currentFace === 'front' ? 'back' : 'front');
  }

  get src(): string | null {
    return this.getAttribute('src');
  }
  set src(value: string | null) {
    if (value === null) this.removeAttribute('src');
    else this.setAttribute('src', value);
  }

  connectedCallback(): void {
    this.addEventListener('dblclick', this.#onDblClick);
    this.addEventListener('pointermove', this.#onPointerMove);
    this.addEventListener('pointerleave', this.#onPointerLeave);
    this.addEventListener('pointercancel', this.#onPointerLeave);
    this.#maybeAttachGyro();
    if (this.src) this.#scheduleLoad(this.src);
  }

  disconnectedCallback(): void {
    this.removeEventListener('dblclick', this.#onDblClick);
    this.removeEventListener('pointermove', this.#onPointerMove);
    this.removeEventListener('pointerleave', this.#onPointerLeave);
    this.removeEventListener('pointercancel', this.#onPointerLeave);
    this.#detachGyro();
    if (this.#tiltRaf) {
      cancelAnimationFrame(this.#tiltRaf);
      this.#tiltRaf = 0;
    }
    this.#cancelInFlight();
    this.#revokeBlobs();
  }

  async enableGyroscope(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const ctor = (
      window as unknown as {
        DeviceOrientationEvent?: { requestPermission?: () => Promise<'granted' | 'denied'> };
      }
    ).DeviceOrientationEvent;
    if (!ctor) return false;
    if (typeof ctor.requestPermission === 'function') {
      try {
        const result = await ctor.requestPermission();
        if (result !== 'granted') return false;
      } catch {
        return false;
      }
    }
    this.#gyroGranted = true;
    this.#maybeAttachGyro();
    return this.#gyroAttached;
  }

  attributeChangedCallback(
    name: ObservedAttribute,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    if (oldValue === newValue) return;
    if (name === 'src') {
      this.#cancelInFlight();
      if (newValue === null) this.#clear();
      else if (this.isConnected) this.#scheduleLoad(newValue);
    } else if (name === 'holo') {
      // Legacy single-preset attribute: drives slot 0 only.
      if (newValue === null || newValue === '' || newValue === 'none') {
        this.holoLayers = [];
      } else if (isHoloPreset(newValue)) {
        this.holoLayers = [{ preset: newValue, intensity: 1 }];
      }
    }
  }

  #scheduleLoad(src: string): void {
    const controller = new AbortController();
    this.#abort = controller;
    const token = ++this.#loadToken;
    this.#setStatus('loading…');
    void this.#load(src, controller.signal, token);
  }

  async #load(src: string, signal: AbortSignal, token: number): Promise<void> {
    try {
      const res = await fetch(src, { signal });
      if (signal.aborted || token !== this.#loadToken) return;
      if (!res.ok) {
        throw new Error(`fetch failed: HTTP ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      if (signal.aborted || token !== this.#loadToken) return;
      const file = decode(new Uint8Array(buf));
      if (signal.aborted || token !== this.#loadToken) return;
      this.#adoptFile(file);
      this.#setStatus(null);
      this.dispatchEvent(new CustomEvent('xflip-load', { detail: { file }, bubbles: true }));
    } catch (err) {
      if (signal.aborted || token !== this.#loadToken) return;
      const error = err instanceof Error ? err : new Error(String(err));
      this.#resetFile();
      this.#setStatus(`error: ${error.message}`);
      this.dispatchEvent(new CustomEvent('xflip-error', { detail: { error }, bubbles: true }));
    }
  }

  #adoptFile(file: XflipFile): void {
    this.#revokeBlobs();
    this.#file = file;
    this.#blobUrls.front = makeBlobUrl(file.front, file.head.frontFormat);
    this.#blobUrls.back = makeBlobUrl(file.back, file.head.backFormat);

    this.#frontImg.src = this.#blobUrls.front;
    this.#frontImg.hidden = false;
    this.#backImg.src = this.#blobUrls.back;
    this.#backImg.hidden = false;

    const noAnim = (file.head.flags & HEAD_FLAG_NO_FLIP_ANIM) !== 0;
    this.toggleAttribute('data-no-anim', noAnim);

    this.#currentFace =
      (file.head.flags & HEAD_FLAG_DEFAULT_BACK) === HEAD_FLAG_DEFAULT_BACK ? 'back' : 'front';
    this.#flipper.dataset.face = this.#currentFace;

    // Pick up holo config from META chunk if the caller hasn't pinned its
    // own. `holoOverride === true` means the user / framework explicitly set
    // `holoLayers` and the file's META should be ignored.
    if (!this.#holoOverride) {
      const fromMeta = readHoloFromMeta(file);
      if (fromMeta) {
        this.#holoLayers = fromMeta.slice(0, MAX_HOLO_SLOTS);
        this.#applyHoloLayers();
      }
    }

    this.#maybeAttachGyro();
  }

  #maybeAttachGyro(): void {
    if (this.#gyroAttached) return;
    if (typeof window === 'undefined') return;
    const ctor = (
      window as unknown as {
        DeviceOrientationEvent?: { requestPermission?: () => Promise<'granted' | 'denied'> };
      }
    ).DeviceOrientationEvent;
    if (!ctor) return;
    if (typeof ctor.requestPermission === 'function' && !this.#gyroGranted) return;
    window.addEventListener('deviceorientation', this.#onDeviceOrientation);
    this.#gyroAttached = true;
  }

  #detachGyro(): void {
    if (!this.#gyroAttached) return;
    if (typeof window === 'undefined') return;
    window.removeEventListener('deviceorientation', this.#onDeviceOrientation);
    this.#gyroAttached = false;
  }

  #resetFile(): void {
    this.#revokeBlobs();
    this.#file = null;
    this.#frontImg.hidden = true;
    this.#frontImg.removeAttribute('src');
    this.#backImg.hidden = true;
    this.#backImg.removeAttribute('src');
    this.removeAttribute('data-no-anim');
    this.#currentFace = 'front';
    this.#flipper.dataset.face = 'front';
  }

  #revokeBlobs(): void {
    if (this.#blobUrls.front) {
      URL.revokeObjectURL(this.#blobUrls.front);
      this.#blobUrls.front = null;
    }
    if (this.#blobUrls.back) {
      URL.revokeObjectURL(this.#blobUrls.back);
      this.#blobUrls.back = null;
    }
  }

  #animationsDisabled(): boolean {
    if (this.#file && (this.#file.head.flags & HEAD_FLAG_NO_FLIP_ANIM) !== 0) return true;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  #queueTilt(nx: number, ny: number): void {
    this.#tiltPending = {
      x: Math.max(-1, Math.min(1, nx)),
      y: Math.max(-1, Math.min(1, ny)),
    };
    this.#scheduleTilt();
  }

  #releaseTilt(): void {
    this.#tiltPending = null;
    if (this.#tiltRaf) {
      cancelAnimationFrame(this.#tiltRaf);
      this.#tiltRaf = 0;
    }
    this.removeAttribute('data-tilting');
    this.style.setProperty('--xflip-tilt-x', '0deg');
    this.style.setProperty('--xflip-tilt-y', '0deg');
    this.style.setProperty('--xflip-pointer-nx', '0');
    this.style.setProperty('--xflip-pointer-ny', '0');
    this.style.setProperty('--xflip-pointer-px', '50%');
    this.style.setProperty('--xflip-pointer-py', '50%');
    this.style.setProperty('--xflip-tilt-magnitude', '0');
  }

  #scheduleTilt(): void {
    if (this.#tiltRaf) return;
    this.#tiltRaf = requestAnimationFrame(() => {
      this.#tiltRaf = 0;
      if (!this.#tiltPending) return;
      const { x, y } = this.#tiltPending;
      this.setAttribute('data-tilting', '');
      this.style.setProperty('--xflip-tilt-x', `${(-y * this.tiltMax).toFixed(2)}deg`);
      this.style.setProperty('--xflip-tilt-y', `${(x * this.tiltMax).toFixed(2)}deg`);
      this.style.setProperty('--xflip-pointer-nx', x.toFixed(3));
      this.style.setProperty('--xflip-pointer-ny', y.toFixed(3));
      this.style.setProperty('--xflip-pointer-px', `${(((x + 1) / 2) * 100).toFixed(2)}%`);
      this.style.setProperty('--xflip-pointer-py', `${(((y + 1) / 2) * 100).toFixed(2)}%`);
      // Magnitude (0..1) drives holo opacity. Use max(|x|,|y|) so corner
      // pointer position lights the sheen fully without easing artifacts.
      const mag = Math.min(1, Math.max(Math.abs(x), Math.abs(y)));
      this.style.setProperty('--xflip-tilt-magnitude', mag.toFixed(3));
    });
  }

  #cancelInFlight(): void {
    if (this.#abort) {
      this.#abort.abort();
      this.#abort = null;
    }
  }

  #clear(): void {
    this.#resetFile();
    this.#setStatus(null);
  }

  #setStatus(text: string | null): void {
    if (text === null) {
      this.#status.hidden = true;
      this.#status.textContent = '';
      return;
    }
    this.#status.hidden = false;
    this.#status.textContent = text;
  }
}
