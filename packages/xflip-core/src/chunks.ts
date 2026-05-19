/**
 * Low-level chunk parser for the xflip container format.
 *
 * Responsibilities: validate the 6-byte signature, iterate TYPE/LENGTH/
 * PAYLOAD/CRC tuples until the `ENDX` terminator, and check CRC32 against
 * every chunk. Ordering rules (HEAD-first, FRNT-before-BACK, etc.) are
 * enforced higher up in `decode()`.
 *
 * Throws {@link XflipParseError} or {@link XflipCrcError} with the offset
 * where the parse failed.
 */

import { BytesReader, type BytesWriter } from './bytes.js';
import { crc32Concat } from './crc32.js';
import { XflipCrcError, XflipEncodeError, XflipParseError } from './errors.js';

const SIGNATURE_LENGTH = 6;
const SUPPORTED_MAJOR_VERSION = 1;
const MAX_CHUNK_PAYLOAD = 0x7fffffff; // spec §3.2: LENGTH is uint32 max 2^31-1

const KNOWN_CRITICAL: ReadonlySet<string> = new Set(['HEAD', 'FRNT', 'BACK', 'ENDX']);
const KNOWN_ANCILLARY: ReadonlySet<string> = new Set([
  'META',
  'tHmb',
  'fLip',
  'sIgn',
  'eDge',
  'fLyr',
  'bLyr',
  'hEfx',
]);

const isUppercase = (charCode: number): boolean => charCode >= 0x41 && charCode <= 0x5a;
const isLowercase = (charCode: number): boolean => charCode >= 0x61 && charCode <= 0x7a;

/**
 * A single parsed chunk. Excludes the wire framing (length, CRC) and
 * exposes only the type tag and its payload as a view into the source
 * buffer (no copy).
 */
export interface ParsedChunk {
  /** Four-character ASCII chunk type code, case-sensitive (e.g., "HEAD", "fLyr"). */
  readonly type: string;
  /** Byte offset of the TYPE field in the source buffer. */
  readonly offset: number;
  /** Chunk payload bytes (view into source, may be empty). */
  readonly payload: Uint8Array;
  /** `true` if the chunk's first letter is uppercase (spec §3.3). */
  readonly critical: boolean;
}

/**
 * Result of {@link parseChunks}. Contains the parsed format version and the
 * ordered list of chunks up to (but excluding) the `ENDX` terminator.
 */
export interface ParsedFile {
  readonly versionMajor: number;
  readonly versionMinor: number;
  readonly chunks: readonly ParsedChunk[];
}

export interface ParseOptions {
  /** If `true`, mismatched CRC on ancillary chunks throws; if `false` (default),
   *  the chunk is skipped silently. */
  readonly strictAncillaryCrc?: boolean;
}

/**
 * Parse an xflip byte buffer into its raw chunk list.
 *
 * @param bytes - Full file bytes.
 * @param options - Optional behavior switches.
 * @returns Parsed signature + chunk list, ENDX-terminated.
 *
 * @throws XflipParseError - Magic bytes wrong, truncated input, unknown
 *   critical chunk type, missing ENDX, or chunk length exceeds 2^31-1.
 * @throws XflipCrcError - CRC32 mismatch on a critical chunk (or on any
 *   chunk when `strictAncillaryCrc` is `true`).
 */
export function parseChunks(bytes: Uint8Array, options: ParseOptions = {}): ParsedFile {
  const strictAncillaryCrc = options.strictAncillaryCrc ?? false;

  const reader = new BytesReader(bytes);
  const { versionMajor, versionMinor } = readSignature(reader);

  const chunks: ParsedChunk[] = [];
  let sawEndx = false;

  while (!reader.eof()) {
    const chunkOffset = reader.offset;
    const { type, critical } = readChunkType(reader);
    const length = readChunkLength(reader, chunkOffset);
    const payload = reader.slice(length);
    const declaredCrc = reader.u32BE();

    validateCrc(type, payload, declaredCrc, chunkOffset, critical, strictAncillaryCrc);

    if (type === 'ENDX') {
      sawEndx = true;
      break;
    }

    chunks.push({ type, offset: chunkOffset, payload, critical });
  }

  if (!sawEndx) {
    throw new XflipParseError(
      'reached end of input without encountering an ENDX chunk',
      reader.offset,
    );
  }

  return { versionMajor, versionMinor, chunks };
}

const readSignature = (reader: BytesReader): { versionMajor: number; versionMinor: number } => {
  if (reader.remaining() < SIGNATURE_LENGTH) {
    throw new XflipParseError(
      `file is too short to contain an XFLP signature (${reader.remaining()} bytes)`,
      0,
    );
  }
  const magic = reader.ascii(4);
  if (magic !== 'XFLP') {
    throw new XflipParseError(`expected magic "XFLP", got "${magic}" — not an xflip file`, 0);
  }
  const versionMajor = reader.u8();
  const versionMinor = reader.u8();
  if (versionMajor > SUPPORTED_MAJOR_VERSION) {
    // Spec §3.1: decoder MAY warn but SHOULD attempt to parse. We continue.
    // Higher-level callers can inspect versionMajor and act accordingly.
  }
  return { versionMajor, versionMinor };
};

