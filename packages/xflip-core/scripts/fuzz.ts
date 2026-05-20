/**
 * Mutation fuzzer for the v1.0 decoder.
 *
 * Runs for a fixed wall-clock duration (default 60 s, override via
 * `XFLIP_FUZZ_DURATION_MS`). Each iteration either:
 *   - generates a random byte buffer and feeds it to `decode`, or
 *   - takes a known-good encoded fixture and mutates a single byte before
 *     feeding it to `decode`.
 *
 * The decoder MUST react in one of two ways:
 *   - return a value, or
 *   - throw an {@link XflipError} subclass.
 *
 * Anything else (e.g., an uncaught `TypeError`, `RangeError`, or stack
 * overflow) is a bug and exits non-zero.
 *
 * Usage:
 *   pnpm --filter @xflip/core fuzz
 *   XFLIP_FUZZ_DURATION_MS=5000 pnpm --filter @xflip/core fuzz
 */

import type { FlipAxis, ImageFormat, XflipFile } from '../src/index.js';
import { decode, encode, XflipError } from '../src/index.js';

const FORMATS: readonly ImageFormat[] = ['raw', 'png', 'jpeg', 'webp', 'avif', 'jxl', 'custom'];
const AXES: readonly FlipAxis[] = ['horizontal', 'vertical', 'diagonal'];

const durationMs = Number.parseInt(process.env.XFLIP_FUZZ_DURATION_MS ?? '60000', 10);
const seed = Number.parseInt(process.env.XFLIP_FUZZ_SEED ?? `${Date.now()}`, 10);

// Tiny seeded LCG. Deterministic so a failing seed can be re-run.
let rngState = seed >>> 0;
const rand = (): number => {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return rngState;
};
const randInt = (max: number): number => rand() % max;
const randByte = (): number => rand() & 0xff;

const randomBytes = (max: number): Uint8Array => {
  const len = randInt(max);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = randByte();
  return out;
};

const randomFile = (): XflipFile => ({
  versionMajor: 1,
  versionMinor: 0,
  head: {
    width: 1 + randInt(4096),
    height: 1 + randInt(4096),
    frontFormat: FORMATS[randInt(FORMATS.length)] as ImageFormat,
    backFormat: FORMATS[randInt(FORMATS.length)] as ImageFormat,
    flipAxis: AXES[randInt(AXES.length)] as FlipAxis,
    flags: randByte(),
  },
  front: randomBytes(512),
  back: randomBytes(512),
});

const tryDecode = (bytes: Uint8Array): { ok: boolean; classified: boolean } => {
  try {
    decode(bytes);
    return { ok: true, classified: true };
  } catch (err) {
    return { ok: false, classified: err instanceof XflipError };
  }
};

const deadline = Date.now() + durationMs;
let iterations = 0;
let parsed = 0;
let typedErrors = 0;
let unclassified = 0;

console.log(
  `[fuzz] seed=${seed} duration=${durationMs}ms — decoder MUST throw XflipError or succeed`,
);

while (Date.now() < deadline) {
  const useMutation = (rand() & 1) === 0;
  let bytes: Uint8Array;
  if (useMutation) {
    bytes = encode(randomFile());
    if (bytes.length > 0) {
      const pos = randInt(bytes.length);
      bytes[pos] = randByte();
    }
  } else {
    bytes = randomBytes(256);
  }
  const result = tryDecode(bytes);
  iterations++;
  if (result.ok) parsed++;
  else if (result.classified) typedErrors++;
  else {
    unclassified++;
    console.error(
      `[fuzz] FAIL iter=${iterations} mutation=${useMutation} bytes.length=${bytes.length}`,
    );
    console.error(`[fuzz] seed to reproduce: XFLIP_FUZZ_SEED=${seed}`);
  }
}

console.log(
  `[fuzz] iterations=${iterations} parsed=${parsed} typed=${typedErrors} unclassified=${unclassified}`,
);

if (unclassified > 0) {
  console.error(`[fuzz] ${unclassified} unclassified throw(s) — decoder leaked a non-XflipError`);
  process.exit(1);
}
