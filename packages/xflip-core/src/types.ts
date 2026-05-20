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
  | 'hEfx'
  | 'pOse';

/**
 * Affine transform at a single pose grid point.
 * All values are deltas relative to the layer's base transform.
 */
export interface PoseKeyframe {
  /** X translation offset in pixels. */
  tx: number;
  /** Y translation offset in pixels. */
  ty: number;
  /** Rotation in radians around layer center. */
  rotationRad: number;
  /** Uniform scale multiplier (1.0 = no change). */
  scale: number;
  /** Opacity multiplier in [0, 1] (1.0 = no change). */
  opacity: number;
}

/**
 * Valid grid sizes for a {@link XflipPose}.
 * 3×3 = 9 keyframes (standard); 5×5 = 25 keyframes (reserved for v1.3).
 */
export type PoseGridSize = 3 | 5;

/**
 * Pose rig for a single layer: a grid of {@link PoseKeyframe} values
 * sampled by viewer tilt angle via bilinear interpolation.
 *
 * Grid axes are normalized tiltX ∈ [-1, +1] (left→right) and
 * tiltY ∈ [-1, +1] (top→bottom). Keyframes are stored row-major,
 * tiltY ascending (row 0 = tiltY=-1, last row = tiltY=+1).
 */
export interface XflipPose {
  gridSize: PoseGridSize;
  /** row-major; length must equal gridSize × gridSize. */
  keyframes: readonly PoseKeyframe[];
}

/**
 * Decoded HEAD chunk per spec v0.2 §4.1.
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
 * Blend mode names per spec v0.2 §5.6.1.
 */
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'add'
  | 'color_dodge'
  | 'color_burn'
  | 'soft_light'
  | 'hard_light'
  | 'difference'
  | 'luminosity'
  | 'custom';

/**
 * Numeric blend-mode codes on the wire per spec v0.2 §5.6.1.
 * Codes 0x0B-0xFE are reserved.
 */
export const BLEND_MODE_CODES = {
  normal: 0x00,
  multiply: 0x01,
  screen: 0x02,
  overlay: 0x03,
  add: 0x04,
  color_dodge: 0x05,
  color_burn: 0x06,
  soft_light: 0x07,
  hard_light: 0x08,
  difference: 0x09,
  luminosity: 0x0a,
  custom: 0xff,
} as const satisfies Record<BlendMode, number>;

/**
 * Per-layer response parameters per spec v0.2 §5.6.2. Schema is open;
 * unknown keys are preserved on the `extras` field after parse.
 */
export interface XflipLayerResponse {
  input_source?: 'mouse' | 'tilt' | 'time' | 'auto';
  response_axis?: 'x' | 'y' | 'xy' | 'radial' | 'angle' | 'none';
  response_curve?: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'wave' | 'step';
  intensity?: number;
  offset_max_x?: number;
  offset_max_y?: number;
  rotation_max?: number;
  scale_range?: readonly [number, number];
  phase_offset?: number;
  frequency?: number;
  mask_threshold?: number;
  /** Implementation-specific extension object (opaque). */
  custom?: Record<string, unknown>;
  /** Any non-standard keys preserved verbatim (round-trip safe). */
  extras?: Record<string, unknown>;
}

/**
 * Decoded layer record per spec v0.2 §5.6.
 */
export interface XflipLayer {
  /** Unique ID within the parent chunk (0-255). */
  layerId: number;
  /** Image format for `imageData` (same code-space as HEAD). */
  format: ImageFormat;
  /** Blend mode for compositing over previous layers. */
  blendMode: BlendMode;
  /** Non-empty semantic effect type (Appendix B or `x-*` custom). */
  effectType: string;
  /** Alpha multiplier (0-255; 255 = fully opaque). */
  opacity: number;
  /** Stacking order. Lower = drawn first (bottom). */
  zOrder: number;
  /** Parsed per-layer response parameters. */
  response: XflipLayerResponse;
  /** Encoded image data (raw bytes of a PNG/JPEG/... file). */
  imageData: Uint8Array;
  /** Optional pose rig from a paired `pOse` chunk (xflip v1.2+). */
  pose?: XflipPose;
}

/**
 * Decoded `fLyr` or `bLyr` payload per spec v0.2 §5.6.
 */
export interface XflipLayerChunk {
  /** Layer format version (currently 1). */
  version: number;
  /** Reserved bit field; spec requires 0. Preserved on decode. */
  flags: number;
  /** Layer records in chunk order. layer_count ∈ [1, 255]. */
  layers: readonly XflipLayer[];
}

/**
 * Decoded `hEfx` global parameters per spec v0.2 §5.7. Schema is open;
 * unknown keys are preserved on `extras` for round-trip safety.
 */
export interface XflipHefx {
  tilt_sensitivity?: number;
  tilt_max_angle?: number;
  perspective?: number;
  ambient_intensity?: number;
  card_material?: 'matte' | 'glossy' | 'holographic' | 'foil' | 'prismatic';
  surface_finish?: 'smooth' | 'linen' | 'etched' | 'embossed';
  face_scope?: {
    front?: Record<string, unknown>;
    back?: Record<string, unknown>;
  };
  interaction_modes?: readonly string[];
  fallback_behavior?: 'static' | 'auto-animate';
  custom?: Record<string, unknown>;
  /** Any non-standard top-level keys preserved verbatim. */
  extras?: Record<string, unknown>;
}

/**
 * Decoded xflip file. v1.1 surface (layered effects included).
 *
 * For v1.0 files (no `fLyr`/`bLyr`/`hEfx`), the corresponding optional
 * fields are absent. For v1.1 files, registered layered chunks are lifted
 * out of `ancillary` and exposed as typed objects.
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
  /** Decoded `fLyr` chunk if present. */
  frontLayers?: XflipLayerChunk;
  /** Decoded `bLyr` chunk if present. */
  backLayers?: XflipLayerChunk;
  /** Decoded `hEfx` chunk if present. */
  effects?: XflipHefx;
  /** Optional ancillary chunks preserved as raw payloads, keyed by chunk type.
   *  Keys are 4-character ASCII tags. Registered layered chunks
   *  (`fLyr`/`bLyr`/`hEfx`) are NOT included here — they appear on their
   *  own typed fields. Other ancillaries (`META`, `tHmb`, ..., and unknown
   *  lowercase-first tags) are preserved verbatim. */
  ancillary?: ReadonlyMap<string, Uint8Array>;
}
