import { describe, expect, test } from 'vitest';
import {
  BytesReader,
  BytesWriter,
  readAscii,
  readSlice,
  readUint8,
  readUint16BE,
  readUint32BE,
  writeUint8,
  writeUint16BE,
  writeUint32BE,
} from './bytes.js';
import { XflipParseError } from './errors.js';

describe('readUint8 / writeUint8', () => {
  test('read returns byte at offset', () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(readUint8(bytes, 0)).toBe(0xde);
    expect(readUint8(bytes, 3)).toBe(0xef);
  });

  test('write places byte at offset and masks to 8 bits', () => {
    const bytes = new Uint8Array(4);
    writeUint8(bytes, 1, 0xff);
    writeUint8(bytes, 2, 0x1ff);
    expect(bytes[1]).toBe(0xff);
    expect(bytes[2]).toBe(0xff);
  });

  test('OOB read throws XflipParseError with offset', () => {
    const bytes = new Uint8Array(2);
    expect(() => readUint8(bytes, 5)).toThrow(XflipParseError);
    try {
      readUint8(bytes, 5);
    } catch (e) {
      expect(e).toBeInstanceOf(XflipParseError);
      expect((e as XflipParseError).offset).toBe(5);
    }
  });
});

describe('readUint16BE / writeUint16BE', () => {
  test('big-endian read', () => {
    const bytes = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
    expect(readUint16BE(bytes, 0)).toBe(0x1234);
    expect(readUint16BE(bytes, 2)).toBe(0x5678);
  });

  test('round-trip', () => {
    const bytes = new Uint8Array(2);
    writeUint16BE(bytes, 0, 0xabcd);
    expect(bytes[0]).toBe(0xab);
    expect(bytes[1]).toBe(0xcd);
    expect(readUint16BE(bytes, 0)).toBe(0xabcd);
  });

  test('OOB throws', () => {
    expect(() => readUint16BE(new Uint8Array(1), 0)).toThrow(XflipParseError);
  });
});

describe('readUint32BE / writeUint32BE', () => {
  test('big-endian read of XFLP-like value', () => {
    const bytes = new Uint8Array([0x58, 0x46, 0x4c, 0x50]);
    expect(readUint32BE(bytes, 0)).toBe(0x58464c50);
  });

  test('handles max uint32 without sign issues', () => {
    const bytes = new Uint8Array(4);
    writeUint32BE(bytes, 0, 0xffffffff);
    expect(readUint32BE(bytes, 0)).toBe(0xffffffff);
  });

  test('round-trip 0x80000000 (high bit)', () => {
    const bytes = new Uint8Array(4);
    writeUint32BE(bytes, 0, 0x80000000);
    expect(readUint32BE(bytes, 0)).toBe(0x80000000);
  });

  test('OOB throws with descriptive message', () => {
    try {
      readUint32BE(new Uint8Array(3), 0);
    } catch (e) {
      expect(e).toBeInstanceOf(XflipParseError);
      expect((e as Error).message).toContain('uint32');
    }
  });
});

describe('readAscii / readSlice', () => {
  test('readAscii decodes XFLP magic', () => {
    const bytes = new Uint8Array([0x58, 0x46, 0x4c, 0x50, 0x01, 0x01]);
    expect(readAscii(bytes, 0, 4)).toBe('XFLP');
  });

  test('readAscii throws on invalid (non-ASCII) bytes', () => {
    const bytes = new Uint8Array([0xff, 0xfe]);
    expect(() => readAscii(bytes, 0, 2)).toThrow();
  });

  test('readSlice returns a view (no copy) into the source', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const slice = readSlice(bytes, 1, 3);
    expect(slice).toEqual(new Uint8Array([2, 3, 4]));
    expect(slice.buffer).toBe(bytes.buffer);
  });

  test('readSlice OOB throws', () => {
    expect(() => readSlice(new Uint8Array(2), 0, 5)).toThrow(XflipParseError);
  });
});

