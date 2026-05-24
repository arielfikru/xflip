/**
 * High-level decoder: byte buffer → typed {@link XflipFile}.
 *
 * Builds on {@link parseChunks}: lifts the raw chunk list into a domain
 * object, parses the HEAD payload, enforces chunk-ordering invariants, and
 * surfaces optional ancillaries. Flat v1.0 surface only.
 */

import { type ParsedChunk, type ParseOptions, parseChunks } from './chunks.js';
import { XflipParseError } from './errors.js';
import {
  FLIP_AXIS_CODES,
  type FlipAxis,
  IMAGE_FORMAT_CODES,
  type ImageFormat,
  type XflipFile,
  type XflipHead,
} from './types.js';

const HEAD_PAYLOAD_LENGTH = 12;

const IMAGE_FORMAT_BY_CODE: ReadonlyMap<number, ImageFormat> = new Map(
  Object.entries(IMAGE_FORMAT_CODES).map(([name, code]) => [code, name as ImageFormat]),
);

const FLIP_AXIS_BY_CODE: ReadonlyMap<number, FlipAxis> = new Map(
  Object.entries(FLIP_AXIS_CODES).map(([name, code]) => [code, name as FlipAxis]),
);

/**
 * Decode an xflip byte buffer into a typed {@link XflipFile}.
 *
 * @param bytes - Full file bytes.
 * @param options - Forwarded to {@link parseChunks}.
 * @returns Decoded file. Ancillary chunks (META, tHmb, etc.) are preserved
 *   as raw payloads on `file.ancillary`.
 *
 * @throws XflipParseError - Wrong chunk order, missing mandatory chunk,
 *   malformed HEAD payload, unknown image format code, or any framing
 *   error from {@link parseChunks}.
 * @throws XflipCrcError - Critical chunk CRC mismatch.
 */
export function decode(bytes: Uint8Array, options?: ParseOptions): XflipFile {
  const parsed = parseChunks(bytes, options);

  const headChunk = expectFirst(parsed.chunks, 'HEAD');
  const head = parseHead(headChunk);

  const frntIndex = findIndex(parsed.chunks, 'FRNT');
  const backIndex = findIndex(parsed.chunks, 'BACK');
  if (frntIndex < 0) {
    throw new XflipParseError('missing mandatory FRNT chunk', 0);
  }
  if (backIndex < 0) {
    throw new XflipParseError('missing mandatory BACK chunk', 0);
  }
  if (backIndex < frntIndex) {
    throw new XflipParseError(
      'BACK chunk appears before FRNT chunk (spec §3.5: FRNT MUST precede BACK)',
      (parsed.chunks[backIndex] as ParsedChunk).offset,
    );
  }

  const frnt = parsed.chunks[frntIndex] as ParsedChunk;
  const back = parsed.chunks[backIndex] as ParsedChunk;

  const ancillary = collectAncillary(parsed.chunks);

  const file: XflipFile = {
    versionMajor: parsed.versionMajor,
    versionMinor: parsed.versionMinor,
    head,
    front: copy(frnt.payload),
    back: copy(back.payload),
  };
  if (ancillary.size > 0) file.ancillary = ancillary;
  return file;
}

const expectFirst = (chunks: readonly ParsedChunk[], type: string): ParsedChunk => {
  const first = chunks[0];
  if (!first || first.type !== type) {
    throw new XflipParseError(
      `expected first chunk to be "${type}", got "${first?.type ?? '<none>'}" (spec §3.5)`,
      first?.offset ?? 0,
    );
  }
  return first;
};

const findIndex = (chunks: readonly ParsedChunk[], type: string): number =>
  chunks.findIndex((c) => c.type === type);

const parseHead = (chunk: ParsedChunk): XflipHead => {
  if (chunk.payload.length !== HEAD_PAYLOAD_LENGTH) {
    throw new XflipParseError(
      `HEAD payload must be exactly ${HEAD_PAYLOAD_LENGTH} bytes, got ${chunk.payload.length}`,
      chunk.offset,
    );
  }
  const dv = new DataView(chunk.payload.buffer, chunk.payload.byteOffset, chunk.payload.byteLength);
  const width = dv.getUint32(0, false);
  const height = dv.getUint32(4, false);
  if (width === 0 || height === 0) {
    throw new XflipParseError(
      `HEAD width/height must be non-zero, got ${width}x${height}`,
      chunk.offset,
    );
  }
  const frontFormat = lookupFormat(dv.getUint8(8), 'front_format', chunk.offset + 8);
  const backFormat = lookupFormat(dv.getUint8(9), 'back_format', chunk.offset + 9);
  const flipAxis = lookupFlipAxis(dv.getUint8(10), chunk.offset + 10);
  const flags = dv.getUint8(11);
  return { width, height, frontFormat, backFormat, flipAxis, flags };
};

const lookupFormat = (code: number, field: string, offset: number): ImageFormat => {
  const name = IMAGE_FORMAT_BY_CODE.get(code);
  if (!name) {
    throw new XflipParseError(
      `unknown ${field} code 0x${code.toString(16).padStart(2, '0')} (spec §4.1)`,
      offset,
    );
  }
  return name;
};

const lookupFlipAxis = (code: number, offset: number): FlipAxis => {
  const name = FLIP_AXIS_BY_CODE.get(code);
  if (!name) {
    throw new XflipParseError(
      `unknown flip_axis code 0x${code.toString(16).padStart(2, '0')} (spec §4.1)`,
      offset,
    );
  }
  return name;
};

const collectAncillary = (chunks: readonly ParsedChunk[]): Map<string, Uint8Array> => {
  const ancillary = new Map<string, Uint8Array>();
  for (const chunk of chunks) {
    if (chunk.critical) continue;
    ancillary.set(chunk.type, copy(chunk.payload));
  }
  return ancillary;
};

const copy = (view: Uint8Array): Uint8Array => {
  const out = new Uint8Array(view.length);
  out.set(view);
  return out;
};
