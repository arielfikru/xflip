// Generates 20 .xflip variants into apps/playground/public/.
//
// Each variant uses the SAME front (original rin.jpg) and the SAME dark
// back. What differs is the holographic overlay config carried inside the
// META chunk as UTF-8 JSON: `{ "holo": [{ preset, intensity?, blend? }] }`.
// The viewer parses META on load and applies the layers automatically.
//
// Build via `pnpm --filter @xflip/playground fixtures` or as predev.

import { deflateSync } from 'node:zlib';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { crc32, encode } from '../../../packages/xflip-core/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public');
const repoRoot = join(here, '..', '..', '..');
mkdirSync(outDir, { recursive: true });

// ---------- back PNG synthesis ----------

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

function solidPng(w, h, rgba) {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = pngChunk('IHDR', concat([u32be(w), u32be(h), new Uint8Array([8, 6, 0, 0, 0])]));
  const row = new Uint8Array(1 + w * 4);
  for (let x = 0; x < w; x++) {
    row[1 + x * 4 + 0] = rgba[0];
    row[1 + x * 4 + 1] = rgba[1];
    row[1 + x * 4 + 2] = rgba[2];
    row[1 + x * 4 + 3] = rgba[3];
  }
  const raw = new Uint8Array(row.length * h);
  for (let y = 0; y < h; y++) raw.set(row, y * row.length);
  const idat = pngChunk('IDAT', new Uint8Array(deflateSync(raw)));
  const iend = pngChunk('IEND', new Uint8Array());
  return concat([sig, ihdr, idat, iend]);
}

function makeXflip(front, back, w, h, frontFormat, backFormat, holoMeta) {
  const ancillary = new Map();
  if (holoMeta) {
    const json = JSON.stringify({ holo: holoMeta });
    ancillary.set('META', new TextEncoder().encode(json));
  }
  return encode({
    versionMajor: 1,
    versionMinor: 0,
    head: { width: w, height: h, frontFormat, backFormat, flipAxis: 'horizontal', flags: 0 },
    front,
    back,
    ...(ancillary.size > 0 ? { ancillary } : {}),
  });
}

// ---------- run ----------

const built = [];

const fallback = makeXflip(
  solidPng(240, 336, [37, 99, 235, 255]),
  solidPng(240, 336, [220, 38, 38, 255]),
  240,
  336,
  'png',
  'png',
);
writeFileSync(join(outDir, 'sample.xflip'), fallback);
built.push(['sample.xflip', fallback.length]);

const rinPath = join(repoRoot, 'rin.jpg');
if (!existsSync(rinPath)) {
  console.log(
    [
      ...built.map(([n, b]) => `built ${b.toString().padStart(10)} B  ${n}`),
      'note: rin.jpg not found at repo root — skipping variants',
    ].join('\n'),
  );
  process.exit(0);
}

const rinBuf = readFileSync(rinPath);

// Downscale once to keep file size sane (~80-150 KB JPEG).
const base = await sharp(rinBuf)
  .resize({ width: 720, withoutEnlargement: true })
  .jpeg({ quality: 82, mozjpeg: true })
  .toBuffer();
const baseMeta = await sharp(base).metadata();
const bw = baseMeta.width;
const bh = baseMeta.height;
const back = solidPng(bw, bh, [12, 14, 22, 255]);

