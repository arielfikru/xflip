/**
 * Codec for `fLyr` / `bLyr` layered effect chunks (spec v0.2 §5.6) and
 * `hEfx` global parameters (§5.7).
 *
 * Both layered chunks share an identical binary layout and are handled by
 * the same parse/serialize pair. `hEfx` is a UTF-8 JSON blob; its codec
 * preserves unknown keys verbatim to keep round-trips bit-exact.
 */

import { BytesReader, BytesWriter } from './bytes.js';
import { XflipEncodeError, XflipParseError } from './errors.js';
import {
  BLEND_MODE_CODES,
  type BlendMode,
  IMAGE_FORMAT_CODES,
  type ImageFormat,
  type XflipHefx,
  type XflipLayer,
  type XflipLayerChunk,
  type XflipLayerResponse,
} from './types.js';

const SUPPORTED_LAYER_VERSION = 1;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const UTF8_ENCODER = new TextEncoder();

const BLEND_MODE_BY_CODE: ReadonlyMap<number, BlendMode> = new Map(
  Object.entries(BLEND_MODE_CODES).map(([name, code]) => [code, name as BlendMode]),
);

const IMAGE_FORMAT_BY_CODE: ReadonlyMap<number, ImageFormat> = new Map(
  Object.entries(IMAGE_FORMAT_CODES).map(([name, code]) => [code, name as ImageFormat]),
);

const STANDARD_RESPONSE_KEYS = new Set<string>([
  'input_source',
  'response_axis',
  'response_curve',
  'intensity',
  'offset_max_x',
  'offset_max_y',
  'rotation_max',
  'scale_range',
  'phase_offset',
  'frequency',
  'mask_threshold',
  'custom',
]);

const STANDARD_HEFX_KEYS = new Set<string>([
  'tilt_sensitivity',
  'tilt_max_angle',
  'perspective',
  'ambient_intensity',
  'card_material',
  'surface_finish',
  'face_scope',
  'interaction_modes',
  'fallback_behavior',
  'custom',
]);

/**
 * Parse an `fLyr` or `bLyr` payload into a typed {@link XflipLayerChunk}.
 *
 * @throws XflipParseError - Unsupported layer version, layer_count = 0,
 *   truncated record, empty effect_type, unknown blend_mode/format code,
 *   or malformed response JSON.
 */
export function parseLayerChunk(payload: Uint8Array): XflipLayerChunk {
  const reader = new BytesReader(payload);
  const version = reader.u8();
  if (version !== SUPPORTED_LAYER_VERSION) {
    throw new XflipParseError(
      `unsupported layer chunk version ${version} (expected ${SUPPORTED_LAYER_VERSION}) (spec §5.6)`,
      0,
    );
  }
  const layerCount = reader.u8();
  if (layerCount === 0) {
    throw new XflipParseError('layer_count must be ≥ 1 (spec §5.6)', 1);
  }
  const flags = reader.u16BE();
  const layers: XflipLayer[] = [];
  for (let i = 0; i < layerCount; i++) {
    layers.push(parseLayerRecord(reader));
  }
  if (!reader.eof()) {
    throw new XflipParseError(
      `${reader.remaining()} trailing byte(s) after last layer record`,
      reader.offset,
    );
  }
  return { version, flags, layers };
}

