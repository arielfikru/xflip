/**
 * Round-trip integration tests for xflip-core v1.0.
 *
 * Generates a variety of synthetic {@link XflipFile} values, encodes each,
 * decodes the result, and asserts the decoded value matches the input.
 * Complements the in-package decode/encode unit tests by exercising
 * realistic combinations across the full v1.0 surface in one place.
 */

import { describe, expect, test } from 'vitest';
import {
  decode,
  encode,
  type FlipAxis,
  type ImageFormat,
  type XflipFile,
} from '../packages/xflip-core/src/index.js';

const FORMATS: readonly ImageFormat[] = ['raw', 'png', 'jpeg', 'webp', 'avif', 'jxl', 'custom'];
const AXES: readonly FlipAxis[] = ['horizontal', 'vertical', 'diagonal'];

const makeFile = (
  overrides: Partial<XflipFile['head']> & {
    front?: Uint8Array;
    back?: Uint8Array;
    ancillary?: Map<string, Uint8Array>;
  } = {},
): XflipFile => {
  const { front, back, ancillary, ...headOverrides } = overrides;
  const file: XflipFile = {
    versionMajor: 1,
    versionMinor: 0,
    head: {
      width: 64,
      height: 64,
      frontFormat: 'png',
      backFormat: 'png',
      flipAxis: 'horizontal',
      flags: 0,
      ...headOverrides,
    },
    front: front ?? new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xfe]),
    back: back ?? new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xfd]),
  };
  if (ancillary) return { ...file, ancillary };
  return file;
};

const expectRoundTrip = (file: XflipFile): void => {
  const decoded = decode(encode(file));
  expect(decoded.versionMajor).toBe(file.versionMajor);
  expect(decoded.versionMinor).toBe(file.versionMinor);
  expect(decoded.head).toEqual(file.head);
  expect(decoded.front).toEqual(file.front);
  expect(decoded.back).toEqual(file.back);
  if (file.ancillary) {
    expect(decoded.ancillary).toBeDefined();
    expect(Array.from(decoded.ancillary?.entries() ?? [])).toEqual(
      Array.from(file.ancillary.entries()),
    );
  }
};

describe('round-trip: format matrix', () => {
  for (const front of FORMATS) {
    for (const back of FORMATS) {
      test(`${front} / ${back}`, () => {
        expectRoundTrip(makeFile({ frontFormat: front, backFormat: back }));
      });
    }
  }
});

describe('round-trip: flip-axis matrix', () => {
  for (const axis of AXES) {
    test(axis, () => {
      expectRoundTrip(makeFile({ flipAxis: axis }));
    });
  }
});

describe('round-trip: dimensions and flags', () => {
  test('extreme dimensions (1x1)', () => {
    expectRoundTrip(makeFile({ width: 1, height: 1 }));
  });

  test('extreme dimensions (max uint32)', () => {
    expectRoundTrip(makeFile({ width: 0xffffffff, height: 0xffffffff }));
  });

  test('every flag bit independently', () => {
    for (let bit = 0; bit < 8; bit++) {
      expectRoundTrip(makeFile({ flags: 1 << bit }));
    }
  });

  test('all reserved flag bits set', () => {
    expectRoundTrip(makeFile({ flags: 0xff }));
  });
});

describe('round-trip: payload sizes', () => {
  test('empty front and back payloads', () => {
    expectRoundTrip(makeFile({ front: new Uint8Array(), back: new Uint8Array() }));
  });

  test('1 MB front payload', () => {
    const big = new Uint8Array(1024 * 1024);
    for (let i = 0; i < big.length; i++) big[i] = i & 0xff;
    expectRoundTrip(makeFile({ front: big }));
  });

  test('different sizes for front and back', () => {
    expectRoundTrip(
      makeFile({
        front: new Uint8Array(123).fill(0xaa),
        back: new Uint8Array(456).fill(0xbb),
      }),
    );
  });
});

describe('round-trip: ancillary chunks', () => {
  test('META + tHmb preserved in order', () => {
    const ancillary = new Map([
      ['META', new TextEncoder().encode('{"title":"x"}')],
      ['tHmb', new Uint8Array([1, 2, 3, 4])],
    ]);
    expectRoundTrip(makeFile({ ancillary }));
  });

  test('unknown lowercase-first ancillary chunk preserved', () => {
    const ancillary = new Map([['xZzZ', new Uint8Array([9, 8, 7])]]);
    expectRoundTrip(makeFile({ ancillary }));
  });

  test('multiple ancillaries preserved in insertion order', () => {
    const ancillary = new Map<string, Uint8Array>([
      ['META', new Uint8Array([1])],
      ['tHmb', new Uint8Array([2])],
      ['fLip', new Uint8Array([3])],
      ['eDge', new Uint8Array([4])],
    ]);
    expectRoundTrip(makeFile({ ancillary }));
  });

  test('empty-payload ancillary chunk round-trips', () => {
    const ancillary = new Map([['META', new Uint8Array()]]);
    expectRoundTrip(makeFile({ ancillary }));
  });
});
