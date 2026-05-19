import { describe, expect, test } from 'vitest';
import { MINIMAL_V1_BYTES, MINIMAL_V1_PARTS } from '../../../tests/fixtures/golden/minimal-v1.js';
import { parseChunks } from './chunks.js';
import { crc32Concat } from './crc32.js';
import { XflipCrcError, XflipParseError } from './errors.js';

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
};

const buildChunk = (type: string, payload: Uint8Array): Uint8Array => {
  const typeBytes = new Uint8Array([
    type.charCodeAt(0),
    type.charCodeAt(1),
    type.charCodeAt(2),
    type.charCodeAt(3),
  ]);
  const lengthBytes = new Uint8Array(4);
  new DataView(lengthBytes.buffer).setUint32(0, payload.length, false);
  const crcBytes = new Uint8Array(4);
  new DataView(crcBytes.buffer).setUint32(0, crc32Concat(typeBytes, payload), false);
  return concat([typeBytes, lengthBytes, payload, crcBytes]);
};

const SIGNATURE = new Uint8Array([0x58, 0x46, 0x4c, 0x50, 0x01, 0x00]);
const ENDX = MINIMAL_V1_PARTS.endx;

describe('parseChunks — happy path', () => {
  test('parses the minimal v1.0 golden fixture', () => {
    const result = parseChunks(MINIMAL_V1_BYTES);
    expect(result.versionMajor).toBe(1);
    expect(result.versionMinor).toBe(0);
    expect(result.chunks.map((c) => c.type)).toEqual(['HEAD', 'FRNT', 'BACK']);
    // ENDX terminates but is not returned in the chunk list
  });

  test('payloads are byte-identical to fixture inputs', () => {
    const result = parseChunks(MINIMAL_V1_BYTES);
    const [head, frnt, back] = result.chunks;
    expect(head?.payload).toEqual(MINIMAL_V1_PARTS.headPayload);
    expect(frnt?.payload).toEqual(MINIMAL_V1_PARTS.frntPayload);
    expect(back?.payload).toEqual(MINIMAL_V1_PARTS.backPayload);
  });

  test('marks HEAD/FRNT/BACK as critical', () => {
    const result = parseChunks(MINIMAL_V1_BYTES);
    expect(result.chunks.every((c) => c.critical)).toBe(true);
  });

  test('offset of each chunk points at its TYPE byte', () => {
    const result = parseChunks(MINIMAL_V1_BYTES);
    expect(result.chunks[0]?.offset).toBe(6); // right after 6-byte signature
  });
});

describe('parseChunks — signature errors', () => {
  test('rejects empty input', () => {
    expect(() => parseChunks(new Uint8Array())).toThrow(XflipParseError);
  });

  test('rejects too-short input (< 6 bytes)', () => {
    expect(() => parseChunks(new Uint8Array([0x58, 0x46, 0x4c]))).toThrow(XflipParseError);
  });

  test('rejects bad magic bytes', () => {
    const bad = new Uint8Array(MINIMAL_V1_BYTES);
    bad[0] = 0x59; // 'Y' instead of 'X'
    expect(() => parseChunks(bad)).toThrow(/expected magic "XFLP"/);
  });

  test('tolerates a higher major version (continues parsing per spec §3.1)', () => {
    // Build a v2.0 file with the same chunk layout
    const sig = new Uint8Array([0x58, 0x46, 0x4c, 0x50, 0x02, 0x00]);
    const file = concat([sig, MINIMAL_V1_BYTES.subarray(6)]);
    const result = parseChunks(file);
    expect(result.versionMajor).toBe(2);
  });
});

describe('parseChunks — CRC validation', () => {
  test('throws XflipCrcError on critical chunk CRC mismatch', () => {
    const corrupted = new Uint8Array(MINIMAL_V1_BYTES);
    // Flip a byte inside the HEAD payload (offset 6 + 8 = 14)
    corrupted[14] = (corrupted[14] as number) ^ 0xff;
    try {
      parseChunks(corrupted);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(XflipCrcError);
      expect((err as XflipCrcError).chunkType).toBe('HEAD');
    }
  });

  test('CRC error carries expected and actual checksums', () => {
    const corrupted = new Uint8Array(MINIMAL_V1_BYTES);
    corrupted[14] = (corrupted[14] as number) ^ 0xff;
    try {
      parseChunks(corrupted);
    } catch (err) {
      const crc = err as XflipCrcError;
      expect(crc.expected).not.toBe(crc.actual);
      expect(crc.message).toContain('HEAD');
    }
  });

  test('non-strict mode tolerates ancillary CRC mismatch', () => {
    // Build: SIGNATURE + HEAD + corrupted-CRC tHmb + FRNT + BACK + ENDX
    const tHmb = buildChunk('tHmb', new Uint8Array([0x01, 0x02, 0x03]));
    const corruptCrc = new Uint8Array(tHmb);
    corruptCrc[corruptCrc.length - 1] ^= 0xff;
    const file = concat([
      SIGNATURE,
      MINIMAL_V1_PARTS.head,
      corruptCrc,
      MINIMAL_V1_PARTS.frnt,
      MINIMAL_V1_PARTS.back,
      ENDX,
    ]);
    const result = parseChunks(file);
    expect(result.chunks.map((c) => c.type)).toEqual(['HEAD', 'tHmb', 'FRNT', 'BACK']);
  });

  test('strictAncillaryCrc=true rejects bad ancillary CRC', () => {
    const tHmb = buildChunk('tHmb', new Uint8Array([0x01, 0x02, 0x03]));
    const corruptCrc = new Uint8Array(tHmb);
    corruptCrc[corruptCrc.length - 1] ^= 0xff;
    const file = concat([
      SIGNATURE,
      MINIMAL_V1_PARTS.head,
      corruptCrc,
      MINIMAL_V1_PARTS.frnt,
      MINIMAL_V1_PARTS.back,
      ENDX,
    ]);
    expect(() => parseChunks(file, { strictAncillaryCrc: true })).toThrow(XflipCrcError);
  });
});

