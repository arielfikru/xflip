# @xflip/core

Encoder and decoder for the **xflip** image format — an open container for
two-sided visual content (trading cards, collectibles, NFC-style flip
media) with optional holographic effects.

Zero runtime dependencies. ESM only. Targets Node 20+ and evergreen
browsers.

## Install

```bash
pnpm add @xflip/core
# or: npm install @xflip/core
```

## Quick start

```ts
import { decode, encode, type XflipFile } from '@xflip/core';

// Decode a buffer fetched from disk, network, or <input type="file">
const file: XflipFile = decode(bytes);

console.log(file.head.width, file.head.height);
console.log(file.head.frontFormat); // 'png' | 'jpeg' | 'webp' | 'avif' | 'jxl' | ...
renderFront(file.front); // raw image bytes — pass to a decoder of your choice

// Encode back to a self-contained xflip buffer
const out: Uint8Array = encode(file);
```

## API surface

### Primary

| Symbol            | Purpose                                       |
| ----------------- | --------------------------------------------- |
| `decode(bytes)`   | Bytes → typed `XflipFile`                     |
| `encode(file)`    | `XflipFile` → bytes                           |
| `XflipFile`       | Decoded file (HEAD + FRNT + BACK + layered + ancillary) |
| `XflipHead`       | Decoded HEAD chunk fields                     |
| `XflipLayerChunk` | Decoded `fLyr`/`bLyr` (v1.1)                  |
| `XflipLayer`      | Single layer record                           |
| `XflipLayerResponse` | Per-layer response parameters (open schema, see spec §5.6.2) |
| `XflipHefx`       | Decoded `hEfx` global parameters (open schema, see spec §5.7) |
| `ImageFormat`     | `'raw' \| 'png' \| 'jpeg' \| 'webp' \| 'avif' \| 'jxl' \| 'custom'` |
| `FlipAxis`        | `'horizontal' \| 'vertical' \| 'diagonal'`    |
| `BlendMode`       | `'normal' \| 'multiply' \| 'screen' \| ... \| 'custom'` |

### Lower-level

| Symbol                 | Purpose                                         |
| ---------------------- | ----------------------------------------------- |
| `parseChunks(bytes)`   | Iterate raw chunk list without HEAD parsing     |
| `parseLayerChunk(payload)` | Parse a raw `fLyr`/`bLyr` payload           |
| `serializeLayerChunk(chunk)` | Inverse of `parseLayerChunk`              |
| `parseHefx(payload)`   | Parse a raw `hEfx` payload                      |
| `serializeHefx(hefx)`  | Inverse of `parseHefx`                          |
| `crc32(bytes)`         | CRC-32/ISO-HDLC (PNG polynomial) checksum       |
| `crc32Concat(...spans)`| Multi-span CRC without joining buffers          |
| `IMAGE_FORMAT_CODES`   | Name → wire byte (`png` → `0x01`, ...)          |
| `FLIP_AXIS_CODES`      | Name → wire byte                                |
| `BLEND_MODE_CODES`     | Name → wire byte (per spec §5.6.1)              |

### Errors

All decoder/encoder failures throw a subclass of `XflipError`:

| Class               | When                                          |
| ------------------- | --------------------------------------------- |
| `XflipParseError`   | Malformed bytes; carries the byte `offset`    |
| `XflipCrcError`     | CRC mismatch; carries `expected` and `actual` |
| `XflipEncodeError`  | Invalid `XflipFile` passed to `encode()`      |

Treat any non-`XflipError` throw as a bug — please file an issue.

## Format

See the spec at `xflip-spec-v0.2.md` in the repository root. Highlights:

- Magic bytes `XFLP` + version (`0x01 0x00` for v1.0, `0x01 0x01` for v1.1).
- PNG-style chunk framing: `TYPE` (4 bytes) + `LENGTH` (uint32 BE) +
  `PAYLOAD` + `CRC32` (uint32 BE).
- Critical chunks: `HEAD`, `FRNT`, `BACK`, `ENDX`.
- Ancillary chunks: `META`, `tHmb`, `fLip`, `eDge` (preserved verbatim);
  `fLyr`, `bLyr`, `hEfx` (lifted to typed fields when parseable, else
  preserved verbatim per spec §3.3); plus any unknown lowercase-first tag.
- CRC-32/ISO-HDLC (polynomial `0xEDB88320`, init `0xFFFFFFFF`, final XOR
  `0xFFFFFFFF`).

## Guarantees

- **Round-trip identity.** `decode(encode(file))` deep-equals `file` for
  every value in the v1.0 surface (verified by property tests).
- **No silent corruption.** Critical-chunk CRC mismatches throw
  `XflipCrcError`. Ancillary CRC is best-effort by default; pass
  `decode(bytes, { strictAncillaryCrc: true })` to opt in.
- **Bounded throws.** The decoder either succeeds or throws an
  `XflipError`. Fuzz-tested at 50k+ iterations per second.

## Browser & Node

The package ships ESM only. It uses `Uint8Array` and `DataView`
throughout — no `Buffer`, no `fs`. Bundle size budget is ≤ 10 KB gzip.

## License

MIT