const parseLayerRecord = (reader: BytesReader): XflipLayer => {
  const recordOffset = reader.offset;
  const layerId = reader.u8();
  const formatCode = reader.u8();
  const format = IMAGE_FORMAT_BY_CODE.get(formatCode);
  if (!format) {
    throw new XflipParseError(
      `unknown layer format code 0x${formatCode.toString(16).padStart(2, '0')} (spec §4.1)`,
      recordOffset + 1,
    );
  }
  const blendCode = reader.u8();
  const blendMode = BLEND_MODE_BY_CODE.get(blendCode);
  if (!blendMode) {
    throw new XflipParseError(
      `unknown blend_mode code 0x${blendCode.toString(16).padStart(2, '0')} (spec §5.6.1)`,
      recordOffset + 2,
    );
  }
  const effectTypeLen = reader.u8();
  if (effectTypeLen === 0) {
    throw new XflipParseError('effect_type_len must be ≥ 1 (spec §5.6)', recordOffset + 3);
  }
  const effectTypeBytes = reader.slice(effectTypeLen);
  let effectType: string;
  try {
    effectType = UTF8_DECODER.decode(effectTypeBytes);
  } catch (cause) {
    throw new XflipParseError(`effect_type is not valid UTF-8 (spec §5.6)`, recordOffset + 4, {
      cause,
    });
  }
  const opacity = reader.u8();
  const zOrder = reader.u8();
  const responseLen = reader.u16BE();
  const responseBytes = responseLen > 0 ? reader.slice(responseLen) : new Uint8Array();
  const response = parseResponseJson(responseBytes, reader.offset - responseLen);
  const dataLength = reader.u32BE();
  const imageData = reader.slice(dataLength);
  return {
    layerId,
    format,
    blendMode,
    effectType,
    opacity,
    zOrder,
    response,
    imageData: copy(imageData),
  };
};

