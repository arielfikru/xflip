/**
 * Codec and runtime sampler for `pOse` ancillary chunks (xflip v1.2+).
 *
 * A `pOse` chunk pairs with one layer in `fLyr` or `bLyr` via (face, layer_id).
 * It encodes a fixed bilinear grid of affine keyframes. At render time,
 * `samplePose` interpolates the grid for the current viewer tilt.
 *
 * Wire layout:
 *   0x00  u8   face       0=front, 1=back
 *   0x01  u8   layer_id
 *   0x02  u8   grid_size  3 (v1.2 only; 5 reserved for v1.3)
 *   0x03  u8   reserved   must be 0
 *   0x04  N×24 keyframes  N=grid_size², row-major (tiltY ascending),
 *                         each = 6× f32 BE: tx, ty, rotation_x_rad, rotation_y_rad, scale, opacity
 */

import { XflipEncodeError, XflipParseError } from './errors.js';
import type { PoseGridSize, PoseKeyframe, XflipPose } from './types.js';

const KEYFRAME_BYTES = 24; // 6 × float32
const HEADER_BYTES = 4;

export interface ParsedPoseChunk {
  face: 'front' | 'back';
  layerId: number;
  pose: XflipPose;
}

/**
 * Parse a raw `pOse` chunk payload into a typed {@link ParsedPoseChunk}.
 *
 * @throws XflipParseError - Unknown face code, unsupported grid_size,
 *   non-zero reserved byte, or truncated payload.
 */
export function parsePoseChunk(payload: Uint8Array): ParsedPoseChunk {
  if (payload.length < HEADER_BYTES) {
    throw new XflipParseError(
      `pOse payload too short: ${payload.length} bytes (min ${HEADER_BYTES})`,
      0,
    );
  }
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const faceCode = dv.getUint8(0);
  if (faceCode !== 0 && faceCode !== 1) {
    throw new XflipParseError(`pOse face code must be 0 or 1, got ${faceCode}`, 0);
  }
  const face: 'front' | 'back' = faceCode === 0 ? 'front' : 'back';
  const layerId = dv.getUint8(1);
  const rawGridSize = dv.getUint8(2);
  if (rawGridSize !== 3 && rawGridSize !== 5) {
    throw new XflipParseError(
      `pOse grid_size must be 3 or 5, got ${rawGridSize} (spec studio-rfc §3.1)`,
      2,
    );
  }
  const gridSize = rawGridSize as PoseGridSize;
  const reserved = dv.getUint8(3);
  if (reserved !== 0) {
    throw new XflipParseError(`pOse reserved byte must be 0, got ${reserved}`, 3);
  }
  const count = gridSize * gridSize;
  const expectedBytes = HEADER_BYTES + count * KEYFRAME_BYTES;
  if (payload.length !== expectedBytes) {
    throw new XflipParseError(
      `pOse payload length ${payload.length} ≠ expected ${expectedBytes} (grid ${gridSize}×${gridSize})`,
      0,
    );
  }
  const keyframes: PoseKeyframe[] = [];
  for (let i = 0; i < count; i++) {
    const base = HEADER_BYTES + i * KEYFRAME_BYTES;
    keyframes.push({
      tx: dv.getFloat32(base, false),
      ty: dv.getFloat32(base + 4, false),
      rotationXRad: dv.getFloat32(base + 8, false),
      rotationYRad: dv.getFloat32(base + 12, false),
      scale: dv.getFloat32(base + 16, false),
      opacity: dv.getFloat32(base + 20, false),
    });
  }
  return { face, layerId, pose: { gridSize, keyframes } };
}

/**
 * Serialize a pose rig into a raw `pOse` chunk payload.
 *
 * @throws XflipEncodeError - Invalid grid_size or keyframe count mismatch.
 */
