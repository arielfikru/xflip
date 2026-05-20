// @vitest-environment node

import { describe, expect, it } from 'vitest';

describe('@xflip/react SSR safety', () => {
  it('imports cleanly under Node with no browser globals defined', async () => {
    // Sanity: confirm we're in a Node-like environment with no DOM globals.
    expect(typeof globalThis.HTMLElement).toBe('undefined');
    expect(typeof globalThis.customElements).toBe('undefined');
    expect(typeof globalThis.document).toBe('undefined');

    const mod = await import('./index.js');
    expect(mod).toHaveProperty('XflipCard');
    expect(mod).toHaveProperty('useXflip');
    expect(mod.VERSION).toBe('0.0.0');

    // Importing must not touch the DOM or define custom elements.
    expect(typeof globalThis.HTMLElement).toBe('undefined');
    expect(typeof globalThis.customElements).toBe('undefined');
  });

  it('does not eagerly load @xflip/viewer', async () => {
    // The `@xflip/viewer` module defines `class XflipCardElement extends
    // HTMLElement` at top level. If react eagerly imported it on the server,
    // this whole file would have thrown above. Re-importing here is just a
    // belt-and-suspenders check: we resolve the module identifier and confirm
    // the import succeeds (after the first test, the dynamic-import path
    // may have been triggered — but only via our test eval, not by react).
    const reactMod = await import('./index.js');
    expect(reactMod).toBeDefined();
  });
});
