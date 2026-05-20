// @vitest-environment happy-dom
import { encode, type XflipFile } from '@xflip/core';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  defineXflipCard,
  XFLIP_CARD_TAG,
  XflipCardElement,
  type XflipErrorEventDetail,
  type XflipLoadEventDetail,
} from './index.js';

function makeFileBytes(overrides: { flags?: number } = {}): Uint8Array {
  const file: XflipFile = {
    versionMajor: 1,
    versionMinor: 0,
    head: {
      width: 100,
      height: 140,
      frontFormat: 'png',
      backFormat: 'png',
      flipAxis: 'horizontal',
      flags: overrides.flags ?? 0,
    },
    front: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    back: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  };
  return encode(file);
}

function mockFetchOk(bytes: Uint8Array): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    })),
  );
}

function mockFetchHttpError(status: number): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      status,
      arrayBuffer: async () => new ArrayBuffer(0),
    })),
  );
}

function waitForEvent<T extends Event>(el: EventTarget, type: string): Promise<T> {
  return new Promise((resolve) => {
    el.addEventListener(type, (e) => resolve(e as T), { once: true });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Custom elements can only be registered once per constructor per document.
// All tests share a single registration under the canonical tag.
beforeAll(() => {
  XflipCardElement.register();
});

describe('XflipCardElement', () => {
  it('exposes the default tag constant', () => {
    expect(XFLIP_CARD_TAG).toBe('xflip-card');
  });

  it('register() is idempotent', () => {
    XflipCardElement.register();
    XflipCardElement.register();
    expect(customElements.get(XFLIP_CARD_TAG)).toBe(XflipCardElement);
  });

  it('register() throws when the requested tag is taken by another constructor', () => {
    const tag = `taken-${Math.random().toString(36).slice(2, 10)}`;
    class Other extends HTMLElement {}
    customElements.define(tag, Other);
    expect(() => XflipCardElement.register(tag)).toThrow(/already registered/);
  });

  it('register() throws when called with a different tag than the first registration', () => {
    expect(() => XflipCardElement.register('xflip-card-alt')).toThrow(/already registered/);
  });

  it('defineXflipCard() delegates to register and is a no-op for the same tag', () => {
    defineXflipCard();
    expect(customElements.get(XFLIP_CARD_TAG)).toBe(XflipCardElement);
  });

  it('creates a shadow root with stage and status parts', () => {
    const el = document.createElement(XFLIP_CARD_TAG) as XflipCardElement;
    expect(el.shadowRoot).not.toBeNull();
    expect(el.shadowRoot?.querySelector('.stage')).toBeInstanceOf(HTMLElement);
    expect(el.shadowRoot?.querySelector('.status')).toBeInstanceOf(HTMLElement);
  });

  it('src getter/setter mirrors the attribute', () => {
    const el = document.createElement(XFLIP_CARD_TAG) as XflipCardElement;
    expect(el.src).toBeNull();
    el.src = './card.xflip';
    expect(el.getAttribute('src')).toBe('./card.xflip');
    el.src = null;
    expect(el.hasAttribute('src')).toBe(false);
  });

  it('file is null before any load', () => {
    const el = document.createElement(XFLIP_CARD_TAG) as XflipCardElement;
    expect(el.file).toBeNull();
  });

  it('clears state when src attribute is removed', () => {
    const el = document.createElement(XFLIP_CARD_TAG) as XflipCardElement;
    document.body.append(el);
    el.setAttribute('src', './a.xflip');
    el.removeAttribute('src');
    expect(el.file).toBeNull();
    el.remove();
  });
});

describe('XflipCardElement fetch + decode lifecycle', () => {
  it('emits xflip-load with decoded file on success', async () => {
    mockFetchOk(makeFileBytes());
    const el = document.createElement(XFLIP_CARD_TAG) as XflipCardElement;
    const loaded = waitForEvent<CustomEvent<XflipLoadEventDetail>>(el, 'xflip-load');
    document.body.append(el);
    el.setAttribute('src', './card.xflip');
    const ev = await loaded;
    expect(ev.detail.file.versionMajor).toBe(1);
    expect(ev.detail.file.versionMinor).toBe(0);
    expect(el.file).toBe(ev.detail.file);
    el.remove();
  });

  it('emits xflip-error on HTTP failure', async () => {
    mockFetchHttpError(404);
    const el = document.createElement(XFLIP_CARD_TAG) as XflipCardElement;
    const failed = waitForEvent<CustomEvent<XflipErrorEventDetail>>(el, 'xflip-error');
    document.body.append(el);
    el.setAttribute('src', './missing.xflip');
    const ev = await failed;
    expect(ev.detail.error.message).toMatch(/HTTP 404/);
    expect(el.file).toBeNull();
    el.remove();
  });

  it('emits xflip-error on decode failure (invalid bytes)', async () => {
    mockFetchOk(new Uint8Array([0, 1, 2, 3]));
    const el = document.createElement(XFLIP_CARD_TAG) as XflipCardElement;
    const failed = waitForEvent<CustomEvent<XflipErrorEventDetail>>(el, 'xflip-error');
    document.body.append(el);
    el.setAttribute('src', './bad.xflip');
    const ev = await failed;
    expect(ev.detail.error).toBeInstanceOf(Error);
    el.remove();
  });

  it('cancels prior in-flight fetch when src changes', async () => {
    const bytes = makeFileBytes();
    const calls: AbortSignal[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal;
        calls.push(signal);
        return new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          // Resolve only the last call; earlier ones get aborted first.
          if (calls.length === 2) {
            resolve({
              ok: true,
              status: 200,
              arrayBuffer: async () =>
                bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
            } as Response);
          }
        });
      }),
    );

    const el = document.createElement(XFLIP_CARD_TAG) as XflipCardElement;
    const loaded = waitForEvent<CustomEvent<XflipLoadEventDetail>>(el, 'xflip-load');
    document.body.append(el);
    el.setAttribute('src', './first.xflip');
    el.setAttribute('src', './second.xflip');
    await loaded;
    expect(calls).toHaveLength(2);
    expect(calls[0].aborted).toBe(true);
    expect(calls[1].aborted).toBe(false);
    el.remove();
  });

  it('paints the front face by default after load', async () => {
    mockFetchOk(makeFileBytes());
    const el = document.createElement(XFLIP_CARD_TAG) as XflipCardElement;
    const loaded = waitForEvent<CustomEvent<XflipLoadEventDetail>>(el, 'xflip-load');
    document.body.append(el);
    el.setAttribute('src', './card.xflip');
    await loaded;
    const img = el.shadowRoot?.querySelector('img.face') as HTMLImageElement;
    expect(img.hidden).toBe(false);
    expect(img.src).toMatch(/^blob:/);
    expect(el.face).toBe('front');
    el.remove();
  });

  it('honors DEFAULT_BACK flag for initial face', async () => {
    mockFetchOk(makeFileBytes({ flags: 0x01 }));
    const el = document.createElement(XFLIP_CARD_TAG) as XflipCardElement;
    const loaded = waitForEvent<CustomEvent<XflipLoadEventDetail>>(el, 'xflip-load');
    document.body.append(el);
    el.setAttribute('src', './card.xflip');
    await loaded;
    expect(el.face).toBe('back');
    el.remove();
  });

  it('showFace() swaps the visible face URL', async () => {
    mockFetchOk(makeFileBytes());
    const el = document.createElement(XFLIP_CARD_TAG) as XflipCardElement;
    const loaded = waitForEvent<CustomEvent<XflipLoadEventDetail>>(el, 'xflip-load');
    document.body.append(el);
    el.setAttribute('src', './card.xflip');
    await loaded;
    const img = el.shadowRoot?.querySelector('img.face') as HTMLImageElement;
    const frontUrl = img.src;
    el.showFace('back');
    expect(el.face).toBe('back');
    expect(img.src).not.toBe(frontUrl);
    expect(img.src).toMatch(/^blob:/);
    el.remove();
  });

  it('hides face image and clears state when src is removed', async () => {
    mockFetchOk(makeFileBytes());
    const el = document.createElement(XFLIP_CARD_TAG) as XflipCardElement;
    const loaded = waitForEvent<CustomEvent<XflipLoadEventDetail>>(el, 'xflip-load');
    document.body.append(el);
    el.setAttribute('src', './card.xflip');
    await loaded;
    el.removeAttribute('src');
    const img = el.shadowRoot?.querySelector('img.face') as HTMLImageElement;
    expect(img.hidden).toBe(true);
    expect(el.file).toBeNull();
    el.remove();
  });

  it('cancels in-flight fetch on disconnect', async () => {
    let captured: AbortSignal | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        captured = init?.signal as AbortSignal;
        return new Promise(() => {});
      }),
    );

    const el = document.createElement(XFLIP_CARD_TAG) as XflipCardElement;
    document.body.append(el);
    el.setAttribute('src', './slow.xflip');
    expect(captured).not.toBeNull();
    el.remove();
    expect(captured?.aborted).toBe(true);
  });
});
