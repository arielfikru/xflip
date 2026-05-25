// Scrapes danbooru thumbnails into a 120-card gacha set and builds .xflip
// cards from them. Rarity is decided by post score:
//   C 10-19 · R 20-29 · SR 30-39 · SSR 40-69 · UR 70+
//
// Network is required (runs on a machine with internet, not the sandbox):
//   pnpm --filter @xflip/playground pack120
//
// Per tier we query `score:LO..HI 1girl` (anonymous danbooru allows only 2
// search tags), then filter rating=general + the `solo` tag client-side,
// take the thumbnail (360x360 variant, else preview), downscale, and embed
// a rarity-escalating holo config in META. Output overwrites the gacha set
// at public/gacha/ + manifest.json. Source thumbnails cached in
// gacha/large-src/ so re-runs don't re-download.

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
mkdirSync(srcDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const USER_AGENT = 'xflip-gacha-demo/1.0 (card-game thumbnail fetch)';
const API = 'https://danbooru.donmai.us/posts.json';

// tier → { label, scoreRange, count, drop-rate, holo }
const TIERS = [
  { tier: 'c', label: 'Common', range: '10..19', count: 45, rate: 0.6, holo: [] },
  { tier: 'r', label: 'Rare', range: '20..29', count: 35, rate: 0.25, holo: [{ preset: 'foil', intensity: 0.3 }] },
  { tier: 'sr', label: 'Super Rare', range: '30..39', count: 25, rate: 0.1, holo: [{ preset: 'rainbow', intensity: 0.85 }] },
  {
    tier: 'ssr',
    label: 'SSR',
    range: '40..69',
    count: 12,
    rate: 0.045,
    holo: [
      { preset: 'gold', intensity: 1 },
      { preset: 'foil', intensity: 0.5 },
    ],
  },
  {
    tier: 'ur',
    label: 'Ultra Rare',
    range: '70..',
    count: 3,
    rate: 0.005,
    holo: [
      { preset: 'galaxy', intensity: 0.85 },
      { preset: 'pearl', intensity: 0.55 },
      { preset: 'gold', intensity: 0.5 },
    ],
  },
];

// rotate single-tier holo across a few presets so a tier isn't monotone.
const SR_PRESETS = ['rainbow', 'aurora'];
const SSR_SIGNATURE = ['gold', 'galaxy', 'emerald', 'ruby'];

function holoFor(tier, i) {
  if (tier.tier === 'sr') {
    return [{ preset: SR_PRESETS[i % SR_PRESETS.length], intensity: 0.85 }];
  }
  if (tier.tier === 'ssr') {
    return [
      { preset: SSR_SIGNATURE[i % SSR_SIGNATURE.length], intensity: 1 },
      { preset: 'foil', intensity: 0.5 },
    ];
  }
  return tier.holo;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.status === 429) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === 2) throw err;
      await sleep(1000 * (attempt + 1));
    }
  }
  return [];
}

function thumbUrl(post) {
  const variants = post.media_asset?.variants ?? [];
  const byType = (t) => variants.find((v) => v.type === t)?.url;
  return (
    byType('720x720') ??
    post.sample_file_url ??
    byType('360x360') ??
    post.preview_file_url ??
    null
  );
}

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function collectTier(tier) {
  const picked = [];
  const seen = new Set();
  for (let page = 1; page <= 30 && picked.length < tier.count; page++) {
    const url = `${API}?tags=${encodeURIComponent(`score:${tier.range} 1girl`)}&limit=200&page=${page}`;
    const posts = await fetchJson(url);
    if (!Array.isArray(posts) || posts.length === 0) break;
    for (const post of posts) {
      if (picked.length >= tier.count) break;
      if (post.rating !== 'g') continue; // general only
      const tags = String(post.tag_string ?? '');
      if (!/\bsolo\b/.test(tags)) continue;
      const thumb = thumbUrl(post);
      if (!thumb || seen.has(post.id)) continue;
      seen.add(post.id);
      picked.push({ id: post.id, score: post.score, url: thumb });
    }
    await sleep(500);
  }
  return picked;
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

const backPath = join(gachaDir, 'back.jpg');
if (!existsSync(backPath)) {
  console.error(`back.jpg not found at ${backPath}`);
  process.exit(1);
}
const back = await sharp(readFileSync(backPath))
  .resize({ width: 720, withoutEnlargement: true })
  .jpeg({ quality: 82, mozjpeg: true })
  .toBuffer();
writeFileSync(join(outDir, 'back.jpg'), back);

// Clear the previous card set (keep back.jpg + manifest until rewritten).
for (const f of readdirSync(outDir)) {
  if (f.endsWith('.xflip')) rmSync(join(outDir, f));
}

const manifest = [];
const built = [];

for (const tier of TIERS) {
  const posts = await collectTier(tier);
  if (posts.length < tier.count) {
    console.warn(`tier ${tier.tier}: only ${posts.length}/${tier.count} posts found`);
  }
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const id = `${tier.tier}-${String(i + 1).padStart(2, '0')}`;
    const cachePath = join(srcDir, `${id}.jpg`);

    let raw;
    if (existsSync(cachePath)) {
      raw = readFileSync(cachePath);
    } else {
      try {
        raw = await download(post.url);
        writeFileSync(cachePath, raw);
        await sleep(300);
      } catch (err) {
        console.warn(`skip ${id} (${post.id}): ${err.message}`);
        continue;
      }
    }

    const front = await sharp(raw)
      .resize({ width: 600, withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const meta = await sharp(front).metadata();
    const holo = holoFor(tier, i);
    const bytes = makeXflip(front, back, meta.width, meta.height, holo);
    writeFileSync(join(outDir, `${id}.xflip`), bytes);

    manifest.push({
      id,
      name: `${tier.label} #${String(i + 1).padStart(2, '0')}`,
      rarity: tier.tier,
      rarityLabel: tier.label,
      rate: tier.rate,
      score: post.score,
      source: `https://danbooru.donmai.us/posts/${post.id}`,
      src: `gacha/${id}.xflip`,
      holo,
    });
    built.push(id);
  }
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`built ${built.length} cards across ${TIERS.length} tiers → public/gacha/`);
for (const tier of TIERS) {
  console.log(`  ${tier.tier}: ${manifest.filter((m) => m.rarity === tier.tier).length}`);
}
