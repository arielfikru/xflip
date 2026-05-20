# xflip Studio + Pose Rig — RFC / Guidelines

> Status: **draft**. Scope: design rules + implementation plan for a Live2D-lite
> studio that authors `.xflip` cards with per-layer pose-driven transforms.
> Not yet on the phase map; this RFC defines what entering P9 would mean.

## 1. Motivation

Current xflip = static layered card with parallax (P6.2). Add **pose rig**:
per-layer affine transform interpolated from viewer angle. Authoring tool
= **xflip-studio** web app (drop PNG → arrange → set keyframes per pose →
export `.xflip`).

Outcome: cards feel alive (head turn, breath, blink-via-opacity, hair sway)
without mesh-warp complexity or runtime deps.

## 2. Non-goals

- **No mesh deformation.** Affine only (translate, rotate, scale, opacity).
- **No skeletal rigging / bones.** Each layer independent.
- **No physics simulation.** Pose values are authored keyframes, interpolated.
- **No audio / lipsync.** Visual only.
- **No editor on mobile.** Studio is desktop-class.

If a future v2 needs mesh warp, that's a separate spec bump.

## 3. Format extension (xflip 1.1 → 1.2)

### 3.1 New chunk: `POSE` (per layer)

Optional. Appears inside a layer's chunk group (after the image data,
before next layer). Decoder lacking knowledge of `POSE` MUST skip
(ancillary chunk, lowercase first letter convention applies).

Grid model: **fixed bilinear grid**, 3×3 or 5×5. No continuous scattered
keyframes in v1.2. Grid axes = `tiltX` ∈ [-1, +1], `tiltY` ∈ [-1, +1]
(normalized; runtime scales by `tilt_max_angle` from HEAD).

### 3.2 Layout

```
0x00  1     grid_size      3 or 5 (only valid values for v1.2)
0x01  1     reserved       0
0x02  N*5*4 keyframes      N = grid_size*grid_size, each = 5× float32 BE:
                           tx, ty, rotation_rad, scale, opacity
```

Per-keyframe = 20 byte. Grid 3×3 = 180 byte. Grid 5×5 = 500 byte.
Plus 12-byte chunk frame (type + len + CRC).

### 3.3 Defaults / semantics

- Origin (tiltX=0, tiltY=0) keyframe = neutral pose. Layer's base
  `position_x/y` from layer header is the **anchor**; pose `tx/ty` is
  **offset from anchor**.
- `scale` is uniform; multiplied with any base scale.
- `opacity` is multiplicative with layer's base `opacity`.
- `rotation_rad` is around layer center (not anchor).
- Interpolation: **bilinear** over the 4 nearest grid cells. Clamp
  outside grid.

### 3.4 Backward compatibility

- v1.2 = additive only. v1.1 decoder reads layers, skips `POSE` chunk,
  renders static (or with existing parallax).
- HEAD format version field bumps minor 0x01 → 0x02.
- No breaking changes to chunk parser or CRC.

## 4. Runtime (xflip-viewer)

### 4.1 Interpolator

```ts
function sampleAffine(
  grid: AffineKeyframe[],
  gridSize: 3 | 5,
  nx: number, // normalized tiltX in [-1, 1]
  ny: number,
): AffineKeyframe
```

Bilinear. ~50 LOC. No allocations in hot path (write into preallocated
struct).

### 4.2 Compose

For each layer with POSE:

```
final_transform = base_layer_transform
  * translate(pose.tx, pose.ty)
  * rotate(pose.rotation_rad)
  * scale(pose.scale)
final_opacity = base_opacity * pose.opacity
```

Apply via CSS `transform` on the existing per-layer DOM node. No new
render path. Reuses P6.2 pointer-relative angle vars.

### 4.3 Driver

Reuse existing `tiltX/tiltY` source. No new input mode. Gyro path
already wired in viewer; it feeds the same vars.

### 4.4 Cost budget

- Sample 12 layers × 5 floats = 60 multiplications + 60 adds per frame.
- Stay <0.05 ms / frame on mid-tier mobile. Confirmed feasible.

## 5. Studio app (`apps/studio`)

### 5.1 Tech

- Vite + React (consistent with `apps/playground`).
- Canvas: **plain DOM + CSS transforms**. Same renderer xflip-viewer
  uses. No konva / pixi (keeps studio output = exactly what viewer
  shows). Compositing accuracy > editor convenience.
- State: zustand or React reducer. No Redux.
- Persistence: IndexedDB autosave of in-progress project (JSON +
  per-layer Blob). Export = `.xflip` via `@xflip/core`.

### 5.2 UI regions

