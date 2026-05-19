# xflip Format Specification

**Version:** 0.2 (Draft)
**Format version:** 1.1
**Status:** Experimental
**Extension:** `.xflip`
**MIME Type:** `image/x-flip` (provisional), `image/vnd.xflip` (target)
**Pronunciation:** "ex-flip" or "x-flip"

This document is **self-contained**. v0.1 is retained for historical
reference only; v0.2 is the authoritative spec for format version 1.1.

## Changes from v0.1

- Added Section 5.6 — `fLyr` and `bLyr` chunks for layered effects
- Added Section 5.7 — `hEfx` chunk for holographic effect parameters
- Added Section 5.7.1 — Parameter precedence rules
- Added Appendix B — Effect Type Registry
- Format version bumped from 1.0 to 1.1 (minor; backward compatible)
- v1.0 decoders MUST be able to read v1.1 files (ignoring new ancillary chunks)
- Fixed: `response_len` widened from uint8 to uint16 (allows >255-byte JSON)
- Clarified: Section 3.3 — Appendix A registry is authoritative for
  criticality; case-of-first-letter is a fallback for unknown types only.
  Resolves the apparent conflict between the case rule and `META` being
  listed as Ancillary.

## 1. Overview

xflip is a container image format for two-sided visual content. A single `.xflip`
file holds a **front** image, a **back** image, and optional metadata, including
**layered effects** for holographic and material-response rendering. The format
is designed for digital trading cards, badges, collectible visuals, and any
two-sided visual artifact.

xflip is **not a codec**. Image data inside the container uses existing
well-supported formats (PNG, JPEG, WebP, AVIF, JXL). xflip provides only the
structural wrapper, semantic meaning, and effect orchestration.

## 2. Design Principles

1. **Container, not codec.** Delegate compression and pixel encoding to
   established formats.
2. **Chunk-based extensibility.** New features can be added via new chunk types
   without breaking existing decoders.
3. **Graceful degradation.** Decoders may safely ignore unrecognized
   ancillary chunks. Files with rich effects still display sensibly on
   simple viewers.
4. **No prescribed rendering.** The spec defines data and intent, not
   presentation. Viewers choose their own rendering engine (CSS, WebGL,
   native APIs).
5. **Composite + enhancement model.** `FRNT` and `BACK` always contain a
   complete, flat representation. `fLyr` and `bLyr` provide optional
   enhanced rendering data.
6. **Big-endian throughout.** All multi-byte integers are big-endian.

## 3. File Structure

```
+----------------------+
| Signature (6 bytes)  |
+----------------------+
| Chunk 1              |
+----------------------+
| ...                  |
+----------------------+
| ENDX chunk           |
+----------------------+
```

### 3.1 Signature

```
Offset  Bytes              Meaning
------  -----------------  -------------------------
0x00    58 46 4C 50        ASCII "XFLP" — magic bytes
0x04    01                 Major version (currently 1)
0x05    01                 Minor version (currently 1 for v0.2)
```

Decoders MUST reject files that do not begin with `XFLP`. Decoders MAY warn
but SHOULD attempt to parse files with a higher major version than they
support — they parse critical chunks they recognize and skip unknown ones.

### 3.2 Chunks

All content after the signature is organized into chunks:

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
xor-out 0xFFFFFFFF), computed over `TYPE + PAYLOAD`. Decoders MUST validate
CRC32 of critical chunks; MAY validate ancillary chunks.

### 3.3 Critical vs Ancillary Chunks

Criticality is determined by the **registry in Appendix A**, which is
authoritative. The case-of-first-letter rule below is a fallback that
applies **only to unknown chunk types not present in Appendix A**.

- **Registry (authoritative):** Each chunk type listed in Appendix A is
  marked Critical or Ancillary explicitly.
- **Fallback rule for unknown types:**
  - **Uppercase first letter** → Critical. Decoder MUST fail.
  - **Lowercase first letter** → Ancillary. Decoder MAY safely ignore.

