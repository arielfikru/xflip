import {
  type BlendMode,
  decode,
  type ImageFormat,
  samplePose,
  type XflipFile,
  type XflipHefx,
  type XflipLayer,
  type XflipLayerChunk,
  type XflipPose,
} from '@xflip/core';

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

/**
 * Bits of `XflipHead.flags` per spec v0.2 §4.1.
 *
 * - `DEFAULT_BACK` (bit 0): card opens showing the back face.
 * - `NO_FLIP_ANIM` (bit 1): renderers should skip the flip animation.
 */
const HEAD_FLAG_DEFAULT_BACK = 0x01;
const HEAD_FLAG_NO_FLIP_ANIM = 0x02;

/**
 * Normalization range (deg) for `deviceorientation` gamma/beta. A phone held
 * at ±this many degrees produces the full tilt magnitude; readings beyond
 * are clamped. Picked to match the comfort range of a one-handed phone
 * wrist roll without forcing the user to flip the device upside down.
 */
const GYRO_RANGE_DEG = 30;

/**
 * MIME types for the formats `<img>` can render natively. Unknown or
 * non-image formats (`raw`, `custom`, future codecs) fall back to
 * `application/octet-stream`, which most browsers refuse to render — the
 * fallback layer paints nothing in that case.
 */
function makeBlobUrl(bytes: Uint8Array, format: ImageFormat): string {
  const mime = IMAGE_MIME[format] ?? 'application/octet-stream';
  // BlobPart in lib.dom narrows ArrayBufferView to ArrayBuffer-backed views;
  // Uint8Array<ArrayBufferLike> is structurally compatible at runtime.
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
}

/**
 * Map xflip blend mode names to CSS `mix-blend-mode` values per spec v0.2
 * Appendix B. `add` maps to `plus-lighter` (modern equivalent). `custom`
 * has no CSS analog — fall back to `normal` and rely on `data-blend-mode`
 * for selector-based styling.
 */
const BLEND_MODE_CSS: Record<BlendMode, string> = {
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  add: 'plus-lighter',
  color_dodge: 'color-dodge',
  color_burn: 'color-burn',
  soft_light: 'soft-light',
  hard_light: 'hard-light',
  difference: 'difference',
  luminosity: 'luminosity',
  custom: 'normal',
};

const IMAGE_MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  jxl: 'image/jxl',
  raw: 'application/octet-stream',
  custom: 'application/octet-stream',
};

/**
 * Observed attributes for `<xflip-card>`.
 *
 * `src` — URL of an `.xflip` file to fetch and render. Changing it triggers a
 * reload. Unsetting it clears the rendered content.
 */
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
  }
  .face.back { transform: rotateY(180deg); }
  .face[hidden] { display: none; }
  .layers {
    position: absolute;
    inset: 0;
    pointer-events: none;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    /* Keep parallax-translated layers visually inside the card. Using
       clip-path instead of overflow:hidden because the parent uses
       transform-style: preserve-3d, which breaks the latter in some
       engines. */
    clip-path: inset(0);
  }
  .layers.back { transform: rotateY(180deg); }
  .layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    will-change: transform, opacity;
    transform:
      translate3d(
        calc(var(--xflip-pointer-nx, 0) * var(--xflip-layer-offset-x, 0px)),
        calc(var(--xflip-pointer-ny, 0) * var(--xflip-layer-offset-y, 0px)),
        0
      )
      rotate(calc(var(--xflip-pointer-nx, 0) * var(--xflip-layer-rotation-max, 0deg)));
    transition: transform var(--xflip-tilt-release, 400ms) ease-out;
  }
  :host([data-tilting]) .layer { transition: none; }
  /* Pose-rigged layers: JS drives transform directly via samplePose */
  .layer[data-has-pose] {
    transform: none;
    transition: none;
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
    .flipper, .tilt { transition: none; }
  }
</style>
<div class="stage" part="stage">
  <div class="tilt" part="tilt">
    <div class="flipper" part="flipper" data-face="front">
      <img class="face front" part="face face-front" alt="" hidden />
      <div class="layers front" part="layers layers-front"></div>
      <img class="face back" part="face face-back" alt="" hidden />
      <div class="layers back" part="layers layers-back"></div>
    </div>
  </div>