const readChunkType = (reader: BytesReader): { type: string; critical: boolean } => {
  const offset = reader.offset;
  if (reader.remaining() < 4) {
    throw new XflipParseError(
      `truncated input: need 4 bytes for chunk type, have ${reader.remaining()}`,
      offset,
    );
  }
  const type = reader.ascii(4);
  const firstChar = type.charCodeAt(0);
  if (!isUppercase(firstChar) && !isLowercase(firstChar)) {
    throw new XflipParseError(`chunk type "${type}" does not start with an ASCII letter`, offset);
  }

  // Spec v0.2 §3.3: Appendix A registry is authoritative; case rule is
  // a fallback for unknown types only. `META` is registered Ancillary
  // despite its uppercase 'M'.
  if (KNOWN_CRITICAL.has(type)) {
    return { type, critical: true };
  }
  if (KNOWN_ANCILLARY.has(type)) {
    return { type, critical: false };
  }
  if (isUppercase(firstChar)) {
    throw new XflipParseError(
      `unknown critical chunk type "${type}"; decoder must understand all critical chunks (spec §3.3)`,
      offset,
    );
  }
  // Lowercase-first unknown chunk: per spec, safely treat as ancillary.
  return { type, critical: false };
};

const readChunkLength = (reader: BytesReader, chunkOffset: number): number => {
  const length = reader.u32BE();
  if (length > MAX_CHUNK_PAYLOAD) {
    throw new XflipParseError(
      `chunk length ${length} exceeds the spec maximum of 0x7fffffff`,
      chunkOffset + 4,
    );
  }
  if (length > reader.remaining() - 4) {
    // Need `length` bytes of payload plus 4 bytes of trailing CRC.
    throw new XflipParseError(
      `chunk declares length ${length} but only ${reader.remaining() - 4} payload bytes remain`,
      chunkOffset + 4,
    );
  }
  return length;
};

const validateCrc = (
  type: string,
  payload: Uint8Array,
  declaredCrc: number,
  chunkOffset: number,
  critical: boolean,
  strictAncillaryCrc: boolean,
): void => {
  const typeBytes = new Uint8Array([
    type.charCodeAt(0),
    type.charCodeAt(1),
    type.charCodeAt(2),
    type.charCodeAt(3),
  ]);
  const actualCrc = crc32Concat(typeBytes, payload);
  if (actualCrc !== declaredCrc) {
    if (critical || strictAncillaryCrc) {
      throw new XflipCrcError(type, chunkOffset, declaredCrc, actualCrc);
    }
    // Ancillary + non-strict: silently skip. Note: the caller still sees
    // the chunk in the returned list. Callers that care about CRC of
    // ancillary chunks should pass strictAncillaryCrc: true.
  }
};

const isAsciiLetter = (charCode: number): boolean => isUppercase(charCode) || isLowercase(charCode);

const typeBytesOf = (type: string): Uint8Array =>
  new Uint8Array([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)]);

/**
 * Serialize a single chunk (TYPE + LENGTH + PAYLOAD + CRC) onto a writer.
 *
 * Validates the type tag is exactly 4 ASCII letters and the payload fits in
 * a uint32 within the spec maximum (2^31-1 bytes, §3.2). Computes CRC32 over
 * `TYPE + PAYLOAD` per spec §3.4.
 *
 * @param writer - Destination buffer.
 * @param type - Four-character ASCII chunk type (e.g., "HEAD", "fLyr").
 * @param payload - Chunk payload bytes; may be empty.
 *
 * @throws XflipEncodeError - Type tag malformed or payload too large.
 */
export function writeChunk(writer: BytesWriter, type: string, payload: Uint8Array): void {
  validateChunkType(type);
  if (payload.length > MAX_CHUNK_PAYLOAD) {
    throw new XflipEncodeError(
      `chunk "${type}" payload length ${payload.length} exceeds the spec maximum of 0x7fffffff`,
    );
  }
  const typeBytes = typeBytesOf(type);
  writer.bytes(typeBytes);
  writer.u32BE(payload.length);
  writer.bytes(payload);
  writer.u32BE(crc32Concat(typeBytes, payload));
}

/**
 * Write the 6-byte XFLP signature: `"XFLP"` + uint8 major + uint8 minor.
 *
 * @throws XflipEncodeError - Version bytes out of uint8 range.
 */
export function writeSignature(
  writer: BytesWriter,
  versionMajor: number,
  versionMinor: number,
): void {
  if (!isUint8(versionMajor) || !isUint8(versionMinor)) {
    throw new XflipEncodeError(
      `version bytes must be uint8, got major=${versionMajor} minor=${versionMinor}`,
    );
  }
  writer.ascii('XFLP');
  writer.u8(versionMajor);
  writer.u8(versionMinor);
}

const isUint8 = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 0xff;

const validateChunkType = (type: string): void => {
  if (type.length !== 4) {
    throw new XflipEncodeError(`chunk type must be 4 characters, got "${type}" (${type.length})`);
  }
  for (let i = 0; i < 4; i++) {
    const code = type.charCodeAt(i);
    if (!isAsciiLetter(code)) {
      throw new XflipEncodeError(
        `chunk type "${type}" contains non-letter byte 0x${code.toString(16)} at index ${i}`,
      );
    }
  }
};

/** Internal: exposed for tests. */
export const __testing = {
  KNOWN_CRITICAL,
  KNOWN_ANCILLARY,
  SIGNATURE_LENGTH,
  SUPPORTED_MAJOR_VERSION,
};
