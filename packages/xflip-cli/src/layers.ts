import {
  BLEND_MODE_CODES,
  type BlendMode,
  encode,
  type ImageFormat,
  XflipEncodeError,
  type XflipFile,
  type XflipLayer,
  type XflipLayerChunk,
  type XflipLayerResponse,
} from '@xflip/core';

const BLEND_MODES = Object.keys(BLEND_MODE_CODES) as readonly BlendMode[];

export function isBlendMode(value: string): value is BlendMode {
  return (BLEND_MODES as readonly string[]).includes(value);
}

/**
 * Per-face selector for {@link addLayer}. Maps to spec §5.6 chunks
 * `fLyr` (front) and `bLyr` (back).
 */
export type LayerFace = 'front' | 'back';

/**
 * Inputs to {@link addLayer}. Bytes are caller-supplied; this module is
 * pure (no filesystem access) so it stays unit-testable.
 */
export interface AddLayerInputs {
  readonly face: LayerFace;
  readonly image: Uint8Array;
  readonly format: ImageFormat;
  readonly blendMode: BlendMode;
  readonly effectType: string;
  /** Explicit layer_id (0-255). Defaults to next unused id within the face's chunk. */
  readonly layerId?: number;
  /** Alpha multiplier (0-255). Default 255 (fully opaque). */
  readonly opacity?: number;
  /** Stacking order (0-255). Default = max existing zOrder + 1 (capped at 255). */
  readonly zOrder?: number;
  /** Parsed response object (already JSON.parse'd). Omit for `{}`. */
  readonly response?: XflipLayerResponse;
}

/**
 * Insert a new layer into the face's `fLyr` / `bLyr` chunk, creating the
 * chunk if absent. Promotes a v1.0 file to v1.1 when the input had no
 * layered chunks. Throws {@link XflipEncodeError} on capacity / id
 * conflicts.
 *
 * Pure: returns a fresh {@link XflipFile} without mutating the input.
 */
export function addLayer(file: XflipFile, input: AddLayerInputs): XflipFile {
  const existing = input.face === 'front' ? file.frontLayers : file.backLayers;
  const layers = existing?.layers ?? [];
  if (layers.length >= 0xff) {
    throw new XflipEncodeError(
      `cannot add layer: ${input.face} face already has 255 layers (spec §5.6 layer_count max)`,
    );
  }
  const layerId = input.layerId ?? nextUnusedId(layers);
  if (input.layerId !== undefined && layers.some((l) => l.layerId === input.layerId)) {
    throw new XflipEncodeError(
      `layer_id ${input.layerId} already exists on the ${input.face} face`,
    );
  }
  const zOrder = input.zOrder ?? nextZOrder(layers);
  const opacity = input.opacity ?? 0xff;
  const layer: XflipLayer = {
    layerId,
    format: input.format,
    blendMode: input.blendMode,
    effectType: input.effectType,
    opacity,
    zOrder,
    response: input.response ?? {},
    imageData: input.image,
  };
  const nextChunk: XflipLayerChunk = {
    version: existing?.version ?? 1,
    flags: existing?.flags ?? 0,
    layers: [...layers, layer],
  };
  const promoted = file.versionMajor === 1 && file.versionMinor < 1 ? 1 : file.versionMinor;
  return {
    ...file,
    versionMinor: promoted,
    ...(input.face === 'front' ? { frontLayers: nextChunk } : { backLayers: nextChunk }),
  };
}

/**
 * Encode a file produced by {@link addLayer} to bytes. Thin wrapper that
 * keeps the CLI command flow symmetric with `create`.
 */
export function encodeWithLayer(file: XflipFile): Uint8Array {
  return encode(file);
}

const nextUnusedId = (layers: readonly XflipLayer[]): number => {
  const used = new Set(layers.map((l) => l.layerId));
  for (let i = 0; i <= 0xff; i++) {
    if (!used.has(i)) return i;
  }
  throw new XflipEncodeError('no free layer_id slot in [0, 255]');
};

const nextZOrder = (layers: readonly XflipLayer[]): number => {
  if (layers.length === 0) return 0;
  const max = layers.reduce((m, l) => (l.zOrder > m ? l.zOrder : m), 0);
  return max >= 0xff ? 0xff : max + 1;
};
