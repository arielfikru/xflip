import { describe, expect, it } from 'vitest';
import { VERSION } from './index.js';

describe('@xflip/react skeleton', () => {
  it('exports a VERSION sentinel so the package is importable before any component lands', () => {
    expect(VERSION).toBe('0.0.0');
  });
});
