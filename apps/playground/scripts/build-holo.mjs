// Builds apps/playground/public/sample-holo.xflip from a JPG at repo root.
//
// Input:  <repoRoot>/sample.jpg          (front + back face source)
// Output: apps/playground/public/sample-holo.xflip
//
// The holographic overlay is a rainbow-gradient PNG synthesized inline at
// the same dimensions as the input JPG so blending lines up. Back face
// reuses the front bytes (mirror is the viewer's job via flipAxis).

import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { crc32, encode } from '../../../packages/xflip-core/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const outDir = join(here, '..', 'public');
const inputPath = join(repoRoot, 'sample.jpg');

if (!existsSync(inputPath)) {
  console.log(
    `skip build-holo: no sample.jpg at ${inputPath} (drop one there to enable the photo demo)`,
  );
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

const jpeg = new Uint8Array(readFileSync(inputPath));
const { width, height } = readJpegDims(jpeg);
console.log(`source ${jpeg.length} B JPEG · ${width}×${height}`);

const holo = rainbowOverlayPng(width, height);
const sparkle = sparklePng(width, height);
const specular = specularPng(width, height);

const file = encode({
  versionMajor: 1,
  versionMinor: 1,
  head: {
    width,
    height,
    frontFormat: 'jpeg',
    backFormat: 'jpeg',
    flipAxis: 'horizontal',
    flags: 0,
  },
  front: jpeg,
  back: jpeg,
  frontLayers: {
    version: 1,
    flags: 0,
    layers: [
      // Offsets are in viewport pixels, NOT source pixels — the viewer
      // renders the card at ~280 px wide regardless of the source size.
      // 0 — rainbow sweep (color_dodge for vivid spectrum on photo)
      {
        layerId: 0,
        format: 'png',
        blendMode: 'color_dodge',
        effectType: 'holographic',
        opacity: 200,
        zOrder: 0,
        response: {
          input_source: 'pointer',
          response_curve: 'linear',
          offset_max_x: 10,
          offset_max_y: 7,
        },
        imageData: holo,
      },
      // 1 — sparkle dots (screen, lighter parallax — feels closer to surface)
      {
        layerId: 1,
        format: 'png',
        blendMode: 'screen',
        effectType: 'sparkle',
        opacity: 230,
        zOrder: 1,
        response: {
          input_source: 'pointer',
          response_curve: 'linear',
          offset_max_x: 4,
          offset_max_y: 3,
        },
        imageData: sparkle,
      },
      // 2 — specular highlight (overlay, big parallax so the bright spot
      // tracks the pointer across most of the card)
      {
        layerId: 2,
        format: 'png',
        blendMode: 'overlay',
        effectType: 'specular',
        opacity: 230,
        zOrder: 2,
        response: {
          input_source: 'pointer',
          response_curve: 'linear',
          offset_max_x: 130,
          offset_max_y: 180,
        },
        imageData: specular,
      },
    ],
  },
  effects: {
    interaction_modes: ['pointer', 'gyroscope'],
    response_curve: 'easeOutQuad',
    intensity: 1.0,
    tilt_sensitivity: 1.0,
    tilt_max_angle: 18,
    ambient_intensity: 0.8,
    card_material: 'foil',
    surface_finish: 'glossy',
  },
});

const outPath = join(outDir, 'sample-holo.xflip');
writeFileSync(outPath, file);
console.log(`wrote ${file.length} B → ${outPath}`);

// ---------- JPEG dimension reader (SOF0/SOF2 marker) ----------

function readJpegDims(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('not a JPEG (missing SOI)');
  }
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error(`bad marker at ${i.toString(16)}`);
    // Skip fill bytes
    while (bytes[i] === 0xff) i++;
    const marker = bytes[i++];
    // Markers with no payload
    if (marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const len = (bytes[i] << 8) | bytes[i + 1];
    // SOF0..SOF15 except DHT(0xC4), DAC(0xCC), DNL(0xDC)
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const height = (bytes[i + 3] << 8) | bytes[i + 4];
      const width = (bytes[i + 5] << 8) | bytes[i + 6];
      return { width, height };
    }
    i += len;
  }
  throw new Error('SOF marker not found');
}

// ---------- PNG helpers ----------

function u32be(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, false);
  return b;
}

function concat(arrays) {
  const total = arrays.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
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

// HSL -> RGB; h in [0,1], s/l in [0,1]
function hsl(h, s, l) {
  const k = (n) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [f(0), f(8), f(4)];
}

/**
 * Encode an RGBA buffer (row-major, no filter bytes) into a PNG byte stream.
 */
function rgbaToPng(width, height, rgba) {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = concat([
    u32be(width),
    u32be(height),
    new Uint8Array([8, 6, 0, 0, 0]),
  ]);
  const ihdr = pngChunk('IHDR', ihdrData);
  const stride = 1 + width * 4;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    raw[stride * y] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), stride * y + 1);
  }
  const idat = pngChunk('IDAT', new Uint8Array(deflateSync(raw)));
  const iend = pngChunk('IEND', new Uint8Array());
  return concat([sig, ihdr, idat, iend]);
}