Critical chunks in v1.1: `HEAD`, `FRNT`, `BACK`, `ENDX`.
Ancillary chunks in v1.1: `META`, `tHmb`, `fLip`, `sIgn`, `eDge`, `fLyr`, `bLyr`, `hEfx`.

**Note:** `META` begins with an uppercase letter but is explicitly registered
as Ancillary in Appendix A; the registry wins. Future registered types
SHOULD follow the case rule to avoid this kind of override, but
implementations MUST consult the registry first.

### 3.4 Chunk Ordering

Strict MUST rules (decoders MUST reject violations on critical chunks):

1. `HEAD` MUST be the first chunk after the signature.
2. `ENDX` MUST be the final chunk.
3. `FRNT` MUST appear before `BACK`.

Strict MUST rules for v1.1 ancillary effect chunks (decoders MUST reject
violations; encoders MUST produce in this order):

4. `fLyr`, if present, MUST appear after `FRNT` and before `BACK`.
5. `bLyr`, if present, MUST appear after `BACK` and before `ENDX`.
6. `hEfx`, if present, MUST appear after `bLyr` (or `BACK` if no `bLyr`) and before `ENDX`.

SHOULD rules (decoders SHOULD accept any order; encoders SHOULD prefer):

7. `META`, if present, SHOULD appear before `FRNT`.
8. Other ancillary chunks (`tHmb`, `fLip`, `sIgn`, `eDge`) MAY appear in any
   valid position between `HEAD` and `ENDX`.

**Backward compatibility note:** v1.0 files written under v0.1 ordering rules
(which were entirely SHOULD-level) remain valid under v1.1 because v1.0 files
contain no `fLyr`/`bLyr`/`hEfx` chunks.

## 4. Critical Chunks

### 4.1 HEAD — File Header

Structural metadata required to decode the file.

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

Renderers MAY ignore the suggestion and use their own preference.

**Flags bit field (bit 0 = LSB):**

| Bit | Name           | Meaning                                              |
| --- | -------------- | ---------------------------------------------------- |
| 0   | DEFAULT_BACK   | If set, viewer should show BACK first by default     |
| 1   | NO_FLIP_ANIM   | Hint: viewer should not animate flip (instant swap)  |
| 2-7 | Reserved       | Must be 0 in version 1.1                             |

### 4.2 FRNT — Front Image Data

Raw bytes of the front image, encoded using the format specified in
`HEAD.front_format`. The payload is a complete, standalone image file
including its own signature and all internal structures. Extracting the FRNT
chunk payload and saving it to disk produces a valid standalone image file.

The `FRNT` chunk MUST always contain a complete, flat representation of the
front face suitable for simple viewers that ignore `fLyr`. Encoders SHOULD
pre-compose all layers with neutral input (e.g., mouse at center) when
generating the FRNT payload for layered cards.

### 4.3 BACK — Back Image Data

Identical to FRNT but contains the back image. The decoded back image
dimensions MUST equal `HEAD.width` and `HEAD.height`. The `BACK` chunk MUST
always contain a complete, flat representation of the back face.

### 4.4 ENDX — End Marker

**Payload size:** 0 bytes (LENGTH = 0).

Marks the logical end of the file. Decoders MUST stop parsing after reading
ENDX. Any bytes after ENDX are not part of the xflip file (though tools MAY
use trailing space for sidecar data; this is outside the xflip spec).

The CRC32 of ENDX is computed over just the 4 bytes `"ENDX"` (no payload).

## 5. Standard Ancillary Chunks

### 5.1 META — Metadata

**Payload:** UTF-8 encoded JSON object (RFC 8259, no BOM).

Reserved keys:

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
this list; they SHOULD nest them under `custom`.

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

Typically 128×128 to 256×256 pixels.

### 5.3 fLip — Animation Hints

**Payload:** UTF-8 JSON object.

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
Offset    Size      Field         Type    Description
------    --------  ------------  ------  ---------------------------------
0x00      1         algorithm     uint8   Signature algorithm code
0x01      2         pubkey_len    uint16  Length of public key in bytes
0x03      N         pubkey        bytes   Public key
0x03+N    2         sig_len       uint16  Length of signature in bytes
0x05+N    M         signature     bytes   Signature bytes
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