describe('parseChunks — chunk type recognition', () => {
  test('META is treated as ancillary despite uppercase first letter', () => {
    const meta = buildChunk('META', new Uint8Array([0x7b, 0x7d])); // "{}"
    const file = concat([
      SIGNATURE,
      meta,
      MINIMAL_V1_PARTS.head,
      MINIMAL_V1_PARTS.frnt,
      MINIMAL_V1_PARTS.back,
      ENDX,
    ]);
    const result = parseChunks(file);
    const metaChunk = result.chunks.find((c) => c.type === 'META');
    expect(metaChunk?.critical).toBe(false);
  });

  test('lowercase-first unknown chunk treated as ancillary', () => {
    const unknown = buildChunk('xZzZ', new Uint8Array([0xaa, 0xbb]));
    const file = concat([
      SIGNATURE,
      MINIMAL_V1_PARTS.head,
      unknown,
      MINIMAL_V1_PARTS.frnt,
      MINIMAL_V1_PARTS.back,
      ENDX,
    ]);
    const result = parseChunks(file);
    const x = result.chunks.find((c) => c.type === 'xZzZ');
    expect(x?.critical).toBe(false);
  });

  test('uppercase-first unknown chunk rejected as unknown critical', () => {
    const unknown = buildChunk('ZZZZ', new Uint8Array([0xaa]));
    const file = concat([
      SIGNATURE,
      MINIMAL_V1_PARTS.head,
      unknown,
      MINIMAL_V1_PARTS.frnt,
      MINIMAL_V1_PARTS.back,
      ENDX,
    ]);
    expect(() => parseChunks(file)).toThrow(/unknown critical chunk type "ZZZZ"/);
  });

  test('non-letter first byte rejected', () => {
    const bad = buildChunk('1ABC', new Uint8Array([0]));
    const file = concat([SIGNATURE, MINIMAL_V1_PARTS.head, bad, ENDX]);
    expect(() => parseChunks(file)).toThrow(/does not start with an ASCII letter/);
  });
});

describe('parseChunks — termination', () => {
  test('rejects files missing ENDX', () => {
    const noEndx = concat([
      SIGNATURE,
      MINIMAL_V1_PARTS.head,
      MINIMAL_V1_PARTS.frnt,
      MINIMAL_V1_PARTS.back,
    ]);
    expect(() => parseChunks(noEndx)).toThrow(/without encountering an ENDX/);
  });

  test('stops parsing after ENDX (ignores trailing bytes)', () => {
    const trailing = concat([MINIMAL_V1_BYTES, new Uint8Array([0xde, 0xad, 0xbe, 0xef])]);
    const result = parseChunks(trailing);
    expect(result.chunks.length).toBe(3);
  });
});

describe('parseChunks — length validation', () => {
  test('rejects chunk length larger than 2^31-1', () => {
    // Hand-craft a HEAD chunk header with length = 0x80000000
    const type = new Uint8Array([0x48, 0x45, 0x41, 0x44]);
    const length = new Uint8Array([0x80, 0x00, 0x00, 0x00]);
    const file = concat([SIGNATURE, type, length, new Uint8Array(20)]);
    expect(() => parseChunks(file)).toThrow(/exceeds the spec maximum/);
  });

  test('rejects truncated payload (length exceeds remaining bytes)', () => {
    const type = new Uint8Array([0x48, 0x45, 0x41, 0x44]);
    const length = new Uint8Array([0x00, 0x00, 0x10, 0x00]); // 4096
    const file = concat([SIGNATURE, type, length, new Uint8Array(8)]); // not enough bytes
    expect(() => parseChunks(file)).toThrow(/only \d+ payload bytes remain/);
  });

  test('rejects truncated header (cannot read length)', () => {
    const type = new Uint8Array([0x48, 0x45, 0x41, 0x44]);
    const file = concat([SIGNATURE, type]); // no length field
    expect(() => parseChunks(file)).toThrow(XflipParseError);
  });
});
