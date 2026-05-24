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

const OBSERVED_ATTRIBUTES = ['src'] as const;
type ObservedAttribute = (typeof OBSERVED_ATTRIBUTES)[number];

const TEMPLATE_HTML = `
<style>
  :host {
    display: inline-block;
    position: relative;
    aspect-ratio: var(--xflip-aspect-ratio, 5 / 7);
    width: var(--xflip-width, 240px);
    contain: layout paint;
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
    object-fit: contain;
    display: block;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    border-radius: var(--xflip-radius, 14px);
    overflow: hidden;
  }
  .face.back { transform: rotateY(180deg); }
  .face[hidden] { display: none; }
  /* Built-in holographic overlay. Always on; opacity follows tilt magnitude
     so a card at rest stays calm and reveals shine on motion. */
  .holo {
    position: absolute;
    inset: 0;
    pointer-events: none;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    border-radius: var(--xflip-radius, 14px);
    mix-blend-mode: color-dodge;
    opacity: calc(var(--xflip-holo-strength, 0.55) * var(--xflip-tilt-magnitude, 0));
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
    transition: opacity var(--xflip-tilt-release, 400ms) ease-out;
  }
  :host([data-tilting]) .holo { transition: none; }
  .holo.back { transform: rotateY(180deg); }
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
      <div class="holo front" part="holo holo-front"></div>
      <img class="face back" part="face face-back" alt="" hidden />
      <div class="holo back" part="holo holo-back"></div>
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
  #onClick = (): void => {
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
    this.#setStatus(null);
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
    this.addEventListener('click', this.#onClick);
    this.addEventListener('pointermove', this.#onPointerMove);
    this.addEventListener('pointerleave', this.#onPointerLeave);
    this.addEventListener('pointercancel', this.#onPointerLeave);
    this.#maybeAttachGyro();
    if (this.src) this.#scheduleLoad(this.src);
  }

  disconnectedCallback(): void {
    this.removeEventListener('click', this.#onClick);
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