For mode 2, payload after the first byte is a small image (format
auto-detected from magic bytes).

### 5.6 fLyr / bLyr — Layered Effect Data

**New in v1.1.** These chunks describe additional layers that enhance the
flat image in `FRNT` (for `fLyr`) or `BACK` (for `bLyr`). Viewers that
support layered rendering compose these layers over the base image with
real-time response to user input (mouse position, device tilt, etc.).

Viewers that do not support layered effects MUST safely ignore these chunks
and render the flat image from `FRNT`/`BACK`.

**Payload structure:**

```
Offset  Size      Field             Description
------  --------  ----------------  ---------------------------------
0x00    1         version           Layer format version (currently 1)
0x01    1         layer_count       Number of layers (1-255; 0 = invalid)
0x02    2         flags             Bit field (reserved, must be 0)
0x04    ...       layer_records     Layer records (see below)
```

**`layer_count = 0` is invalid.** Decoders MUST reject the chunk (warning
for ancillary, do not treat layers as present).

Each **layer record** has the following structure:

```
Offset       Size  Field             Description
-----------  ----  ----------------  ---------------------------------
0x00         1     layer_id          Unique ID within this chunk (0-255)
0x01         1     format            Image format code (same as HEAD)
0x02         1     blend_mode        Blend mode code (see Section 5.6.1)
0x03         1     effect_type_len   Length of effect_type string (1-255)
0x04         N     effect_type       UTF-8 string identifying effect type
0x04+N       1     opacity           0-255 (255 = fully opaque)
0x05+N       1     z_order           Stacking order, lower = bottom (0-255)
0x06+N       2     response_len      Length of response JSON (uint16 BE)
0x08+N       M     response_json     UTF-8 JSON object (response parameters)
0x08+N+M     4     data_length       Length of image data in bytes (uint32 BE)
0x0C+N+M     K     image_data        Encoded image data
```

**Field details:**

- **layer_id**: Unique within this chunk only. Used for referencing layers
  in `hEfx` parameters and debugging.
- **format**: Image format code identical to `HEAD.front_format` values.
  For mask layers, PNG with single-channel is recommended.
- **blend_mode**: How this layer composites over previous layers
  (see Section 5.6.1).
- **effect_type_len**: MUST be ≥ 1. Decoders MUST reject layer records with
  `effect_type_len = 0`.
- **effect_type**: Non-empty UTF-8 string identifying the semantic effect
  category. Standard values defined in Appendix B. Implementations MAY
  support custom types with prefix `x-` (e.g., `x-mystudio-prism`).
- **opacity**: Multiplier on layer's alpha channel during composition.
- **z_order**: Stacking order. Layers with lower z_order are drawn first
  (bottom). When two layers have equal z_order, order in chunk decides.
- **response_len**: uint16 big-endian. Max 65535 bytes per layer.
- **response_json**: Per-layer response parameters. See Section 5.6.2.
  May be empty JSON `{}` (response_len = 2).
- **image_data**: A complete image file in the specified format (same
  semantics as `FRNT`).

#### 5.6.1 Blend Modes

| Code      | Mode        | Description                                     |
| --------- | ----------- | ----------------------------------------------- |
| 0x00      | normal      | Standard alpha compositing                      |
| 0x01      | multiply    | Multiplies pixel values                         |
| 0x02      | screen      | Inverse multiply; brightens                     |
| 0x03      | overlay     | Multiply or screen depending on base luminance  |
| 0x04      | add         | Additive blending (linear add)                  |
| 0x05      | color_dodge | Brightens base based on layer                   |
| 0x06      | color_burn  | Darkens base based on layer                     |
| 0x07      | soft_light  | Soft contrast modification                      |
| 0x08      | hard_light  | Harsh contrast modification                     |
| 0x09      | difference  | Absolute difference of channels                 |
| 0x0A      | luminosity  | Layer's luma over base's hue/saturation         |
| 0x0B-0xFE | (reserved)  | Reserved for future blend modes                 |
| 0xFF      | custom      | Mode defined in response_json `custom_blend`    |

