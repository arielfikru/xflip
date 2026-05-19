# xflip Format Specification

> **LEGACY — DO NOT IMPLEMENT FROM THIS FILE.** Superseded by `xflip-spec-v0.2.md`,
> which is self-contained and authoritative. This file is retained for historical
> reference only. v0.2 covers format version 1.1 (backward compatible with 1.0).
> Known issues fixed in v0.2: ordering rules tightened; `response_len` widened.

**Version:** 0.1 (Draft, superseded)
**Status:** Historical
**Extension:** `.xflip`
**MIME Type:** `image/x-flip` (provisional)
**Pronunciation:** "ex-flip" or "x-flip"

## 1. Overview

xflip is a container image format for two-sided visual content. A single `.xflip`
file holds a **front** image, a **back** image, and optional metadata. The format
is designed for digital trading cards, but is general-purpose for any
visual concept requiring two faces in one portable file.

xflip is **not a codec**. Image data inside the container uses existing
well-supported formats (PNG, JPEG, WebP, AVIF). xflip provides only the
structural wrapper and semantic meaning of "front/back".

## 2. Design Principles

1. **Container, not codec.** Delegate compression and pixel encoding to
   established formats. Focus xflip's complexity on structure and semantics.
2. **Chunk-based extensibility.** New features can be added via new chunk types
   without breaking existing decoders.
3. **Graceful degradation.** Decoders may safely ignore unrecognized
   ancillary chunks.
4. **No prescribed rendering.** The spec defines data, not presentation.
   Viewers choose their own flip animation, layout, and interaction model.
5. **Big-endian throughout.** All multi-byte integers are big-endian (network
   byte order) for consistency with PNG/RIFF conventions.

## 3. File Structure

A valid xflip file is a sequence of bytes structured as:

```
+----------------------+
| Signature (6 bytes)  |
+----------------------+
| Chunk 1              |
+----------------------+
| Chunk 2              |
+----------------------+
| ...                  |
+----------------------+
| Chunk N              |
+----------------------+
| ENDX chunk           |
+----------------------+
```

### 3.1 Signature

The first 6 bytes of every xflip file MUST be:

```
Offset  Bytes              Meaning
------  -----------------  -------------------------
0x00    58 46 4C 50        ASCII "XFLP" — magic bytes
0x04    01                 Major version (currently 1)
0x05    00                 Minor version (currently 0)
```

Decoders MUST reject files that do not begin with `XFLP`.

Decoders MAY warn but SHOULD attempt to parse files with a higher major version
than they support — they will parse critical chunks they recognize and skip
unknown ones.

### 3.2 Chunks

All content after the signature is organized into chunks. Each chunk has
the following structure:

```
+--------+--------+----------------+--------+
| TYPE   | LENGTH | PAYLOAD        | CRC32  |
| 4 bytes| 4 bytes| LENGTH bytes   | 4 bytes|
+--------+--------+----------------+--------+
```

| Field   | Size     | Description                                                |
| ------- | -------- | ---------------------------------------------------------- |
| TYPE    | 4 bytes  | ASCII chunk type code (case-sensitive)                     |
| LENGTH  | 4 bytes  | Length of PAYLOAD in bytes (uint32 big-endian, max 2^31-1) |
| PAYLOAD | variable | Chunk content, format depends on TYPE                      |
| CRC32   | 4 bytes  | CRC-32/ISO-HDLC checksum of TYPE + PAYLOAD                 |

CRC32 uses the same polynomial as PNG (0xEDB88320 reflected, init 0xFFFFFFFF,
xor-out 0xFFFFFFFF). Decoders MUST validate CRC32 of critical chunks;
MAY validate ancillary chunks.

### 3.3 Critical vs Ancillary Chunks

The case of the first letter in a chunk's TYPE code indicates criticality:

- **Uppercase first letter** → Critical chunk. Decoder MUST understand it.
  If unrecognized, decoder MUST fail.
- **Lowercase first letter** → Ancillary chunk. Decoder MAY ignore if
  unrecognized. File remains valid.

Example: `HEAD`, `FRNT`, `BACK`, `ENDX` are critical. `tHmb`, `fLip`, `sIgn`,
`eDge` are ancillary.

### 3.4 Chunk Ordering

The following ordering rules apply:

1. The `HEAD` chunk MUST be the first chunk after the signature.
2. The `ENDX` chunk MUST be the final chunk.
3. The `FRNT` chunk MUST appear before the `BACK` chunk.
4. The `META` chunk, if present, SHOULD appear before `FRNT`.
5. All other chunks MAY appear in any order between `HEAD` and `ENDX`.