const parseResponseJson = (bytes: Uint8Array, offset: number): XflipLayerResponse => {
  if (bytes.length === 0) return {};
  let text: string;
  try {
    text = UTF8_DECODER.decode(bytes);
  } catch (cause) {
    throw new XflipParseError(`response_json is not valid UTF-8 (spec §5.6.2)`, offset, {
      cause,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new XflipParseError(`response_json is not valid JSON (spec §5.6.2)`, offset, { cause });
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new XflipParseError(
      `response_json must be a JSON object, got ${describeJsonType(parsed)} (spec §5.6.2)`,
      offset,
    );
  }
  return splitKnownKeys(parsed as Record<string, unknown>, STANDARD_RESPONSE_KEYS);
};

/**
 * Serialize a {@link XflipLayerChunk} back to its on-wire payload.
 *
 * Symmetric inverse of {@link parseLayerChunk}: round-trip is byte-exact
 * when the response JSON survives `JSON.stringify(JSON.parse(x))` (true
 * for any JSON we emit ourselves).
 *
 * @throws XflipEncodeError - layer_count out of range, opacity/z_order
 *   out of uint8, effect_type too long, response/image too large.
 */
export function serializeLayerChunk(chunk: XflipLayerChunk): Uint8Array {
  if (chunk.version !== SUPPORTED_LAYER_VERSION) {
    throw new XflipEncodeError(
      `unsupported layer chunk version ${chunk.version} (only ${SUPPORTED_LAYER_VERSION} is defined)`,
    );
  }
  if (!isUint16(chunk.flags)) {
    throw new XflipEncodeError(`layer chunk flags must be uint16, got ${chunk.flags}`);
  }
  const count = chunk.layers.length;
  if (count < 1 || count > 0xff) {
    throw new XflipEncodeError(`layer_count must be in [1, 255], got ${count}`);
  }
  const writer = new BytesWriter(64);
  writer.u8(chunk.version);
  writer.u8(count);
  writer.u16BE(chunk.flags);
  for (const layer of chunk.layers) serializeLayerRecord(writer, layer);
  return writer.toBytes();
}

const serializeLayerRecord = (writer: BytesWriter, layer: XflipLayer): void => {
  if (!isUint8(layer.layerId)) {
    throw new XflipEncodeError(`layer_id must be uint8, got ${layer.layerId}`);
  }
  if (!isUint8(layer.opacity)) {
    throw new XflipEncodeError(`opacity must be uint8, got ${layer.opacity}`);
  }
  if (!isUint8(layer.zOrder)) {
    throw new XflipEncodeError(`z_order must be uint8, got ${layer.zOrder}`);
  }
  const formatCode = IMAGE_FORMAT_CODES[layer.format];
  if (formatCode === undefined) {
    throw new XflipEncodeError(`unknown layer.format "${layer.format}"`);
  }
  const blendCode = BLEND_MODE_CODES[layer.blendMode];
  if (blendCode === undefined) {
    throw new XflipEncodeError(`unknown layer.blendMode "${layer.blendMode}"`);
  }
  const effectBytes = UTF8_ENCODER.encode(layer.effectType);
  if (effectBytes.length < 1 || effectBytes.length > 0xff) {
    throw new XflipEncodeError(
      `effect_type UTF-8 length must be in [1, 255], got ${effectBytes.length}`,
    );
  }
  const responseBytes = serializeResponseJson(layer.response);
  if (responseBytes.length > 0xffff) {
    throw new XflipEncodeError(
      `response_json UTF-8 length ${responseBytes.length} exceeds uint16 max`,
    );
  }
  writer.u8(layer.layerId);
  writer.u8(formatCode);
  writer.u8(blendCode);
  writer.u8(effectBytes.length);
  writer.bytes(effectBytes);
  writer.u8(layer.opacity);
  writer.u8(layer.zOrder);
  writer.u16BE(responseBytes.length);
  writer.bytes(responseBytes);
  writer.u32BE(layer.imageData.length);
  writer.bytes(layer.imageData);
};

const serializeResponseJson = (response: XflipLayerResponse): Uint8Array => {
  const merged = mergeKnownAndExtras(response as Record<string, unknown>, STANDARD_RESPONSE_KEYS);
  if (Object.keys(merged).length === 0) return new Uint8Array();
  return UTF8_ENCODER.encode(JSON.stringify(merged));
};

/**
 * Parse the `hEfx` payload (a UTF-8 JSON object) into typed {@link XflipHefx}.
 *
 * @throws XflipParseError - Invalid UTF-8 or non-object root.
 */
export function parseHefx(payload: Uint8Array): XflipHefx {
  if (payload.length === 0) return {};
  let text: string;
  try {
    text = UTF8_DECODER.decode(payload);
  } catch (cause) {
    throw new XflipParseError('hEfx payload is not valid UTF-8 (spec §5.7)', 0, { cause });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new XflipParseError('hEfx payload is not valid JSON (spec §5.7)', 0, { cause });
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new XflipParseError(
      `hEfx root must be a JSON object, got ${describeJsonType(parsed)} (spec §5.7)`,
      0,
    );
  }
  return splitKnownKeys(parsed as Record<string, unknown>, STANDARD_HEFX_KEYS) as XflipHefx;
}

/**
 * Serialize a typed {@link XflipHefx} back to its UTF-8 JSON payload.
 *
 * Round-trip is byte-exact for hEfx values that survive
 * `JSON.stringify(JSON.parse(x))` and whose key order matches insertion.
 */
export function serializeHefx(hefx: XflipHefx): Uint8Array {
  const merged = mergeKnownAndExtras(hefx as Record<string, unknown>, STANDARD_HEFX_KEYS);
  if (Object.keys(merged).length === 0) return UTF8_ENCODER.encode('{}');
  return UTF8_ENCODER.encode(JSON.stringify(merged));
}

const splitKnownKeys = <T>(
  obj: Record<string, unknown>,
  knownKeys: ReadonlySet<string>,
): T & { extras?: Record<string, unknown> } => {
  const out: Record<string, unknown> = {};
  const extras: Record<string, unknown> = {};
  let hasExtras = false;
  for (const [key, value] of Object.entries(obj)) {
    if (knownKeys.has(key)) {
      out[key] = value;
    } else {
      extras[key] = value;
      hasExtras = true;
    }
  }
  if (hasExtras) out.extras = extras;
  return out as T & { extras?: Record<string, unknown> };
};

const mergeKnownAndExtras = (
  source: { extras?: Record<string, unknown> } & { [k: string]: unknown },
  knownKeys: ReadonlySet<string>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'extras' || !knownKeys.has(key)) continue;
    if (value !== undefined) out[key] = value;
  }
  if (source.extras) {
    for (const [key, value] of Object.entries(source.extras)) {
      if (value !== undefined) out[key] = value;
    }
  }
  return out;
};

const describeJsonType = (v: unknown): string => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
};

const copy = (view: Uint8Array): Uint8Array => {
  const out = new Uint8Array(view.length);
  out.set(view);
  return out;
};

const isUint8 = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 0xff;
const isUint16 = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 0xffff;