Blend modes follow W3C Compositing Level 1 spec where applicable.

#### 5.6.2 Response Parameters (response_json)

The `response_json` field is a UTF-8 JSON object describing how the layer
reacts to viewing input. Schema is **open**, but these keys have defined meaning:

| Key                   | Type    | Description                                        |
| --------------------- | ------- | -------------------------------------------------- |
| `input_source`        | string  | "mouse", "tilt", "time", "auto" (default "mouse")  |
| `response_axis`       | string  | "x", "y", "xy", "radial", "angle", "none"          |
| `response_curve`      | string  | "linear", "ease", "ease-in", "ease-out", "wave", "step" |
| `intensity`           | number  | Strength multiplier, 0.0-2.0 (default 1.0)         |
| `offset_max_x`        | number  | Max horizontal offset in % of layer size           |
| `offset_max_y`        | number  | Max vertical offset in % of layer size             |
| `rotation_max`        | number  | Max rotation in degrees                            |
| `scale_range`         | array   | [min, max] scale during response                   |
| `phase_offset`        | number  | Phase offset for time-based responses (0.0-1.0)    |
| `frequency`           | number  | Frequency for time/wave responses (Hz)             |
| `mask_threshold`      | number  | For mask layers: threshold for visibility (0.0-1.0)|
| `custom`              | object  | Implementation-specific extensions                 |

All keys optional. Renderers MAY honor any subset.

**Example response_json for a holographic sweep layer:**

```json
{
  "input_source": "mouse",
  "response_axis": "xy",
  "response_curve": "linear",
  "intensity": 1.0,
  "offset_max_x": 50,
  "offset_max_y": 50
}
```

**Example for an idle sparkle animation:**

```json
{
  "input_source": "time",
  "response_axis": "none",
  "frequency": 0.5,
  "intensity": 0.8
}
```

### 5.7 hEfx — Global Holographic Effect Parameters

**New in v1.1.** UTF-8 JSON object holding global effect parameters that
apply to the entire card (not per-layer). Applies to both faces unless
explicitly scoped.

**Defined keys:**

| Key                    | Type    | Description                                          |
| ---------------------- | ------- | ---------------------------------------------------- |
| `tilt_sensitivity`     | number  | Global multiplier for 3D tilt response (0.0-2.0)     |
| `tilt_max_angle`       | number  | Maximum tilt angle in degrees (default 25)           |
| `perspective`          | integer | CSS-style perspective value in pixels (default 1500) |
| `ambient_intensity`    | number  | Idle animation intensity when no input (0.0-1.0)     |
| `card_material`        | string  | "matte", "glossy", "holographic", "foil", "prismatic"|
| `surface_finish`       | string  | "smooth", "linen", "etched", "embossed"              |
| `face_scope`           | object  | Override parameters per face (see below)             |
| `interaction_modes`    | array   | Supported interaction modes (see below)              |
| `fallback_behavior`    | string  | "static" or "auto-animate" if no input available     |
| `custom`               | object  | Implementation-specific extensions                   |

**face_scope object structure:**

```json
{
  "front": { /* override params for front face */ },
  "back":  { /* override params for back face */ }
}
```

**interaction_modes values:**

| Value         | Description                                          |
| ------------- | ---------------------------------------------------- |
| `mouse`       | Mouse position over the card                         |
| `tilt`        | Device orientation (gyroscope)                       |
| `touch_drag`  | Touch drag gesture                                   |
| `auto`        | Automatic continuous animation                       |
| `scroll`      | Scroll position on page                              |
| `audio`       | Audio amplitude (reactive)                           |

If `interaction_modes` is omitted, viewer SHOULD default to
`["mouse", "tilt", "auto"]` in that priority order.

**Example complete hEfx:**

