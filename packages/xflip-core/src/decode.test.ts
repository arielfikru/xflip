import { describe, expect, test } from 'vitest';
import {
  MINIMAL_V1_BYTES,
  MINIMAL_V1_EXPECTED,
  MINIMAL_V1_PARTS,
} from '../../../tests/fixtures/golden/minimal-v1.js';
import { BytesWriter } from './bytes.js';
import { writeChunk, writeSignature } from './chunks.js';
import { decode } from './decode.js';
import { XflipParseError } from './errors.js';

const buildFile = (chunks: readonly { type: string; payload: Uint8Array }[]): Uint8Array => {
  const w = new BytesWriter();
  writeSignature(w, 1, 0);
  for (const { type, payload } of chunks) writeChunk(w, type, payload);
  writeChunk(w, 'ENDX', new Uint8Array());
  return w.toBytes();
};

describe('decode — happy path', () => {
  test('decodes the golden v1.0 fixture into the expected XflipFile', () => {
    const file = decode(MINIMAL_V1_BYTES);
    expect(file.versionMajor).toBe(MINIMAL_V1_EXPECTED.versionMajor);
    expect(file.versionMinor).toBe(MINIMAL_V1_EXPECTED.versionMinor);
    expect(file.head).toEqual(MINIMAL_V1_EXPECTED.head);
    expect(file.front).toEqual(MINIMAL_V1_EXPECTED.front);
    expect(file.back).toEqual(MINIMAL_V1_EXPECTED.back);
    expect(file.ancillary).toBeUndefined();
  });

  test('image bytes are independent copies (not views into source)', () => {
    const source = new Uint8Array(MINIMAL_V1_BYTES);
    const file = decode(source);
    source.fill(0);
    expect(file.front[0]).toBe(0x89);
    expect(file.back[0]).toBe(0x89);
  });

  test('preserves ancillary chunks keyed by type', () => {
    const meta = new TextEncoder().encode('{"title":"hi"}');
    const thmb = new Uint8Array([1, 2, 3]);
    const bytes = buildFile([
      { type: 'HEAD', payload: MINIMAL_V1_PARTS.headPayload },
      { type: 'META', payload: meta },
      { type: 'FRNT', payload: MINIMAL_V1_PARTS.frntPayload },
      { type: 'tHmb', payload: thmb },
      { type: 'BACK', payload: MINIMAL_V1_PARTS.backPayload },
    ]);
    const file = decode(bytes);
    expect(file.ancillary?.get('META')).toEqual(meta);
    expect(file.ancillary?.get('tHmb')).toEqual(thmb);
    expect(file.ancillary?.size).toBe(2);
  });
});

