import { describe, expect, it } from 'vitest';
import { decode } from './decode.js';
import { encode } from './encode.js';
import { XflipEncodeError, XflipParseError } from './errors.js';
import { identityPose, parsePoseChunk, samplePose, serializePoseChunk } from './pose.js';
import type { PoseKeyframe, XflipPose } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const minimalPng = (): Uint8Array => {
  // 1×1 white PNG — valid image bytes for layer imageData
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==';
  const bin = atob(base64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const kf = (
  tx = 0,
  ty = 0,
  rotationYRad = 0,
  scale = 1,
  opacity = 1,
  rotationXRad = 0,
): PoseKeyframe => ({
  tx,
  ty,
  rotationXRad,
  rotationYRad,
  scale,
  opacity,
});

const uniformPose = (gridSize: 3 | 5, frame: PoseKeyframe): XflipPose => ({
  gridSize,
  keyframes: Array(gridSize * gridSize).fill(frame) as PoseKeyframe[],
});

// ---------------------------------------------------------------------------
// parsePoseChunk
// ---------------------------------------------------------------------------

describe('parsePoseChunk', () => {
  it('round-trips 3×3 identity via serialize+parse', () => {
    const pose = identityPose(3);
    const payload = serializePoseChunk('front', 2, pose);
    const result = parsePoseChunk(payload);
    expect(result.face).toBe('front');
    expect(result.layerId).toBe(2);
    expect(result.pose.gridSize).toBe(3);
    expect(result.pose.keyframes).toHaveLength(9);
    for (const frame of result.pose.keyframes) {
      expect(frame.tx).toBeCloseTo(0);
      expect(frame.ty).toBeCloseTo(0);
      expect(frame.scale).toBeCloseTo(1);
      expect(frame.opacity).toBeCloseTo(1);
    }
  });

  it('round-trips back face', () => {
    const pose = identityPose(3);
    const payload = serializePoseChunk('back', 7, pose);
    const result = parsePoseChunk(payload);
    expect(result.face).toBe('back');
    expect(result.layerId).toBe(7);
  });

  it('round-trips 3×3 with non-zero keyframes', () => {
    const pose: XflipPose = {
      gridSize: 3,
      keyframes: Array.from({ length: 9 }, (_, i) =>
        kf(i * 1.5, -i * 0.5, i * 0.01, 1 + i * 0.05, 1 - i * 0.02),
      ),
    };
    const payload = serializePoseChunk('front', 0, pose);
    const result = parsePoseChunk(payload);
    for (let i = 0; i < 9; i++) {
      const src = pose.keyframes[i] as PoseKeyframe;
      const got = result.pose.keyframes[i] as PoseKeyframe;
      expect(got.tx).toBeCloseTo(src.tx, 3);
      expect(got.ty).toBeCloseTo(src.ty, 3);
      expect(got.rotationYRad).toBeCloseTo(src.rotationYRad, 3);
      expect(got.scale).toBeCloseTo(src.scale, 3);
      expect(got.opacity).toBeCloseTo(src.opacity, 3);
    }
  });

  it('round-trips 5×5', () => {
    const pose = identityPose(5);
    const payload = serializePoseChunk('back', 1, pose);
    const result = parsePoseChunk(payload);
    expect(result.pose.gridSize).toBe(5);
    expect(result.pose.keyframes).toHaveLength(25);
  });

  it('throws on too-short payload', () => {
    expect(() => parsePoseChunk(new Uint8Array(2))).toThrow(XflipParseError);
  });

  it('throws on unknown face code', () => {
    const buf = new Uint8Array(4 + 9 * 24);
    buf[0] = 99;
    buf[2] = 3;
    expect(() => parsePoseChunk(buf)).toThrow(XflipParseError);
  });

  it('throws on unsupported grid_size', () => {
    const buf = new Uint8Array(4 + 4 * 24); // wrong size for grid=2
    buf[2] = 2;
    expect(() => parsePoseChunk(buf)).toThrow(XflipParseError);
  });

  it('throws on non-zero reserved byte', () => {
    const pose = identityPose(3);
    const payload = serializePoseChunk('front', 0, pose);
    payload[3] = 1; // corrupt reserved
    expect(() => parsePoseChunk(payload)).toThrow(XflipParseError);
  });

  it('throws on wrong payload length for grid_size', () => {
    const pose = identityPose(3);
    const payload = serializePoseChunk('front', 0, pose);
    payload[2] = 5; // claim grid=5 but bytes only fit 3×3
    expect(() => parsePoseChunk(payload)).toThrow(XflipParseError);
  });
});

// ---------------------------------------------------------------------------
// serializePoseChunk
// ---------------------------------------------------------------------------

describe('serializePoseChunk', () => {
  it('throws on invalid grid_size', () => {
    expect(() => serializePoseChunk('front', 0, { gridSize: 4 as 3, keyframes: [] })).toThrow(
      XflipEncodeError,
    );
  });

  it('throws on keyframe count mismatch', () => {
    expect(() => serializePoseChunk('front', 0, { gridSize: 3, keyframes: [kf()] })).toThrow(
      XflipEncodeError,
    );
  });

  it('throws on invalid layer_id', () => {
    const pose = identityPose(3);
    expect(() => serializePoseChunk('front', 300, pose)).toThrow(XflipEncodeError);
    expect(() => serializePoseChunk('front', -1, pose)).toThrow(XflipEncodeError);
  });

  it('produces correct byte length for 3×3', () => {
    const pose = identityPose(3);
    const payload = serializePoseChunk('front', 0, pose);
    expect(payload.length).toBe(4 + 9 * 24); // 220 bytes
  });

  it('produces correct byte length for 5×5', () => {
    const pose = identityPose(5);
    const payload = serializePoseChunk('front', 0, pose);
    expect(payload.length).toBe(4 + 25 * 24); // 604 bytes
  });
});

// ---------------------------------------------------------------------------
// samplePose
// ---------------------------------------------------------------------------

describe('samplePose', () => {
  it('uniform grid returns same value everywhere', () => {
    const frame = kf(10, -5, 0.1, 1.2, 0.8);
    const pose = uniformPose(3, frame);
    for (const [nx, ny] of [
      [-1, -1],
      [0, 0],
      [1, 1],
      [0.3, -0.7],
    ] as [number, number][]) {
      const result = samplePose(pose, nx, ny);
      expect(result.tx).toBeCloseTo(frame.tx, 3);
      expect(result.ty).toBeCloseTo(frame.ty, 3);
      expect(result.scale).toBeCloseTo(frame.scale, 3);
    }
  });

  it('identity grid returns zeros at all positions', () => {
    const pose = identityPose(3);
    const result = samplePose(pose, 0.5, -0.5);
    expect(result.tx).toBeCloseTo(0);
    expect(result.ty).toBeCloseTo(0);
    expect(result.rotationYRad).toBeCloseTo(0);
    expect(result.scale).toBeCloseTo(1);
    expect(result.opacity).toBeCloseTo(1);
  });

  it('corner samples return exact keyframe values', () => {
    // Make a 3×3 where only corners are set distinctly
    const keyframes: PoseKeyframe[] = Array(9).fill(kf()) as PoseKeyframe[];
    keyframes[0] = kf(100, 0); // top-left (nx=-1, ny=-1)
    keyframes[2] = kf(0, 200); // top-right (nx=+1, ny=-1)
    keyframes[6] = kf(-100, 0); // bot-left (nx=-1, ny=+1)
    keyframes[8] = kf(0, -200); // bot-right (nx=+1, ny=+1)
    const pose: XflipPose = { gridSize: 3, keyframes };

    const tl = samplePose(pose, -1, -1);
    expect(tl.tx).toBeCloseTo(100, 2);
    expect(tl.ty).toBeCloseTo(0, 2);

    const tr = samplePose(pose, 1, -1);
    expect(tr.tx).toBeCloseTo(0, 2);
    expect(tr.ty).toBeCloseTo(200, 2);

    const br = samplePose(pose, 1, 1);
    expect(br.ty).toBeCloseTo(-200, 2);
  });

  it('center of 3×3 equals exact middle keyframe (index 4)', () => {
    const keyframes: PoseKeyframe[] = Array(9).fill(kf()) as PoseKeyframe[];
    keyframes[4] = kf(42, 42); // center cell
    const pose: XflipPose = { gridSize: 3, keyframes };
    const result = samplePose(pose, 0, 0);
    expect(result.tx).toBeCloseTo(42, 3);
    expect(result.ty).toBeCloseTo(42, 3);
  });

  it('clamps outside [-1,+1] to boundary', () => {
    const keyframes: PoseKeyframe[] = Array(9).fill(kf()) as PoseKeyframe[];
    keyframes[2] = kf(99, 0); // top-right corner
    const pose: XflipPose = { gridSize: 3, keyframes };
    // nx=2 > 1 → clamped to 1
    const clamped = samplePose(pose, 2, -1);
    expect(clamped.tx).toBeCloseTo(99, 2);
  });
});

// ---------------------------------------------------------------------------
// identityPose
// ---------------------------------------------------------------------------

describe('identityPose', () => {
  it('default is 3×3 with 9 keyframes', () => {
    const pose = identityPose();
    expect(pose.gridSize).toBe(3);
    expect(pose.keyframes).toHaveLength(9);
  });

  it('5×5 produces 25 keyframes', () => {
    const pose = identityPose(5);
    expect(pose.keyframes).toHaveLength(25);
  });

  it('all keyframes are neutral', () => {
    for (const kf of identityPose(3).keyframes) {
      expect(kf.tx).toBe(0);
      expect(kf.ty).toBe(0);
      expect(kf.rotationYRad).toBe(0);
      expect(kf.scale).toBe(1);
      expect(kf.opacity).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// decode + encode round-trip with pose
// ---------------------------------------------------------------------------

describe('decode/encode round-trip with pOse', () => {
  it('encodes pOse chunk when layer has pose', () => {
    const pose = identityPose(3);
    // Use encode/decode from this package directly
    const frontLayers = {
      version: 1,
      flags: 0,
      layers: [
        {
          layerId: 0,
          format: 'png' as const,
          blendMode: 'normal' as const,
          effectType: 'base',
          opacity: 255,
          zOrder: 0,
          response: {},
          imageData: minimalPng(),
          pose,
        },
      ],
    };
    const file = {
      versionMajor: 1,
      versionMinor: 2,
      head: {
        width: 100,
        height: 150,
        frontFormat: 'png' as const,
        backFormat: 'png' as const,
        flipAxis: 'horizontal' as const,
        flags: 0,
      },
      front: minimalPng(),
      back: minimalPng(),
      frontLayers,
    };
    const bytes = encode(file);
    const decoded = decode(bytes);
    const layer = decoded.frontLayers?.layers[0];
    expect(layer?.pose).toBeDefined();
    expect(layer?.pose?.gridSize).toBe(3);
    expect(layer?.pose?.keyframes).toHaveLength(9);
  });

  it('layers without pose decode with pose=undefined', () => {
    const frontLayers = {
      version: 1,
      flags: 0,
      layers: [
        {
          layerId: 0,
          format: 'png' as const,
          blendMode: 'normal' as const,
          effectType: 'base',
          opacity: 255,
          zOrder: 0,
          response: {},
          imageData: minimalPng(),
        },
      ],
    };
    const file = {
      versionMajor: 1,
      versionMinor: 1,
      head: {
        width: 100,
        height: 150,
        frontFormat: 'png' as const,
        backFormat: 'png' as const,
        flipAxis: 'horizontal' as const,
        flags: 0,
      },
      front: minimalPng(),
      back: minimalPng(),
      frontLayers,
    };
    const bytes = encode(file);
    const decoded = decode(bytes);
    expect(decoded.frontLayers?.layers[0]?.pose).toBeUndefined();
  });

  it('pose keyframe values survive float32 round-trip', () => {
    const pose: XflipPose = {
      gridSize: 3,
      keyframes: Array.from({ length: 9 }, (_, i) =>
        kf(i * 10, -i * 5, i * 0.1, 1 + i * 0.1, 1 - i * 0.05),
      ),
    };
    const frontLayers = {
      version: 1,
      flags: 0,
      layers: [
        {
          layerId: 3,
          format: 'png' as const,
          blendMode: 'normal' as const,
          effectType: 'base',
          opacity: 255,
          zOrder: 0,
          response: {},
          imageData: minimalPng(),
          pose,
        },
      ],
    };
    const file = {
      versionMajor: 1,
      versionMinor: 2,
      head: {
        width: 1,
        height: 1,
        frontFormat: 'png' as const,
        backFormat: 'png' as const,
        flipAxis: 'horizontal' as const,
        flags: 0,
      },
      front: minimalPng(),
      back: minimalPng(),
      frontLayers,
    };
    const bytes = encode(file);
    const decoded = decode(bytes);
    const got = decoded.frontLayers?.layers[0]?.pose;
    expect(got?.gridSize).toBe(3);
    for (let i = 0; i < 9; i++) {
      const src = pose.keyframes[i] as PoseKeyframe;
      const got2 = got?.keyframes[i] as PoseKeyframe;
      // float32 has ~6 decimal digits precision
      expect(got2.tx).toBeCloseTo(src.tx, 3);
      expect(got2.ty).toBeCloseTo(src.ty, 3);
    }
  });
});
