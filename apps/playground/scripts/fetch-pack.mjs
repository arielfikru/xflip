// REMOTE fetch-only stage (runs on a host with danbooru access, e.g. a VPS).
// Generalized over a base tag so multiple themed packs share one fetcher.
// No npm deps — uses Node 18+ global fetch. Downloads thumbnails + writes an
// index.json describing each card. The local `encode-pack.mjs` stage then
// resizes and encodes them into .xflip offline.
//
//   node fetch-pack.mjs <outDir> <baseTag> [--solo]
//
// Anonymous danbooru allows only 2 search tags, so we query
// `score:LO..HI <baseTag>` and filter rating=general client-side. Pass --solo
// to additionally require the `solo` tag (single-character packs).
//
// Rarity by score: C 10-19 · R 20-29 · SR 30-39 · SSR 40-69 · UR 70+

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? './pack-src';
const baseTag = process.argv[3] ?? '1girl';
const requireSolo = process.argv.includes('--solo');
mkdirSync(outDir, { recursive: true });

const USER_AGENT = 'xflip-gacha-demo/1.0 (card-game thumbnail fetch)';
const API = 'https://danbooru.donmai.us/posts.json';

const TIERS = [
  { tier: 'c', range: '10..19', count: 45 },
  { tier: 'r', range: '20..29', count: 35 },
  { tier: 'sr', range: '30..39', count: 25 },
  { tier: 'ssr', range: '40..69', count: 12 },
  { tier: 'ur', range: '70..', count: 3 },
];

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
  for (let page = 1; page <= 50 && picked.length < tier.count; page++) {
    const url = `${API}?tags=${encodeURIComponent(`score:${tier.range} ${baseTag}`)}&limit=200&page=${page}`;
    const posts = await fetchJson(url);
    if (!Array.isArray(posts) || posts.length === 0) break;
    for (const post of posts) {
      if (picked.length >= tier.count) break;
      if (post.rating !== 'g') continue;
      if (requireSolo && !/\bsolo\b/.test(String(post.tag_string ?? ''))) continue;
      const thumb = thumbUrl(post);
      if (!thumb || seen.has(post.id)) continue;
      seen.add(post.id);
      picked.push({ danbooruId: post.id, score: post.score, url: thumb });
    }
    await sleep(500);
  }
  return picked;
}

const index = [];
for (const tier of TIERS) {
  const posts = await collectTier(tier);
  if (posts.length < tier.count) {
    console.warn(`tier ${tier.tier}: only ${posts.length}/${tier.count}`);
  }
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const id = `${tier.tier}-${String(i + 1).padStart(2, '0')}`;
    const file = `${id}.jpg`;
    const dest = join(outDir, file);
    if (!existsSync(dest)) {
      try {
        writeFileSync(dest, await download(post.url));
        await sleep(300);
      } catch (err) {
        console.warn(`skip ${id} (${post.danbooruId}): ${err.message}`);
        continue;
      }
    }
    index.push({ id, file, tier: tier.tier, score: post.score, danbooruId: post.danbooruId });
  }
}

writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2));
console.log(`fetched ${index.length} thumbnails (tag="${baseTag}", solo=${requireSolo}) → ${outDir}`);
for (const tier of TIERS) {
  console.log(`  ${tier.tier}: ${index.filter((x) => x.tier === tier.tier).length}`);
}
