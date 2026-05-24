/**
 * Image format codes as defined in xflip spec v1.0 §4.1 HEAD chunk.
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
 * Suggested flip axis per spec §4.1.
 */
export type FlipAxis = 'horizontal' | 'vertical' | 'diagonal';

export const FLIP_AXIS_CODES = {
  horizontal: 0x00,
  vertical: 0x01,
  diagonal: 0x02,
} as const satisfies Record<FlipAxis, number>;

/**
 * Chunk type codes used by the decoder/encoder. All are 4-byte ASCII,
 * case-sensitive per spec §3.3.
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
  | 'eDge';

/**
 * Decoded HEAD chunk per spec §4.1.
 */
export interface XflipHead {
  /** Canvas width in pixels. uint32, must be ≥ 1. */
  width: number;
  /** Canvas height in pixels. uint32, must be ≥ 1. */
  height: number;
  /** Image format for the FRNT payload. */
  frontFormat: ImageFormat;
  /** Image format for the BACK payload. */
  backFormat: ImageFormat;
  /** Suggested flip axis. Renderers MAY ignore this hint. */
  flipAxis: FlipAxis;
  /** Bit flags (uint8). Bit 0: DEFAULT_BACK. Bit 1: NO_FLIP_ANIM. Other bits reserved. */
  flags: number;
}

/**
 * Decoded xflip file. Flat v1.0 surface only.
 */
export interface XflipFile {
  /** Format version major (currently 1). */
  versionMajor: number;
  /** Format version minor (currently 0). */
  versionMinor: number;
  head: XflipHead;
  /** Raw bytes of the front image file (PNG/JPEG/...). */
  front: Uint8Array;
  /** Raw bytes of the back image file. */
  back: Uint8Array;
  /** Optional ancillary chunks preserved as raw payloads, keyed by chunk type.
   *  Keys are 4-character ASCII tags (`META`, `tHmb`, `fLip`, ...). */
  ancillary?: ReadonlyMap<string, Uint8Array>;
}
