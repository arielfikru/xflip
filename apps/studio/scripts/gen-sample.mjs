// Generates sample-data/head-turn.xflip — a 3-layer 3×3 pose-rig demo card.
// Layers: background (static), head (shifts left/right per column), shadow (shifts opposite).
// Run: node apps/studio/scripts/gen-sample.mjs

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, encode, identityPose } from '../../../packages/xflip-core/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', '..', 'sample-data');
mkdirSync(outDir, { recursive: true });

// ---------- PNG helpers ----------

function u32be(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, false);
  return b;
}

function concat(arrays) {
  const len = arrays.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const body = concat([typeBytes, data]);
  return concat([u32be(data.length), body, u32be(crc32(body))]);
}

/** Solid-color RGBA PNG */
function solidPng(w, h, [r, g, b, a]) {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = pngChunk('IHDR', concat([u32be(w), u32be(h), new Uint8Array([8, 6, 0, 0, 0])]));
  const row = new Uint8Array(1 + w * 4);
  for (let x = 0; x < w; x++) { row[1 + x*4] = r; row[2 + x*4] = g; row[3 + x*4] = b; row[4 + x*4] = a; }
  const raw = new Uint8Array(row.length * h);
  for (let y = 0; y < h; y++) raw.set(row, y * row.length);
  const idat = pngChunk('IDAT', new Uint8Array(deflateSync(raw)));
  return concat([sig, ihdr, idat, pngChunk('IEND', new Uint8Array())]);
}

/** Circle PNG (RGBA with transparent bg, filled circle center) */
function circlePng(w, h, [r, g, b]) {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = pngChunk('IHDR', concat([u32be(w), u32be(h), new Uint8Array([8, 6, 0, 0, 0])]));
  const raw = new Uint8Array((1 + w * 4) * h);
  const cx = w / 2, cy = h / 2, radius = Math.min(w, h) * 0.35;
  for (let y = 0; y < h; y++) {
    const rowOff = y * (1 + w * 4);
    raw[rowOff] = 0; // filter None
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const inside = (dx*dx + dy*dy) <= radius*radius;
      const px = rowOff + 1 + x * 4;
      raw[px] = inside ? r : 0;
      raw[px+1] = inside ? g : 0;
      raw[px+2] = inside ? b : 0;
      raw[px+3] = inside ? 255 : 0;
    }
  }
  const idat = pngChunk('IDAT', new Uint8Array(deflateSync(raw)));
  return concat([sig, ihdr, idat, pngChunk('IEND', new Uint8Array())]);
}

// ---------- Card dimensions ----------

const W = 240, H = 336;

// ---------- Layer images ----------

const bgBytes   = solidPng(W, H, [30, 30, 46, 255]);    // dark background (#1e1e2e-ish)
const headBytes = circlePng(W, H, [166, 227, 161]);      // green circle (head)
const shadowBytes = circlePng(W, H, [49, 50, 68]);       // dim circle (shadow)

// ---------- Pose rig: 3×3 grid ----------
// Grid layout (cell indices):
//   0 1 2   (top row:    left / center / right tilt)
//   3 4 5   (middle row: left / center / right tilt)
//   6 7 8   (bottom row: left / center / right tilt)
//
// head:   tx shifts +30 for right col, -30 for left col
// shadow: tx shifts opposite (slight parallax)

function headPose(tx, ty) {
  const base = identityPose(3);
  const kf = { tx, ty, rotationRad: 0, scale: 1, opacity: 1 };
  return { ...base, keyframes: base.keyframes.map((_, i) => {
    const col = i % 3;
    const colTx = col === 0 ? -tx : col === 2 ? tx : 0;
    const row = Math.floor(i / 3);
    const rowTy = row === 0 ? -ty : row === 2 ? ty : 0;
    return { ...kf, tx: colTx, ty: rowTy };
  })};
}

function shadowPose(tx, ty) {
  const base = identityPose(3);
  const kf = { tx: 0, ty: 0, rotationRad: 0, scale: 0.9, opacity: 0.6 };
  return { ...base, keyframes: base.keyframes.map((_, i) => {
    const col = i % 3;
    const colTx = col === 0 ? tx * 0.5 : col === 2 ? -tx * 0.5 : 0;
    const row = Math.floor(i / 3);
    const rowTy = row === 0 ? ty * 0.5 : row === 2 ? -ty * 0.5 : 0;
    return { ...kf, tx: colTx, ty: rowTy + 20 }; // shadow below head
  })};
}

// ---------- Build file ----------

const layers = [
  {
    layerId: 0,
    format: 'png',
    blendMode: 'normal',
    effectType: 'base',
    opacity: 255,
    zOrder: 0,
    response: {},
    imageData: bgBytes,
    // no pose — background is static
  },
  {
    layerId: 1,
    format: 'png',
    blendMode: 'normal',
    effectType: 'base',
    opacity: 180,
    zOrder: 1,
    response: {},
    imageData: shadowBytes,
    pose: shadowPose(30, 15),
  },
  {
    layerId: 2,
    format: 'png',
    blendMode: 'normal',
    effectType: 'base',
    opacity: 255,
    zOrder: 2,
    response: {},
    imageData: headBytes,
    pose: headPose(30, 15),
  },
];

const file = {
  versionMajor: 1,
  versionMinor: 2,
  head: {
    width: W,
    height: H,
    frontFormat: 'png',
    backFormat: 'png',
    flipAxis: 'horizontal',
    flags: 0,
  },
  front: bgBytes,
  back: bgBytes,
  frontLayers: { version: 1, flags: 0, layers },
};

const bytes = encode(file);
const outPath = join(outDir, 'head-turn.xflip');
writeFileSync(outPath, bytes);
console.log(`Written ${bytes.length} bytes → ${outPath}`);
