// REMOTE fetch-only stage (runs on a host with danbooru access, e.g. a VPS).
// Generalized over a base tag so multiple themed packs share one fetcher.
// No npm deps — uses Node 18+ global fetch. Downloads thumbnails + writes an
// index.json describing each card. The local `encode-pack.mjs` stage then
// resizes and encodes them into .xflip offline.
//
//   node fetch-pack.mjs <outDir> <baseTag> [--solo] [--ban a,b,...] [--min-boys N]
//
// Anonymous danbooru allows only 2 search tags, so we query
// `score:LO..HI <baseTag>` and filter rating=general client-side. Pass --solo
// to additionally require the `solo` tag (single-character packs). Pass
// --ban with a comma-separated list to reject posts carrying any of those tags
// (also client-side, so it doesn't count against the 2-tag query limit). Pass
// --min-boys N to guarantee at least N `1boy` cards across the pack, injected
// by swapping in male candidates without changing per-tier counts.
//
// Rarity by score: C 10-19 · UC 20-29 · R 30-39 · SR 40-49 · SSR 50-69
//   · UR 70-80 · HR (Hidden Rare) 81+

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? './pack-src';
const baseTag = process.argv[3] ?? '1girl';
const requireSolo = process.argv.includes('--solo');
const banIdx = process.argv.indexOf('--ban');
const banned = banIdx !== -1 ? (process.argv[banIdx + 1] ?? '').split(',').filter(Boolean) : [];
const boysIdx = process.argv.indexOf('--min-boys');
const minBoys = boysIdx !== -1 ? Number(process.argv[boysIdx + 1] ?? 0) || 0 : 0;
mkdirSync(outDir, { recursive: true });

const USER_AGENT = 'xflip-gacha-demo/1.0 (card-game thumbnail fetch)';
const API = 'https://danbooru.donmai.us/posts.json';

const TIERS = [
  { tier: 'c', range: '10..19', count: 48 },
  { tier: 'uc', range: '20..29', count: 38 },
  { tier: 'r', range: '30..39', count: 28 },
  { tier: 'sr', range: '40..49', count: 18 },
  { tier: 'ssr', range: '50..69', count: 8 },
  { tier: 'ur', range: '70..80', count: 4 },
  { tier: 'hr', range: '81..', count: 6 },
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
  // Prefer the larger sample/original for higher-res cards, fall back down.
  const ext = String(post.file_ext ?? '');
  const original = ext === 'jpg' || ext === 'png' ? post.file_url : null;
  return (
    post.sample_file_url ??
    original ??
    byType('720x720') ??
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

// Gather candidates (more than needed) so boy injection has spares to swap in.
async function collectCandidates(tier) {
  const out = [];
  const seen = new Set();
  const cap = Math.max(tier.count * 4, 60);
  for (let page = 1; page <= 50 && out.length < cap; page++) {
    const url = `${API}?tags=${encodeURIComponent(`score:${tier.range} ${baseTag}`)}&limit=200&page=${page}`;
    const posts = await fetchJson(url);
    if (!Array.isArray(posts) || posts.length === 0) break;
    for (const post of posts) {
      if (out.length >= cap) break;
      if (post.rating !== 'g') continue;
      const tags = new Set(String(post.tag_string ?? '').split(/\s+/));
      if (requireSolo && !tags.has('solo')) continue;
      if (banned.some((b) => tags.has(b))) continue;
      const thumb = thumbUrl(post);
      if (!thumb || seen.has(post.id)) continue;
      seen.add(post.id);
      out.push({ danbooruId: post.id, score: post.score, url: thumb, isBoy: tags.has('1boy') });
    }
    await sleep(500);
  }
  return out;
}

function tierForScore(score) {
  for (const t of TIERS) {
    const [lo, hi] = t.range.split('..');
    const min = Number(lo);
    const max = hi === '' || hi === undefined ? Infinity : Number(hi);
    if (score >= min && score <= max) return t.tier;
  }
  return null;
}

// Dedicated male pool: `1boy <baseTag>` is only 2 tags (anon-OK) and male-rich.
// Bucket the results into score tiers so we can inject them per rarity.
async function collectBoysByTier() {
  const byTier = {};
  for (const t of TIERS) byTier[t.tier] = [];
  const seen = new Set();
  for (let page = 1; page <= 40; page++) {
    const url = `${API}?tags=${encodeURIComponent(`1boy ${baseTag}`)}&limit=200&page=${page}`;
    const posts = await fetchJson(url);
    if (!Array.isArray(posts) || posts.length === 0) break;
    for (const post of posts) {
      if (post.rating !== 'g') continue;
      const tags = new Set(String(post.tag_string ?? '').split(/\s+/));
      if (requireSolo && !tags.has('solo')) continue;
      if (banned.some((b) => tags.has(b))) continue;
      const tier = tierForScore(post.score);
      if (!tier || seen.has(post.id)) continue;
      const thumb = thumbUrl(post);
      if (!thumb) continue;
      seen.add(post.id);
      byTier[tier].push({ danbooruId: post.id, score: post.score, url: thumb, isBoy: true });
    }
    await sleep(500);
  }
  return byTier;
}

const candidates = {};
for (const tier of TIERS) candidates[tier.tier] = await collectCandidates(tier);

const boysByTier = minBoys > 0 ? await collectBoysByTier() : {};

// Base selection: first `count` per tier (highest-ranked).
const selected = {};
for (const tier of TIERS) selected[tier.tier] = candidates[tier.tier].slice(0, tier.count);

// Boy injection: swap female picks for male candidates from the boy pool.
function boyCount() {
  return Object.values(selected).reduce((n, arr) => n + arr.filter((p) => p.isBoy).length, 0);
}
if (minBoys > 0) {
  // Queue of unused boys per tier (skip any already selected).
  const queue = {};
  for (const tier of TIERS) {
    const selIds = new Set(selected[tier.tier].map((p) => p.danbooruId));
    queue[tier.tier] = (boysByTier[tier.tier] ?? []).filter((p) => !selIds.has(p.danbooruId));
  }
  // Round-robin across tiers so males spread over rarities, not dumped in Common.
  let progressed = true;
  while (boyCount() < minBoys && progressed) {
    progressed = false;
    for (const tier of TIERS) {
      if (boyCount() >= minBoys) break;
      const sel = selected[tier.tier];
      const boy = queue[tier.tier].shift();
      if (!boy) continue;
      const victim = sel.findIndex((p) => !p.isBoy);
      if (victim === -1) continue;
      sel[victim] = boy;
      progressed = true;
    }
  }
  const perTier = TIERS.map((t) => `${t.tier}:${selected[t.tier].filter((p) => p.isBoy).length}`);
  console.log(`boys after injection: ${boyCount()}/${minBoys} [${perTier.join(' ')}]`);
}

const index = [];
for (const tier of TIERS) {
  const posts = selected[tier.tier];
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
console.log(
  `fetched ${index.length} thumbnails (tag="${baseTag}", solo=${requireSolo}, minBoys=${minBoys}, ban=[${banned.join(',')}]) → ${outDir}`,
);
for (const tier of TIERS) {
  console.log(`  ${tier.tier}: ${index.filter((x) => x.tier === tier.tier).length}`);
}
