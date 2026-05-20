// Generates apps/playground/public/sample.xflip + sample-layered.xflip.
//
// The viewer renders FRNT/BACK payloads through `<img>` blob URLs, so the
// payloads need to be real PNGs. We synthesize solid-color PNGs inline
// (zero npm deps beyond node:zlib) and then call @xflip/core's encode().
//
// Run via `pnpm --filter @xflip/playground fixtures` or as the `predev`
// step in package.json.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { crc32, encode } from '../../../packages/xflip-core/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public');
mkdirSync(outDir, { recursive: true });

// ---------- PNG synthesis ----------

function u32be(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, false);
  return b;
}

function concat(arrays) {
  const len = arrays.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const body = concat([typeBytes, data]);
  const crc = crc32(body);
  return concat([u32be(data.length), body, u32be(crc)]);
}

/**
 * Solid-color RGBA PNG. width/height in pixels; `rgba` is a 4-tuple [0,255].
 */
function solidPng(width, height, rgba) {
  // PNG signature
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR: width, height, bit depth=8, color type=6 (RGBA), compression=0,
  // filter=0, interlace=0
  const ihdrData = concat([
    u32be(width),
    u32be(height),
    new Uint8Array([8, 6, 0, 0, 0]),
  ]);
  const ihdr = pngChunk('IHDR', ihdrData);

  // IDAT: filter byte (0 = None) per scanline, then 4 bytes per pixel
  const row = new Uint8Array(1 + width * 4);
  row[0] = 0; // filter: None
  for (let x = 0; x < width; x++) {
    row[1 + x * 4 + 0] = rgba[0];
    row[1 + x * 4 + 1] = rgba[1];
    row[1 + x * 4 + 2] = rgba[2];
    row[1 + x * 4 + 3] = rgba[3];
  }
  const raw = new Uint8Array(row.length * height);
  for (let y = 0; y < height; y++) raw.set(row, y * row.length);
  const idat = pngChunk('IDAT', new Uint8Array(deflateSync(raw)));

  // IEND
  const iend = pngChunk('IEND', new Uint8Array());

  return concat([sig, ihdr, idat, iend]);
}

// ---------- xflip files ----------

const W = 240;
const H = 336;

const frontPng = solidPng(W, H, [37, 99, 235, 255]); // blue
const backPng = solidPng(W, H, [220, 38, 38, 255]); // red

const flat = encode({
  versionMajor: 1,
  versionMinor: 0,
  head: {
    width: W,
    height: H,
    frontFormat: 'png',
    backFormat: 'png',
    flipAxis: 'horizontal',
    flags: 0,
  },
  front: frontPng,
  back: backPng,
});

writeFileSync(join(outDir, 'sample.xflip'), flat);

const overlayPng = solidPng(W, H, [255, 255, 255, 64]); // translucent white sheen
const layered = encode({
  versionMajor: 1,
  versionMinor: 1,
  head: {
    width: W,
    height: H,
    frontFormat: 'png',
    backFormat: 'png',
    flipAxis: 'horizontal',
    flags: 0,
  },
  front: frontPng,
  back: backPng,
  frontLayers: {
    version: 1,
    flags: 0,
    layers: [
      {
        layerId: 0,
        format: 'png',
        blendMode: 'screen',
        effectType: 'holographic',
        opacity: 200,
        zOrder: 0,
        response: {},
        imageData: overlayPng,
      },
    ],
  },
  effects: {
    interaction_modes: ['pointer', 'gyroscope'],
    response_curve: 'easeOutQuad',
    intensity: 0.8,
  },
});

writeFileSync(join(outDir, 'sample-layered.xflip'), layered);

console.log(
  `built ${flat.length} B sample.xflip + ${layered.length} B sample-layered.xflip`,
);
