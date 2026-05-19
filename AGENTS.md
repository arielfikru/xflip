# AGENTS.md — Implementation Guide for AI Coding Agents

> **Audience:** AI coding agents (Claude Code, Cursor, Devin, Aider, etc.)
> **Purpose:** Provide complete context for autonomous implementation of the xflip ecosystem.
> **Last updated:** 2026-05-19

---

## 1. Project Overview

**xflip** is an experimental open image format for two-sided visual content
(digital trading cards, collectibles, badges) with optional layered
holographic effects. The project consists of a format specification plus a
reference implementation ecosystem.

**Repository structure (target):**

```
xflip/
├── spec/                    # Format specification (Markdown)
│   ├── v0.1.md
│   └── v0.2.md
├── packages/
│   ├── xflip-core/          # Core encoder/decoder (TypeScript)
│   ├── xflip-viewer/        # Web Component <xflip-card>
│   ├── xflip-cli/           # CLI tool (node)
│   └── xflip-react/         # React wrapper component
├── apps/
│   ├── playground/          # Interactive web playground
│   └── docs/                # Documentation site
├── examples/                # Sample .xflip files + how-to
├── tests/                   # Cross-package integration tests
└── README.md
```

**Tech stack (mandatory):**

- **Language:** TypeScript (strict mode, all packages)
- **Runtime:** Node.js 20+ (LTS), modern browsers (ES2022)
- **Build:** Vite for apps, tsup for libraries
- **Monorepo:** pnpm workspaces
- **Testing:** Vitest (unit), Playwright (e2e)
- **Lint/Format:** Biome (replaces ESLint + Prettier)
- **CI:** GitHub Actions
- **License:** MIT (code), CC0 (spec)

**Why these choices:** Modern, fast, minimal config, single tool for lint+format.
Do not introduce alternatives without explicit instruction.

---

## 2. Mandatory Reading Before Coding

Before writing any code, the agent MUST read:

1. `xflip-spec-v0.2.md` — Format specification (authoritative, self-contained source of truth)
2. This file (`AGENTS.md`) — Implementation conventions
3. The relevant package's `README.md` if it exists

If working in the maintainer's own clone, also read (these are local-only and
gitignored, not present in fresh contributor checkouts):

- `PROGRESS.md` — current task pointer and per-phase task breakdowns
- `CLAUDE.md` — autonomous continuation protocol for the AI assistant
- `SOW.md` — personal project charter

`xflip-spec-v0.1.md` is **legacy / historical only**. Do not read it for
implementation. v0.2 is fully self-contained.

**Do not implement from memory.** The spec defines exact byte layouts and
chunk semantics. Refer to it constantly during implementation.

If anything in this document conflicts with `spec/v0.2.md`, the **spec wins**.
Flag the conflict in a comment and proceed per the spec.

---

## 3. Core Implementation Principles

### 3.1 Spec Fidelity Above All

- Implement what the spec says, not what seems reasonable.
- Big-endian for all multi-byte integers. Never assume platform endianness.
- CRC32 polynomial = PNG polynomial (0xEDB88320 reflected).
- Chunk type codes are case-sensitive ASCII. `HEAD` ≠ `head`.

### 3.2 No Premature Optimization

- Correctness first, performance second.
- Use straightforward algorithms; do not micro-optimize until benchmarks justify it.
- Inline obvious computations; do not extract abstract base classes unless 2+ concrete uses exist.

### 3.3 Fail Loud, Fail Early

- Throw descriptive errors with chunk type and byte offset when parsing fails.
- Never silently swallow errors except for explicitly ancillary unknown chunks.
- Errors must include: what failed, where (offset), what was expected, what was found.

Example:

```typescript
throw new XflipError(
  `CRC32 mismatch on critical chunk "${type}" at offset 0x${offset.toString(16)}: expected 0x${expected.toString(16)}, got 0x${actual.toString(16)}`
);
```

### 3.4 Browser AND Node Compatibility

- Core library MUST work in both browser (no Node-specific APIs) and Node.
- Use `Uint8Array` and `DataView`, never `Buffer` in the core package.
- File I/O lives in `xflip-cli` only.

### 3.5 Zero Runtime Dependencies (Core)

- `xflip-core` must have **zero** runtime dependencies. No exceptions.
- Other packages may depend on `xflip-core` and well-maintained libraries.
- Dev dependencies are unrestricted.

---

## 4. Code Conventions

### 4.1 TypeScript

- `tsconfig.json` uses `"strict": true`, `"noUncheckedIndexedAccess": true`.
- No `any`. Use `unknown` if type is genuinely unknown.
- Prefer `type` over `interface` unless declaration merging is needed.
- Exhaustive switch cases use `never` assertion in default branch.

