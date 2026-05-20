import { encode, XflipError, type XflipFile } from '@xflip/core';
import { describe, expect, it } from 'vitest';
import { MINIMAL_V1_BYTES } from '../../../tests/fixtures/golden/minimal-v1.js';
import { extract, formatExtractReport } from './extract.js';

const buildFile = (overrides: Partial<XflipFile> = {}): Uint8Array => {
  const base: XflipFile = {
    versionMajor: 1,
    versionMinor: 0,
    head: {
      width: 2,
      height: 2,
      frontFormat: 'png',
      backFormat: 'jpeg',
      flipAxis: 'horizontal',
      flags: 0,
    },
    front: new Uint8Array([1, 2, 3, 4]),
    back: new Uint8Array([5, 6, 7, 8, 9]),
    ...overrides,
  };
  return encode(base);
};

describe('extract', () => {
  it('returns front + back files with extensions from HEAD format codes', () => {
    const result = extract(MINIMAL_V1_BYTES);
    expect(result.versionMajor).toBe(1);
    expect(result.versionMinor).toBe(0);
    expect(result.front.filename).toBe('front.png');
    expect(result.back.filename).toBe('back.png');
    expect(result.front.bytes.byteLength).toBeGreaterThan(0);
    expect(result.back.bytes.byteLength).toBeGreaterThan(0);
  });

  it('omits meta when no META ancillary chunk is present', () => {
    const result = extract(MINIMAL_V1_BYTES);
    expect(result.meta).toBeUndefined();
  });

  it('maps PNG/JPEG format codes to .png/.jpg extensions', () => {
    const bytes = buildFile();
    const result = extract(bytes);
    expect(result.front.filename).toBe('front.png');
    expect(result.back.filename).toBe('back.jpg');
    expect(Array.from(result.front.bytes)).toEqual([1, 2, 3, 4]);
    expect(Array.from(result.back.bytes)).toEqual([5, 6, 7, 8, 9]);
  });

  it('emits meta.json when META ancillary is present', () => {
    const metaJson = new TextEncoder().encode('{"title":"Zapdos"}');
    const bytes = buildFile({ ancillary: new Map([['META', metaJson]]) });
    const result = extract(bytes);
    expect(result.meta).toBeDefined();
    expect(result.meta?.filename).toBe('meta.json');
    expect(new TextDecoder().decode(result.meta?.bytes)).toBe('{"title":"Zapdos"}');
  });

  it('maps custom/raw format codes to .bin', () => {
    const bytes = buildFile({
      head: {
        width: 1,
        height: 1,
        frontFormat: 'custom',
        backFormat: 'raw',
        flipAxis: 'horizontal',
        flags: 0,
      },
    });
    const result = extract(bytes);
    expect(result.front.filename).toBe('front.bin');
    expect(result.back.filename).toBe('back.bin');
  });

  it('throws XflipError on malformed input', () => {
    const bogus = new Uint8Array([0, 0, 0, 0]);
    expect(() => extract(bogus)).toThrow(XflipError);
  });
});

describe('formatExtractReport', () => {
  it('lists each extracted file with its size', () => {
    const result = extract(MINIMAL_V1_BYTES);
    const report = formatExtractReport(result, '/tmp/out');
    expect(report).toContain('Extracted xflip 1.0 → /tmp/out');
    expect(report).toContain('front.png');
    expect(report).toContain('back.png');
    expect(report).not.toContain('meta.json');
  });

  it('includes meta.json line when present', () => {
    const metaJson = new TextEncoder().encode('{}');
    const bytes = buildFile({ ancillary: new Map([['META', metaJson]]) });
    const report = formatExtractReport(extract(bytes), 'out');
    expect(report).toContain('meta.json');
  });
});