```json
{
  "tilt_sensitivity": 1.0,
  "tilt_max_angle": 25,
  "perspective": 1500,
  "ambient_intensity": 0.4,
  "card_material": "holographic",
  "surface_finish": "smooth",
  "interaction_modes": ["mouse", "tilt", "auto"],
  "fallback_behavior": "auto-animate"
}
```

#### 5.7.1 Parameter Precedence

When the same conceptual parameter exists at multiple scopes, the renderer
MUST resolve in this priority order (highest wins):

1. **Per-layer `response_json`** values (most specific)
2. **`hEfx.face_scope.front` / `hEfx.face_scope.back`** values (face-specific override)
3. **`hEfx` top-level** values (card-wide default)
4. **Renderer built-in defaults** (least specific)

For numeric parameters that **combine** rather than override (e.g., global
`tilt_sensitivity` modulating per-layer `intensity`), the combination rule is
**multiplicative**:

```
effective_response = layer.intensity
                   * (face_scope.tilt_sensitivity ?? hEfx.tilt_sensitivity ?? 1.0)
```

The following keys **combine multiplicatively** with their per-layer
counterparts (rather than override):

- `hEfx.tilt_sensitivity` × per-layer `intensity`
- `hEfx.ambient_intensity` × per-layer `intensity` (when input_source = "auto")

All other keys at higher scopes **override** lower scopes when present.

Renderers MUST clamp the final effective value to the per-key valid range
(e.g., `intensity` ∈ [0.0, 2.0]) after combination.

## 6. Decoder Algorithm

Pseudocode for a v1.1 conforming decoder:

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


function parse_layer_chunk(payload):
    version = payload[0]
    if version != 1:
        warn("Unknown layer chunk version, skipping")
        return null

    layer_count = payload[1]
    if layer_count == 0:
        warn("Layer chunk with zero layers; rejecting")
        return null
    flags = read_uint16_be(payload[2:4])
    layers = []
    offset = 4

    for i in range(layer_count):
        layer = {}
        layer.id = payload[offset]
        layer.format = payload[offset + 1]
        layer.blend_mode = payload[offset + 2]
        et_len = payload[offset + 3]
        if et_len == 0:
            warn("Empty effect_type; rejecting layer record")
            return null
        layer.effect_type = decode_utf8(payload[offset+4 : offset+4+et_len])
        cursor = offset + 4 + et_len
        layer.opacity = payload[cursor]
        layer.z_order = payload[cursor + 1]
        rj_len = read_uint16_be(payload[cursor+2 : cursor+4])
        layer.response = parse_json(payload[cursor+4 : cursor+4+rj_len])
        cursor += 4 + rj_len
        data_length = read_uint32_be(payload[cursor : cursor+4])
        layer.image_data = payload[cursor+4 : cursor+4+data_length]
        cursor += 4 + data_length
        layers.append(layer)
        offset = cursor

    return layers