describe('decode — HEAD validation', () => {
  test('rejects wrong HEAD payload length', () => {
    const bytes = buildFile([
      { type: 'HEAD', payload: new Uint8Array(11) },
      { type: 'FRNT', payload: MINIMAL_V1_PARTS.frntPayload },
      { type: 'BACK', payload: MINIMAL_V1_PARTS.backPayload },
    ]);
    expect(() => decode(bytes)).toThrow(/HEAD payload must be exactly 12 bytes/);
  });

  test('rejects zero width', () => {
    const head = new Uint8Array(12);
    new DataView(head.buffer).setUint32(4, 64, false); // height only
    head[8] = 0x01;
    head[9] = 0x01;
    const bytes = buildFile([
      { type: 'HEAD', payload: head },
      { type: 'FRNT', payload: MINIMAL_V1_PARTS.frntPayload },
      { type: 'BACK', payload: MINIMAL_V1_PARTS.backPayload },
    ]);
    expect(() => decode(bytes)).toThrow(/width\/height must be non-zero/);
  });

  test('rejects unknown front_format code', () => {
    const head = new Uint8Array(MINIMAL_V1_PARTS.headPayload);
    head[8] = 0x7f; // reserved range
    const bytes = buildFile([
      { type: 'HEAD', payload: head },
      { type: 'FRNT', payload: MINIMAL_V1_PARTS.frntPayload },
      { type: 'BACK', payload: MINIMAL_V1_PARTS.backPayload },
    ]);
    expect(() => decode(bytes)).toThrow(/unknown front_format code 0x7f/);
  });

  test('rejects unknown flip_axis code', () => {
    const head = new Uint8Array(MINIMAL_V1_PARTS.headPayload);
    head[10] = 0x09;
    const bytes = buildFile([
      { type: 'HEAD', payload: head },
      { type: 'FRNT', payload: MINIMAL_V1_PARTS.frntPayload },
      { type: 'BACK', payload: MINIMAL_V1_PARTS.backPayload },
    ]);
    expect(() => decode(bytes)).toThrow(/unknown flip_axis code 0x09/);
  });

  test('decodes all valid format codes', () => {
    const formats: Array<[number, string]> = [
      [0x00, 'raw'],
      [0x01, 'png'],
      [0x02, 'jpeg'],
      [0x03, 'webp'],
      [0x04, 'avif'],
      [0x05, 'jxl'],
      [0xff, 'custom'],
    ];
    for (const [code, name] of formats) {
      const head = new Uint8Array(MINIMAL_V1_PARTS.headPayload);
      head[8] = code;
      head[9] = code;
      const bytes = buildFile([
        { type: 'HEAD', payload: head },
        { type: 'FRNT', payload: MINIMAL_V1_PARTS.frntPayload },
        { type: 'BACK', payload: MINIMAL_V1_PARTS.backPayload },
      ]);
      const file = decode(bytes);
      expect(file.head.frontFormat).toBe(name);
      expect(file.head.backFormat).toBe(name);
    }
  });

  test('preserves flags byte verbatim', () => {
    const head = new Uint8Array(MINIMAL_V1_PARTS.headPayload);
    head[11] = 0x03; // DEFAULT_BACK | NO_FLIP_ANIM
    const bytes = buildFile([
      { type: 'HEAD', payload: head },
      { type: 'FRNT', payload: MINIMAL_V1_PARTS.frntPayload },
      { type: 'BACK', payload: MINIMAL_V1_PARTS.backPayload },
    ]);
    expect(decode(bytes).head.flags).toBe(0x03);
  });
});

describe('decode — ordering invariants', () => {
  test('rejects file whose first chunk is not HEAD', () => {
    const bytes = buildFile([
      { type: 'META', payload: new Uint8Array() },
      { type: 'HEAD', payload: MINIMAL_V1_PARTS.headPayload },
      { type: 'FRNT', payload: MINIMAL_V1_PARTS.frntPayload },
      { type: 'BACK', payload: MINIMAL_V1_PARTS.backPayload },
    ]);
    expect(() => decode(bytes)).toThrow(/expected first chunk to be "HEAD"/);
  });

  test('rejects BACK before FRNT', () => {
    const bytes = buildFile([
      { type: 'HEAD', payload: MINIMAL_V1_PARTS.headPayload },
      { type: 'BACK', payload: MINIMAL_V1_PARTS.backPayload },
      { type: 'FRNT', payload: MINIMAL_V1_PARTS.frntPayload },
    ]);
    expect(() => decode(bytes)).toThrow(/BACK chunk appears before FRNT/);
  });

  test('rejects file missing FRNT', () => {
    const bytes = buildFile([
      { type: 'HEAD', payload: MINIMAL_V1_PARTS.headPayload },
      { type: 'BACK', payload: MINIMAL_V1_PARTS.backPayload },
    ]);
    expect(() => decode(bytes)).toThrow(/missing mandatory FRNT/);
  });

  test('rejects file missing BACK', () => {
    const bytes = buildFile([
      { type: 'HEAD', payload: MINIMAL_V1_PARTS.headPayload },
      { type: 'FRNT', payload: MINIMAL_V1_PARTS.frntPayload },
    ]);
    expect(() => decode(bytes)).toThrow(/missing mandatory BACK/);
  });

  test('XflipParseError thrown for ordering violations', () => {
    const bytes = buildFile([
      { type: 'HEAD', payload: MINIMAL_V1_PARTS.headPayload },
      { type: 'BACK', payload: MINIMAL_V1_PARTS.backPayload },
      { type: 'FRNT', payload: MINIMAL_V1_PARTS.frntPayload },
    ]);
    expect(() => decode(bytes)).toThrow(XflipParseError);
  });
});
