/**
 * Hand-crafted minimal v1.0 xflip file (spec v0.2 Appendix D).
 *
 * Used as a golden input for the decoder under test in P1.6+. Per
 * AGENTS.md Section 4.7, this fixture must NEVER use the encoder under
 * test (xflip-core's encode()) to generate its bytes — that would create
 * a circular self-test. We only depend on the separately-tested CRC32
 * utility from task P1.3.
 *
 * Layout (62 bytes total):
 *
 *   0x00-0x05  XFLP magic + version 1.0
 *   0x06-0x21  HEAD chunk (12-byte payload + 8-byte type/length + 4-byte CRC)
 *   0x22-0x32  FRNT chunk (5-byte payload)
 *   0x33-0x43  BACK chunk (5-byte payload)
 *   0x44-0x4f  ENDX chunk (0-byte payload)
 *
 * The FRNT/BACK payloads are intentionally NOT valid PNG bodies. xflip-core
 * stores image bytes opaquely; decoding the image is the renderer's job.
 * Using non-PNG bytes proves the decoder does not peek inside.
 */

import { crc32Concat } from '../../../packages/xflip-core/src/crc32.js';

const asciiBytes = (type: string): Uint8Array => {
  const out = new Uint8Array(type.length);
  for (let i = 0; i < type.length; i++) {
    out[i] = type.charCodeAt(i);
  }
  return out;
};

const uint32BE = (value: number): Uint8Array => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0, false);
  return out;
};

const buildChunk = (type: string, payload: Uint8Array): Uint8Array => {
  const typeBytes = asciiBytes(type);
  const lengthBytes = uint32BE(payload.length);
  const crcBytes = uint32BE(crc32Concat(typeBytes, payload));
  const out = new Uint8Array(4 + 4 + payload.length + 4);
  let offset = 0;
  out.set(typeBytes, offset);
  offset += 4;
  out.set(lengthBytes, offset);
  offset += 4;
  out.set(payload, offset);
  offset += payload.length;
  out.set(crcBytes, offset);
  return out;
};

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};

const SIGNATURE_BYTES = new Uint8Array([0x58, 0x46, 0x4c, 0x50, 0x01, 0x00]);

// width=64 (uint32 BE), height=64 (uint32 BE),
// front_format=0x01 PNG, back_format=0x01 PNG,
// flip_axis=0x00 horizontal, flags=0x00
// biome-ignore format: hex byte fixture; one row per logical field
const HEAD_PAYLOAD = new Uint8Array([
  0x00, 0x00, 0x00, 0x40,
  0x00, 0x00, 0x00, 0x40,
  0x01, 0x01, 0x00, 0x00,
]);

// Deliberately not a valid PNG body. xflip-core stores image bytes opaquely.
const FRNT_PAYLOAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xfe]);
const BACK_PAYLOAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xfd]);
const ENDX_PAYLOAD = new Uint8Array(0);

const HEAD_CHUNK = buildChunk('HEAD', HEAD_PAYLOAD);
const FRNT_CHUNK = buildChunk('FRNT', FRNT_PAYLOAD);
const BACK_CHUNK = buildChunk('BACK', BACK_PAYLOAD);
const ENDX_CHUNK = buildChunk('ENDX', ENDX_PAYLOAD);

/**
 * The full hand-crafted minimal v1.0 file as a single byte buffer.
 */
export const MINIMAL_V1_BYTES: Uint8Array = concat([
  SIGNATURE_BYTES,
  HEAD_CHUNK,
  FRNT_CHUNK,
  BACK_CHUNK,
  ENDX_CHUNK,
]);

/**
 * Decomposed pieces of the minimal file. Tests can assert against
 * individual chunks without re-deriving offsets.
 */
export const MINIMAL_V1_PARTS = {
  signature: SIGNATURE_BYTES,
  head: HEAD_CHUNK,
  frnt: FRNT_CHUNK,
  back: BACK_CHUNK,
  endx: ENDX_CHUNK,
  headPayload: HEAD_PAYLOAD,
  frntPayload: FRNT_PAYLOAD,
  backPayload: BACK_PAYLOAD,
} as const;

/**
 * Expected decoded values. Decoder tests assert against these.
 */
export const MINIMAL_V1_EXPECTED = {
  versionMajor: 1,
  versionMinor: 0,
  head: {
    width: 64,
    height: 64,
    frontFormat: 'png',
    backFormat: 'png',
    flipAxis: 'horizontal',
    flags: 0,
  },
  front: FRNT_PAYLOAD,
  back: BACK_PAYLOAD,
} as const;
