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

async function waitForCustomElement(name: string, timeoutMs = 500): Promise<void> {
  const start = Date.now();
  while (!customElements.get(name)) {
    if (Date.now() - start > timeoutMs) return;
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('<XflipCard>', () => {
  it('renders an <xflip-card> element and forwards src', () => {
    mount(<XflipCard src="/example.xflip" />);
    const el = container.querySelector('xflip-card');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('src')).toBe('/example.xflip');
  });

  it('registers the custom element on first mount', async () => {
    mount(<XflipCard src="/a.xflip" />);
    await waitForCustomElement('xflip-card');
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

  it('updates tiltMax when the prop changes between renders', () => {
    const ref = createRef<XflipCardElement>();
    mount(<XflipCard ref={ref} src="/e.xflip" tiltMax={6} />);
    expect(ref.current?.tiltMax).toBe(6);
    mount(<XflipCard ref={ref} src="/e.xflip" tiltMax={18} />);
    expect(ref.current?.tiltMax).toBe(18);
  });

  it('forwards className / style / hidden / aria-label to the host element', () => {
    mount(
      <XflipCard
        src="/f.xflip"
        className="card-host"
        style={{ width: 240 }}
        hidden
        aria-label="Demo card"
      />,
    );
    const el = container.querySelector('xflip-card') as HTMLElement | null;
    // React's custom-element heuristic kicks in once the tag contains a
    // hyphen *and* the element is upgraded; until then it treats the tag
    // like a generic HTML element and writes `className` literally.
    // We only care that the attribute lands on the host, so accept either
    // spelling.
    const klass = el?.getAttribute('class') ?? el?.getAttribute('className');
    expect(klass).toBe('card-host');
    expect(el?.style.width).toBe('240px');
    expect(el?.hasAttribute('hidden')).toBe(true);
    expect(el?.getAttribute('aria-label')).toBe('Demo card');
  });

  it('preserves the same element identity across src changes', () => {
    const ref = createRef<XflipCardElement>();
    mount(<XflipCard ref={ref} src="/first.xflip" />);
    const initial = ref.current;
    expect(initial).not.toBeNull();
    mount(<XflipCard ref={ref} src="/second.xflip" />);
    expect(ref.current).toBe(initial);
    expect(ref.current?.getAttribute('src')).toBe('/second.xflip');
  });

  it('detaches the ref when the component unmounts via render(null)', () => {
    const ref = createRef<XflipCardElement>();
    mount(<XflipCard ref={ref} src="/g.xflip" />);
    expect(ref.current).not.toBeNull();
    flushSync(() => {
      root.render(null);
    });
    expect(ref.current).toBeNull();
  });

  it('supports a callback ref and clears it on unmount', () => {
    const seen: Array<XflipCardElement | null> = [];
    mount(<XflipCard ref={(el) => seen.push(el)} src="/h.xflip" />);
    expect(seen[0]?.tagName.toLowerCase()).toBe('xflip-card');
    flushSync(() => {
      root.render(null);
    });
    expect(seen[seen.length - 1]).toBeNull();
  });

  it('drops the previous onLoad listener when the handler reference changes', () => {
    const first = vi.fn();
    const second = vi.fn();
    mount(<XflipCard src="/i.xflip" onLoad={first} />);
    mount(<XflipCard src="/i.xflip" onLoad={second} />);
    const el = container.querySelector('xflip-card');
    const fakeFile = { head: {}, front: new Uint8Array(), back: new Uint8Array() };
    el?.dispatchEvent(new CustomEvent('xflip-load', { detail: { file: fakeFile } }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(fakeFile);
  });
});
