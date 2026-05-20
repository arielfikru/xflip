import { decode, type XflipFile } from '@xflip/core';

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
<div class="stage" part="stage"></div>
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
  #stage: HTMLDivElement;
  #status: HTMLDivElement;
  #abort: AbortController | null = null;
  #loadToken = 0;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = TEMPLATE_HTML;
    this.#stage = root.querySelector('.stage') as HTMLDivElement;
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
      this.#file = file;
      this.#setStatus(null);
      this.dispatchEvent(new CustomEvent('xflip-load', { detail: { file }, bubbles: true }));
    } catch (err) {
      if (signal.aborted || token !== this.#loadToken) return;
      const error = err instanceof Error ? err : new Error(String(err));
      this.#file = null;
      this.#setStatus(`error: ${error.message}`);
      this.dispatchEvent(new CustomEvent('xflip-error', { detail: { error }, bubbles: true }));
    }
  }

  #cancelInFlight(): void {
    if (this.#abort) {
      this.#abort.abort();
      this.#abort = null;
    }
  }

  #clear(): void {
    this.#file = null;
    this.#stage.replaceChildren();
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