export function serializePoseChunk(
  face: 'front' | 'back',
  layerId: number,
  pose: XflipPose,
): Uint8Array {
  if (pose.gridSize !== 3 && pose.gridSize !== 5) {
    throw new XflipEncodeError(`pOse grid_size must be 3 or 5, got ${pose.gridSize}`);
  }
  const count = pose.gridSize * pose.gridSize;
  if (pose.keyframes.length !== count) {
    throw new XflipEncodeError(
      `pOse keyframe count ${pose.keyframes.length} ≠ expected ${count} for grid ${pose.gridSize}×${pose.gridSize}`,
    );
  }
  if (!Number.isInteger(layerId) || layerId < 0 || layerId > 0xff) {
    throw new XflipEncodeError(`pOse layer_id must be uint8, got ${layerId}`);
  }
  const out = new Uint8Array(HEADER_BYTES + count * KEYFRAME_BYTES);
  const dv = new DataView(out.buffer);
  dv.setUint8(0, face === 'front' ? 0 : 1);
  dv.setUint8(1, layerId);
  dv.setUint8(2, pose.gridSize);
  dv.setUint8(3, 0);
  for (let i = 0; i < count; i++) {
    const base = HEADER_BYTES + i * KEYFRAME_BYTES;
    const kf = pose.keyframes[i] as PoseKeyframe;
    dv.setFloat32(base, kf.tx, false);
    dv.setFloat32(base + 4, kf.ty, false);
    dv.setFloat32(base + 8, kf.rotationXRad, false);
    dv.setFloat32(base + 12, kf.rotationYRad, false);
    dv.setFloat32(base + 16, kf.scale, false);
    dv.setFloat32(base + 20, kf.opacity, false);
  }
  return out;
}

/**
 * Bilinear sample of a pose grid at normalized tilt coordinates.
 *
 * @param pose - The pose rig to sample.
 * @param nx - Normalized tiltX in [-1, +1] (left = -1, right = +1).
 * @param ny - Normalized tiltY in [-1, +1] (top = -1, bottom = +1).
 * @returns Interpolated {@link PoseKeyframe}. Values are clamped to grid
 *   boundary when |nx| or |ny| exceeds 1.
 */
export function samplePose(pose: XflipPose, nx: number, ny: number): PoseKeyframe {
  const g = pose.gridSize;
  // Map [-1, +1] → [0, g-1], then clamp.
  const fx = Math.max(0, Math.min(g - 1, ((nx + 1) / 2) * (g - 1)));
  const fy = Math.max(0, Math.min(g - 1, ((ny + 1) / 2) * (g - 1)));
  const c0 = Math.floor(fx);
  const r0 = Math.floor(fy);
  const c1 = Math.min(g - 1, c0 + 1);
  const r1 = Math.min(g - 1, r0 + 1);
  const wc = fx - c0; // fractional column weight
  const wr = fy - r0; // fractional row weight

  const kf = (row: number, col: number): PoseKeyframe =>
    pose.keyframes[row * g + col] as PoseKeyframe;

  const lerp6 = (a: PoseKeyframe, b: PoseKeyframe, t: number): PoseKeyframe => ({
    tx: a.tx + (b.tx - a.tx) * t,
    ty: a.ty + (b.ty - a.ty) * t,
    rotationXRad: a.rotationXRad + (b.rotationXRad - a.rotationXRad) * t,
    rotationYRad: a.rotationYRad + (b.rotationYRad - a.rotationYRad) * t,
    scale: a.scale + (b.scale - a.scale) * t,
    opacity: a.opacity + (b.opacity - a.opacity) * t,
  });

  // Bilinear: interpolate along columns first, then rows.
  const top = lerp6(kf(r0, c0), kf(r0, c1), wc);
  const bot = lerp6(kf(r1, c0), kf(r1, c1), wc);
  return lerp6(top, bot, wr);
}

/**
 * Build an identity pose grid (all keyframes = neutral transform).
 *
 * Useful as a starting point when authoring a new pose rig.
 */
export function identityPose(gridSize: PoseGridSize = 3): XflipPose {
  const count = gridSize * gridSize;
  const keyframes: PoseKeyframe[] = Array.from({ length: count }, () => ({
    tx: 0,
    ty: 0,
    rotationXRad: 0,
    rotationYRad: 0,
    scale: 1,
    opacity: 1,
  }));
  return { gridSize, keyframes };
}
