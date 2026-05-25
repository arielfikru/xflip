// LOCAL encode stage (offline). Reads thumbnails + index.json fetched by the
// remote fetch-pack.mjs stage (in gacha/<packId>-src/), resizes them, embeds a
// rarity-escalating holo config in META, and writes that pack's .xflip set +
// manifest.json to public/gacha/<packId>/.
//
//   pnpm --filter @xflip/playground encode-pack <packId>
//   node scripts/encode-pack.mjs waifu

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { encode } from '../../../packages/xflip-core/dist/index.js';

const packId = process.argv[2];
if (!packId) {
  console.error('usage: node scripts/encode-pack.mjs <packId>');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const gachaDir = join(repoRoot, 'gacha');
const srcDir = join(gachaDir, `${packId}-src`);
const outDir = join(here, '..', 'public', 'gacha', packId);
mkdirSync(outDir, { recursive: true });

const TIERS = {
  c: { label: 'Common', rate: 0.56 },
  uc: { label: 'Uncommon', rate: 0.24 },
  r: { label: 'Rare', rate: 0.12 },
  sr: { label: 'Super Rare', rate: 0.05 },
  ssr: { label: 'SSR', rate: 0.022 },
  ur: { label: 'Ultra Rare', rate: 0.007 },
  hr: { label: 'Hidden Rare', rate: 0.001 },
};

const SR_PRESETS = ['rainbow', 'aurora'];
const SSR_SIGNATURE = ['gold', 'galaxy', 'emerald', 'ruby'];

function holoFor(tier, i) {
  switch (tier) {
    case 'c':
      return [];
    case 'uc':
      return [{ preset: 'foil', intensity: 0.15 }];
    case 'r':
      return [{ preset: 'foil', intensity: 0.3 }];
    case 'sr':
      return [{ preset: SR_PRESETS[i % SR_PRESETS.length], intensity: 0.85 }];
    case 'ssr':
      return [
        { preset: SSR_SIGNATURE[i % SSR_SIGNATURE.length], intensity: 1 },
        { preset: 'rainbow', intensity: 0.7 },
        { preset: 'prism', intensity: 0.55 },
        { preset: 'foil', intensity: 0.6 },
      ];
    case 'ur':
      return [
        { preset: 'galaxy', intensity: 0.85 },
        { preset: 'pearl', intensity: 0.55 },
        { preset: 'gold', intensity: 0.5 },
      ];
    case 'hr':
      return [
        { preset: 'galaxy', intensity: 1 },
        { preset: 'rainbow', intensity: 0.7 },
        { preset: 'gold', intensity: 0.6 },
        { preset: 'pearl', intensity: 0.5 },
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

// Shared card back for every pack. Prefer back.png at the repo root (sharp
// converts it to JPEG below, so an oversized PNG is fine), then fall back.
const backCandidates = [
  join(repoRoot, 'back.png'),
  join(srcDir, 'back.jpg'),
  join(gachaDir, 'back.jpg'),
];
const backPath = backCandidates.find((p) => existsSync(p));
if (!backPath) {
  console.error(`no card back found (looked for: ${backCandidates.join(', ')})`);
  process.exit(1);
}
const back = await sharp(readFileSync(backPath))
  .resize({ width: 1000, withoutEnlargement: true })
  .jpeg({ quality: 88, mozjpeg: true })
  .toBuffer();
writeFileSync(join(outDir, 'back.jpg'), back);

for (const f of readdirSync(outDir)) {
  if (f.endsWith('.xflip')) rmSync(join(outDir, f));
}

const tierSeq = {};
const manifest = [];

for (const entry of index) {
  const i = tierSeq[entry.tier] ?? 0;
  tierSeq[entry.tier] = i + 1;

  const raw = readFileSync(join(srcDir, entry.file));
  const front = await sharp(raw)
    .resize({ width: 1000, withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
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
    src: `gacha/${packId}/${entry.id}.xflip`,
    holo,
  });
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`encoded ${manifest.length} cards → public/gacha/${packId}/`);
for (const tier of Object.keys(TIERS)) {
  console.log(`  ${tier}: ${manifest.filter((m) => m.rarity === tier).length}`);
}
