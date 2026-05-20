# ADR 0002: CRC32 and Binary Parsing Decisions

**Status:** Accepted
**Date:** 2026-05-20
**Decider:** arielfikru
**Phase:** P1 (xflip-core v1.0)

## Context

`@xflip/core` is a binary codec for the xflip container format (spec v0.2).
It is the only package in the workspace that does bit-level work, and it
ships to **both browsers and Node.js with zero runtime dependencies** (per
AGENTS.md §3.5 and ADR 0001). Several non-trivial low-level decisions were
made during P1 that need to be captured before they ossify into folklore:

- Which CRC32 variant, computed how, with what API surface.
- How to model byte cursors over `Uint8Array` without `Buffer`.
- How to enforce big-endian on every multi-byte integer without relying on
  host endianness.
- How error reporting carries offset context out of deeply-nested parser
  frames.
- How chunk type recognition handles spec §3.3 vs Appendix A registry.

These choices are load-bearing for every future codec change (v1.1 layered
effects in P2, viewer-side parsing in P3, CLI in P4). Locking them in an
ADR avoids re-litigating during later phases.

Relevant spec sections: §2.6 (big-endian), §3.2 (chunk LENGTH ≤ 2^31-1),
§3.3 (chunk type case rule + Appendix A precedence), §3.4 (CRC32 over
TYPE+PAYLOAD), Appendix D (golden fixtures).

## Decision

### 1. CRC-32/ISO-HDLC, hand-implemented

We use the **PNG/zlib polynomial** (`0xEDB88320`, reflected form of
`0x04C11DB7`), initial value `0xFFFFFFFF`, final XOR `0xFFFFFFFF`,
reflect-in and reflect-out — i.e., CRC-32/ISO-HDLC.

Implementation is a single 256-entry lookup table built lazily at module
load (`crc32.ts`). No external library. The hot loop is a 5-line
table-driven kernel; the table itself is a `Uint32Array`.

Two exports:

| API                                  | Purpose |
| ------------------------------------ | ------- |
| `crc32(bytes: Uint8Array): number`   | Single-buffer checksum. |
| `crc32Concat(...parts): number`      | Checksum over concatenated spans without allocating a joined buffer. Used by chunk validation, which computes CRC over `TYPE + PAYLOAD` without materializing the concat. |

### 2. Byte access via `DataView`, never typed arrays for multi-byte ints

All multi-byte integer reads/writes go through a fresh `DataView` over the
target buffer with the `littleEndian` parameter **explicitly set to
`false`**. We never use `Uint16Array` / `Uint32Array` for parsing because
their endianness follows the host.

A thin functional layer (`readUint8`, `readUint16BE`, `readUint32BE`,
`readAscii`, `readSlice`, and write counterparts) lives in `bytes.ts`.
These are pure functions taking `(bytes, offset, ...)`.

### 3. `BytesReader` / `BytesWriter` cursors as the primary parser API

Two stateful classes wrap the functional helpers:

- **`BytesReader`** — owns a `#offset` (private field), exposes `u8`,
  `u16BE`, `u32BE`, `ascii(n)`, `slice(n)`, `skip(n)`, `remaining()`,
  `eof()`. Every read advances the cursor and throws `XflipParseError`
  with the failing offset on out-of-bounds.
- **`BytesWriter`** — growable buffer with capacity-doubling; exposes the
  same primitive write methods plus `bytes(span)` and `toBytes()` which
  returns a tight copy. Initial capacity 256, minimum 16.

Rationale: the format is sequential (signature → repeating
TYPE/LENGTH/PAYLOAD/CRC → ENDX). A cursor matches the parser's mental
model better than passing `(bytes, offset)` through every helper. The
functional layer remains available for ad-hoc reads (tests, fuzzer) and
keeps the cursor itself thin.

### 4. `slice()` returns a view, not a copy

