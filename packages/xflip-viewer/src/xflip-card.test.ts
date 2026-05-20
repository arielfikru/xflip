// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { defineXflipCard, XFLIP_CARD_TAG, XflipCardElement } from './index.js';

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
