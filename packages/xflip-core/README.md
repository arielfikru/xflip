# @xflip/core

Zero-dependency TypeScript encoder and decoder for the
[xflip image format](https://github.com/arielfikru/xflip).

Runs in browser and Node 20+.

## Install

```bash
pnpm add @xflip/core
```

## Usage

```typescript
import { decode, encode } from '@xflip/core';

// Decode
const file = decode(bytes); // bytes: Uint8Array

// Encode
const out = encode({
  head: { width: 320, height: 460, frontFormat: 'png', backFormat: 'png' },
  front: pngBytes,
  back: pngBackBytes,
});
```

## Constraints

- **Zero runtime dependencies.** Hand-implemented CRC32, hand-rolled big-endian
  byte readers; uses only `Uint8Array` and `DataView` from the platform.
- **Browser + Node.** Does not import `node:` modules. No `Buffer`.
- **Spec fidelity.** Implements [xflip-spec-v0.2.md](../../xflip-spec-v0.2.md)
  exactly. Big-endian, PNG-polynomial CRC32, chunk type code case-sensitive.

## License

MIT
