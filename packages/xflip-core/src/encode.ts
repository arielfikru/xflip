/**
 * High-level encoder: typed {@link XflipFile} → byte buffer.
 *
 * Symmetric inverse of {@link decode}. v1.0 surface only — layered effect
 * chunks (`fLyr`, `bLyr`, `hEfx`) are emitted only if the caller supplies
 * them via `file.ancillary`; this module does not synthesize them.
 */

import { BytesWriter } from './bytes.js';
import { writeChunk, writeSignature } from './chunks.js';
import { XflipEncodeError } from './errors.js';
import { serializeHefx, serializeLayerChunk } from './layers.js';
import { serializePoseChunk } from './pose.js';
import {
  FLIP_AXIS_CODES,
  IMAGE_FORMAT_CODES,
  type XflipFile,
  type XflipHead,
  type XflipLayer,
} from './types.js';

const LAYERED_KEYS = new Set(['fLyr', 'bLyr', 'hEfx', 'pOse']);

const MAX_DIMENSION = 0xffffffff;

/**
 * Serialize an {@link XflipFile} to a complete xflip byte buffer.
 *
 * Chunk order: signature, HEAD, ancillary chunks (in `file.ancillary`
 * insertion order), FRNT, BACK, ENDX. This is one valid ordering per
 * spec §3.5 (HEAD first, FRNT before BACK, ENDX last).
 *
 * @param file - File to encode.
 * @returns A self-contained xflip byte buffer.
 *
 * @throws XflipEncodeError - HEAD dimensions out of range, unknown image
 *   format name, flags byte out of uint8 range, or chunk-too-large.
 */
export function encode(file: XflipFile): Uint8Array {
  const fLyrPayload = resolveLayered(file, 'frontLayers', 'fLyr', serializeLayerChunk);
  const bLyrPayload = resolveLayered(file, 'backLayers', 'bLyr', serializeLayerChunk);
  const hEfxPayload = resolveLayered(file, 'effects', 'hEfx', serializeHefx);

  const writer = new BytesWriter(
    file.front.length +
      file.back.length +
      64 +
      estimateAncillary(file.ancillary) +
      (fLyrPayload?.length ?? 0) +
      (bLyrPayload?.length ?? 0) +
      (hEfxPayload?.length ?? 0),
  );
  writeSignature(writer, file.versionMajor, file.versionMinor);
  writeChunk(writer, 'HEAD', encodeHead(file.head));
  if (file.ancillary) {
    for (const [type, payload] of file.ancillary) {
      if (LAYERED_KEYS.has(type)) continue; // emitted at spec-mandated positions below
      writeChunk(writer, type, payload);
    }
  }
  writeChunk(writer, 'FRNT', file.front);
  if (fLyrPayload) {
    writeChunk(writer, 'fLyr', fLyrPayload);
    if (file.frontLayers) emitPoseChunks(writer, 'front', file.frontLayers.layers);
  }
  writeChunk(writer, 'BACK', file.back);
  if (bLyrPayload) {
    writeChunk(writer, 'bLyr', bLyrPayload);
    if (file.backLayers) emitPoseChunks(writer, 'back', file.backLayers.layers);
  }
  if (hEfxPayload) writeChunk(writer, 'hEfx', hEfxPayload);
  writeChunk(writer, 'ENDX', new Uint8Array());
  return writer.toBytes();
}

const resolveLayered = <K extends 'frontLayers' | 'backLayers' | 'effects'>(
  file: XflipFile,
  field: K,
  ancillaryKey: 'fLyr' | 'bLyr' | 'hEfx',
  serialize: (v: NonNullable<XflipFile[K]>) => Uint8Array,
): Uint8Array | undefined => {
  const typed = file[field];
  const raw = file.ancillary?.get(ancillaryKey);
  if (typed && raw) {
    throw new XflipEncodeError(
      `conflicting source for "${ancillaryKey}": both file.${field} and file.ancillary["${ancillaryKey}"] are set`,
    );
  }
  if (typed) return serialize(typed as NonNullable<XflipFile[K]>);
  if (raw) return raw;
  return undefined;
};

const encodeHead = (head: XflipHead): Uint8Array => {
  if (!isUint32(head.width) || head.width === 0 || head.width > MAX_DIMENSION) {
    throw new XflipEncodeError(`HEAD.width out of range: ${head.width}`);
  }
  if (!isUint32(head.height) || head.height === 0 || head.height > MAX_DIMENSION) {
    throw new XflipEncodeError(`HEAD.height out of range: ${head.height}`);
  }
  if (!isUint8(head.flags)) {
    throw new XflipEncodeError(`HEAD.flags must be uint8, got ${head.flags}`);
  }
  const frontCode = IMAGE_FORMAT_CODES[head.frontFormat];
  const backCode = IMAGE_FORMAT_CODES[head.backFormat];
  const axisCode = FLIP_AXIS_CODES[head.flipAxis];
  if (frontCode === undefined) {
    throw new XflipEncodeError(`unknown HEAD.frontFormat "${head.frontFormat}"`);
  }
  if (backCode === undefined) {
    throw new XflipEncodeError(`unknown HEAD.backFormat "${head.backFormat}"`);
  }
  if (axisCode === undefined) {
    throw new XflipEncodeError(`unknown HEAD.flipAxis "${head.flipAxis}"`);
  }
  const out = new Uint8Array(12);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, head.width, false);
  dv.setUint32(4, head.height, false);
  dv.setUint8(8, frontCode);
  dv.setUint8(9, backCode);
  dv.setUint8(10, axisCode);
  dv.setUint8(11, head.flags);
  return out;
};

const emitPoseChunks = (
  writer: BytesWriter,
  face: 'front' | 'back',
  layers: readonly XflipLayer[],
): void => {
  for (const layer of layers) {
    if (layer.pose) {
      writeChunk(writer, 'pOse', serializePoseChunk(face, layer.layerId, layer.pose));
    }
  }
};

const estimateAncillary = (map: ReadonlyMap<string, Uint8Array> | undefined): number => {
  if (!map) return 0;
  let n = 0;
  for (const payload of map.values()) n += payload.length + 12;
  return n;
};

const isUint8 = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 0xff;
const isUint32 = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
