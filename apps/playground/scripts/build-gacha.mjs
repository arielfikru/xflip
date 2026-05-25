// Builds .xflip cards for the gacha mini-game.
//
// Reads every image under <repo>/gacha/, downscales the front to 720px
// JPEG, and pairs it with the shared back (gacha/back.jpg). Each card's
// holographic overlay is chosen by its rarity (encoded in the filename
// prefix: r- / sr- / ssr- / ur-) and embedded in the META chunk as
// `{ "holo": [...] }`, so the viewer applies it automatically on load.
//
// Also emits `public/gacha/manifest.json` describing every card so the
// frontend can build packs and a collection without hard-coding paths.
//
// Run via `pnpm --filter @xflip/playground gacha`.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { encode } from '../../../packages/xflip-core/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const gachaDir = join(repoRoot, 'gacha');
const outDir = join(here, '..', 'public', 'gacha');
mkdirSync(outDir, { recursive: true });

// ---------- rarity → holo config ----------

// Drop rate per rarity (sum = 1). The frontend draws a rarity first, then a
// uniform card within it, so these are the true per-pull odds regardless of
// how many cards exist per tier.
const RARITY = {
  r: { label: 'Rare', rate: 0.793 },
  sr: { label: 'Super Rare', rate: 0.18 },
  ssr: { label: 'SSR', rate: 0.025 },
  ur: { label: 'Ultra Rare', rate: 0.002 },
};

// Holo escalates strictly with rarity so higher tiers always look better:
//   r   → faint single shine (plainest)
//   sr  → one vivid holo color
//   ssr → rich two-layer (color + metallic/foil)
//   ur  → three-layer cosmic max-out
const RARITY_DEFAULT_HOLO = {
  r: [{ preset: 'foil', intensity: 0.3 }],
  sr: [{ preset: 'rainbow', intensity: 0.85 }],
  ssr: [
    { preset: 'gold', intensity: 0.95 },
    { preset: 'foil', intensity: 0.5 },
  ],
  ur: [
    { preset: 'galaxy', intensity: 0.8 },
    { preset: 'rainbow', intensity: 0.5 },
    { preset: 'gold', intensity: 0.5 },
  ],
};

const HOLO_BY_ID = {
  // r — plain. Same faint foil so the whole tier reads as "common".
  'r-01': [{ preset: 'foil', intensity: 0.3 }],
  'r-02': [{ preset: 'foil', intensity: 0.3 }],
  'r-03': [{ preset: 'foil', intensity: 0.3 }],
  'r-04': [{ preset: 'foil', intensity: 0.3 }],
  'r-05': [{ preset: 'foil', intensity: 0.3 }],

  // sr — single vivid holo, clearly above plain foil.
  'sr-01': [{ preset: 'rainbow', intensity: 0.85 }],
  'sr-02': [{ preset: 'aurora', intensity: 0.9 }],
  'sr-03': [{ preset: 'prism', intensity: 0.85 }],
  'sr-04': [{ preset: 'ice', intensity: 0.85 }],
  'sr-05': [{ preset: 'rainbow', intensity: 0.9 }],

  // ssr — two-layer rich: signature color + foil sheen.
  'ssr-01': [
    { preset: 'gold', intensity: 1 },
    { preset: 'foil', intensity: 0.5 },
  ],
  'ssr-02': [
    { preset: 'galaxy', intensity: 1 },
    { preset: 'rainbow', intensity: 0.45 },
  ],
  'ssr-03': [
    { preset: 'emerald', intensity: 1 },
    { preset: 'foil', intensity: 0.5 },
  ],
  'ssr-04': [
    { preset: 'ruby', intensity: 1 },
    { preset: 'foil', intensity: 0.5 },
  ],

  // ur — three-layer cosmic max-out.
  'ur-01': [
    { preset: 'galaxy', intensity: 0.85 },
    { preset: 'pearl', intensity: 0.55 },
    { preset: 'gold', intensity: 0.5 },
  ],
};

function rarityOf(id) {
  const m = /^(ssr|sr|ur|r)-/.exec(id);
  return m ? m[1] : 'r';
}

function holoOf(id) {
  return HOLO_BY_ID[id] ?? RARITY_DEFAULT_HOLO[rarityOf(id)];
}

function titleOf(id) {
  return id.toUpperCase().replace('-', ' #');
}

// ---------- encode ----------

function makeXflip(front, back, w, h, holo) {
  const ancillary = new Map();
  ancillary.set('META', new TextEncoder().encode(JSON.stringify({ holo })));
  return encode({
    versionMajor: 1,
    versionMinor: 0,
    head: { width: w, height: h, frontFormat: 'jpeg', backFormat: 'jpeg', flipAxis: 'horizontal', flags: 0 },
    front,
    back,
    ancillary,
  });
}

// ---------- run ----------

const backPath = join(gachaDir, 'back.jpg');
if (!existsSync(backPath)) {
  console.error(`back.jpg not found at ${backPath}`);
  process.exit(1);
}

// Shared back, downscaled once. `object-fit: cover` in the viewer handles
// any aspect mismatch against each card's own dimensions.
const back = await sharp(readFileSync(backPath))
  .resize({ width: 720, withoutEnlargement: true })
  .jpeg({ quality: 82, mozjpeg: true })
  .toBuffer();

// Expose the back image to the frontend so the reveal placeholder can show
// the real card back instead of a generic tile.
writeFileSync(join(outDir, 'back.jpg'), back);

const files = readdirSync(gachaDir)
  .filter((f) => /\.(jpe?g|png)$/i.test(f) && f !== 'back.jpg')
  .sort();

const manifest = [];
const built = [];

for (const file of files) {
  const id = file.replace(/\.(jpe?g|png)$/i, '');
  const front = await sharp(readFileSync(join(gachaDir, file)))
    .resize({ width: 720, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const meta = await sharp(front).metadata();
  const w = meta.width;
  const h = meta.height;
  const holo = holoOf(id);

  const bytes = makeXflip(front, back, w, h, holo);
  const outName = `${id}.xflip`;
  writeFileSync(join(outDir, outName), bytes);

  const rarity = rarityOf(id);
  manifest.push({
    id,
    name: titleOf(id),
    rarity,
    rarityLabel: RARITY[rarity].label,
    rate: RARITY[rarity].rate,
    src: `gacha/${outName}`,
    holo,
  });
  built.push([outName, bytes.length]);
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(built.map(([n, b]) => `built ${b.toString().padStart(10)} B  ${n}`).join('\n'));
console.log(`\nmanifest: ${manifest.length} cards → gacha/manifest.json`);