`BytesReader.slice(n)` returns `bytes.subarray(...)`. Chunk payloads are
exposed to `decode()` as views into the source buffer. This is safe
because `decode()` is a one-shot transform: the input buffer outlives the
parsed structure, and callers do not mutate parsed payloads. `BytesWriter
.toBytes()` is the only path that *copies*, and it copies tight (no
trailing capacity).

### 5. Errors carry offsets, not stack snapshots

All parse-time failures throw `XflipParseError(message, offset)`. CRC
failures throw `XflipCrcError(type, offset, declared, actual)`. The
`offset` field points at the byte where validation noticed the problem
(not necessarily where corruption started — that is undecidable in
general). This lets consumers render `"corrupt at byte 0x1F4 in chunk
HEAD"` without re-parsing.

### 6. Chunk type recognition: registry first, case fallback

The spec has a documented ambiguity: §3.3 says critical/ancillary is
encoded in the case of the first letter, but Appendix A registers `META`
(uppercase) as **ancillary**. We resolve this in `chunks.ts` as:

1. If type is in the **known critical** set (`HEAD`, `FRNT`, `BACK`,
   `ENDX`) → critical.
2. Else if type is in the **known ancillary** set (`META`, `tHmb`,
   `fLip`, `sIgn`, `eDge`, `fLyr`, `bLyr`, `hEfx`) → ancillary.
3. Else if first letter is uppercase → **throw** `XflipParseError`
   ("unknown critical chunk type"). Decoders must understand all critical
   chunks (spec §3.3).
4. Else (lowercase-first, unknown) → ancillary, payload preserved.

Spec text was updated 2026-05-20 to match this behavior (PROGRESS.md
"Resolved" section).

### 7. CRC validation is strict for critical, lax-by-default for ancillary

`parseChunks(bytes, { strictAncillaryCrc })`:

- Critical chunk CRC mismatch → always throws `XflipCrcError`.
- Ancillary chunk CRC mismatch → silently retained in the parsed list by
  default; throws if `strictAncillaryCrc: true`.

This matches PNG behavior and lets viewers gracefully ignore a corrupted
thumbnail without failing the whole file. The fuzzer runs both modes.

### 8. Chunk length capped at `0x7FFFFFFF`

Spec §3.2 caps LENGTH at 2^31-1 (not the full uint32 range). The parser
rejects anything larger with a typed error before allocation. This
prevents trivial DoS via a forged 4 GB length, and keeps offsets within
safe-integer range for JS arithmetic.

### 9. `ENDX` is required, not optional

A file without an `ENDX` chunk throws `XflipParseError("reached end of
input without encountering an ENDX chunk")`. The terminator is the only
signal that the file is complete; without it we cannot distinguish
truncation from a well-formed file.

### 10. Higher-major version files attempt parse, do not refuse

Spec §3.1: a decoder MAY warn but SHOULD attempt to parse files with a
higher major version. We surface `versionMajor` / `versionMinor` to
callers via `ParsedFile` and let them decide. Internally we proceed as if
the version were supported, relying on the critical-chunk-type check (§6)
to reject unknown structure.

## Status

Accepted as of 2026-05-20. Revisit if:

- A future spec version introduces a different chunk framing (e.g., 64-bit
  lengths) — then `MAX_CHUNK_PAYLOAD` and the BE helpers need a parallel
  path, not an in-place edit.
- Profiling shows the table-driven CRC32 is the bottleneck (>5% of
  decode time). At that point evaluate slice-by-8 or WASM. Current
  measurement: fuzz harness sustains ~50k iter/s on the dev box, so CRC
  is comfortably below the noise floor.
- We need to parse from a streaming source (Node `Readable`, `ReadableStream`).
  The current cursor model assumes the entire buffer is in memory.
- `Buffer` becomes acceptable in `xflip-core` (it currently is not —
  browser shipping is a hard constraint).

## Consequences

### Positive

- **Zero deps.** `pnpm why` on `@xflip/core` shows only `typescript` and
  the dev toolchain. Honors AGENTS.md §3.5.
- **Endianness bugs are unreachable.** Every BE call passes `false`
  explicitly; there is no path that reads a multi-byte int via a typed
  array.
