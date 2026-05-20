import { decode } from '@xflip/core';
import { describe, expect, it } from 'vitest';
import { buildFile } from './create.js';
import { addLayer, encodeWithLayer, isBlendMode } from './layers.js';

const baseFile = () =>
  decode(
    buildFile({
      front: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      back: new Uint8Array([0xff, 0xd8, 0xff]),
      frontFormat: 'png',
      backFormat: 'jpeg',
      width: 64,
      height: 64,
    }),
  );

describe('isBlendMode', () => {
  it.each([
    'normal',
    'multiply',
    'screen',
    'overlay',
    'add',
    'luminosity',
    'custom',
  ])('accepts %s', (name) => {
    expect(isBlendMode(name)).toBe(true);
  });
  it('rejects unknown names', () => {
    expect(isBlendMode('vivid_light')).toBe(false);
    expect(isBlendMode('')).toBe(false);
  });
});

describe('addLayer', () => {
  it('creates fLyr chunk on first front layer and promotes v1.0 → v1.1', () => {
    const file = baseFile();
    expect(file.versionMinor).toBe(0);
    expect(file.frontLayers).toBeUndefined();
    const updated = addLayer(file, {
      face: 'front',
      image: new Uint8Array([1, 2, 3, 4]),
      format: 'png',
      blendMode: 'overlay',
      effectType: 'holographic',
    });
    expect(updated.versionMinor).toBe(1);
    expect(updated.frontLayers?.layers.length).toBe(1);
    const layer = updated.frontLayers?.layers[0];
    expect(layer?.layerId).toBe(0);
    expect(layer?.zOrder).toBe(0);
    expect(layer?.opacity).toBe(255);
    expect(layer?.format).toBe('png');
    expect(layer?.blendMode).toBe('overlay');
    expect(layer?.effectType).toBe('holographic');
  });

  it('routes to bLyr when face is "back"', () => {
    const file = baseFile();
    const updated = addLayer(file, {
      face: 'back',
      image: new Uint8Array([9]),
      format: 'raw',
      blendMode: 'normal',
      effectType: 'matte',
    });
    expect(updated.frontLayers).toBeUndefined();
    expect(updated.backLayers?.layers.length).toBe(1);
  });

  it('appends to an existing chunk, defaulting layer_id and z_order', () => {
    let file = baseFile();
    file = addLayer(file, {
      face: 'front',
      image: new Uint8Array([1]),
      format: 'png',
      blendMode: 'normal',
      effectType: 'a',
    });
    file = addLayer(file, {
      face: 'front',
      image: new Uint8Array([2]),
      format: 'png',
      blendMode: 'screen',
      effectType: 'b',
    });
    expect(file.frontLayers?.layers.length).toBe(2);
    expect(file.frontLayers?.layers[1]?.layerId).toBe(1);
    expect(file.frontLayers?.layers[1]?.zOrder).toBe(1);
  });

  it('round-trips through encode/decode', () => {
    const file = baseFile();
    const updated = addLayer(file, {
      face: 'front',
      image: new Uint8Array([0xa, 0xb, 0xc]),
      format: 'png',
      blendMode: 'multiply',
      effectType: 'foil',
      opacity: 200,
      zOrder: 7,
      response: { intensity: 0.6, response_axis: 'xy' },
    });
    const bytes = encodeWithLayer(updated);
    const reread = decode(bytes);
    expect(reread.versionMinor).toBe(1);
    const layer = reread.frontLayers?.layers[0];
    expect(layer?.opacity).toBe(200);
    expect(layer?.zOrder).toBe(7);
    expect(layer?.blendMode).toBe('multiply');
    expect(layer?.effectType).toBe('foil');
    expect(layer?.response.intensity).toBe(0.6);
    expect(layer?.response.response_axis).toBe('xy');
    expect(Array.from(layer?.imageData ?? [])).toEqual([0xa, 0xb, 0xc]);
  });

  it('rejects a duplicate explicit layer_id', () => {
    let file = baseFile();
    file = addLayer(file, {
      face: 'front',
      image: new Uint8Array([1]),
      format: 'png',
      blendMode: 'normal',
      effectType: 'a',
      layerId: 5,
    });
    expect(() =>
      addLayer(file, {
        face: 'front',
        image: new Uint8Array([2]),
        format: 'png',
        blendMode: 'normal',
        effectType: 'b',
        layerId: 5,
      }),
    ).toThrow(/layer_id 5/);
  });

  it('does not mutate the input file', () => {
    const file = baseFile();
    const snapshot = JSON.stringify({
      versionMinor: file.versionMinor,
      frontLayers: file.frontLayers,
    });
    addLayer(file, {
      face: 'front',
      image: new Uint8Array([1]),
      format: 'png',
      blendMode: 'normal',
      effectType: 'a',
    });
    expect(JSON.stringify({ versionMinor: file.versionMinor, frontLayers: file.frontLayers })).toBe(
      snapshot,
    );
  });
});