## 4. Critical Chunks

### 4.1 HEAD — File Header

The `HEAD` chunk contains structural metadata required to decode the file.

**Payload size:** Exactly 12 bytes.

```
Offset  Size  Field          Type    Description
------  ----  -------------  ------  -----------------------------------
0x00    4     width          uint32  Canvas width in pixels
0x04    4     height         uint32  Canvas height in pixels
0x08    1     front_format   uint8   Format code for front image
0x09    1     back_format    uint8   Format code for back image
0x0A    1     flip_axis      uint8   Suggested flip axis (see below)
0x0B    1     flags          uint8   Bit flags (see below)
```

**Format codes:**

| Code | Format | Notes                          |
| ---- | ------ | ------------------------------ |
| 0x00 | Raw    | Reserved; not for general use  |
| 0x01 | PNG    | RFC 2083                       |
| 0x02 | JPEG   | ITU-T T.81 / ISO/IEC 10918-1   |
| 0x03 | WebP   | RFC 6386 / RFC 9649            |
| 0x04 | AVIF   | ISO/IEC 23000-22               |
| 0x05 | JXL    | ISO/IEC 18181 (JPEG XL)        |
| 0x06-0xFE | Reserved for future formats |             |
| 0xFF | Custom | Format described in METADATA   |

Front and back MAY use different formats.

**Flip axis values:**

| Value | Axis        | Description                          |
| ----- | ----------- | ------------------------------------ |
| 0x00  | Horizontal  | Flip around vertical axis (Y-axis)   |
| 0x01  | Vertical    | Flip around horizontal axis (X-axis) |
| 0x02  | Diagonal    | Flip around diagonal axis            |
| 0x03+ | Reserved    |                                      |

This is a **suggestion** to renderers. Renderers MAY ignore and use their own
preference.

**Flags bit field (bit 0 = LSB):**

| Bit | Name           | Meaning                                              |
| --- | -------------- | ---------------------------------------------------- |
| 0   | DEFAULT_BACK   | If set, viewer should show BACK first by default     |
| 1   | NO_FLIP_ANIM   | Hint: viewer should not animate flip (instant swap)  |
| 2-7 | Reserved       | Must be 0 in version 1.0                             |

### 4.2 FRNT — Front Image Data

**Payload:** Raw bytes of the front image, encoded using the format specified
in `HEAD.front_format`.

If `front_format` is `0x01` (PNG), the payload is a complete, standalone PNG
file including its own signature (`89 50 4E 47 0D 0A 1A 0A`) and all PNG
chunks. The same principle applies to JPEG, WebP, AVIF, JXL.

This means: **extracting the FRNT chunk payload and saving it to disk
produces a valid standalone image file** in its native format.

### 4.3 BACK — Back Image Data

Identical to FRNT but contains the back image. The dimensions of the
decoded back image MUST equal `HEAD.width` and `HEAD.height`.

### 4.4 ENDX — End Marker

**Payload size:** 0 bytes (LENGTH = 0).

The ENDX chunk marks the logical end of the file. Decoders MUST stop parsing
after reading ENDX. Any bytes after ENDX are not part of the xflip file
(though tools MAY use trailing space for sidecar data; this is outside the
xflip spec).

The CRC32 of ENDX is computed over just `"ENDX"` (4 bytes, no payload).

## 5. Standard Ancillary Chunks

These chunks are optional. Decoders that don't understand them may safely
skip them.

### 5.1 META — Metadata

**Payload:** UTF-8 encoded JSON object (RFC 8259).

The JSON object is free-form, but the following keys are reserved and have
defined meaning:

| Key           | Type    | Description                                       |
| ------------- | ------- | ------------------------------------------------- |
| `title`       | string  | Human-readable title of the card                  |
| `creator`     | string  | Creator name or handle                            |
| `created`     | string  | ISO 8601 datetime of creation                     |
| `modified`    | string  | ISO 8601 datetime of last modification            |
| `description` | string  | Free-text description                             |
| `tags`        | array   | Array of string tags                              |
| `edition`     | string  | Edition info, e.g. "12/100"                       |
| `set`         | string  | Set or collection name                            |
| `rarity`      | string  | Free-form rarity descriptor                       |
| `version`     | string  | Card version (independent of file format version) |
| `language`    | string  | BCP 47 language tag                               |
| `custom`      | object  | Reserved for application-specific extensions      |

