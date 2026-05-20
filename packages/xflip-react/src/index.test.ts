// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { VERSION, XflipCard } from './index.js';

describe('@xflip/react entry', () => {
  it('exports a VERSION sentinel', () => {
    expect(VERSION).toBe('0.0.0');
  });

  it('exports the XflipCard component', () => {
    expect(typeof XflipCard).toBe('object');
    expect(XflipCard).toHaveProperty('$$typeof');
  });
});
