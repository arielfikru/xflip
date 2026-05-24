/**
 * Property-based tests for the v1.0 codec.
 *
 * Asserts two universal invariants over fuzz-generated inputs:
 *   1. `decode(encode(x))` deep-equals `x` for any valid {@link XflipFile}.
 *   2. `parseChunks` either succeeds or throws an {@link XflipError} — it
 *      never returns garbage and never crashes the host with an
 *      uncaught `TypeError`/`RangeError`.
 */

import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import { parseChunks } from './chunks.js';
import { decode } from './decode.js';
import { encode } from './encode.js';
import { XflipError } from './errors.js';
import {
  FLIP_AXIS_CODES,
  type FlipAxis,
  IMAGE_FORMAT_CODES,
  type ImageFormat,
  type XflipFile,
} from './types.js';

const FORMAT_NAMES = Object.keys(IMAGE_FORMAT_CODES) as ImageFormat[];
const AXIS_NAMES = Object.keys(FLIP_AXIS_CODES) as FlipAxis[];

const arbBytes = (maxLength: number) =>
  fc.uint8Array({ minLength: 0, maxLength }).map((a) => new Uint8Array(a));

const arbAncillaryKey = fc.constantFrom('META', 'tHmb', 'fLip', 'eDge');

const arbAncillary = fc
  .uniqueArray(fc.tuple(arbAncillaryKey, arbBytes(64)), {
    maxLength: 4,
    selector: ([k]) => k,
  })
  .map((entries) => new Map<string, Uint8Array>(entries));

const arbFile: fc.Arbitrary<XflipFile> = fc.record({
  versionMajor: fc.constant(1),
  versionMinor: fc.constant(0),
  head: fc.record({
    width: fc.integer({ min: 1, max: 0xffffffff }),
    height: fc.integer({ min: 1, max: 0xffffffff }),
    frontFormat: fc.constantFrom(...FORMAT_NAMES),
    backFormat: fc.constantFrom(...FORMAT_NAMES),
    flipAxis: fc.constantFrom(...AXIS_NAMES),
    flags: fc.integer({ min: 0, max: 0xff }),
  }),
  front: arbBytes(512),
  back: arbBytes(512),
  ancillary: fc.option(arbAncillary, { nil: undefined }),
});

describe('property: round-trip identity', () => {
  test.prop([arbFile])('decode(encode(file)) deep-equals file', (file) => {
    const decoded = decode(encode(file));
    expect(decoded.versionMajor).toBe(file.versionMajor);
    expect(decoded.versionMinor).toBe(file.versionMinor);
    expect(decoded.head).toEqual(file.head);
    expect(decoded.front).toEqual(file.front);
    expect(decoded.back).toEqual(file.back);
    if (file.ancillary && file.ancillary.size > 0) {
      expect(Array.from(decoded.ancillary?.entries() ?? [])).toEqual(
        Array.from(file.ancillary.entries()),
      );
    } else {
      expect(decoded.ancillary).toBeUndefined();
    }
  });
});

describe('property: parseChunks robustness', () => {
  test.prop([fc.uint8Array({ minLength: 0, maxLength: 256 })])(
    'arbitrary bytes either parse or throw XflipError',
    (bytes) => {
      try {
        parseChunks(bytes);
      } catch (err) {
        expect(err).toBeInstanceOf(XflipError);
      }
    },
  );

  test.prop([arbFile, fc.nat({ max: 100 }), fc.integer({ min: 0, max: 255 })])(
    'random byte mutations of a valid file never crash with non-XflipError',
    (file, position, value) => {
      const bytes = encode(file);
      if (bytes.length === 0) return;
      const mutated = new Uint8Array(bytes);
      mutated[position % mutated.length] = value;
      try {
        decode(mutated);
      } catch (err) {
        expect(err).toBeInstanceOf(XflipError);
      }
    },
  );
});