### 4.2 Naming

- File names: `kebab-case.ts`
- Types/Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE` only for module-level true constants
- Chunk type codes in code: use `as const` string literals, e.g., `"HEAD" as const`

### 4.3 Module Structure

Each package follows:

```
src/
├── index.ts          # Public API exports only
├── types.ts          # Shared types
├── errors.ts         # Custom error classes
├── core/             # Internal implementation
└── __tests__/        # Tests next to code being tested
```

### 4.4 Public API Rules

- Anything exported from `index.ts` is a public commitment. Treat as semver-stable.
- Internal modules MUST NOT be importable via deep paths (use `exports` field in package.json).
- Document every public symbol with JSDoc. Include `@example` for non-trivial APIs.

### 4.5 Errors

Define a single `XflipError` base class per package, with specific subclasses:

```typescript
export class XflipError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'XflipError';
  }
}

export class XflipParseError extends XflipError {
  constructor(message: string, public readonly offset: number) {
    super(message);
    this.name = 'XflipParseError';
  }
}
```

### 4.6 Testing

- Every public function has tests.
- Tests use Vitest, files named `*.test.ts` next to source.
- Test fixtures (sample `.xflip` files) live in `tests/fixtures/`.
- Integration tests live in root `tests/` directory.

**Coverage thresholds (per-package, enforced in CI):**

| Package          | Line coverage target |
| ---------------- | -------------------- |
| `xflip-core`     | ≥ 90%                |
| `xflip-cli`      | ≥ 85%                |
| `xflip-react`    | ≥ 80%                |
| `xflip-viewer`   | ≥ 60% line + critical-path Playwright e2e |
| `apps/*`         | No threshold (smoke tests only) |

### 4.7 Fixture Strategy (Chicken-and-Egg)

The decoder needs `.xflip` test fixtures, but the encoder is built later in
Phase 1. Resolve as follows:

1. **Phase 1 task 9a — Hex-encoded golden fixtures:** Write minimal valid
   files as TypeScript `Uint8Array` literals in test files. Hand-compute
   CRC32 with a separately-tested CRC32 utility (task 3). Place in
   `tests/fixtures/golden/*.ts` exporting named byte arrays.
2. **Phase 1 task 9b — Round-trip fixtures:** Once encoder lands (task 8),
   regenerate larger fixtures programmatically with `pnpm run gen:fixtures`,
   which writes binary `.xflip` files to `tests/fixtures/generated/`.
3. **NEVER use the encoder under test to generate the decoder's golden
   inputs.** Golden fixtures must be bit-exact and human-auditable.
4. **At least one hand-crafted minimal v1.0 file** (per Spec Appendix D)
   must exist as a hex literal before task 5 (chunk parser) is considered done.

### 4.8 Fuzzing

The binary decoder is the primary attack surface. Phase 1 MUST include:

- **Property tests** with `@fast-check/vitest`: round-trip encode/decode,
  parser robustness against truncation, malformed lengths, swapped chunks.
- **Mutation fuzzing**: A `pnpm fuzz` task that takes valid fixtures, flips
  random bytes, and runs the decoder, asserting it either parses or throws
  a typed `XflipParseError` (never a generic `TypeError`, infinite loop, or
  OOB read).
- Run fuzzer for at least 60 seconds in CI per push.

---

## 5. Implementation Order (Critical)

Implement packages in this order. Do not skip ahead.

### Phase 1: xflip-core (Foundation)

**Goal:** Working encoder/decoder for v1.0 (no layered effects).

Tasks in order:

1. Set up monorepo: pnpm workspaces, tsconfig, biome.json, vitest config, size-limit.
2. Create `xflip-core` package skeleton.
3. Implement CRC32 (PNG-compatible). Test against known vectors (PNG test suite).
4. Implement byte reader/writer utilities with big-endian helpers.
5. Implement chunk parser (`parseChunks` function): reads signature, iterates chunks, validates CRC.
6. Implement chunk serializer (`writeChunk` function).
7. Implement `decode(bytes: Uint8Array): XflipFile` — full v1.0 decoder.
8. Implement `encode(file: XflipFile): Uint8Array` — full v1.0 encoder.
9. Write tests using hex-coded golden fixtures (Spec Appendix D) — see Section 4.7.
10. Implement property tests + mutation fuzzer per Section 4.8.
11. Export public API: `encode`, `decode`, types, errors.
12. Write `docs/adr/0001-tech-stack.md` capturing rationale for pnpm/tsup/Biome/Vitest choices.

**Definition of done for Phase 1:**

- Can encode two PNGs + metadata into valid `.xflip` file.
- Can decode `.xflip` file back to original PNGs + metadata.
- Round-trip test passes byte-identical for FRNT/BACK image data.
- All v1.0 worked examples from spec parse correctly.
- 80%+ test coverage.
- Zero runtime dependencies confirmed.

### Phase 2: xflip-core v1.1 (Layered Effects)

**Goal:** Add `fLyr`/`bLyr`/`hEfx` support.

1. Add types for layer records, blend modes, response parameters.
2. Implement `parseLayerChunk` and `serializeLayerChunk`.
3. Add `hEfx` JSON parsing with schema validation.
4. Update `decode`/`encode` to handle new chunks.
5. Write tests for layered files.

**Definition of done for Phase 2:**

- Can encode a layered card and decode it back identically.
- All effect types from Appendix B are recognized (even if not rendered).
- Files with unknown ancillary chunks decode successfully with warnings.
- Backward compat: v1.0 files still decode correctly.

### Phase 3: xflip-viewer (Web Component)

**Goal:** `<xflip-card src="...">` web component that renders cards.

1. Set up package with Vite library mode.
2. Implement `<xflip-card>` custom element with shadow DOM.
3. Fetch + decode via `xflip-core`.
4. Render flat fallback (FRNT/BACK) using `<canvas>` or `<img>` with object URL.
5. Implement 3D flip on click/tap.
6. Implement mouse tilt response.
7. Implement layered rendering (CSS approach matching playground demo).
8. Implement reduced-motion respect.
9. Write Playwright tests.

**Definition of done for Phase 3:**

- `<xflip-card src="example.xflip">` works in modern browsers.
- Click flips card with smooth animation.
- Mouse hover tilts card and animates holo layers.
- Works on mobile (touch events, gyroscope where available).
- Passes Playwright tests on Chromium + Firefox + WebKit.

### Phase 4: xflip-cli (Command-line Tool)

**Goal:** Node CLI for creating, inspecting, extracting `.xflip` files.

Commands:

```
xflip create --front a.png --back b.png --output card.xflip [--meta meta.json]
xflip inspect card.xflip                  # Print chunk structure
xflip extract card.xflip --to ./out/      # Extract images + metadata
xflip validate card.xflip                 # Verify CRC + structural validity
xflip layers add card.xflip --layer ...   # Add layer (advanced)
```

**Definition of done for Phase 4:**

- All commands work as documented.
- Helpful error messages on invalid input.
- `--help` output for every command.
- Tested on macOS, Linux, Windows.

### Phase 5: xflip-react (React Wrapper)

**Goal:** `<XflipCard>` React component.

Simple wrapper around `xflip-viewer`'s web component with React-friendly props.

### Phase 6: apps/playground (Interactive Demo)

**Goal:** Web app where users can upload cards and play with layered effects.

- Drag-drop `.xflip` file → renders it
- Live parameter editor for `hEfx` values
- Layer toggle/reorder UI
- "Save" outputs modified `.xflip` for download

### Phase 7: apps/docs (Documentation Site)

**Goal:** Public-facing docs at e.g., `xflip.dev`.

- Built with Astro or VitePress
- Sections: Intro, Spec, Guides, API Reference, Playground, Showcase
- Embedded examples using `<xflip-card>` web component
- SEO-optimized for discovery

### Phase 8: Launch Prep

- README with hero example, badges, install instructions
- CONTRIBUTING.md
- CODE_OF_CONDUCT.md
- LICENSE files
- GitHub repository public
- npm packages published
- Hacker News "Show HN" post drafted

---

## 6. Common Pitfalls (Avoid These)

### 6.1 Endianness

JavaScript `DataView.getUint32(offset)` defaults to big-endian when you OMIT
the `littleEndian` parameter — but `TypedArray` views (`Uint32Array`) use
platform-native endianness. Always use `DataView` for binary parsing.

### 6.2 CRC32 Implementation

Many CRC32 libraries on npm use different polynomials. The correct one for
xflip is the PNG polynomial: `0xEDB88320` (reflected). Hand-implement and
test against PNG test vectors. Do not assume any library is correct without
verification.

### 6.3 Chunk Type Code Case

`HEAD` and `head` are different chunks. `fLyr` is intentionally mixed-case;
the case carries semantic meaning per the spec (critical/ancillary). Never
normalize case.

### 6.4 Image Data Is Not Decoded

The `FRNT` chunk payload is the **raw bytes of a PNG/JPEG file**, not decoded
pixel data. `xflip-core` should NOT decode the image; it just stores/returns
the byte slice. Image decoding is the renderer's responsibility (browser
will do it via `<img>` or canvas).

### 6.5 ENDX Chunk Has Empty Payload

`ENDX` has `LENGTH = 0` and no payload bytes. The CRC32 is computed over
just the 4 bytes `"ENDX"`. Easy to get wrong.

### 6.6 JSON Inside Binary

`META`, `hEfx`, and per-layer `response_json` are JSON inside binary chunks.
Encode as UTF-8 bytes (no BOM). Parse safely with try/catch; treat JSON
parse failures on ancillary chunks as warnings, not errors.

### 6.7 Web Component Shadow DOM Styling

`<xflip-card>` uses shadow DOM. CSS variables can pierce shadow DOM but
class-based theming cannot. Document this clearly.

### 6.8 Reduced Motion

Always check `window.matchMedia('(prefers-reduced-motion: reduce)').matches`
before enabling animations. Many users have this set; ignoring it is
accessibility failure.

---

## 7. Git Workflow

- **Branch naming:** `feat/phase-N-description`, `fix/issue-N`, `docs/section`
- **Commit messages:** Conventional Commits format (`feat:`, `fix:`, `docs:`, `chore:`)
- **PR per phase, minimum.** Smaller PRs encouraged.
- **PR description template:**
  - What changed
  - Why
  - How tested
  - Spec sections implemented (with links)
  - Breaking changes (if any)

---

## 8. When to Stop and Ask the Human

The agent SHOULD stop and ask for guidance when:

- The spec is genuinely ambiguous (not just under-specified).
- A design decision affects the public API and isn't covered here.
- A dependency adds non-trivial bundle size and isn't in the approved list.
- Performance optimization requires architectural changes.
- Encountering a security implication not covered in spec Section 9.

The agent SHOULD NOT ask when:

- The spec clearly answers the question (re-read it).
- Implementing standard patterns (logging, error handling, etc.).
- Adding tests, documentation, or examples within the established style.
- Refactoring internal code that doesn't affect public API.

---

## 9. Quality Gates

Before any PR is merged, these MUST pass:

- [ ] All tests pass (`pnpm test`)
- [ ] Coverage meets per-package threshold (Section 4.6)
- [ ] Biome lint clean (`pnpm lint`)
- [ ] TypeScript strict mode no errors (`pnpm typecheck`)
- [ ] Bundle size check passed (size-limit budgets, Section 9.1)
- [ ] Fuzz harness runs 60s without error (`pnpm fuzz --ci`)
- [ ] Round-trip test for any spec changes
- [ ] Documentation updated for any public API changes
- [ ] ADR added/updated for any architecture decision

### 9.1 Bundle Size Budgets

Enforced via `size-limit`. CI fails if any package exceeds budget.

| Package          | Bundle (min+gzip)        | Notes                    |
| ---------------- | ------------------------ | ------------------------ |
| `xflip-core`     | ≤ 10 KB                  | Zero runtime deps        |
| `xflip-viewer`   | ≤ 50 KB                  | Includes core; CSS inline |
| `xflip-react`    | ≤ 5 KB (excl. core+viewer) | Pure wrapper           |
| `xflip-cli`      | No browser bundle        | Node only                |

### 9.2 ADR (Architecture Decision Records)

All non-trivial architecture decisions MUST be captured in `docs/adr/`:

- Filename: `NNNN-kebab-case-title.md`, numbered sequentially.
- Format: Michael Nygard template (Context, Decision, Status, Consequences).
- Required for: build tool choice, runtime deps, public API design changes,
  significant refactors, spec changes propagating into code.

This protects solo-dev future-self from re-litigating settled decisions.

---

## 10. Reference Resources

- PNG specification (chunk model inspiration): https://www.w3.org/TR/png/
- W3C Compositing Level 1 (blend modes): https://www.w3.org/TR/compositing-1/
- Web Components MDN: https://developer.mozilla.org/en-US/docs/Web/API/Web_components
- pnpm workspaces: https://pnpm.io/workspaces
- Biome: https://biomejs.dev

---

## 11. Glossary

- **Chunk:** Self-contained section of an xflip file with TYPE/LENGTH/PAYLOAD/CRC.
- **Critical chunk:** Must be understood by decoder (uppercase first letter).
- **Ancillary chunk:** Safely ignorable (lowercase first letter).
- **Layer:** A composable image element within `fLyr`/`bLyr` chunks.
- **Effect type:** Semantic identifier for how a layer should be rendered/animated.
- **Response:** How a layer reacts to viewing input (mouse, tilt, time).
- **FRNT/BACK:** Critical chunks holding the flat fallback images.
- **Compose:** Blend layers using their blend mode and current response state.

---

## 12. Project Status & Authority

This is an experimental open-source project. The format specification is the
authoritative source of truth for behavior. This AGENTS.md is the authoritative
source for implementation style and process.

If you discover spec issues during implementation, propose changes via PR to
`spec/` rather than working around them in code.

When in doubt: **read the spec, write the test, ship the code.**
