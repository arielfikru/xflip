import { describe, expect, test } from 'vitest';
import { crc32, crc32Concat } from './crc32.js';

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('crc32 — CRC-32/ISO-HDLC reference vectors', () => {
  test('empty input yields 0x00000000', () => {
    expect(crc32(new Uint8Array())).toBe(0x00000000);
  });

  // Rocksoft CRC catalog (https://reveng.sourceforge.io/crc-catalogue/all.htm)
  test('"123456789" check vector → 0xcbf43926', () => {
    expect(crc32(encode('123456789'))).toBe(0xcbf43926);
  });

  test('"a" → 0xe8b7be43', () => {
    expect(crc32(encode('a'))).toBe(0xe8b7be43);
  });

  test('"abc" → 0x352441c2', () => {
    expect(crc32(encode('abc'))).toBe(0x352441c2);
  });

  test('"message digest" → 0x20159d7f', () => {
    expect(crc32(encode('message digest'))).toBe(0x20159d7f);
  });

  test('"abcdefghijklmnopqrstuvwxyz" → 0x4c2750bd', () => {
    expect(crc32(encode('abcdefghijklmnopqrstuvwxyz'))).toBe(0x4c2750bd);
  });
});

describe('crc32 — PNG cross-check', () => {
  test('PNG IEND chunk type "IEND" with empty payload → 0xae426082', () => {
    // The PNG spec mandates the IEND chunk's CRC32 = 0xAE426082, computed
    // over the 4 bytes of the type code "IEND" with no payload. This is the
    // strongest cross-format sanity check: if this passes, the polynomial,
    // init, xor-out, and reflection are all correct.
    const iend = new Uint8Array([0x49, 0x45, 0x4e, 0x44]);
    expect(crc32(iend)).toBe(0xae426082);
  });

  test('long zero-byte run', () => {
    const zeros = new Uint8Array(1024);
    // Pre-computed: crc32 of 1024 zero bytes
    expect(crc32(zeros)).toBe(0xefb5af2e);
  });
});

describe('crc32 — boundary cases', () => {
  test('single-byte values match table-driven oracle', () => {
    // Hand-computed: CRC32 of [0x00] = 0xD202EF8D
    expect(crc32(new Uint8Array([0x00]))).toBe(0xd202ef8d);
    // CRC32 of [0xFF] = 0xFF000000
    expect(crc32(new Uint8Array([0xff]))).toBe(0xff000000);
  });

  test('return value is always uint32 (no negative)', () => {
    const bytes = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    const result = crc32(bytes);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('crc32Concat', () => {
  test('matches crc32 over the joined buffer for two spans', () => {
    const a = encode('hello, ');
    const b = encode('world');
    const joined = new Uint8Array(a.length + b.length);
    joined.set(a, 0);
    joined.set(b, a.length);
    expect(crc32Concat(a, b)).toBe(crc32(joined));
  });

  test('matches crc32 over the joined buffer for three spans', () => {
    const parts = [encode('XFLP'), new Uint8Array([0x01, 0x01]), encode('payload')];
    const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const part of parts) {
      joined.set(part, offset);
      offset += part.length;
    }
    expect(crc32Concat(...parts)).toBe(crc32(joined));
  });

  test('zero spans yields the same as crc32(empty)', () => {
    expect(crc32Concat()).toBe(crc32(new Uint8Array()));
  });

  test('single span matches crc32 of that span', () => {
    const bytes = encode('123456789');
    expect(crc32Concat(bytes)).toBe(crc32(bytes));
  });
});

describe('crc32 — xflip-specific vectors', () => {
  test('"ENDX" chunk type (per spec v0.2 Section 4.4)', () => {
    // Per spec, the ENDX chunk has a 0-byte payload and the CRC32 is computed
    // over just the 4 bytes "ENDX". This lock-in value must remain stable.
    const endx = new Uint8Array([0x45, 0x4e, 0x44, 0x58]);
    expect(crc32(endx)).toBe(0x062f841e);
  });

  test('"XFLP" magic bytes', () => {
    // Not part of any CRC in the file (the signature is not a chunk), but
    // useful as a stable lock-in value for the impl.
    expect(crc32(new Uint8Array([0x58, 0x46, 0x4c, 0x50]))).toBe(0x6c4d58de);
  });
});
