/**
 * `@xflip/core` — encoder and decoder for the xflip image format.
 *
 * Zero runtime dependencies. Targets Node 20+ and evergreen browsers.
 *
 * Primary entry points:
 *   - {@link decode} — bytes → typed {@link XflipFile}
 *   - {@link encode} — {@link XflipFile} → bytes
 *
 * Lower-level helpers ({@link parseChunks}, {@link crc32}) are exposed for
 * tools that need partial-decode access (e.g., metadata inspection without
 * loading image bytes).
 *
 * @packageDocumentation
 */

export type { ParsedChunk, ParsedFile, ParseOptions } from './chunks.js';
export { parseChunks } from './chunks.js';

export { crc32, crc32Concat } from './crc32.js';

export { decode } from './decode.js';
export { encode } from './encode.js';

export {
  XflipCrcError,
  XflipEncodeError,
  XflipError,
  XflipParseError,
} from './errors.js';
export { parseHefx, parseLayerChunk, serializeHefx, serializeLayerChunk } from './layers.js';
export type { ParsedPoseChunk } from './pose.js';
export {
  identityPose,
  parsePoseChunk,
  samplePose,
  serializePoseChunk,
} from './pose.js';
export type {
  BlendMode,
  ChunkType,
  FlipAxis,
  ImageFormat,
  PoseGridSize,
  PoseKeyframe,
  XflipFile,
  XflipHead,
  XflipHefx,
  XflipLayer,
  XflipLayerChunk,
  XflipLayerResponse,
  XflipPose,
} from './types.js';
export { BLEND_MODE_CODES, FLIP_AXIS_CODES, IMAGE_FORMAT_CODES } from './types.js';
