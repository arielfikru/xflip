# xflip

> Open image format for two-sided visual content with optional layered holographic effects.

**Status:** Experimental, pre-1.0. See [SOW.md](./SOW.md) for project charter.

## What is xflip?

xflip is a chunk-based container format (inspired by PNG) holding a **front
image**, a **back image**, optional metadata, and optional **layered effects**
for holographic / material-response rendering.

xflip is **not a codec.** Image data inside the container uses existing
formats (PNG, JPEG, WebP, AVIF, JXL). xflip provides the structural
wrapper, semantic meaning, and effect orchestration.

## Specification

- [`xflip-spec-v0.2.md`](./xflip-spec-v0.2.md) — authoritative, self-contained.
- [`xflip-spec-v0.1.md`](./xflip-spec-v0.1.md) — legacy, do not implement.

## Reference Implementation

| Package          | Role                                         | Status   |
| ---------------- | -------------------------------------------- | -------- |
| `@xflip/core`    | Encoder / decoder (TS, browser + Node)       | Planned  |
| `@xflip/viewer`  | `<xflip-card>` web component                 | Planned  |
| `@xflip/cli`     | Node CLI                                     | Planned  |
| `@xflip/react`   | React wrapper                                | Planned  |

## Demo

Open [`xflip-holo-demo.html`](./xflip-holo-demo.html) in a modern browser
for a standalone CSS holographic effect proof of concept.

## Project Documents

- [`AGENTS.md`](./AGENTS.md) — implementation guide for AI coding agents and human contributors

## Development

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

Requires Node 20+ and pnpm 9+. See [`.nvmrc`](./.nvmrc).

## License

- Code: MIT
- Specification: CC0
