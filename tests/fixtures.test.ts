import { describe, expect, test } from 'vitest';
import { crc32Concat } from '../packages/xflip-core/src/crc32.js';
import { MINIMAL_V1_BYTES, MINIMAL_V1_PARTS } from './fixtures/golden/minimal-v1.js';

describe('golden fixture: MINIMAL_V1', () => {
  test('starts with the XFLP signature and version 1.0', () => {
    expect(MINIMAL_V1_BYTES.slice(0, 6)).toEqual(
      new Uint8Array([0x58, 0x46, 0x4c, 0x50, 0x01, 0x00]),
    );
  });

  test('total size is 62 bytes (signature 6 + HEAD 24 + FRNT 17 + BACK 17 + ENDX 12)', () => {
    expect(MINIMAL_V1_BYTES.length).toBe(6 + 24 + 17 + 17 + 12);
  });

  test('HEAD chunk has the correct type tag and 12-byte payload', () => {
    const head = MINIMAL_V1_PARTS.head;
    expect(head.slice(0, 4)).toEqual(new Uint8Array([0x48, 0x45, 0x41, 0x44]));
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    expect(view.getUint32(4, false)).toBe(12);
  });

  test('ENDX chunk has a zero-length payload (per spec Section 4.4)', () => {
    const endx = MINIMAL_V1_PARTS.endx;
    expect(endx.length).toBe(12); // 4 type + 4 length + 0 payload + 4 crc
    const view = new DataView(endx.buffer, endx.byteOffset, endx.byteLength);
    expect(view.getUint32(4, false)).toBe(0);
  });

  test('ENDX CRC matches the known value 0x062f841e from spec lock-in', () => {
    const endx = MINIMAL_V1_PARTS.endx;
    const view = new DataView(endx.buffer, endx.byteOffset, endx.byteLength);
    expect(view.getUint32(8, false)).toBe(0x062f841e);
  });

  test.each([
    ['HEAD', MINIMAL_V1_PARTS.head] as const,
    ['FRNT', MINIMAL_V1_PARTS.frnt] as const,
    ['BACK', MINIMAL_V1_PARTS.back] as const,
    ['ENDX', MINIMAL_V1_PARTS.endx] as const,
  ])('CRC of %s chunk validates', (_label, chunk) => {
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const length = view.getUint32(4, false);
    const expected = view.getUint32(8 + length, false);
    const type = chunk.subarray(0, 4);
    const payload = chunk.subarray(8, 8 + length);
    expect(crc32Concat(type, payload)).toBe(expected);
  });

  test('chunks appear in spec-mandated order: HEAD, FRNT, BACK, ENDX', () => {
    const view = new DataView(
      MINIMAL_V1_BYTES.buffer,
      MINIMAL_V1_BYTES.byteOffset,
      MINIMAL_V1_BYTES.byteLength,
    );
    const types: string[] = [];
    let offset = 6; // skip signature
    while (offset < MINIMAL_V1_BYTES.length) {
      const type = String.fromCharCode(
        MINIMAL_V1_BYTES[offset] as number,
        MINIMAL_V1_BYTES[offset + 1] as number,
        MINIMAL_V1_BYTES[offset + 2] as number,
        MINIMAL_V1_BYTES[offset + 3] as number,
      );
      types.push(type);
      const length = view.getUint32(offset + 4, false);
      offset += 8 + length + 4;
    }
    expect(types).toEqual(['HEAD', 'FRNT', 'BACK', 'ENDX']);
  });
});