/**
 * Diagonal rainbow gradient with sparkle bands. Alpha modulated so the
 * effect reads as a sheen rather than a solid color.
 */
function rainbowOverlayPng(width, height) {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = concat([
    u32be(width),
    u32be(height),
    new Uint8Array([8, 6, 0, 0, 0]),
  ]);
  const ihdr = pngChunk('IHDR', ihdrData);

  const stride = 1 + width * 4;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const row = stride * y;
    raw[row] = 0;
    const vy = vignette(y / height);
    for (let x = 0; x < width; x++) {
      const vx = vignette(x / width);
      const t = ((x + y) / (width + height)) * 2;
      const sparkle = 0.5 + 0.5 * Math.sin(t * Math.PI * 6);
      const [r, g, b] = hsl((t + 0.05 * sparkle) % 1, 0.95, 0.6);
      const alpha = Math.round((80 + 130 * sparkle) * vx * vy);
      const px = row + 1 + x * 4;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = alpha;
    }
  }
  const idat = pngChunk('IDAT', new Uint8Array(deflateSync(raw)));
  const iend = pngChunk('IEND', new Uint8Array());
  return concat([sig, ihdr, idat, iend]);
}

/**
 * Smoothstep falloff: 0 at edges (≤ 0.04 / ≥ 0.96), 1 in the central
 * ~80%. Used to keep holo + sparkle inside the artwork rather than
 * spilling onto borders or frames within the photo.
 */
function vignette(t) {
  const edge = 0.04;
  const inner = 0.2;
  if (t < edge || t > 1 - edge) return 0;
  if (t < edge + inner) {
    const u = (t - edge) / inner;
    return u * u * (3 - 2 * u);
  }
  if (t > 1 - edge - inner) {
    const u = (1 - edge - t) / inner;
    return u * u * (3 - 2 * u);
  }
  return 1;
}

/**
 * Glittery sparkle dots scattered across the surface. Deterministic
 * pseudo-random placement so the pattern is reproducible per dimensions.
 */
function sparklePng(width, height) {
  const px = new Uint8Array(width * height * 4);
  let s = (width * 73856093) ^ (height * 19349663);
  function rand() {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const count = Math.round((width * height) / 1200);
  for (let i = 0; i < count; i++) {
    const cx = Math.floor(rand() * width);
    const cy = Math.floor(rand() * height);
    // Reject sparkles that land near the edges so they don't appear on
    // the photo's outer margin.
    const v = vignette(cx / width) * vignette(cy / height);
    if (v < 0.4) continue;
    const r = 1.2 + rand() * 3.5;
    const peakAlpha = 200 + Math.floor(rand() * 55);
    const box = Math.ceil(r * 2);
    for (let dy = -box; dy <= box; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= height) continue;
      for (let dx = -box; dx <= box; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= width) continue;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r * 1.5) continue;
        const falloff = Math.max(0, 1 - d / (r * 1.5));
        const a = Math.min(255, Math.round(peakAlpha * falloff * falloff));
        const idx = (y * width + x) * 4;
        px[idx + 0] = 255;
        px[idx + 1] = 255;
        px[idx + 2] = 255;
        px[idx + 3] = Math.min(255, px[idx + 3] + a);
      }
    }
  }
  return rgbaToPng(width, height, px);
}

/**
 * Soft radial highlight centered on the card. Large `offset_max` in the
 * encoder makes the bright spot drift with the pointer.
 */
function specularPng(width, height) {
  const px = new Uint8Array(width * height * 4);
  // Tight highlight: ~18% of the shorter side, so the flare reads as a
  // focused glare instead of filling the card.
  const r = Math.min(width, height) * 0.18;
  const cx = width / 2;
  const cy = height / 2;
  const bbox = Math.ceil(r * 1.6);
  for (let y = Math.max(0, cy - bbox); y < Math.min(height, cy + bbox); y++) {
    for (let x = Math.max(0, cx - bbox); x < Math.min(width, cx + bbox); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const t = Math.max(0, 1 - d / r);
      // Steeper falloff (t⁴) so the bright core is small and the
      // surrounding glow fades fast.
      const alpha = Math.round(255 * t * t * t * t);
      if (alpha === 0) continue;
      const idx = (y * width + x) * 4;
      px[idx + 0] = 255;
      px[idx + 1] = 255;
      px[idx + 2] = 255;
      px[idx + 3] = alpha;
    }
  }
  return rgbaToPng(width, height, px);
}