describe('BytesReader', () => {
  test('cursor advances for each read', () => {
    const bytes = new Uint8Array([0x58, 0x46, 0x4c, 0x50, 0x01, 0x01]);
    const r = new BytesReader(bytes);
    expect(r.offset).toBe(0);
    expect(r.ascii(4)).toBe('XFLP');
    expect(r.offset).toBe(4);
    expect(r.u8()).toBe(1);
    expect(r.u8()).toBe(1);
    expect(r.eof()).toBe(true);
  });

  test('remaining() reports unread byte count', () => {
    const r = new BytesReader(new Uint8Array(10));
    expect(r.remaining()).toBe(10);
    r.skip(3);
    expect(r.remaining()).toBe(7);
  });

  test('u16BE and u32BE advance correctly', () => {
    const bytes = new Uint8Array([0, 0, 0, 12, 0xde, 0xad]);
    const r = new BytesReader(bytes);
    expect(r.u32BE()).toBe(12);
    expect(r.offset).toBe(4);
    expect(r.u16BE()).toBe(0xdead);
    expect(r.offset).toBe(6);
  });

  test('skip(negative) throws', () => {
    const r = new BytesReader(new Uint8Array(10));
    expect(() => r.skip(-1)).toThrow(XflipParseError);
  });

  test('skip past end throws and offset stays at attempt point', () => {
    const r = new BytesReader(new Uint8Array(5));
    r.skip(3);
    expect(() => r.skip(10)).toThrow(XflipParseError);
    // offset must not advance on failure
    expect(r.offset).toBe(3);
  });

  test('slice() returns a view starting at cursor', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const r = new BytesReader(bytes);
    r.skip(1);
    const view = r.slice(3);
    expect(view).toEqual(new Uint8Array([2, 3, 4]));
    expect(r.offset).toBe(4);
  });

  test('OOB error carries the cursor offset', () => {
    const r = new BytesReader(new Uint8Array(2));
    r.skip(1);
    try {
      r.u32BE();
    } catch (e) {
      expect(e).toBeInstanceOf(XflipParseError);
      expect((e as XflipParseError).offset).toBe(1);
    }
  });
});

describe('BytesWriter', () => {
  test('writes and reports length correctly', () => {
    const w = new BytesWriter();
    w.ascii('XFLP');
    w.u8(1);
    w.u8(1);
    expect(w.length).toBe(6);
    const out = w.toBytes();
    expect(out).toEqual(new Uint8Array([0x58, 0x46, 0x4c, 0x50, 1, 1]));
  });

  test('round-trip with BytesReader', () => {
    const w = new BytesWriter();
    w.u32BE(0xdeadbeef);
    w.u16BE(0x1234);
    w.u8(0xab);
    w.bytes(new Uint8Array([1, 2, 3]));

    const r = new BytesReader(w.toBytes());
    expect(r.u32BE()).toBe(0xdeadbeef);
    expect(r.u16BE()).toBe(0x1234);
    expect(r.u8()).toBe(0xab);
    expect(r.slice(3)).toEqual(new Uint8Array([1, 2, 3]));
    expect(r.eof()).toBe(true);
  });

  test('grows beyond initial capacity', () => {
    const w = new BytesWriter(16);
    const big = new Uint8Array(1024).fill(0xaa);
    w.bytes(big);
    expect(w.length).toBe(1024);
    expect(w.toBytes()).toEqual(big);
  });

  test('toBytes returns a fresh copy each call', () => {
    const w = new BytesWriter();
    w.u8(1);
    const a = w.toBytes();
    w.u8(2);
    const b = w.toBytes();
    expect(a.length).toBe(1);
    expect(b.length).toBe(2);
    expect(a).toEqual(new Uint8Array([1]));
    expect(b).toEqual(new Uint8Array([1, 2]));
  });
});
