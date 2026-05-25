// LOCAL encode stage (offline). Reads thumbnails + index.json fetched by the
// remote fetch-danbooru.mjs stage (in gacha/large-src/), resizes them, embeds
// a rarity-escalating holo config in META, and writes the 120-card .xflip set
// + manifest.json to public/gacha/.
//
//   pnpm --filter @xflip/playground pack120:encode

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { encode } from '../../../packages/xflip-core/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const gachaDir = join(repoRoot, 'gacha');
const srcDir = join(gachaDir, 'large-src');
const outDir = join(here, '..', 'public', 'gacha');
mkdirSync(outDir, { recursive: true });

const TIERS = {
  c: { label: 'Common', rate: 0.6 },
  r: { label: 'Rare', rate: 0.25 },
  sr: { label: 'Super Rare', rate: 0.1 },
  ssr: { label: 'SSR', rate: 0.045 },
  ur: { label: 'Ultra Rare', rate: 0.005 },
};

const SR_PRESETS = ['rainbow', 'aurora'];
const SSR_SIGNATURE = ['gold', 'galaxy', 'emerald', 'ruby'];

function holoFor(tier, i) {
  switch (tier) {
    case 'c':
      return [];
    case 'r':
      return [{ preset: 'foil', intensity: 0.3 }];
    case 'sr':
      return [{ preset: SR_PRESETS[i % SR_PRESETS.length], intensity: 0.85 }];
    case 'ssr':
      return [
        { preset: SSR_SIGNATURE[i % SSR_SIGNATURE.length], intensity: 1 },
        { preset: 'foil', intensity: 0.5 },
      ];
    case 'ur':
      return [
        { preset: 'galaxy', intensity: 0.85 },
        { preset: 'pearl', intensity: 0.55 },
        { preset: 'gold', intensity: 0.5 },
      ];
    default:
      return [];
  }
}

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

const indexPath = join(srcDir, 'index.json');
if (!existsSync(indexPath)) {
  console.error(`index.json not found at ${indexPath} — run the fetch stage first`);
  process.exit(1);
}
const index = JSON.parse(readFileSync(indexPath, 'utf8'));

const backPath = join(gachaDir, 'back.jpg');
const back = await sharp(readFileSync(backPath))
  .resize({ width: 720, withoutEnlargement: true })
  .jpeg({ quality: 82, mozjpeg: true })
  .toBuffer();
writeFileSync(join(outDir, 'back.jpg'), back);

for (const f of readdirSync(outDir)) {
  if (f.endsWith('.xflip')) rmSync(join(outDir, f));
}

// Per-tier running counter so holo rotation matches fetch order.
const tierSeq = {};
const manifest = [];

for (const entry of index) {
  const i = tierSeq[entry.tier] ?? 0;
  tierSeq[entry.tier] = i + 1;

  const raw = readFileSync(join(srcDir, entry.file));
  const front = await sharp(raw)
    .resize({ width: 600, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const meta = await sharp(front).metadata();
  const holo = holoFor(entry.tier, i);
  const bytes = makeXflip(front, back, meta.width, meta.height, holo);
  writeFileSync(join(outDir, `${entry.id}.xflip`), bytes);

  const t = TIERS[entry.tier];
  manifest.push({
    id: entry.id,
    name: `${t.label} #${String(i + 1).padStart(2, '0')}`,
    rarity: entry.tier,
    rarityLabel: t.label,
    rate: t.rate,
    score: entry.score,
    source: `https://danbooru.donmai.us/posts/${entry.danbooruId}`,
    src: `gacha/${entry.id}.xflip`,
    holo,
  });
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`encoded ${manifest.length} cards → public/gacha/`);
for (const tier of Object.keys(TIERS)) {
  console.log(`  ${tier}: ${manifest.filter((m) => m.rarity === tier).length}`);
}
