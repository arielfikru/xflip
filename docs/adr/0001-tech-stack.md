# ADR 0001: Tech Stack Selection

**Status:** Accepted
**Date:** 2026-05-19
**Decider:** arielfikru
**Phase:** P0 (Monorepo bootstrap)

## Context

xflip is a multi-package TypeScript monorepo shipping a binary format
library (`@xflip/core`), a web component (`@xflip/viewer`), a CLI
(`@xflip/cli`), a React wrapper (`@xflip/react`), an interactive playground
app, and a documentation site. Constraints driving the choice:

- **Solo developer, ~5-10 hours/week.** Tooling overhead must be near-zero.
- **`@xflip/core` ships to both browser and Node.** No Node-only APIs.
- **Zero runtime dependencies for `@xflip/core`.** A format spec
  implementation that pulls in `lodash` defeats the credibility of the spec.
- **Public-facing OSS.** Contributors should not need exotic local setup.
- **Format-spec project = lots of binary parsing.** Property-based tests
  and fuzzing must be first-class, not bolt-on.

## Decision

| Concern           | Choice              | Reason |
| ----------------- | ------------------- | ------ |
| Language          | TypeScript 5.6+, strict | Type safety on binary parsing is high-leverage. `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` catch off-by-one and "missing key vs undefined value" bugs that haunt format decoders. |
| Module system     | ESM only             | All target runtimes (Node 20+, evergreen browsers) support native ESM. CJS adds dual-build complexity for ~0 modern benefit. |
| Monorepo          | pnpm workspaces      | Faster than npm/yarn, content-addressable store saves disk. Workspace protocol (`workspace:*`) is mature. Matches AGENTS.md mandate. |
| Linter + Formatter| Biome 2.x            | Single tool replaces ESLint + Prettier. ~10× faster. Native config. No plugin marketplace = less drift over time. One config file, not three. |
| Library bundler   | tsup                 | Wraps esbuild with sensible defaults for libraries. Outputs ESM + types in one command. Smaller config surface than rollup. |
| App bundler       | Vite                 | De facto standard for TS+React/web-component apps. Fast dev server, no config for common cases. |
| Test runner       | Vitest 2.x           | Native ESM, native TS, jest-compatible API. Faster than jest. Vite-config-aware. Coverage via v8 (no instrumentation overhead). |
| Property tests    | `@fast-check/vitest` | Fast-check is the de facto property-testing library for JS/TS. Integration package gives clean Vitest ergonomics. |
| E2E tests         | Playwright           | Industry standard for web component cross-browser testing. Chromium + Firefox + WebKit in one tool. |
| Size budgets      | size-limit + preset-small-lib | Tiny config to enforce bundle ceilings (per AGENTS.md 9.1) in CI. |
| CI                | GitHub Actions       | Free for public repos. AGENTS.md mandate. |
| Git hooks         | lefthook             | Faster than husky+lint-staged combo, single config file, written in Go (no Node dep at hook time). |

### Versions Pinned

| Package            | Version   |
| ------------------ | --------- |
| Node.js            | ≥ 20 LTS  |
| pnpm               | 11.0.8    |
| TypeScript         | ^5.6.0    |
| Biome              | ^2.0.0    |
| Vitest             | ^2.1.0    |
| tsup               | ^8.3.0    |
| size-limit         | ^11.1.0   |

## Status

Accepted as of 2026-05-19. Re-evaluate if:

- A Biome rule we need is missing (consider migrating back to ESLint).
- tsup output proves limiting for tree-shaking (consider rollup).
- Vitest breaks on a Node API change (consider node:test or jest).
- Browser cross-version Playwright maintenance burden exceeds 1 day/month
  (consider trimming WebKit from the matrix).

## Consequences

### Positive

- **One config file per concern.** biome.json, vitest.config.ts,
  tsconfig.base.json, pnpm-workspace.yaml. No ESLint+Prettier+commitlint
  triple.
- **Cold install on a fresh checkout: < 30 seconds** (pnpm + esbuild
  binaries cached).
- **CI run for typecheck + lint + test on the empty scaffold completes in
  < 10 seconds.** Headroom to add packages without CI bloat.
- **All tools are actively maintained as of 2026 Q2.** No bus-factor-1
  dependencies in critical paths.

### Negative

- **Biome is younger than ESLint.** Some niche rules (e.g.,
  `import/no-cycle`) are absent. Mitigation: use madge or
  dpdm in CI if cycles become a problem.
- **No CJS output.** Consumers on Node ≤ 16 or older bundlers (webpack 4)
  cannot use the libraries. Mitigation: project README states Node 20+ as
  a hard requirement.
- **Playwright adds ~300 MB of browser binaries to CI.** Mitigation:
  cache `~/.cache/ms-playwright`, install only required browsers per job.
- **pnpm 11's `allowBuilds` schema for native deps.** Build scripts of
  trusted packages (esbuild) must be allow-listed explicitly. Mitigation:
  documented in `pnpm-workspace.yaml`.

### Neutral

- **No turborepo / nx.** Pure pnpm workspace orchestration is enough at
  this scale (≤ 7 packages). Revisit if build times exceed 30s.
- **No changesets yet.** Releases are manual until P8. Add changesets if
  contributor PRs land before launch.

## Alternatives Considered

- **ESLint + Prettier instead of Biome.** Rejected: two configs, two
  speeds, two plugin ecosystems to keep in sync for marginal rule
  coverage advantage.
- **Bun instead of Node + pnpm.** Rejected: Bun's workspace ergonomics are
  improving but the format library must ship to browsers anyway, so the
  Node side is mostly a test runner. Bun's compatibility surface is also
  still moving. Revisit in 12 months.
- **Rollup instead of tsup.** Rejected: tsup is rollup + esbuild + sensible
  defaults. Configuring rollup directly is days of yak-shaving on a solo
  project.
- **jest instead of Vitest.** Rejected: jest's ESM story is still painful;
  Vitest is ESM-native.
- **npm or yarn instead of pnpm.** Rejected: pnpm's symlink store is
  cheaper on disk and faster on installs; workspace protocol is more
  ergonomic.

## References

- AGENTS.md Section 1 (mandatory tech stack)
- AGENTS.md Section 4.1-4.5 (TypeScript conventions)
- AGENTS.md Section 9.1 (bundle size budgets)
- PROGRESS.md (current project state)
