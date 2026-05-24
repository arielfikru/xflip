/**
 * High-level encoder: typed {@link XflipFile} → byte buffer.
 *
 * Symmetric inverse of {@link decode}. Flat v1.0 surface only.
 */

import { BytesWriter } from './bytes.js';
import { writeChunk, writeSignature } from './chunks.js';
import { XflipEncodeError } from './errors.js';
import { FLIP_AXIS_CODES, IMAGE_FORMAT_CODES, type XflipFile, type XflipHead } from './types.js';

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
  const writer = new BytesWriter(
    file.front.length + file.back.length + 64 + estimateAncillary(file.ancillary),
  );
  writeSignature(writer, file.versionMajor, file.versionMinor);
  writeChunk(writer, 'HEAD', encodeHead(file.head));
  if (file.ancillary) {
    for (const [type, payload] of file.ancillary) {
      writeChunk(writer, type, payload);
    }
  }
  writeChunk(writer, 'FRNT', file.front);
  writeChunk(writer, 'BACK', file.back);
  writeChunk(writer, 'ENDX', new Uint8Array());
  return writer.toBytes();
}

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

const estimateAncillary = (map: ReadonlyMap<string, Uint8Array> | undefined): number => {
  if (!map) return 0;
  let n = 0;
  for (const payload of map.values()) n += payload.length + 12;
  return n;
};

const isUint8 = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 0xff;
const isUint32 = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
