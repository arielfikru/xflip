// @vitest-environment happy-dom

import type { XflipCardElement } from '@xflip/viewer';
import { createRef, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { XflipCard } from './xflip-card.js';

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  // The viewer's connectedCallback fetches `src`; happy-dom's fetch
  // resolves on a microtask and can mutate the shadow DOM mid-unmount.
  // Stub to a never-resolving promise so the AbortController on
  // disconnect short-circuits cleanly.
  globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  // Skip React's unmount: tearing down the custom element through React's
  // commit phase trips a happy-dom node-parent invariant. Just drop the
  // container; the next test creates fresh DOM.
  container.remove();
});

function mount(element: ReactElement): void {
  flushSync(() => {
    root.render(element);
  });
}

describe('<XflipCard>', () => {
  it('renders an <xflip-card> element and forwards src', () => {
    mount(<XflipCard src="/example.xflip" />);
    const el = container.querySelector('xflip-card');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('src')).toBe('/example.xflip');
  });

  it('registers the custom element on first mount', () => {
    mount(<XflipCard src="/a.xflip" />);
    expect(customElements.get('xflip-card')).toBeDefined();
  });

  it('exposes the underlying element through a forwarded ref', () => {
    const ref = createRef<XflipCardElement>();
    mount(<XflipCard ref={ref} src="/b.xflip" />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('xflip-card');
  });

  it('calls onLoad when the underlying element dispatches xflip-load', () => {
    const onLoad = vi.fn();
    mount(<XflipCard src="/c.xflip" onLoad={onLoad} />);
    const el = container.querySelector('xflip-card');
    expect(el).not.toBeNull();
    const fakeFile = { head: {}, front: new Uint8Array(), back: new Uint8Array() };
    el?.dispatchEvent(new CustomEvent('xflip-load', { detail: { file: fakeFile } }));
    expect(onLoad).toHaveBeenCalledWith(fakeFile);
  });

  it('calls onError when the underlying element dispatches xflip-error', () => {
    const onError = vi.fn();
    mount(<XflipCard src="/d.xflip" onError={onError} />);
    const el = container.querySelector('xflip-card');
    const error = new Error('boom');
    el?.dispatchEvent(new CustomEvent('xflip-error', { detail: { error } }));
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('applies tiltMax as a property, not an attribute', () => {
    const ref = createRef<XflipCardElement>();
    mount(<XflipCard ref={ref} src="/e.xflip" tiltMax={12} />);
    expect(ref.current?.tiltMax).toBe(12);
    expect(container.querySelector('xflip-card')?.getAttribute('tiltMax')).toBeNull();
  });
});
