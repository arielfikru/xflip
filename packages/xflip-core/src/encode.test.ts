import { describe, expect, test } from 'vitest';
import {
  MINIMAL_V1_BYTES,
  MINIMAL_V1_EXPECTED,
} from '../../../tests/fixtures/golden/minimal-v1.js';
import { decode } from './decode.js';
import { encode } from './encode.js';
import { XflipEncodeError } from './errors.js';
import type { XflipFile } from './types.js';

const baseFile = (): XflipFile => ({
  versionMajor: 1,
  versionMinor: 0,
  head: { ...MINIMAL_V1_EXPECTED.head },
  front: new Uint8Array(MINIMAL_V1_EXPECTED.front),
  back: new Uint8Array(MINIMAL_V1_EXPECTED.back),
});

describe('encode — happy path', () => {
  test('encoding the golden expected file reproduces the golden bytes', () => {
    expect(encode(baseFile())).toEqual(MINIMAL_V1_BYTES);
  });

  test('round-trip: decode(encode(file)) === file', () => {
    const file = baseFile();
    const decoded = decode(encode(file));
    expect(decoded.head).toEqual(file.head);
    expect(decoded.front).toEqual(file.front);
    expect(decoded.back).toEqual(file.back);
    expect(decoded.versionMajor).toBe(1);
    expect(decoded.versionMinor).toBe(0);
  });

  test('round-trip through every image format code', () => {
    const formats = ['raw', 'png', 'jpeg', 'webp', 'avif', 'jxl', 'custom'] as const;
    for (const fmt of formats) {
      const file = baseFile();
      file.head.frontFormat = fmt;
      file.head.backFormat = fmt;
      expect(decode(encode(file)).head.frontFormat).toBe(fmt);
    }
  });

  test('round-trip preserves flip axis', () => {
    for (const axis of ['horizontal', 'vertical', 'diagonal'] as const) {
      const file = baseFile();
      file.head.flipAxis = axis;
      expect(decode(encode(file)).head.flipAxis).toBe(axis);
    }
  });

  test('round-trip preserves flags byte', () => {
    const file = baseFile();
    file.head.flags = 0x03;
    expect(decode(encode(file)).head.flags).toBe(0x03);
  });

  test('round-trip preserves ancillary chunks in insertion order', () => {
    const file = baseFile();
    file.ancillary = new Map([
      ['META', new TextEncoder().encode('{"title":"hi"}')],
      ['tHmb', new Uint8Array([1, 2, 3])],
    ]);
    const decoded = decode(encode(file));
    expect(Array.from(decoded.ancillary?.keys() ?? [])).toEqual(['META', 'tHmb']);
    expect(decoded.ancillary?.get('META')).toEqual(file.ancillary.get('META'));
  });
});

describe('encode — HEAD validation', () => {
  test('rejects zero width', () => {
    const file = baseFile();
    file.head.width = 0;
    expect(() => encode(file)).toThrow(/HEAD.width out of range/);
  });

  test('rejects negative dimension', () => {
    const file = baseFile();
    file.head.height = -1;
    expect(() => encode(file)).toThrow(/HEAD.height out of range/);
  });

  test('rejects non-integer dimension', () => {
    const file = baseFile();
    file.head.width = 1.5;
    expect(() => encode(file)).toThrow(XflipEncodeError);
  });

  test('rejects width > 2^32-1', () => {
    const file = baseFile();
    file.head.width = 0x100000000;
    expect(() => encode(file)).toThrow(/HEAD.width out of range/);
  });

  test('rejects flags above uint8 range', () => {
    const file = baseFile();
    file.head.flags = 256;
    expect(() => encode(file)).toThrow(/HEAD.flags must be uint8/);
  });

  test('rejects unknown format name', () => {
    const file = baseFile();
    (file.head as { frontFormat: string }).frontFormat = 'bmp';
    expect(() => encode(file)).toThrow(/unknown HEAD.frontFormat/);
  });

  test('rejects unknown flip axis name', () => {
    const file = baseFile();
    (file.head as { flipAxis: string }).flipAxis = 'sideways';
    expect(() => encode(file)).toThrow(/unknown HEAD.flipAxis/);
  });
});
