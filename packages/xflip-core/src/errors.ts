/**
 * Base class for all xflip-core errors. Catch this to handle anything xflip
 * throws.
 */
export class XflipError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'XflipError';
  }
}

/**
 * Thrown when the decoder rejects malformed input. Includes the byte offset
 * where the parse failed so the caller can locate the corruption.
 */
export class XflipParseError extends XflipError {
  constructor(
    message: string,
    readonly offset: number,
    options?: { cause?: unknown },
  ) {
    super(`[offset 0x${offset.toString(16)}] ${message}`, options);
    this.name = 'XflipParseError';
  }
}

/**
 * Thrown when CRC32 validation fails on a chunk. A specialization of
 * {@link XflipParseError} carrying both the expected and actual checksums.
 */
export class XflipCrcError extends XflipParseError {
  constructor(
    readonly chunkType: string,
    offset: number,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(
      `CRC32 mismatch on chunk "${chunkType}": expected 0x${expected
        .toString(16)
        .padStart(8, '0')}, got 0x${actual.toString(16).padStart(8, '0')}`,
      offset,
    );
    this.name = 'XflipCrcError';
  }
}

/**
 * Thrown when the encoder is asked to produce an invalid file (e.g., chunk
 * exceeds 2^31-1 bytes, image data missing, head dimensions out of range).
 */
export class XflipEncodeError extends XflipError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'XflipEncodeError';
  }
}