- **Typed errors with offsets.** Every parse failure surfaces as an
  `XflipParseError` or `XflipCrcError` with an actionable offset. The
  fuzzer (P1.12) verified zero unclassified throws across 50k+ adversarial
  inputs.
- **No allocations in the CRC hot path.** `crc32Concat` walks spans
  in-place; chunk validation does not materialize `TYPE + PAYLOAD` as a
  joined buffer.
- **Decoder is total over `Uint8Array`.** It either returns an
  `XflipFile` or throws a typed error. Fuzz-tested (P1.11, P1.12).

### Negative

- **`BytesReader.slice()` returns a view, not a copy.** Callers who
  retain payload bytes after the input buffer is GC-eligible must copy
  themselves. We document this on the class and rely on `decode()` being
  a one-shot transform.
- **No streaming decode.** Whole-file buffer assumption. Acceptable for
  v1.0 (target file size is single-image, ≤ few MB). P2+ may need
  streaming for layered effects.
- **CRC32 table built at module load.** ~1 KB of `Uint32Array` per
  worker. Negligible, but worth noting for environments that aggressively
  measure module-init cost.
- **Two layers of API (functional + cursor) is mild duplication.** Kept
  because tests and the fuzzer want both shapes. The cursor delegates to
  the functional layer, so there is one source of truth per primitive.

### Neutral

- **No SIMD / WASM CRC.** Pure JS is ~5× slower than native, but the
  format is small (KB-scale chunks) and the runtime cost is dwarfed by
  the cost of producing the image payload in the first place.
- **`TextEncoder` for ASCII writes.** Used in `BytesWriter.ascii()`.
  Available everywhere we ship.

## Alternatives Considered

- **`crc-32` npm package.** Rejected: pulls a runtime dep into `xflip-core`,
  violating ADR 0001 / AGENTS.md §3.5. Saves ~40 lines of code at the
  cost of the project's central credibility claim.
- **WASM CRC32 (via `@node-rs/crc32` or hand-rolled).** Rejected for v1.0:
  unnecessary complexity; pure JS is fast enough. Revisit only if
  profiling demands it.
- **Slice-by-8 CRC.** Rejected for v1.0: 8× the table size for ~4× the
  speed, on a hot path that is not a bottleneck.
- **Pass `(bytes, offset)` everywhere; no cursor class.** Rejected: the
  parser becomes a chain of `let offset = ...; offset = readX(bytes,
  offset); ...` and every helper has to return a tuple. The cursor
  pattern collapses that into single-call sites.
- **`Buffer` from `node:buffer`.** Rejected: ships to browsers. `Buffer`
  would either pull a polyfill (~6 KB minified) or break the browser
  target.
- **`Uint32Array` view for fast uint32 reads.** Rejected: host
  endianness. We would have to byte-swap on little-endian hosts (i.e.,
  almost all of them), erasing any perf gain.
- **Throwing plain `Error` with formatted strings.** Rejected: consumers
  cannot pattern-match on error class. Typed errors with `offset`
  metadata are friendlier to higher-level tools (CLI, viewer overlays).
- **Refusing to parse files with higher major version.** Rejected: the
  spec explicitly says decoders SHOULD attempt to parse. Refusing
  pre-empts forward compatibility and harms the format's longevity.

## References

- xflip spec v0.2 §2.6 (big-endian), §3.1 (version handling), §3.2
  (chunk framing), §3.3 (case rule + Appendix A precedence), §3.4
  (CRC32), Appendix A (registry), Appendix D (golden fixtures).
- AGENTS.md §3.5 (zero runtime deps), §4.5 (`XflipError` hierarchy),
  §4.7 (fixtures), §5 Phase 1 DoD.
- ADR 0001 (tech stack: `Uint8Array` over `Buffer`, ESM-only).
- PROGRESS.md (P1 task log: P1.3 CRC, P1.4 bytes, P1.6 parser, P1.7
  serializer, P1.11 property tests, P1.12 fuzzer).