All reserved keys are OPTIONAL. Applications MAY add arbitrary keys outside
this list; they SHOULD nest them under `custom` to avoid future spec conflicts.

**Maximum recommended size:** 64 KB. Larger metadata is permitted but
discouraged.

### 5.2 tHmb — Thumbnail

**Payload structure:**

```
Offset  Size      Field         Type    Description
------  --------  ------------  ------  ---------------------------------
0x00    1         format        uint8   Format code (same as HEAD format codes)
0x01    2         width         uint16  Thumbnail width in pixels
0x03    2         height        uint16  Thumbnail height in pixels
0x05    variable  image_data    bytes   Encoded image data
```

Used by file managers and galleries for fast preview without decoding the
full image. Typically 128×128 to 256×256 pixels. May represent the front,
back, or a composite.

### 5.3 fLip — Animation Hints

**Payload:** UTF-8 encoded JSON object.

Defined keys:

| Key           | Type    | Description                                       |
| ------------- | ------- | ------------------------------------------------- |
| `duration_ms` | integer | Suggested flip duration in milliseconds (default 600) |
| `easing`      | string  | CSS easing function name, e.g. "ease-in-out"      |
| `axis`        | string  | "horizontal", "vertical", or "diagonal" (overrides HEAD) |
| `auto`        | boolean | If true, suggest auto-flip loop                   |
| `interval_ms` | integer | If `auto=true`, time between auto-flips           |
| `perspective` | integer | CSS perspective value in pixels (default 1000)    |

All keys optional. Renderers MAY honor any subset.

### 5.4 sIgn — Digital Signature

**Payload structure:**

```
Offset  Size      Field         Type    Description
------  --------  ------------  ------  ---------------------------------
0x00    1         algorithm     uint8   Signature algorithm code
0x01    2         pubkey_len    uint16  Length of public key in bytes
0x03    N         pubkey        bytes   Public key
0x03+N  2         sig_len       uint16  Length of signature in bytes
0x05+N  M         signature     bytes   Signature bytes
```

**Algorithm codes:**

| Code | Algorithm          |
| ---- | ------------------ |
| 0x01 | Ed25519            |
| 0x02 | ECDSA P-256        |
| 0x03 | RSA-PSS-SHA256     |

The signature is computed over the SHA-256 hash of all preceding chunks
(signature + HEAD + all chunks before sIgn) in their on-disk byte order.

### 5.5 eDge — Card Edge Appearance

**Payload structure:**

```
Offset  Size      Field         Type    Description
------  --------  ------------  ------  ---------------------------------
0x00    1         mode          uint8   0=solid color, 1=gradient, 2=texture
0x01    4         color_rgba    bytes   For mode 0/1: RGBA color (4 bytes)
0x05    ...       additional    bytes   Mode-specific data
```

Specifies the appearance of the card's "edge" (visible briefly during 3D
flip animations). For mode 2, payload after the first byte is a small
image (format auto-detected from magic bytes).

## 6. Decoder Algorithm

Pseudocode for a conforming decoder:

```
function decode(bytes):
    if bytes[0:4] != "XFLP":
        fail("Not an xflip file")

    major = bytes[4]
    minor = bytes[5]
    if major > SUPPORTED_MAJOR:
        warn("File version newer than supported; trying anyway")

    offset = 6
    chunks = []
    head_seen = false
    frnt_seen = false
    back_seen = false

    while offset < len(bytes):
        type = bytes[offset:offset+4]
        length = read_uint32_be(bytes[offset+4:offset+8])
        payload = bytes[offset+8 : offset+8+length]
        crc = read_uint32_be(bytes[offset+8+length : offset+12+length])

        if compute_crc32(type + payload) != crc:
            if is_critical(type):
                fail("CRC mismatch on critical chunk: " + type)
            else:
                warn("CRC mismatch on ancillary chunk: " + type)
                offset += 12 + length
                continue

        if type == "HEAD":
            if head_seen: fail("Duplicate HEAD")
            if len(chunks) != 0: fail("HEAD must be first chunk")
            parse_head(payload)
            head_seen = true

        elif type == "FRNT":
            frnt_seen = true
            store_front(payload)

        elif type == "BACK":
            if not frnt_seen: fail("BACK before FRNT")
            back_seen = true
            store_back(payload)

        elif type == "ENDX":
            if not (head_seen and frnt_seen and back_seen):
                fail("File ended before all required chunks present")
            return success

        elif is_critical(type):
            fail("Unknown critical chunk: " + type)

        else:
            store_ancillary(type, payload)

        offset += 12 + length

    fail("Reached end of file without ENDX chunk")
```

