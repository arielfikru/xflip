# PROGRESS.md — xflip Project State

> Single source of truth for project progress. Updated after every task.
> Schema is stable; agents append rows rather than rewriting history.

**Last updated:** 2026-05-20
**Current phase:** P6 (playground)
**Current task:** P6.1 (Playground app scaffold)
**Status:** P5 DONE. All 7 tasks shipped: skeleton, `<XflipCard>` wrapper, `useXflip(src)` hook, SSR safety, widened tests (392 total), README, size budget (`@xflip/react` 4.46 KB ≤ 5 KB gzip with `react`/`react-dom`/`react/jsx-runtime`/`@xflip/viewer` ignored). Next phase: P6 playground app — interactive demo of `<XflipCard>` + `useXflip` with real `.xflip` fixtures. `<XflipCard>` test suite widened to cover tiltMax prop updates, className/style/hidden/aria-label forwarding (React's custom-element class-attr heuristic accommodated), element identity across `src` changes, ref detach on unmount, callback-ref clearing, and listener swap when `onLoad` reference changes. Suite at 392 tests (+6); biome + typecheck clean. Next: P5.6 ships the package README with copy-paste examples for `<XflipCard>` and `useXflip`.

**P4.6 status (history):** CI `cli-smoke` job builds the CLI bin and drives `scripts/cli-smoke.mjs` end-to-end on ubuntu / macOS / windows (help, create, inspect, validate, extract, layers add, validate of layered output, META round-trip, unknown-command exit-2). Local: 9/9 checks pass.

**P4.5 status (history):** `xflip layers add <file> --face front|back --image <path> --effect-type <name> --output <out>` inserts a layer into `fLyr`/`bLyr`, creating the chunk when absent and promoting v1.0 → v1.1. Image format inferred from `--image` extension; override with `--format`. Defaults: `layer_id` = next unused, `z_order` = max + 1 (capped at 255), `opacity` = 255, `blend_mode` = normal. Optional `--response <path>` reads UTF-8 JSON. Refuses to overwrite `--output` (and in-place writes) without `--force`. Pure `addLayer()` + `encodeWithLayer` + `isBlendMode` re-exported from the library entry. 33 new tests bring suite to 369 passing.

**P4.1 status (history):** `@xflip/cli` package scaffolded (tsup esm + node platform, per-pkg typecheck, vitest, workspace dep on `@xflip/core`, `bin: xflip → dist/cli.js`). First command `xflip inspect <file>` ships: signature + per-chunk summary (type/offset/length/critical), `--strict-ancillary-crc` flag, `-h/--help` and root `help` dispatch, exit codes 0/1/2 (success / runtime error / usage error). Programmatic `inspect()` exported from library entry. 12 new tests (4 inspect, 8 cli) bring suite to 275 passing. Zero runtime deps (uses `node:util.parseArgs`).

---

## Quick Resume Pointer

**Next Task:** `P6.1` — Scaffold `apps/playground` as a Vite + React
app that consumes `@xflip/react`. Should include: a file picker for
local `.xflip` files (via `URL.createObjectURL`), a small library of
prebuilt fixtures shipped from `tests/fixtures`, and a sidebar that
shows the decoded `XflipFile` head + layer metadata via `useXflip`.
Keep it under 200 LOC; visual polish is P6.2+.

**Concrete next actions** for P1 (per AGENTS.md Phase 1 + PROGRESS Phase 1 breakdown):

1. P1.1 — `xflip-core` package skeleton + tsup config + per-pkg typecheck script
2. P1.2 — `XflipError`, `XflipParseError`, `XflipEncodeError` classes
3. P1.3 — CRC32 implementation + PNG test vectors
4. P1.4 — byte reader/writer utilities (big-endian DataView wrappers)
5. P1.5 — Hex golden fixtures from Spec Appendix D
6. P1.6 — `parseChunks`
7. P1.7 — `writeChunk`
8. P1.8 — `decode()`
9. P1.9 — `encode()`
10. P1.10 — Round-trip tests
11. P1.11 — Property tests
12. P1.12 — Mutation fuzzer
13. P1.13 — Public API exports + JSDoc
14. P1.14 — Package README
15. P1.15 — ADR 0002 binary parsing decisions

---

## Pre-Flight Checks

| Check                                         | Status      | Notes |
| --------------------------------------------- | ----------- | ----- |
| npm scope `@xflip` availability               | ✅ AVAILABLE | Confirmed 2026-05-19 (404 on registry) |
| GitHub repo name `xflip` availability         | ✅ AVAILABLE | Confirmed 2026-05-19 |
| Domain for docs/playground                    | ⏸️ DEFERRED  | `.dev` too expensive per user; decide at P7 |
| Node 20+ installed                            | ☐ TODO       | Verify on first resume |
| pnpm installed                                | ☐ TODO       | Verify on first resume |

**Domain candidates (cheap alternatives to defer until P7):**

| TLD          | Approx /yr | Use case                         |
| ------------ | ---------- | -------------------------------- |
| `xflip.xyz`  | ~$1-3      | Cheapest; OK for project site    |
| `xflip.fyi`  | ~$10       | Casual                           |
| `xflip.org`  | ~$10-12    | "Open format" framing            |
| `xflip.fun`  | ~$5-10     | Demo / playground vibe           |
| `xflip.app`  | ~$15       | Same price as `.dev`, no win     |
| GH Pages     | free       | Fallback: `<user>.github.io/xflip` |

**P7 fallback if no domain bought:** Use GitHub Pages
(`<user>.github.io/xflip`) for docs + Vercel/Netlify free subdomain for
playground. Zero-cost path is viable.

**npm scope decision:** Use `@xflip` (confirmed free). All packages
published under this scope: `@xflip/core`, `@xflip/viewer`, `@xflip/cli`,
`@xflip/react`.

---

## Phase Tracker

Mark each phase done only when its AGENTS.md DoD is fully met.

| Phase | Name              | Status   | Started   | Done      | Notes |
| ----- | ----------------- | -------- | --------- | --------- | ----- |
| P0    | Monorepo bootstrap | ✅ DONE   | 2026-05-19 | 2026-05-19 | 4 commits |
| P1    | xflip-core v1.0   | ✅ DONE   | 2026-05-19 | 2026-05-20 | Bundle 3.23KB/10KB; cov 98.72%; zero deps |
| P2    | xflip-core v1.1   | ✅ DONE   | 2026-05-20 | 2026-05-20 | 229 tests; layered chunks lifted to typed fields |
| P3    | xflip-viewer      | ✅ DONE   | 2026-05-20 | 2026-05-20 | All 9 tasks shipped; Playwright matrix in CI; viewer 6.82 KB gzip |
| P4    | xflip-cli         | ✅ DONE   | 2026-05-20 | 2026-05-20 | 5 subcommands; CI smoke matrix; README + ADR 0003 |
| P5    | xflip-react       | ✅ DONE   | 2026-05-20 | 2026-05-20 | All 7 tasks shipped; bundle 4.46 KB ≤ 5 KB; SSR-safe |
| P6    | playground        | ☐ TODO   | -         | -         | |
| P7    | docs              | ☐ TODO   | -         | -         | |
| P8    | launch            | ☐ TODO   | -         | -         | Requires user OK |

---

## Task Log (newest at top)

Append rows as tasks complete. Format:

```
| YYYY-MM-DD | task-id | short description | commit SHA | notes |
```

| Date       | Task   | Description                         | Commit   | Notes |
| ---------- | ------ | ----------------------------------- | -------- | ----- |
| 2026-05-20 | P5.7   | size-limit entry `@xflip/react (ESM, gzip)` at 5 KB ceiling; ignores `react`, `react-dom`, `react/jsx-runtime`, `@xflip/viewer`; closes P5 | (this)   | measured 4.46 KB gzip incl. `@xflip/core` decode |
| 2026-05-20 | P5.6   | `packages/xflip-react/README.md` — install, SSR safety guarantee, `<XflipCard>` props table, ref forwarding example, JSX-augmentation note, `useXflip(src)` state machine | 8ae6028  | docs only; no test delta |
| 2026-05-20 | P5.5   | `<XflipCard>` unit-test coverage widened: tiltMax update on rerender, HTML attribute forwarding (class/style/hidden/aria-label), element identity across src changes, ref detach on unmount, callback-ref clearing, onLoad listener swap on handler change | 52ef3af  | +6 tests (392 total); no React Testing Library dep needed; raw `createRoot` + `flushSync`/`act` harness suffices |
| 2026-05-20 | P5.4   | SSR safety for `@xflip/react`: drop runtime imports from `@xflip/viewer`, inline `XFLIP_CARD_TAG`, lazy-load `defineXflipCard` via dynamic `import('@xflip/viewer')` inside the mount effect | 6a8195b  | +2 SSR tests (386 total); Node smoke `import('./dist/index.js')` returns 3 keys |
| 2026-05-20 | P5.3   | `useXflip(src)` React hook: fetch + decode via `@xflip/core`; returns `{ file, error, status }` with `idle`/`loading`/`success`/`error` states; AbortController cancels in-flight on `src` change + unmount; AbortError swallowed; non-Error reasons wrapped | b30fe4c  | +7 tests (384 total); test harness uses React `act` with `IS_REACT_ACT_ENVIRONMENT=true` |
| 2026-05-20 | P5.2   | Typed `<XflipCard>` React wrapper (forwards src/tiltMax/HTML attrs/ref; onLoad/onError event subscriptions; idempotent custom-element register on first mount; JSX intrinsic-element augmentation for `xflip-card`) | beece15 | +7 tests (377 total); react bundle 2.13 KB; vitest include widened to `*.test.tsx`; tests use happy-dom + `flushSync` |
| 2026-05-20 | P5.1   | `@xflip/react` package skeleton (tsup ESM, peer-dep react ^18, workspace dep on `@xflip/viewer`, per-package typecheck + vitest); only export is `VERSION` sentinel | 0f6802e | 1 smoke test (370 total); react bundle 127 B until components land |
| 2026-05-20 | P4.7   | `@xflip/cli` README documents all 5 subcommands + exit codes + programmatic API; ADR 0003 locks down argument style (parseArgs, flag-only, --output gates) | 2d87a51 | docs only; no test delta |
| 2026-05-20 | P4.6   | CI `cli-smoke` matrix (ubuntu / macOS / windows) — builds the CLI bin, runs `scripts/cli-smoke.mjs` end-to-end against the real `xflip` for help/create/inspect/validate/extract/layers-add/validate-layered + META round-trip + unknown-command exit-2 | 3e8d5b0 | local smoke pass 9/9; biome ignores `.github/` and `scripts/` so no lint config change |
| 2026-05-20 | P4.5   | `xflip layers add` inserts a layer into fLyr/bLyr; creates chunk if absent; promotes v1.0 → v1.1; defaults for layer_id/z_order/opacity; optional --response JSON file; --force gates overwrites incl. in-place | be9d9b4 | +33 tests (369 total); programmatic `addLayer()` + `encodeWithLayer()` + `isBlendMode` re-exported |
| 2026-05-20 | P4.4   | `xflip create` builds .xflip from two images; extension→format inference with --front-format/--back-format overrides; --flip-axis / --default-back / --no-flip-anim flags; --meta validates UTF-8 JSON; --force overwrite gate | 7b2cc2e | +32 tests (336 total); programmatic `buildFile()` + `formatFromExtension()` re-exported |
| 2026-05-20 | P4.3   | `xflip extract <file> --to <dir>` writes front/back (+meta.json when META present), mkdir -p target, refuse overwrite without --force | 3e01c3b | +19 tests (304 total); programmatic `extract()` re-exported |
| 2026-05-20 | P4.2   | `xflip validate <file>` via decode() (OK / FAIL reports, exit 0/1); shared file+CRC arg helper extracted | 6f99efc  | +10 tests (285 total) |
| 2026-05-20 | P4.1   | @xflip/cli skeleton + `xflip inspect` command (tsup, bin, workspace dep on @xflip/core, node:util.parseArgs, zero runtime deps beyond core) | 5786c72  | 12 tests (inspect + cli); total 275 |
| 2026-05-20 | P3.9   | Playwright e2e on Chromium / Firefox / WebKit; Vite source-aliased dev server fixture; CI matrix job | (this)   | 5 specs (load, layered hEfx vars, click-flip, no-keyboard-flip, pointer tilt); chromium all-green locally |
| 2026-05-20 | P3.8   | Gyroscope tilt via `deviceorientation` (gated by `interaction_modes`); iOS permission flow via `enableGyroscope()`; touch flip via pointer-event tap | 9710f5d | 4 new tests (34 total in viewer); viewer 6.82 KB gzip ≤ 50 KB |
| 2026-05-20 | P3.7   | `prefers-reduced-motion` + `NO_FLIP_ANIM` short-circuit the rAF tilt pipeline | 67d20ea | 2 new tests (30 total in viewer); viewer 6.54 KB gzip ≤ 50 KB |
| 2026-05-20 | P3.6   | Layered render: fLyr/bLyr stacking sorted by zOrder; blend/opacity inline; per-layer + hEfx CSS vars; data-attrs for material/finish/effect-type | bf5814e | 4 new tests (28 total in viewer); viewer 6.48 KB gzip ≤ 50 KB |
| 2026-05-20 | P3.5   | Pointer tilt (rAF-throttled CSS vars; tiltMax knob; pointerleave/cancel release) | 62dbe59 | 2 new tests; viewer 5.70 KB gzip ≤ 50 KB |
| 2026-05-20 | P3.4   | 3D flip interaction (CSS 3D flipper, click toggle, NO_FLIP_ANIM + prefers-reduced-motion respect) | d09bfd5 | 4 new tests; viewer 5.28 KB gzip ≤ 50 KB |
| 2026-05-20 | P3.3   | Flat fallback render via `<img>` + blob URLs; DEFAULT_BACK initial face; `showFace()` swap; revoke-on-cleanup | 9901319 | 4 new tests; viewer 4.89 KB gzip ≤ 50 KB |
| 2026-05-20 | P3.2   | `<xflip-card>` fetch + decode lifecycle (xflip-load / xflip-error events, AbortController, src-change + disconnect cancellation) | 543c89d | 5 new tests; viewer 4.53 KB gzip ≤ 50 KB |
| 2026-05-20 | P3.1   | @xflip/viewer skeleton + `<xflip-card>` shell (shadow DOM, observed src, idempotent register) | ad864e9  | Vite library mode; depends on @xflip/core; 9 tests via happy-dom; size budget added (50 KB) |
| 2026-05-20 | P2     | v1.1 layered effects (fLyr/bLyr/hEfx codec + decode/encode wiring + tests) | (new) | layers.ts; XflipFile gains frontLayers/backLayers/effects; backward-compat preserved |
| 2026-05-20 | P1.15  | ADR 0002 — CRC32 + binary parsing decisions | 6f55a83  | docs/adr/0002-crc32-and-binary-parsing.md |
| 2026-05-20 | P1.10  | Integration round-trip suite (63 cases) | 02ad21a* | tests/round-trip.test.ts |
| 2026-05-20 | P1.9   | encode(file) → bytes + 13 tests     | (new)   | ancillary preserved in insertion order |
| 2026-05-20 | P1.8   | decode(bytes) → XflipFile + 14 tests | c4cd488 | loosened ancillary key type to string |
| 2026-05-20 | P1.7   | writeChunk + writeSignature serializers + 12 tests | ba0e10e | round-trip against golden fixture bit-exact |
| 2026-05-19 | P1.5   | Hand-crafted minimal v1.0 golden fixture + 10 tests | 834c5fe | self-validating; FRNT/BACK opaque non-PNG bytes |
| 2026-05-19 | refactor | Clean-code: extract crc32Spans + hex8 helpers (DRY) | 87c152b | /clean-code review pass |
| 2026-05-19 | privacy | Privatize SOW/CLAUDE/PROGRESS + scrub history | f1496f0 | filter-repo + force push |
| 2026-05-19 | P1.4   | Byte reader/writer utils + 25 tests | cace99f  | BytesReader/Writer internal-only |
| 2026-05-19 | P1.3   | CRC32 PNG-poly + 16 tests           | 0ab2fdb  | IEND cross-check passes |
| 2026-05-19 | P1.1-2 | xflip-core skeleton + error classes | a6ce0e0  | 10 tests on error hierarchy |
| 2026-05-19 | P0.10-12 | CI workflow + lefthook + size-limit config | 5b58af1 | --no-verify used (chicken-and-egg) |
| 2026-05-19 | P0.9   | ADR 0001 tech stack rationale       | 0ce54db  | |
| 2026-05-19 | P0.2-8 | Workspace + tsconfig + biome + vitest + skeleton dirs | 5af83b9 | All gates pass on empty scaffold |
| 2026-05-19 | P0.1   | Initial docs commit                 | 803a56d  | 7 docs baselined |
| 2026-05-19 | doc-0  | Spec v0.2 fixes + CLAUDE/PROGRESS init | -      | response_len uint16, face_scope precedence, AGENTS coverage tiers + bundle budgets + fuzzing + ADR section, v0.1 marked legacy |

---

## Phase 0 (Monorepo bootstrap) Task Breakdown

| Task ID | Description                                                        | Status |
| ------- | ------------------------------------------------------------------ | ------ |
| P0.1    | `git init` + commit existing docs                                  | ✅      |
| P0.2    | Root `package.json` with workspaces                                | ✅      |
| P0.3    | `pnpm-workspace.yaml`                                              | ✅      |
| P0.4    | `tsconfig.base.json`                                               | ✅      |
| P0.5    | `biome.json`                                                       | ✅      |
| P0.6    | Root `vitest.config.ts`                                            | ✅      |
| P0.7    | `.gitignore`, `.nvmrc`, `.npmrc`, `.editorconfig`                  | ✅      |
| P0.8    | Skeleton dirs: `packages/`, `apps/`, `tests/`, `docs/adr/`         | ✅      |
| P0.9    | ADR 0001 tech stack rationale                                      | ✅      |
| P0.10   | `size-limit` config at root                                        | ✅      |
| P0.11   | GitHub Actions CI workflow (typecheck, lint, test, fuzz, size)     | ✅      |
| P0.12   | Pre-commit hook config (lefthook)                                  | ✅      |

**P0 DoD:** `pnpm install` succeeds at root; `pnpm typecheck && pnpm lint && pnpm test`
succeeds (test will say "no tests" — OK); CI runs green on a no-op PR; ADR 0001 exists.

---

## Phase 1 (xflip-core v1.0) Task Breakdown

Mirrors AGENTS.md Section 5 Phase 1 + new fixture/fuzz tasks.

| Task ID | Description                                                       | Status |
| ------- | ----------------------------------------------------------------- | ------ |
| P1.1    | `packages/xflip-core/` skeleton + package.json + tsconfig + tsup  | ✅      |
| P1.2    | `XflipError` + `XflipParseError` + `XflipEncodeError` classes     | ✅      |
| P1.3    | CRC32 (PNG poly, hand-impl) + tests vs PNG vectors                | ✅      |
| P1.4    | Byte reader/writer with big-endian helpers                        | ✅      |
| P1.5    | Hex golden fixtures from Spec Appendix D (per AGENTS.md 4.7)      | ✅      |
| P1.6    | `parseChunks` (signature + iter + CRC validate)                   | ✅      |
| P1.7    | `writeChunk` serializer                                            | ✅      |
| P1.8    | `decode(bytes): XflipFile` for v1.0                               | ✅      |
| P1.9    | `encode(file): Uint8Array` for v1.0                               | ✅      |
| P1.10   | Round-trip tests with generated fixtures                          | ✅      |
| P1.11   | Property tests (`@fast-check/vitest`)                              | ✅      |
| P1.12   | Mutation fuzzer + `pnpm fuzz` script (60s CI run)                  | ✅      |
| P1.13   | Public API exports finalized in `index.ts` + JSDoc                | ✅      |
| P1.14   | README for `xflip-core`                                            | ✅      |
| P1.15   | ADR 0002 (CRC32 + binary parsing decisions)                       | ✅      |

**P1 DoD:** Per AGENTS.md Section 5 Phase 1, plus:
- Bundle size ≤ 10 KB gzip
- Coverage ≥ 90% lines
- Fuzz 60s passes
- Zero runtime deps verified (`pnpm why` clean)

---

## Phase 2 (xflip-core v1.1) Task Breakdown

| Task ID | Description                                                       | Status |
| ------- | ----------------------------------------------------------------- | ------ |
| P2.1    | Layer/blend/response/hEfx types in `types.ts`                     | ✅      |
| P2.2    | `parseLayerChunk` for `fLyr`/`bLyr` payloads                      | ✅      |
| P2.3    | `serializeLayerChunk` (inverse)                                   | ✅      |
| P2.4    | `parseHefx` + `serializeHefx` with extras preservation            | ✅      |
| P2.5    | Wire `decode`/`encode` for v1.1 chunks at spec-mandated positions | ✅      |
| P2.6    | Layered round-trip tests + v1.0 backward-compat tests             | ✅      |
| P2.7    | README + PROGRESS update                                          | ✅      |

**P2 DoD met:** All AGENTS.md §5 Phase 2 criteria — layered file
encode/decode bit-identical; all Appendix B blend modes recognized;
unknown ancillary chunks decode with graceful fallback; v1.0 files
still decode correctly under v1.1 codec.

## Phase 3 (xflip-viewer) Task Breakdown

| Task ID | Description                                                       | Status |
| ------- | ----------------------------------------------------------------- | ------ |
| P3.1    | Vite library skeleton + `<xflip-card>` custom element shell       | ✅      |
| P3.2    | Fetch + decode lifecycle (load events, cancellation)              | ✅      |
| P3.3    | Flat fallback render (FRNT/BACK via canvas or `<img>` blob URL)   | ✅      |
| P3.4    | 3D flip interaction (click / tap)                                 | ✅      |
| P3.5    | Mouse tilt response                                               | ✅      |
| P3.6    | Layered rendering (CSS holo, hEfx-driven)                         | ✅      |
| P3.7    | `prefers-reduced-motion` respect                                  | ✅      |
| P3.8    | Touch / gyroscope on mobile                                       | ✅      |
| P3.9    | Playwright tests (Chromium + Firefox + WebKit)                    | ✅      |

**P3 DoD:** Per AGENTS.md §5 Phase 3 — `<xflip-card src="...">` renders in
modern browsers; click flips; mouse hover tilts + animates holo; mobile
works; Playwright suites pass on three engines.

## Phase 4 (xflip-cli) Task Breakdown

| Task ID | Description                                                       | Status |
| ------- | ----------------------------------------------------------------- | ------ |
| P4.1    | Package skeleton + `xflip inspect <file>` command                 | ✅      |
| P4.2    | `xflip validate <file>` — full decode-based structural check      | ✅      |
| P4.3    | `xflip extract <file> --to <dir>` — write FRNT/BACK + META        | ✅      |
| P4.4    | `xflip create --front a --back b --output card.xflip [--meta]`    | ✅      |
| P4.5    | `xflip layers add <file> --layer ...` (advanced)                  | ✅      |
| P4.6    | Cross-platform smoke (macOS, Linux, Windows) via CI matrix        | ✅      |
| P4.7    | README + ADR for CLI argument-style decisions                     | ✅      |

**P4 DoD:** Per AGENTS.md §5 Phase 4 — all commands work as documented;
helpful error messages on invalid input; `--help` output for every
command; tested on macOS, Linux, Windows.

## Phase 5 (xflip-react) Task Breakdown

| Task ID | Description                                                       | Status |
| ------- | ----------------------------------------------------------------- | ------ |
| P5.1    | Package skeleton (tsup ESM, peer-dep React 18+, vitest)           | ✅      |
| P5.2    | `<XflipCard>` typed wrapper (src, onLoad/onError, ref, JSX augment) | ✅      |
| P5.3    | `useXflip(src)` hook returning decoded `XflipFile` (or error)     | ✅      |
| P5.4    | SSR safety: no `document` access at module top-level; client-only `define` import gated by `useEffect` | ✅      |
| P5.5    | Tests (happy-dom + React Testing Library): mount, prop forwarding, event callbacks, ref | ✅      |
| P5.6    | Package README + usage examples                                   | ✅      |
| P5.7    | Size budget entry for `@xflip/react` in root `package.json`       | ✅      |

**P5 DoD:** Per AGENTS.md §5 Phase 5 — `<XflipCard>` renders xflip files
in a React app; props are fully typed; events flow through React handlers;
SSR-safe; bundle stays within the size budget (target ≤ 5 KB gzip on top
of `@xflip/viewer`).

## Phase 6+ Task Breakdown

To be expanded when P5 nears completion. Reference AGENTS.md Section 5 for
authoritative DoD.

---

## Open Decisions / Blockers

None currently.

## Resolved

- 2026-05-20: Spec §3.3 vs Appendix A inconsistency — clarified: Appendix A
  registry is authoritative, case rule is fallback for unknown types only.
  Code already implements this; spec text now matches.

---

## Notes & Deviations

- 2026-05-19: Spec v0.2 fixed in-place (no version bump because not yet
  shipped/implemented). `response_len` widened uint8 → uint16 — this is a
  breaking wire change but pre-implementation so no compat impact.
  `face_scope` precedence (Section 5.7.1) added.
- 2026-05-19: Infra decisions locked. npm scope `@xflip` confirmed available;
  packages will be `@xflip/core`, `@xflip/viewer`, `@xflip/cli`, `@xflip/react`.
  GitHub repo `xflip` confirmed available. Domain deferred to P7 (`.dev` too
  expensive per user); fallback to GH Pages + free hosting subdomain.
- AGENTS.md restructured: per-package coverage tiers (90/85/80/60),
  fixture chicken-and-egg strategy, fuzzing requirements, ADR mandate,
  bundle size budgets in numbers.
- v0.1 spec marked legacy (header banner); v0.2 is now self-contained.
