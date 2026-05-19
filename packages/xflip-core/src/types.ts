/**
 * Image format codes as defined in xflip spec v0.2 Section 4.1 HEAD chunk.
 */
export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'avif' | 'jxl' | 'raw' | 'custom';

/**
 * Numeric encoding of {@link ImageFormat} on the wire.
 */
export const IMAGE_FORMAT_CODES = {
  raw: 0x00,
  png: 0x01,
  jpeg: 0x02,
  webp: 0x03,
  avif: 0x04,
  jxl: 0x05,
  custom: 0xff,
} as const satisfies Record<ImageFormat, number>;

/**
 * Suggested flip axis per spec v0.2 Section 4.1.
 */
export type FlipAxis = 'horizontal' | 'vertical' | 'diagonal';

export const FLIP_AXIS_CODES = {
  horizontal: 0x00,
  vertical: 0x01,
  diagonal: 0x02,
} as const satisfies Record<FlipAxis, number>;

/**
 * Chunk type codes used by the decoder/encoder. All are 4-byte ASCII,
 * case-sensitive per spec Section 3.3.
 */
export type ChunkType =
  | 'HEAD'
  | 'FRNT'
  | 'BACK'
  | 'ENDX'
  | 'META'
  | 'tHmb'
  | 'fLip'
  | 'sIgn'
  | 'eDge'
  | 'fLyr'
  | 'bLyr'
  | 'hEfx';

/**
 * Decoded HEAD chunk per spec v0.2 Section 4.1.
 */
export interface XflipHead {
  width: number;
  height: number;
  frontFormat: ImageFormat;
  backFormat: ImageFormat;
  flipAxis: FlipAxis;
  /** Bit 0: DEFAULT_BACK. Bit 1: NO_FLIP_ANIM. Other bits reserved. */
  flags: number;
}

/**
 * Decoded xflip file. v1.0 surface only (no layered effects).
 *
 * Layered effect fields (`fLyr`, `bLyr`, `hEfx`) will be added in P2.
 */
export interface XflipFile {
  /** Format version major (currently 1). */
  versionMajor: number;
  /** Format version minor (0 for v1.0, 1 for v1.1). */
  versionMinor: number;
  head: XflipHead;
  /** Raw bytes of the front image file (PNG/JPEG/...). */
  front: Uint8Array;
  /** Raw bytes of the back image file. */
  back: Uint8Array;
  /** Optional ancillary chunks preserved as raw payloads, keyed by chunk type.
   *  Keys are 4-character ASCII tags; both registered (`META`, `tHmb`, ...)
   *  and unknown lowercase-first tags are preserved verbatim. */
  ancillary?: ReadonlyMap<string, Uint8Array>;
}