## 7. Encoder Guidelines

Conforming encoders SHOULD:

1. Always emit chunks in canonical order: `HEAD`, `META` (if present),
   other ancillary chunks, `FRNT`, `BACK`, `ENDX`.
2. Compute and write correct CRC32 for every chunk.
3. Use the most efficient image format for the content (e.g., AVIF or WebP
   for photographic content, PNG for line art with transparency).
4. Ensure decoded image dimensions match `HEAD.width` and `HEAD.height`.
5. Use UTF-8 with no BOM for all JSON payloads.
6. Generate a `tHmb` chunk for files larger than 256 KB to enable fast preview.

## 8. Security Considerations

### 8.1 Malicious Image Payloads

Because xflip embeds standard image formats, it inherits all
vulnerabilities of those formats. Decoders MUST treat `FRNT` and `BACK`
payloads as untrusted input and pass them through the same hardened image
decoders used for normal PNG/JPEG/WebP files.

### 8.2 Decompression Bombs

Decoders SHOULD enforce maximum dimensions and total decoded pixel count
to prevent memory exhaustion attacks. Recommended defaults: max 8192×8192
per face, max 200 MB total decoded memory.

### 8.3 CRC32 Is Not Cryptographic

CRC32 detects accidental corruption only. Files requiring authenticity
guarantees MUST use the `sIgn` chunk.

### 8.4 Metadata Injection

`META` chunk JSON is untrusted. Applications rendering metadata MUST
escape it appropriately for their context (HTML, terminal, etc.).

## 9. File Type Detection

To detect an xflip file:

1. **By extension:** `.xflip` (case-insensitive)
2. **By magic bytes:** First 4 bytes equal `58 46 4C 50` ("XFLP")
3. **By MIME type:** `image/x-flip` (provisional), `image/vnd.xflip` (target)

Magic byte detection is the authoritative method. Files should be detected
as xflip regardless of extension.

## 10. Worked Example: Minimal Valid File

A minimal xflip file with one tiny PNG on each side might be structured as:

```
Offset  Bytes (hex)                         Meaning
------  ----------------------------------  ------------------------------
0x0000  58 46 4C 50                         "XFLP" magic
0x0004  01 00                               Version 1.0

0x0006  48 45 41 44                         "HEAD" chunk type
0x000A  00 00 00 0C                         Length: 12 bytes
0x000E  00 00 00 40                         width = 64
0x0012  00 00 00 40                         height = 64
0x0016  01                                  front_format = PNG
0x0017  01                                  back_format = PNG
0x0018  00                                  flip_axis = horizontal
0x0019  00                                  flags = 0
0x001A  XX XX XX XX                         CRC32

0x001E  46 52 4E 54                         "FRNT" chunk type
0x0022  00 00 00 ??                         Length of PNG bytes
0x0026  89 50 4E 47 0D 0A 1A 0A ...         Complete PNG file bytes
...     XX XX XX XX                         CRC32

...     42 41 43 4B                         "BACK" chunk type
...     ...                                 Length + PNG bytes + CRC32

...     45 4E 44 58                         "ENDX" chunk type
...     00 00 00 00                         Length: 0
...     XX XX XX XX                         CRC32 of "ENDX"
```

## 11. Versioning

- **Major version bump** (1.x → 2.x): Breaking changes. New critical chunks
  that old decoders cannot ignore, or changes to existing critical chunk
  layouts.
- **Minor version bump** (1.0 → 1.1): Backward-compatible additions. New
  ancillary chunks, new reserved values in existing fields.

Decoders SHOULD accept any minor version within their supported major version.

## 12. Reference Implementations

A reference encoder and decoder in JavaScript is available at
[repository URL TBD]. Implementations in other languages are welcome.

## 13. License

This specification is released under [CC0 / public domain / TBD].
Anyone may implement xflip without permission or royalty.

## Appendix A: Chunk Type Code Registry

Reserved chunk type codes for version 1.x:

| Code | Status   | Description           |
| ---- | -------- | --------------------- |
| HEAD | Critical | File header           |
| FRNT | Critical | Front image data      |
| BACK | Critical | Back image data       |
| ENDX | Critical | End-of-file marker    |
| META | Ancillary| Metadata (JSON)       |
| tHmb | Ancillary| Thumbnail             |
| fLip | Ancillary| Animation hints       |
| sIgn | Ancillary| Digital signature     |
| eDge | Ancillary| Card edge appearance  |

To register new chunk types, submit a proposal to the spec repository.
