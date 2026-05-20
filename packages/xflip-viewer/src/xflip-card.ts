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

/**
 * Bit 0 of `XflipHead.flags` (DEFAULT_BACK) — when set, the card opens
 * showing the back face. Spec v0.2 §4.1.
 */
const HEAD_FLAG_DEFAULT_BACK = 0x01;

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
  }
  :host([hidden]) { display: none; }
  .stage {
    width: 100%;
    height: 100%;
    position: relative;
  }
  .face {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  .face[hidden] { display: none; }
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
</style>
<div class="stage" part="stage">
  <img class="face" part="face" alt="" hidden />
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

  #file: XflipFile | null = null;
  #face: HTMLImageElement;
  #status: HTMLDivElement;
  #abort: AbortController | null = null;
  #loadToken = 0;
  #currentFace: XflipFace = 'front';
  #blobUrls: { front: string | null; back: string | null } = {
    front: null,
    back: null,
  };

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = TEMPLATE_HTML;
    this.#face = root.querySelector('.face') as HTMLImageElement;
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
   * Swap the visible face. No-op if no file is loaded yet. Flip animation
   * lands in P3.4; for now this performs an instant swap.
   */
  showFace(face: XflipFace): void {
    if (this.#currentFace === face) return;
    this.#currentFace = face;
    if (this.#file) this.#paintFace();
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
    if (this.src) this.#scheduleLoad(this.src);
  }

  disconnectedCallback(): void {
    this.#cancelInFlight();
    // Object URLs are tied to the document; revoke so detached elements
    // don't leak. A subsequent reconnect with the same src will re-fetch.
    this.#revokeBlobs();
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
    this.#currentFace =
      (file.head.flags & HEAD_FLAG_DEFAULT_BACK) === HEAD_FLAG_DEFAULT_BACK ? 'back' : 'front';
    this.#paintFace();
  }

  #paintFace(): void {
    const url = this.#currentFace === 'back' ? this.#blobUrls.back : this.#blobUrls.front;
    if (url === null) {
      this.#face.hidden = true;
      this.#face.removeAttribute('src');
      return;
    }
    this.#face.src = url;
    this.#face.hidden = false;
  }

  #resetFile(): void {
    this.#revokeBlobs();
    this.#file = null;
    this.#face.hidden = true;
    this.#face.removeAttribute('src');
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