```
┌─────────────────────────────────────────────────────────┐
│ Top bar: project name · save · export · pose-grid mode  │
├──────────┬─────────────────────────────┬────────────────┤
│ Layers   │ Canvas (live preview)       │ Inspector      │
│ panel    │  - drag layers              │  - position    │
│  - add   │  - bounding box             │  - rotation    │
│  - z     │  - origin / anchor handle   │  - opacity     │
│  - mask  │                             │  - blend mode  │
│  - lock  │                             │                │
│          │                             │                │
├──────────┴─────────────────────────────┴────────────────┤
│ Pose grid: 3×3 or 5×5 cells. Click cell → that pose is  │
│ active. Drag layer in canvas → write transform to cell. │
│ Cell shows tiny diff vs neutral.                        │
└─────────────────────────────────────────────────────────┘
```

### 5.3 Editing flow

1. **Load PNGs.** Drag-drop into layers panel; one PNG = one layer.
   Auto-detect codec for export (default WebP lossy q85, fallback PNG
   if alpha demands lossless).
2. **Arrange neutral pose** (center grid cell). Drag layers to place;
   set z-order; set blend mode if effect layer.
3. **Pick pose cell** (e.g., top-right = `tiltX=+1, tiltY=-1`). Move
   layer → studio writes delta into that cell.
4. **Preview by moving pointer over canvas** = real bilinear
   interpolation. WYSIWYG.
5. **Export** → `.xflip` 1.2.

### 5.4 Constraints / guardrails

- Lock origin keyframe value when user is editing other cells (prevent
  accidental neutral-pose drift).
- "Copy from neutral" / "mirror X" buttons on the pose grid for symmetry.
- Per-layer toggle: "include POSE chunk" (small layers like background
  may stay static — save bytes).

## 6. File size targets

Card normal 8 layers @ 768², grid 3×3:

| Codec       | Total .xflip |
|-------------|--------------|
| PNG only    | 1.5 – 3 MB   |
| WebP q85    | **300 – 800 KB** |
| AVIF q60    | **200 – 500 KB** |

POSE chunk overhead = ~1.5 KB total at grid 3×3 / 4 KB at grid 5×5.
Always negligible vs image bytes.

Studio default export = **WebP q85**. AVIF as opt-in (encoder slower in
browser, but supported via `canvas.toBlob('image/avif')` in evergreen
2026).

## 7. Phase placement

Proposed: **P9 — xflip-studio** (after P7 docs, before or alongside P8
launch). Sub-tasks:

- P9.1 — POSE chunk spec frozen + decoder support in `xflip-core` (no
  encoder API change beyond passing `pose` field on layer input).
- P9.2 — Viewer interpolator + render compose.
- P9.3 — Studio app skeleton (Vite, layout, layer panel, canvas).
- P9.4 — Drag-to-edit pose cells, bilinear preview.
- P9.5 — Export pipeline: layers → codec encode → `@xflip/core` encode
  → blob download.
- P9.6 — IndexedDB autosave + project import/export `.studio.json`.
- P9.7 — Sample card shipped with grid 3×3 pose (head-turn demo).

DoD P9: studio builds a head-turn card from 6 PNGs in under 3 minutes
without docs.

## 8. Non-decisions (defer)

- **Pose blending across multiple cards** (cross-fade): not v1.2.
- **Animation timeline / autoplay**: studio is rig editor, not
  animator. Punt.
- **Bone constraints (parent-child layer transforms)**: punt to v2.
- **Mesh / FFD warp**: explicit non-goal (Section 2).

## 9. Hard rules during implementation

- `xflip-core` stays zero runtime deps. POSE decode = vanilla DataView.
- No `Buffer` in core / viewer. `Uint8Array` only.
- POSE chunk type lowercase first letter (ancillary, optional).
- Decoder must skip unknown POSE grid_size (forward compat).
- Bilinear interp deterministic across implementations (no
  floating-point order-of-operations divergence in spec language).
- Studio NEVER mutates source PNG bytes when round-tripping a loaded
  `.xflip`. Re-encode only on user export.

## 10. Decisions (resolved 2026-05-20)

1. **POSE grid:** `3×3 only` in v1.2. 9 keyframe sufficient for
   head-turn / parallax / blink. 5×5 deferred to v1.3 on real demand.

2. **Default export codec:** `WebP q85`. Universal 2026, fast
   `canvas.toBlob` encode, alpha support. AVIF opt-in (slower browser
   encode, ~500 ms/layer). Power users can select AVIF manually.

3. **Studio placement:** Standalone `apps/studio`. Playground = read-only
   showcase. Studio = authoring tool with different state model and user.
   Merging creates confused app. Both use Vite + React + `@xflip/core`.

4. **Phase order:** P8 partial launch first (playground + viewer + CLI
   public). P9 studio = second wave. Prevents launch delay, gives xflip
   1.2 spec time to stabilize on post-P8 feedback before freezing POSE
   chunk format.