// 20 distinct holo configs. Single-layer and stacked. The viewer parses
// each from META on load and applies them as `holoLayers`.
const HOLO_CONFIGS = [
  ['rin-01-rainbow.xflip',       [{ preset: 'rainbow', intensity: 1 }]],
  ['rin-02-foil.xflip',          [{ preset: 'foil',    intensity: 1 }]],
  ['rin-03-prism.xflip',         [{ preset: 'prism',   intensity: 1 }]],
  ['rin-04-gold.xflip',          [{ preset: 'gold',    intensity: 1 }]],
  ['rin-05-rainbow-soft.xflip',  [{ preset: 'rainbow', intensity: 0.35 }]],
  ['rin-06-foil-soft.xflip',     [{ preset: 'foil',    intensity: 0.4 }]],
  ['rin-07-prism-soft.xflip',    [{ preset: 'prism',   intensity: 0.4 }]],
  ['rin-08-gold-soft.xflip',     [{ preset: 'gold',    intensity: 0.45 }]],

  ['rin-09-rainbow+foil.xflip',  [
    { preset: 'rainbow', intensity: 0.7 },
    { preset: 'foil',    intensity: 0.6 },
  ]],
  ['rin-10-gold+foil.xflip',     [
    { preset: 'gold',    intensity: 0.9 },
    { preset: 'foil',    intensity: 0.5 },
  ]],
  ['rin-11-prism+foil.xflip',    [
    { preset: 'prism',   intensity: 0.8 },
    { preset: 'foil',    intensity: 0.4 },
  ]],
  ['rin-12-rainbow+gold.xflip',  [
    { preset: 'rainbow', intensity: 0.6 },
    { preset: 'gold',    intensity: 0.6 },
  ]],
  ['rin-13-prism+gold.xflip',    [
    { preset: 'prism',   intensity: 0.7 },
    { preset: 'gold',    intensity: 0.5 },
  ]],
  ['rin-14-rainbow+prism.xflip', [
    { preset: 'rainbow', intensity: 0.5 },
    { preset: 'prism',   intensity: 0.6 },
  ]],

  ['rin-15-full-stack.xflip',    [
    { preset: 'rainbow', intensity: 0.5 },
    { preset: 'foil',    intensity: 0.4 },
    { preset: 'gold',    intensity: 0.5 },
  ]],
  ['rin-16-prism-stack.xflip',   [
    { preset: 'prism',   intensity: 0.7 },
    { preset: 'foil',    intensity: 0.35 },
    { preset: 'gold',    intensity: 0.35 },
  ]],
  ['rin-17-cool-stack.xflip',    [
    { preset: 'rainbow', intensity: 0.5, blend: 'screen' },
    { preset: 'foil',    intensity: 0.5 },
  ]],
  ['rin-18-warm-stack.xflip',    [
    { preset: 'gold',    intensity: 0.85 },
    { preset: 'rainbow', intensity: 0.3 },
    { preset: 'foil',    intensity: 0.25 },
  ]],
  ['rin-19-shine-only.xflip',    [
    { preset: 'foil',    intensity: 1, blend: 'overlay' },
  ]],
  ['rin-20-quiet.xflip',         [
    { preset: 'gold',    intensity: 0.2 },
    { preset: 'foil',    intensity: 0.15 },
  ]],

  ['rin-21-aurora.xflip',        [{ preset: 'aurora',   intensity: 1 }]],
  ['rin-22-galaxy.xflip',        [{ preset: 'galaxy',   intensity: 1 }]],
  ['rin-23-emerald.xflip',       [{ preset: 'emerald',  intensity: 1 }]],
  ['rin-24-ruby.xflip',          [{ preset: 'ruby',     intensity: 1 }]],
  ['rin-25-ice.xflip',           [{ preset: 'ice',      intensity: 1 }]],
  ['rin-27-aurora+foil.xflip',   [
    { preset: 'aurora',  intensity: 0.8 },
    { preset: 'foil',    intensity: 0.5 },
  ]],
  ['rin-28-galaxy+ice.xflip',    [
    { preset: 'galaxy',  intensity: 0.8 },
    { preset: 'ice',     intensity: 0.5 },
  ]],
  ['rin-30-cosmic-stack.xflip',  [
    { preset: 'galaxy',  intensity: 0.6 },
    { preset: 'aurora',  intensity: 0.4 },
    { preset: 'ice',     intensity: 0.4 },
  ]],

  ['rin-31-pearl.xflip',         [{ preset: 'pearl',  intensity: 1 }]],
  ['rin-32-pearl+foil.xflip',    [
    { preset: 'pearl',   intensity: 0.8 },
    { preset: 'foil',    intensity: 0.45 },
  ]],
];

for (const [name, holo] of HOLO_CONFIGS) {
  const bytes = makeXflip(base, back, bw, bh, 'jpeg', 'png', holo);
  writeFileSync(join(outDir, name), bytes);
  built.push([name, bytes.length]);
}

console.log(built.map(([n, b]) => `built ${b.toString().padStart(10)} B  ${n}`).join('\n'));
