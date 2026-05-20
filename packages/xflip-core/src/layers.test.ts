import { describe, expect, test } from 'vitest';
import { XflipEncodeError, XflipParseError } from './errors.js';
import { parseHefx, parseLayerChunk, serializeHefx, serializeLayerChunk } from './layers.js';
import type { XflipHefx, XflipLayer, XflipLayerChunk } from './types.js';

const baseLayer = (overrides: Partial<XflipLayer> = {}): XflipLayer => ({
  layerId: 1,
  format: 'png',
  blendMode: 'normal',
  effectType: 'holo',
  opacity: 255,
  zOrder: 0,
  response: {},
  imageData: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  ...overrides,
});

describe('parseLayerChunk / serializeLayerChunk', () => {
  test('round-trip single minimal layer', () => {
    const chunk: XflipLayerChunk = { version: 1, flags: 0, layers: [baseLayer()] };
    const bytes = serializeLayerChunk(chunk);
    const back = parseLayerChunk(bytes);
    expect(back).toEqual(chunk);
  });

  test('round-trip multiple layers with rich response', () => {
    const chunk: XflipLayerChunk = {
      version: 1,
      flags: 0,
      layers: [
        baseLayer({ layerId: 1, blendMode: 'screen', zOrder: 5 }),
        baseLayer({
          layerId: 2,
          format: 'jpeg',
          blendMode: 'add',
          effectType: 'sparkle',
          opacity: 128,
          zOrder: 10,
          response: {
            input_source: 'mouse',
            response_axis: 'xy',
            response_curve: 'linear',
            intensity: 1.0,
            offset_max_x: 50,
            offset_max_y: 50,
          },
          imageData: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
        }),
      ],
    };
    const back = parseLayerChunk(serializeLayerChunk(chunk));
    expect(back).toEqual(chunk);
  });

  test('preserves unknown response keys via extras', () => {
    const chunk: XflipLayerChunk = {
      version: 1,
      flags: 0,
      layers: [
        baseLayer({
          response: {
            intensity: 0.5,
            extras: { vendor_param: 42, nested: { a: 1 } },
          },
        }),
      ],
    };
    const back = parseLayerChunk(serializeLayerChunk(chunk));
    expect(back.layers[0]?.response.intensity).toBe(0.5);
    expect(back.layers[0]?.response.extras).toEqual({ vendor_param: 42, nested: { a: 1 } });
  });

  test('rejects unsupported version', () => {
    const bytes = new Uint8Array([2, 1, 0, 0]);
    expect(() => parseLayerChunk(bytes)).toThrow(XflipParseError);
  });

  test('rejects layer_count = 0', () => {
    const bytes = new Uint8Array([1, 0, 0, 0]);
    expect(() => parseLayerChunk(bytes)).toThrow(/layer_count must be ≥ 1/);
  });

  test('rejects effect_type_len = 0', () => {
    const writer = serializeLayerChunk({ version: 1, flags: 0, layers: [baseLayer()] });
    // effect_type_len is at offset 4 (header) + 3 (in record) = 7
    const mutated = new Uint8Array(writer);
    mutated[7] = 0;
    expect(() => parseLayerChunk(mutated)).toThrow(/effect_type_len must be ≥ 1/);
  });

  test('rejects unknown blend_mode code', () => {
    const writer = serializeLayerChunk({ version: 1, flags: 0, layers: [baseLayer()] });
    const mutated = new Uint8Array(writer);
    mutated[6] = 0x42; // blend_mode at header+2
    expect(() => parseLayerChunk(mutated)).toThrow(/unknown blend_mode/);
  });

  test('rejects unknown format code', () => {
    const writer = serializeLayerChunk({ version: 1, flags: 0, layers: [baseLayer()] });
    const mutated = new Uint8Array(writer);
    mutated[5] = 0x42; // format at header+1
    expect(() => parseLayerChunk(mutated)).toThrow(/unknown layer format code/);
  });

  test('rejects trailing bytes after last record', () => {
    const bytes = new Uint8Array(
      serializeLayerChunk({ version: 1, flags: 0, layers: [baseLayer()] }),
    );
    const padded = new Uint8Array(bytes.length + 3);
    padded.set(bytes);
    expect(() => parseLayerChunk(padded)).toThrow(/trailing byte/);
  });

  test('rejects malformed response JSON', () => {
    // Hand-build a payload with response_json = "not json"
    const effect = new TextEncoder().encode('holo');
    const badJson = new TextEncoder().encode('not json');
    const writer: number[] = [];
    writer.push(1, 1, 0, 0); // version, count, flags
    writer.push(0, 0x01, 0x00, effect.length); // layer_id, format=png, blend=normal, effect_len
    for (const b of effect) writer.push(b);
    writer.push(255, 0); // opacity, z_order
    writer.push((badJson.length >> 8) & 0xff, badJson.length & 0xff); // response_len
    for (const b of badJson) writer.push(b);
    writer.push(0, 0, 0, 0); // data_length=0
    expect(() => parseLayerChunk(new Uint8Array(writer))).toThrow(/not valid JSON/);
  });

  test('rejects response root that is not an object', () => {
    const effect = new TextEncoder().encode('holo');
    const arrJson = new TextEncoder().encode('[1,2,3]');
    const writer: number[] = [];
    writer.push(1, 1, 0, 0);
    writer.push(0, 0x01, 0x00, effect.length);
    for (const b of effect) writer.push(b);
    writer.push(255, 0);
    writer.push((arrJson.length >> 8) & 0xff, arrJson.length & 0xff);
    for (const b of arrJson) writer.push(b);
    writer.push(0, 0, 0, 0);
    expect(() => parseLayerChunk(new Uint8Array(writer))).toThrow(/must be a JSON object/);
  });

  test('serialize rejects layer_count out of range', () => {
    expect(() => serializeLayerChunk({ version: 1, flags: 0, layers: [] })).toThrow(
      XflipEncodeError,
    );
  });

  test('serialize rejects unknown blend mode at type-level escape', () => {
    const layer = { ...baseLayer(), blendMode: 'bogus' as unknown as XflipLayer['blendMode'] };
    expect(() => serializeLayerChunk({ version: 1, flags: 0, layers: [layer] })).toThrow(
      /unknown layer.blendMode/,
    );
  });

  test('serialize rejects empty effect_type', () => {
    expect(() =>
      serializeLayerChunk({ version: 1, flags: 0, layers: [baseLayer({ effectType: '' })] }),
    ).toThrow(/effect_type UTF-8 length/);
  });

  test('serialize rejects opacity out of uint8', () => {
    expect(() =>
      serializeLayerChunk({ version: 1, flags: 0, layers: [baseLayer({ opacity: 999 })] }),
    ).toThrow(/opacity must be uint8/);
  });
});

