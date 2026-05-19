import { describe, expect, test } from 'vitest';
import { MINIMAL_V1_BYTES, MINIMAL_V1_PARTS } from '../../../tests/fixtures/golden/minimal-v1.js';
import { BytesWriter } from './bytes.js';
import { parseChunks, writeChunk, writeSignature } from './chunks.js';
import { crc32Concat } from './crc32.js';
import { XflipEncodeError } from './errors.js';

describe('writeSignature', () => {
  test('emits the 6-byte XFLP v1.0 header', () => {
    const w = new BytesWriter();
    writeSignature(w, 1, 0);
    expect(w.toBytes()).toEqual(new Uint8Array([0x58, 0x46, 0x4c, 0x50, 0x01, 0x00]));
  });

  test('rejects out-of-range major', () => {
    const w = new BytesWriter();
    expect(() => writeSignature(w, 256, 0)).toThrow(XflipEncodeError);
  });

  test('rejects negative minor', () => {
    const w = new BytesWriter();
    expect(() => writeSignature(w, 1, -1)).toThrow(XflipEncodeError);
  });

  test('rejects non-integer version', () => {
    const w = new BytesWriter();
    expect(() => writeSignature(w, 1.5, 0)).toThrow(XflipEncodeError);
  });
});

describe('writeChunk — happy path', () => {
  test('emits TYPE + LENGTH + PAYLOAD + CRC for empty payload', () => {
    const w = new BytesWriter();
    writeChunk(w, 'ENDX', new Uint8Array());
    const bytes = w.toBytes();
    expect(bytes.subarray(0, 4)).toEqual(new Uint8Array([0x45, 0x4e, 0x44, 0x58]));
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(dv.getUint32(4, false)).toBe(0);
    expect(dv.getUint32(8, false)).toBe(crc32Concat(new Uint8Array([0x45, 0x4e, 0x44, 0x58])));
    expect(bytes.length).toBe(12);
  });

  test('emits correct length and CRC for non-empty payload', () => {
    const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const w = new BytesWriter();
    writeChunk(w, 'tHmb', payload);
    const bytes = w.toBytes();
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(dv.getUint32(4, false)).toBe(4);
    expect(bytes.subarray(8, 12)).toEqual(payload);
    const typeBytes = new Uint8Array([0x74, 0x48, 0x6d, 0x62]);
    expect(dv.getUint32(12, false)).toBe(crc32Concat(typeBytes, payload));
  });

  test('round-trip: writeSignature + writeChunk reproduces the golden fixture', () => {
    const w = new BytesWriter();
    writeSignature(w, 1, 0);
    writeChunk(w, 'HEAD', MINIMAL_V1_PARTS.headPayload);
    writeChunk(w, 'FRNT', MINIMAL_V1_PARTS.frntPayload);
    writeChunk(w, 'BACK', MINIMAL_V1_PARTS.backPayload);
    writeChunk(w, 'ENDX', new Uint8Array());
    expect(w.toBytes()).toEqual(MINIMAL_V1_BYTES);
  });

  test('output round-trips through parseChunks', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const w = new BytesWriter();
    writeSignature(w, 1, 0);
    writeChunk(w, 'HEAD', MINIMAL_V1_PARTS.headPayload);
    writeChunk(w, 'FRNT', MINIMAL_V1_PARTS.frntPayload);
    writeChunk(w, 'BACK', MINIMAL_V1_PARTS.backPayload);
    writeChunk(w, 'tHmb', payload);
    writeChunk(w, 'ENDX', new Uint8Array());
    const parsed = parseChunks(w.toBytes(), { strictAncillaryCrc: true });
    expect(parsed.chunks.map((c) => c.type)).toEqual(['HEAD', 'FRNT', 'BACK', 'tHmb']);
    expect(parsed.chunks[3]?.payload).toEqual(payload);
  });
});

describe('writeChunk — validation errors', () => {
  test('rejects wrong-length type', () => {
    const w = new BytesWriter();
    expect(() => writeChunk(w, 'HED', new Uint8Array())).toThrow(/must be 4 characters/);
  });

  test('rejects non-letter type byte', () => {
    const w = new BytesWriter();
    expect(() => writeChunk(w, 'HE1D', new Uint8Array())).toThrow(/non-letter byte/);
  });

  test('rejects non-ASCII type', () => {
    const w = new BytesWriter();
    expect(() => writeChunk(w, 'HÉAD', new Uint8Array())).toThrow(XflipEncodeError);
  });

  test('rejects payload above 0x7fffffff', () => {
    const w = new BytesWriter();
    // Fake a too-large array via subarray on a fresh buffer would OOM; spoof length instead.
    const huge = { length: 0x80000000 } as unknown as Uint8Array;
    expect(() => writeChunk(w, 'HEAD', huge)).toThrow(/exceeds the spec maximum/);
  });
});
