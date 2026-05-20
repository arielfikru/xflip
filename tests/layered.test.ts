/**
 * Round-trip integration tests for xflip v1.1 layered effects.
 *
 * Covers: `fLyr`, `bLyr`, `hEfx`, spec-mandated chunk ordering, and
 * backward compatibility with v1.0 files (which must still decode under
 * the v1.1 codec, with all new optional fields absent).
 */

import { describe, expect, test } from 'vitest';
import {
  decode,
  encode,
  parseChunks,
  type XflipFile,
  type XflipHefx,
  type XflipLayer,
  type XflipLayerChunk,
} from '../packages/xflip-core/src/index.js';

const baseLayer = (overrides: Partial<XflipLayer> = {}): XflipLayer => ({
  layerId: 1,
  format: 'png',
  blendMode: 'normal',
  effectType: 'holo',
  opacity: 255,
  zOrder: 0,
  response: {},
  imageData: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xde, 0xad]),
  ...overrides,
});

const baseFile = (overrides: Partial<XflipFile> = {}): XflipFile => ({
  versionMajor: 1,
  versionMinor: 1,
  head: {
    width: 32,
    height: 32,
    frontFormat: 'png',
    backFormat: 'png',
    flipAxis: 'horizontal',
    flags: 0,
  },
  front: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x01]),
  back: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x02]),
  ...overrides,
});

describe('round-trip: v1.1 layered chunks', () => {
  test('fLyr only', () => {
    const file = baseFile({
      frontLayers: { version: 1, flags: 0, layers: [baseLayer()] },
    });
    const decoded = decode(encode(file));
    expect(decoded.frontLayers).toEqual(file.frontLayers);
    expect(decoded.backLayers).toBeUndefined();
    expect(decoded.effects).toBeUndefined();
  });

  test('bLyr only', () => {
    const file = baseFile({
      backLayers: { version: 1, flags: 0, layers: [baseLayer({ blendMode: 'screen' })] },
    });
    const decoded = decode(encode(file));
    expect(decoded.backLayers).toEqual(file.backLayers);
  });

  test('hEfx only', () => {
    const hefx: XflipHefx = {
      tilt_sensitivity: 1.2,
      card_material: 'holographic',
      interaction_modes: ['mouse', 'tilt'],
    };
    const file = baseFile({ effects: hefx });
    const decoded = decode(encode(file));
    expect(decoded.effects).toEqual(hefx);
  });

  test('fLyr + bLyr + hEfx + META combined', () => {
    const file = baseFile({
      frontLayers: {
        version: 1,
        flags: 0,
        layers: [
          baseLayer({ layerId: 1, effectType: 'rainbow', zOrder: 0 }),
          baseLayer({
            layerId: 2,
            blendMode: 'add',
            effectType: 'sparkle',
            opacity: 200,
            zOrder: 5,
            response: { input_source: 'mouse', response_axis: 'xy', intensity: 0.8 },
            imageData: new Uint8Array([1, 2, 3, 4]),
          }),
        ],
      },
      backLayers: {
        version: 1,
        flags: 0,
        layers: [baseLayer({ effectType: 'foil', blendMode: 'overlay' })],
      },
      effects: {
        perspective: 1500,
        ambient_intensity: 0.3,
        fallback_behavior: 'auto-animate',
      },
      ancillary: new Map([['META', new TextEncoder().encode('{"title":"card"}')]]),
    });
    const decoded = decode(encode(file));
    expect(decoded.frontLayers).toEqual(file.frontLayers);
    expect(decoded.backLayers).toEqual(file.backLayers);
    expect(decoded.effects).toEqual(file.effects);
    expect(decoded.ancillary?.get('META')).toEqual(file.ancillary?.get('META'));
  });

  test('chunk ordering matches spec §3.4', () => {
    const file = baseFile({
      frontLayers: { version: 1, flags: 0, layers: [baseLayer()] },
      backLayers: { version: 1, flags: 0, layers: [baseLayer()] },
      effects: { perspective: 1000 },
      ancillary: new Map([['META', new Uint8Array([1])]]),
    });
    const bytes = encode(file);
    const parsed = parseChunks(bytes);
    const order = parsed.chunks.map((c) => c.type);
    expect(order).toEqual(['HEAD', 'META', 'FRNT', 'fLyr', 'BACK', 'bLyr', 'hEfx']);
  });
});

describe('backward compat: v1.0 files under v1.1 codec', () => {
  test('v1.0 file without layered chunks decodes with optional fields absent', () => {
    const file = baseFile({ versionMinor: 0 });
    const decoded = decode(encode(file));
    expect(decoded.versionMinor).toBe(0);
    expect(decoded.frontLayers).toBeUndefined();
    expect(decoded.backLayers).toBeUndefined();
    expect(decoded.effects).toBeUndefined();
    expect(decoded.ancillary).toBeUndefined();
  });

  test('unparseable fLyr payload gracefully preserved as raw ancillary', () => {
    // Spec §3.3: ancillary chunks MUST NOT abort decode on parse failure.
    const file = baseFile({
      ancillary: new Map([['fLyr', new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff])]]),
    });
    const decoded = decode(encode(file));
    expect(decoded.frontLayers).toBeUndefined();
    expect(decoded.ancillary?.get('fLyr')).toEqual(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff]));
  });
});

describe('encode error paths', () => {
  test('rejects conflict between typed frontLayers and ancillary["fLyr"]', () => {
    const file = baseFile({
      frontLayers: { version: 1, flags: 0, layers: [baseLayer()] },
      ancillary: new Map([['fLyr', new Uint8Array([1, 2, 3])]]),
    });
    expect(() => encode(file)).toThrow(/conflicting source/);
  });
});

describe('layered round-trip preserves all blend modes', () => {
  const allBlends = [
    'normal',
    'multiply',
    'screen',
    'overlay',
    'add',
    'color_dodge',
    'color_burn',
    'soft_light',
    'hard_light',
    'difference',
    'luminosity',
    'custom',
  ] as const;
  for (const blend of allBlends) {
    test(`blendMode=${blend}`, () => {
      const chunk: XflipLayerChunk = {
        version: 1,
        flags: 0,
        layers: [baseLayer({ blendMode: blend })],
      };
      const file = baseFile({ frontLayers: chunk });
      const decoded = decode(encode(file));
      expect(decoded.frontLayers?.layers[0]?.blendMode).toBe(blend);
    });
  }
});