describe('parseHefx / serializeHefx', () => {
  test('empty payload returns empty object', () => {
    expect(parseHefx(new Uint8Array())).toEqual({});
  });

  test('round-trip standard keys', () => {
    const hefx: XflipHefx = {
      tilt_sensitivity: 1.0,
      tilt_max_angle: 25,
      perspective: 1500,
      ambient_intensity: 0.4,
      card_material: 'holographic',
      surface_finish: 'smooth',
      interaction_modes: ['mouse', 'tilt', 'auto'],
      fallback_behavior: 'auto-animate',
    };
    const back = parseHefx(serializeHefx(hefx));
    expect(back).toEqual(hefx);
  });

  test('preserves unknown top-level keys via extras', () => {
    const hefx: XflipHefx = {
      perspective: 2000,
      extras: { studio: 'mystudio', custom_flag: true },
    };
    const back = parseHefx(serializeHefx(hefx));
    expect(back.perspective).toBe(2000);
    expect(back.extras).toEqual({ studio: 'mystudio', custom_flag: true });
  });

  test('round-trip face_scope object', () => {
    const hefx: XflipHefx = {
      face_scope: { front: { intensity: 1.5 }, back: { intensity: 0.5 } },
    };
    const back = parseHefx(serializeHefx(hefx));
    expect(back.face_scope).toEqual(hefx.face_scope);
  });

  test('rejects non-object root', () => {
    const bytes = new TextEncoder().encode('[1,2,3]');
    expect(() => parseHefx(bytes)).toThrow(/must be a JSON object/);
  });

  test('rejects malformed JSON', () => {
    const bytes = new TextEncoder().encode('{not json');
    expect(() => parseHefx(bytes)).toThrow(/not valid JSON/);
  });

  test('empty object hefx serializes to "{}"', () => {
    expect(new TextDecoder().decode(serializeHefx({}))).toBe('{}');
  });
});
