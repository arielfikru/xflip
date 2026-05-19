/**
 * Byte-level reader and writer utilities for big-endian binary formats.
 *
 * All multi-byte integers in xflip are big-endian (spec v0.2 Section 2.6).
 * These helpers wrap `DataView` to avoid hand-rolling shift arithmetic in
 * the decoder/encoder.
 *
 * No `Buffer` use: this module ships to browsers.
 */

import { XflipParseError } from './errors.js';

const ASCII_ENCODER = new TextEncoder();

const dataViewOf = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const ensureRange = (bytes: Uint8Array, offset: number, size: number, what: string): void => {
  if (offset < 0 || offset + size > bytes.length) {
    throw new XflipParseError(
      `read past end while reading ${what} (need ${size} bytes from offset, have ${
        bytes.length - offset
      })`,
      offset,
    );
  }
};

export function readUint8(bytes: Uint8Array, offset: number): number {
  ensureRange(bytes, offset, 1, 'uint8');
  return bytes[offset] as number;
}

export function readUint16BE(bytes: Uint8Array, offset: number): number {
  ensureRange(bytes, offset, 2, 'uint16');
  return dataViewOf(bytes).getUint16(offset, false);
}

export function readUint32BE(bytes: Uint8Array, offset: number): number {
  ensureRange(bytes, offset, 4, 'uint32');
  return dataViewOf(bytes).getUint32(offset, false);
}

export function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  ensureRange(bytes, offset, length, `ascii(${length})`);
  let out = '';
  for (let i = 0; i < length; i++) {
    const byte = bytes[offset + i] as number;
    if (byte > 0x7f) {
      throw new XflipParseError(
        `non-ASCII byte 0x${byte.toString(16)} at position ${i} of ascii(${length})`,
        offset + i,
      );
    }
    out += String.fromCharCode(byte);
  }
  return out;
}

export function readSlice(bytes: Uint8Array, offset: number, length: number): Uint8Array {
  ensureRange(bytes, offset, length, `slice(${length})`);
  return bytes.subarray(offset, offset + length);
}

/**
 * Stateful cursor over a `Uint8Array`. Each `u*` call advances the cursor
 * by the size read. Throws {@link XflipParseError} on out-of-bounds reads,
 * carrying the offset at which the read failed.
 */
export class BytesReader {
  #offset = 0;
  readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  get offset(): number {
    return this.#offset;
  }

  remaining(): number {
    return this.bytes.length - this.#offset;
  }

  eof(): boolean {
    return this.#offset >= this.bytes.length;
  }

  u8(): number {
    const v = readUint8(this.bytes, this.#offset);
    this.#offset += 1;
    return v;
  }

  u16BE(): number {
    const v = readUint16BE(this.bytes, this.#offset);
    this.#offset += 2;
    return v;
  }

  u32BE(): number {
    const v = readUint32BE(this.bytes, this.#offset);
    this.#offset += 4;
    return v;
  }

  ascii(length: number): string {
    const v = readAscii(this.bytes, this.#offset, length);
    this.#offset += length;
    return v;
  }

  /** Returns a view into the source buffer; does not copy. */
  slice(length: number): Uint8Array {
    const v = readSlice(this.bytes, this.#offset, length);
    this.#offset += length;
    return v;
  }

  skip(n: number): void {
    if (n < 0) {
      throw new XflipParseError(`cannot skip negative bytes (${n})`, this.#offset);
    }
    ensureRange(this.bytes, this.#offset, n, `skip(${n})`);
    this.#offset += n;
  }
}

export function writeUint8(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
}

export function writeUint16BE(bytes: Uint8Array, offset: number, value: number): void {
  dataViewOf(bytes).setUint16(offset, value & 0xffff, false);
}

export function writeUint32BE(bytes: Uint8Array, offset: number, value: number): void {
  dataViewOf(bytes).setUint32(offset, value >>> 0, false);
}

/**
 * Growable byte-buffer writer. Doubles capacity when filled. `toBytes()`
 * returns a tight copy of the written portion.
 */
export class BytesWriter {
  #buf: Uint8Array;
  #length = 0;

  constructor(initialCapacity = 256) {
    this.#buf = new Uint8Array(Math.max(16, initialCapacity));
  }

  get length(): number {
    return this.#length;
  }

  #ensure(extra: number): void {
    const needed = this.#length + extra;
    if (needed <= this.#buf.length) return;
    let cap = this.#buf.length;
    while (cap < needed) cap *= 2;
    const grown = new Uint8Array(cap);
    grown.set(this.#buf.subarray(0, this.#length), 0);
    this.#buf = grown;
  }

  u8(value: number): void {
    this.#ensure(1);
    writeUint8(this.#buf, this.#length, value);
    this.#length += 1;
  }

  u16BE(value: number): void {
    this.#ensure(2);
    writeUint16BE(this.#buf, this.#length, value);
    this.#length += 2;
  }

  u32BE(value: number): void {
    this.#ensure(4);
    writeUint32BE(this.#buf, this.#length, value);
    this.#length += 4;
  }

  ascii(str: string): void {
    const encoded = ASCII_ENCODER.encode(str);
    this.bytes(encoded);
  }

  bytes(span: Uint8Array): void {
    this.#ensure(span.length);
    this.#buf.set(span, this.#length);
    this.#length += span.length;
  }

  /** Returns a tight copy of the written bytes. The writer remains usable. */
  toBytes(): Uint8Array {
    return this.#buf.slice(0, this.#length);
  }
}