</div>
<div class="status" part="status" aria-live="polite"></div>
`;

/**
 * `<xflip-card>` web component.
 *
 * @remarks
 * This element is the rendering surface only. Decoding is delegated to
 * `@xflip/core`. Phase P3.1 ships the shell: shadow DOM, attribute plumbing,
 * a status region, and lifecycle hooks. Fetch, decode, and rendering land in
 * subsequent P3 tasks.
 *
 * @example
 * ```html
 * <xflip-card src="./hero.xflip"></xflip-card>
 * ```
 */
export class XflipCardElement extends HTMLElement {
  static readonly observedAttributes = OBSERVED_ATTRIBUTES;

  /**
   * Register this element under `tagName` (defaults to `xflip-card`).
   *
   * Safe to call multiple times: a no-op if the tag is already registered.
   * Throws if the tag is registered to a different constructor.
   */
  static register(tagName: string = XFLIP_CARD_TAG): void {
    const existing = customElements.get(tagName);
    if (existing === XflipCardElement) return;
    if (existing) {
      throw new Error(`<${tagName}> is already registered to a different constructor`);
    }
    // The same constructor can only be registered once per registry; refuse a
    // second tag instead of letting the registry throw a generic DOMException.
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
  #frontLayersBox: HTMLDivElement;
  #backLayersBox: HTMLDivElement;
  #status: HTMLDivElement;
  #abort: AbortController | null = null;
  #loadToken = 0;
  #currentFace: XflipFace = 'front';
  #blobUrls: { front: string | null; back: string | null } = {
    front: null,
    back: null,
  };
  #layerBlobUrls: string[] = [];
  #hefxDataKeys: string[] = [];
  #poseLayers: Array<{ el: HTMLImageElement; pose: XflipPose; baseOpacity: number }> = [];
  #tiltRaf = 0;
  #tiltPending: { x: number; y: number } | null = null;
  #gyroAttached = false;
  #gyroGranted = false;
  #gyroModeAllowed = true;
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
  // Map device orientation to the same tilt pipeline as the pointer.
  // gamma (left/right roll, -90..90) drives x; beta (front/back, -180..180)
  // drives y. Clamp to ±GYRO_RANGE so a held phone at rest doesn't max-tilt.
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
    this.#frontLayersBox = root.querySelector('.layers.front') as HTMLDivElement;
    this.#backLayersBox = root.querySelector('.layers.back') as HTMLDivElement;
    this.#status = root.querySelector('.status') as HTMLDivElement;
    this.#setStatus(null);
  }

  /**
   * The decoded file currently held by the element, or `null` when no source
   * has loaded yet.
   *
   * Read-only; the element owns the decode lifecycle.
   */
  get file(): XflipFile | null {
    return this.#file;
  }

  /** Which face is currently presented. */
  get face(): XflipFace {
    return this.#currentFace;
  }

  /**
   * Swap the visible face. No-op if no file is loaded yet.
   *
   * Triggers the CSS 3D flip transition unless `NO_FLIP_ANIM` (head flag
   * bit 1) is set on the loaded file or the user has
   * `prefers-reduced-motion: reduce`.
   */
  showFace(face: XflipFace): void {
    if (this.#currentFace === face) return;
    this.#currentFace = face;
    this.#flipper.dataset.face = face;
  }

  /** Toggle between front and back. */
  toggleFace(): void {
    this.showFace(this.#currentFace === 'front' ? 'back' : 'front');
  }

  /** Source URL. Mirrors the `src` attribute. */
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
    // Object URLs are tied to the document; revoke so detached elements
    // don't leak. A subsequent reconnect with the same src will re-fetch.
    this.#revokeBlobs();
  }

  /**
   * Request access to device orientation events (gyroscope tilt).
   *
   * @remarks
   * On iOS Safari, `DeviceOrientationEvent.requestPermission()` must be
   * invoked from a user gesture (click/tap handler) — call this from a
   * button's `onclick`. On other browsers, returns `true` immediately and
   * the listener is attached on connect.
   *
   * @returns `true` if the listener is now attached, `false` if denied or
   *   unsupported.
   */
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
    this.#frontLayersBox.replaceChildren();
    this.#backLayersBox.replaceChildren();
    this.#clearHefxVars();
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

    if (file.frontLayers) this.#renderLayers(this.#frontLayersBox, file.frontLayers);
    if (file.backLayers) this.#renderLayers(this.#backLayersBox, file.backLayers);
    if (file.effects) this.#applyHefx(file.effects);
    // Gate gyroscope by interaction_modes if the file declares them.
    // Absent list → permissive. Present list → opt-in.
    const modes = file.effects?.interaction_modes;
    this.#gyroModeAllowed = !modes || modes.includes('gyroscope');
    if (this.#gyroModeAllowed) this.#maybeAttachGyro();
    else this.#detachGyro();
  }

  #maybeAttachGyro(): void {
    if (this.#gyroAttached) return;
    if (!this.#gyroModeAllowed) return;
    if (typeof window === 'undefined') return;
    const ctor = (
      window as unknown as {
        DeviceOrientationEvent?: { requestPermission?: () => Promise<'granted' | 'denied'> };
      }
    ).DeviceOrientationEvent;
    if (!ctor) return;
    // iOS exposes requestPermission(); defer attach until the caller
    // invokes enableGyroscope() from a user gesture and gets 'granted'.
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

  #renderLayers(host: HTMLDivElement, chunk: XflipLayerChunk): void {
    // Spec §5.6: lower zOrder = drawn first (bottom). DOM order paints
    // earlier siblings under later ones, so ascending zOrder is correct.
    const sorted = [...chunk.layers].sort((a, b) => a.zOrder - b.zOrder);
    for (const layer of sorted) {
      host.append(this.#buildLayer(layer));
    }
  }

  #buildLayer(layer: XflipLayer): HTMLImageElement {
    const img = document.createElement('img');
    img.className = 'layer';
    img.setAttribute('part', 'layer');
    img.alt = '';
    img.decoding = 'async';
    const url = makeBlobUrl(layer.imageData, layer.format);
    this.#layerBlobUrls.push(url);
    img.src = url;
    img.dataset.layerId = String(layer.layerId);
    img.dataset.blendMode = layer.blendMode;
    img.dataset.effectType = layer.effectType;
    const baseOpacity = layer.opacity / 255;
    img.style.opacity = baseOpacity.toFixed(3);
    img.style.mixBlendMode = BLEND_MODE_CSS[layer.blendMode];
    if (layer.pose) {
      img.dataset.hasPose = '';
      this.#poseLayers.push({ el: img, pose: layer.pose, baseOpacity });
      // Apply neutral pose immediately so layer has correct transform before first tilt.
      this.#applyPoseToElement(img, layer.pose, 0, 0, baseOpacity);
    } else {
      this.#applyLayerResponse(img, layer);
    }
    return img;
  }

  #applyPoseToElement(
    el: HTMLImageElement,
    pose: XflipPose,
    nx: number,
    ny: number,
    baseOpacity: number,
  ): void {
    const kf = samplePose(pose, nx, ny);
    el.style.transform = [
      'perspective(800px)',
      `translate3d(${kf.tx.toFixed(2)}px, ${kf.ty.toFixed(2)}px, 0)`,
      `rotateY(${kf.rotationRad.toFixed(4)}rad)`,
      `scale(${kf.scale.toFixed(4)})`,
    ].join(' ');
    el.style.opacity = (baseOpacity * kf.opacity).toFixed(3);
  }

  #applyPoseLayers(nx: number, ny: number): void {
    for (const { el, pose, baseOpacity } of this.#poseLayers) {
      this.#applyPoseToElement(el, pose, nx, ny, baseOpacity);
    }
  }

  #applyLayerResponse(img: HTMLImageElement, layer: XflipLayer): void {
    const r = layer.response;
    if (r.input_source) img.dataset.inputSource = r.input_source;
    if (r.response_axis) img.dataset.responseAxis = r.response_axis;
    if (r.response_curve) img.dataset.responseCurve = r.response_curve;
    if (typeof r.intensity === 'number') {
      img.style.setProperty('--xflip-layer-intensity', r.intensity.toString());
    }
    if (typeof r.offset_max_x === 'number') {
      img.style.setProperty('--xflip-layer-offset-x', `${r.offset_max_x}px`);
    }
    if (typeof r.offset_max_y === 'number') {
      img.style.setProperty('--xflip-layer-offset-y', `${r.offset_max_y}px`);
    }
    if (typeof r.rotation_max === 'number') {
      img.style.setProperty('--xflip-layer-rotation-max', `${r.rotation_max}deg`);
    }
    if (typeof r.phase_offset === 'number') {
      img.style.setProperty('--xflip-layer-phase-offset', r.phase_offset.toString());
    }
    if (typeof r.frequency === 'number') {
      img.style.setProperty('--xflip-layer-frequency', r.frequency.toString());
    }
  }

  #applyHefx(hefx: XflipHefx): void {
    if (typeof hefx.tilt_sensitivity === 'number') {
      this.style.setProperty('--xflip-tilt-sensitivity', hefx.tilt_sensitivity.toString());
    }
    if (typeof hefx.tilt_max_angle === 'number') {
      this.style.setProperty('--xflip-tilt-max-angle', `${hefx.tilt_max_angle}deg`);
    }
    if (typeof hefx.perspective === 'number') {
      this.style.setProperty('--xflip-perspective', `${hefx.perspective}px`);
    }
    if (typeof hefx.ambient_intensity === 'number') {
      this.style.setProperty('--xflip-ambient-intensity', hefx.ambient_intensity.toString());
    }
    if (hefx.card_material) {
      this.dataset.cardMaterial = hefx.card_material;
      this.#hefxDataKeys.push('cardMaterial');
    }
    if (hefx.surface_finish) {
      this.dataset.surfaceFinish = hefx.surface_finish;
      this.#hefxDataKeys.push('surfaceFinish');
    }
  }

  #resetFile(): void {
    this.#revokeBlobs();
    this.#file = null;
    this.#frontImg.hidden = true;
    this.#frontImg.removeAttribute('src');
    this.#backImg.hidden = true;
    this.#backImg.removeAttribute('src');
    this.#frontLayersBox.replaceChildren();
    this.#backLayersBox.replaceChildren();
    this.#clearHefxVars();
    this.#poseLayers = [];
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
    for (const url of this.#layerBlobUrls) URL.revokeObjectURL(url);
    this.#layerBlobUrls = [];
  }

  #clearHefxVars(): void {
    const vars = [
      '--xflip-tilt-sensitivity',
      '--xflip-tilt-max-angle',
      '--xflip-perspective',
      '--xflip-ambient-intensity',
    ];
    for (const v of vars) this.style.removeProperty(v);
    for (const key of this.#hefxDataKeys) delete this.dataset[key];
    this.#hefxDataKeys = [];
  }

  /**
   * Returns true when the viewer should skip transient animations. Triggers:
   *
   * - The user has set `prefers-reduced-motion: reduce`.
   * - The loaded file's HEAD has `NO_FLIP_ANIM` (bit 1) set. The spec calls
   *   the flag out for flip, but treating it as a global "no animation" hint
   *   matches the principle of least surprise — files that opt out of the
   *   flip animation almost never want lively tilt either.
   */
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
    this.#applyPoseLayers(0, 0);
  }

  #scheduleTilt(): void {
    if (this.#tiltRaf) return;
    this.#tiltRaf = requestAnimationFrame(() => {
      this.#tiltRaf = 0;
      if (!this.#tiltPending) return;
      const { x, y } = this.#tiltPending;
      this.setAttribute('data-tilting', '');
      // Pointer y maps to rotateX (top → tilt back); pointer x to rotateY.
      this.style.setProperty('--xflip-tilt-x', `${(-y * this.tiltMax).toFixed(2)}deg`);
      this.style.setProperty('--xflip-tilt-y', `${(x * this.tiltMax).toFixed(2)}deg`);
      // Pointer-relative vars consumed by per-layer parallax + custom
      // host CSS (e.g. specular highlights). `nx`/`ny` are signed in
      // [-1, 1]; `px`/`py` are percentages in [0%, 100%].
      this.style.setProperty('--xflip-pointer-nx', x.toFixed(3));
      this.style.setProperty('--xflip-pointer-ny', y.toFixed(3));
      this.style.setProperty('--xflip-pointer-px', `${(((x + 1) / 2) * 100).toFixed(2)}%`);
      this.style.setProperty('--xflip-pointer-py', `${(((y + 1) / 2) * 100).toFixed(2)}%`);
      this.#applyPoseLayers(x, y);
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