```

After parsing layer chunks, the renderer SHOULD:

1. Sort layers by `z_order` (ascending).
2. For each layer, decode `image_data` using the appropriate format decoder.
3. Apply the layer over the base composite, using `blend_mode`, `opacity`,
   and the response calculated from current input + `response` parameters,
   resolved per Section 5.7.1 precedence rules.

## 7. Renderer Guidelines

Renderers supporting v1.1 layered effects SHOULD:

1. **Always render `FRNT`/`BACK` as base.** Layered effects compose ON TOP of
   the base image, not replace it.
2. **Honor `z_order`.** Lower z_order draws first.
3. **Implement at least the standard effect types** from Appendix B.
4. **Fall back gracefully.** If an `effect_type` is unrecognized, render the
   layer with normal blend mode and no response (static overlay).
5. **Respect `interaction_modes`.** If the device has no gyroscope, fall back
   to next mode in the list.
6. **Provide reduced-motion respect.** If user has set
   `prefers-reduced-motion`, disable response animations.
7. **Honor Section 5.7.1 precedence** when resolving effective parameters.

## 8. Encoder Guidelines

Encoders creating v1.1 files with layered effects SHOULD:

1. **Always include `FRNT`/`BACK`.** These MUST contain a flat, complete
   representation suitable for simple viewers. Generate this by pre-composing
   all layers with neutral input (e.g., mouse at center).
2. **Set minor version to 1.** Bump the minor version byte in the signature.
3. **Order layers by `z_order` in the chunk.** Not required, but makes
   debugging easier.
4. **Use mask format for masks.** Sparkle masks, foil masks, etc. should use
   PNG with single-channel grayscale or alpha-only encoding for size.
5. **Validate effect types.** Use standard types from Appendix B when possible.
6. **Use UTF-8 with no BOM** for all JSON payloads.
7. **Generate a `tHmb` chunk** for files larger than 256 KB.

## 9. Security Considerations

### 9.1 Malicious Image Payloads

xflip embeds standard image formats and inherits all their vulnerabilities.
Decoders MUST treat `FRNT`, `BACK`, and layer `image_data` payloads as
untrusted input and pass them through hardened image decoders.

### 9.2 Decompression Bombs

Decoders SHOULD enforce maximum dimensions and total decoded pixel count.
Recommended defaults: max 8192×8192 per face, max 200 MB total decoded
memory for single-image files, max 500 MB across all layers for layered
files.

### 9.3 Layer Count Limits

Decoders SHOULD enforce a maximum layer count per face (recommended: 32).
Files exceeding this should be rejected or truncated with a warning.

### 9.4 Response Parameter Validation

JSON in `response_json` and `hEfx` is untrusted. Implementations MUST clamp
all numeric values to safe ranges and validate string enum values against
known sets.

### 9.5 Custom Effect Types

Custom effect types with prefix `x-` MUST NOT trigger execution of arbitrary
code. They are opaque identifiers only; implementations dispatch based on a
pre-registered allow-list.

### 9.6 CRC32 Is Not Cryptographic

CRC32 detects accidental corruption only. Files requiring authenticity
guarantees MUST use the `sIgn` chunk.

### 9.7 Metadata Injection

`META` chunk JSON is untrusted. Applications rendering metadata MUST escape
it appropriately for their context (HTML, terminal, etc.).

## 10. File Type Detection

1. **By extension:** `.xflip` (case-insensitive)
2. **By magic bytes:** First 4 bytes equal `58 46 4C 50` ("XFLP")
3. **By MIME type:** `image/x-flip` (provisional), `image/vnd.xflip` (target)

Magic byte detection is the authoritative method.

## 11. Versioning

- **Version 1.0**: Original format with `FRNT`, `BACK`, basic metadata.
- **Version 1.1**: Adds `fLyr`, `bLyr`, `hEfx` for layered holographic effects.
  Backward compatible: v1.0 decoders ignore new ancillary chunks.

- **Major version bump** (1.x → 2.x): Breaking changes. New critical chunks
  that old decoders cannot ignore, or changes to existing critical chunk
  layouts.
- **Minor version bump** (1.0 → 1.1): Backward-compatible additions. New
  ancillary chunks, new reserved values in existing fields.

Decoders SHOULD accept any minor version within their supported major version.

## Appendix A: Chunk Type Code Registry

| Code | Status   | Since | Description           |
| ---- | -------- | ----- | --------------------- |
| HEAD | Critical | 1.0   | File header           |
| FRNT | Critical | 1.0   | Front image data      |
| BACK | Critical | 1.0   | Back image data       |
| ENDX | Critical | 1.0   | End-of-file marker    |
| META | Ancillary| 1.0   | Metadata (JSON)       |
| tHmb | Ancillary| 1.0   | Thumbnail             |
| fLip | Ancillary| 1.0   | Animation hints       |
| sIgn | Ancillary| 1.0   | Digital signature     |
| eDge | Ancillary| 1.0   | Card edge appearance  |
| fLyr | Ancillary| 1.1   | Front layered effects |
| bLyr | Ancillary| 1.1   | Back layered effects  |
| hEfx | Ancillary| 1.1   | Global effect params  |

## Appendix B: Effect Type Registry

Standard effect type strings for use in `effect_type` field of layer records.
Implementations supporting layered effects SHOULD support all standard types.

### B.1 Static Effects

| Type             | Description                                         |
| ---------------- | --------------------------------------------------- |
| `base`           | Base artwork; typically z_order 0; usually no response |
| `static_overlay` | Static decorative overlay, no response              |

### B.2 Response Effects (react to input)

| Type             | Description                                         |
| ---------------- | --------------------------------------------------- |
| `holo_sweep`     | Rainbow gradient that sweeps across surface         |
| `specular`       | Bright highlight following input position           |
| `sparkle`        | Glitter dots that shift/brighten with input         |
| `parallax`       | Layer that shifts position based on viewing angle   |
| `lenticular`     | Discrete state switching (like real lenticular)     |
| `prism`          | Spectral light split simulation                     |
| `foil`           | Metallic foil with anisotropic reflection           |
| `etched`         | Etched/embossed surface with directional shading    |
| `glitter_rain`   | Animated falling sparkles                           |
| `aurora`         | Slow waving rainbow patterns (no direct response)   |

### B.3 Border/Frame Effects

| Type             | Description                                         |
| ---------------- | --------------------------------------------------- |
| `border_foil`    | Holographic border that rotates with viewing angle  |
| `border_glow`    | Soft luminous border                                |

### B.4 Mask Layers

Mask layers use the same effect types as response effects but mark areas
where the effect applies, rather than providing visual data themselves.
Indicate mask role via `response_json.mask_threshold` being present.

### B.5 Custom Types

Implementations MAY define custom effect types with prefix `x-`:

- `x-vendor-effectname` format (e.g., `x-pokemon-rainbow-rare`)
- Unrecognized custom types render as `static_overlay`

## Appendix C: Worked Example — Holographic Trading Card

A Zapdos card with the full holographic treatment might be structured as:

```
0x0000  XFLP signature + version 1.1
0x0006  HEAD chunk: 320×460, PNG/PNG, horizontal flip
0x002?  META chunk: { "title": "Zapdos ex", "rarity": "ultra rare", ... }
0x0???  FRNT chunk: complete pre-composed PNG (flat fallback)
0x0???  fLyr chunk:
        - Layer 0 (z=0): base_artwork (PNG, normal blend, effect_type="base")
        - Layer 1 (z=10): holo_mask (PNG, color_dodge blend, effect_type="holo_sweep",
          response: { input_source: "mouse", response_axis: "xy", intensity: 1.0 })
        - Layer 2 (z=20): sparkle_pattern (PNG, screen blend, effect_type="sparkle",
          response: { input_source: "mouse", response_axis: "radial", intensity: 0.8 })
        - Layer 3 (z=30): specular_shape (PNG, overlay blend, effect_type="specular",
          response: { input_source: "mouse", response_axis: "xy", intensity: 0.7 })
        - Layer 4 (z=40): border_foil (PNG, normal blend, effect_type="border_foil",
          response: { input_source: "mouse", response_axis: "angle", intensity: 1.0 })
0x0???  BACK chunk: complete pre-composed PNG of card back
0x0???  bLyr chunk: (optional layered effects for back face)
0x0???  hEfx chunk: {
          "tilt_sensitivity": 1.0,
          "card_material": "holographic",
          "interaction_modes": ["mouse", "tilt", "auto"]
        }
0x0???  ENDX chunk
```

A simple viewer (v1.0 decoder, or v1.1 decoder without layer support) opens
this file and sees the flat `FRNT`/`BACK` images — the card displays correctly
as a regular flippable card.

A full viewer (v1.1 decoder with layer support) decodes the `fLyr`/`bLyr`/`hEfx`
chunks and renders the card with full holographic response to mouse/tilt.

## Appendix D: Minimal Valid File (v1.0 byte layout)

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

## License

This specification is released under CC0 / public domain.
Anyone may implement xflip without permission or royalty.
