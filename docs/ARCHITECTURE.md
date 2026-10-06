# Architecture

## Runtime flow

```
index.html ──loads──▶ src/main.js ──imports──▶ src/config.js
                         │
                         ├─ renderer, camera, OrbitControls, RoomEnvironment (studio IBL),
                         │  1 shadow-casting sun + back light, ShadowMaterial ground
                         ├─ GLTFLoader + MeshoptDecoder → assets/models/bike.glb
                         │     traverse meshes → slotFor(node, material) → shared material M[slot]
                         │     decals → white-alpha canvas textures, tinted by material color
                         │     every decal also gets a TextDecal (its own canvas for custom text)
                         │     generated tires, Deformers (cached vertex deformation), style shaders (looks.js)
                         │     adds 2 generated "semi-slick" torus tires (hidden by default)
                         ├─ renderer.compileAsync() → hide loader → flyTo('overview')
                         └─ UI built from SECTIONS → clicks update `state` → applyState() → writeHash()
```

## State

`DEFAULT` in `config.js` lists every key. Most keys are indexes into a control's `opts` array.
`height` is centimeters (a number). Text spots store strings: `name` (down tube, kept for old share links) and `<spot>Txt` for the others.
Only values that differ from `DEFAULT` go into the URL hash. Strings are sanitized on read and on input (`TEXT_CHARS`).

`opt(key)` in `main.js` finds any control by key, including the per-spot controls nested in a `spots` control.

## Control types (in `SECTIONS[].controls`)

| type | shape | price field |
|---|---|---|
| `color` | swatches; `opts: [name, hex \| null, price?]`; `null` means "match" | `opts[i][2]` |
| `seg` | segmented buttons; `opts: [label, price]` | `opts[i][1]` (may be negative) |
| `cards` | two-line option cards; `opts: [title, subtitle, price]` | `opts[i][2]` |
| `range` | slider; `min`, `max`, `unit` | none |
| `text` | text input; `max`, `placeholder` | counted by the `spots` control |
| `toggle` | on/off switch, state is 0 or 1 | none |
| `font` | typeface picker, each option previews itself; `opts: [label, cssFamily, weight]` | none |
| `effect` | segmented buttons with a small preview; `opts: [label, price]` | `opts[i][1]` |
| `spots` | one row per text spot with an inline editor; `spots: TEXT_SPOTS` | `TEXT_PRICE` per custom spot, capped at `TEXT_PRICE_MAX` |
| `style` | option cards with a tiny preview chip; `opts: [title, subtitle, price, cssPreview]` | `opts[i][2]` |
| `pattern` | same as `style`, for surface textures (grip, saddle cover) | `opts[i][2]` |
| `deform` | segmented buttons for shape options; `opts: [label, price, value]` (the value drives the deformation) | `opts[i][1]` |
| `more` | "More options" disclosure; `controls: [...]`, hidden when none of its controls apply | none |

Card previews may use `--c1`/`--c2`/`--c3` (the part's current colors) and `--ac` (anodized color); `updateUI()` fills them in.

Any control can carry `when: [key, [values]]`: it is only shown while `state[key]` is one of the values.
In a `color` control, a `null` hex is a "match" option; `opts[i][3]` names the slot it borrows from (`frame`, `accent`).

## Slots → materials

`slotFor(node, material)` returns a slot key. `main.js` defines one material per slot in `M`.
`SLOT_SECTION` maps a slot to the panel section opened on click, and `SLOT_LABEL` sets the tooltip text.

Current slots: `frame`, `rear`, `accent`, `forkLow`, `forkUp`, `stanch`, `knob`, `spring`, `shockBody`, `rims`, `spokes`, `tires`, `grips`, `bar`, `saddle`, `saddleBase`, `seatpost`, `chain`, `rotor`, `cranks`, `pedals`, `rubber`, `black`, `blackMetal`, and `decal`.

## Text spots (`TEXT_SPOTS` → `TextDecal` in main.js)

Each decal mesh in the GLB is a logo spot. `TEXT_SPOTS` groups them (down tube, frame, tires, fork, shock, cranks, brakes, drivetrain) by node name.
On load every decal mesh gets a `TextDecal`:

- **Canvas per mesh**, sized to the UV rectangle the mesh uses in its original image (several decals share one atlas image).
  Texture `offset`/`repeat` map the canvas onto that rectangle, so the GLB UVs stay untouched and the original logo can come back.
- **Orientation**: text runs in the same direction as the original artwork. Tall spots (fork leg, shock) rotate it 90°, choosing the
  direction that keeps letters pointing up in the world. Every spot was checked from both sides; none of the current UVs are mirrored.
  If a future model has a mirrored decal, add its node to the spot's `flip` regex.
- **Tire sidewalls** (`arc`): the sidewall decals are flat projections, so world (x, y) → canvas pixels is an exact affine map.
  `fitArc()` fits it by least squares, maps the wheel center into canvas space, and draws each glyph on a circle between the
  `arc` radii (meters from the hub), letters pointing away from the hub like molded tire lettering.
- **Drawing**: white on transparent, auto-fit to the spot (`fit: [width, height]`), centered on its measured glyph box.
  Effects (outline, shadow, italic) are drawn on the canvas. Fonts are loaded with `document.fonts.load()`; a spot redraws once its font arrives.
- **Swapping** between the logo and text only changes `material.map` between two sRGB textures: same shader, no recompile.

## Style options (`src/looks.js`)

The GLB has no swappable parts, so every style is generated in code. Three techniques:

| Technique | Used for | How |
|---|---|---|
| Shader patch (`onBeforeCompile`) | frame paint styles, tire sidewall, grip pattern, saddle cover | world- or rest-space math, no UVs. Each patched material has a fixed `customProgramCacheKey` |
| Generated normal/height maps | grip patterns, saddle covers | drawn once on a canvas into a tiling `DataTexture` (RGB normal, A height), cached in `GRIP_TEX` / `SADDLE_TEX` |
| Cached vertex deformation (`Deformer`) | bar rise/width, saddle shape, rim depth, bladed spokes, pedals | positions are dequantized to float once; each option's target positions are computed once, cached, and eased over 260 ms (`--slow`) |
| Procedural meshes | semi-slick, slick street, mud spike tires | tori, plus an `InstancedMesh` of tapered knobs for mud spike |

**No recompiles.** Styles switch with uniforms, never defines. Every variant (all tires, collars, pedals, the guide) is made visible
for `renderer.compileAsync()` before the loader hides, and the frame's flake normal map stays bound (`normalScale` 0 when not metallic).
Measured: 34 option changes, shader programs stay at 17, worst frame 16.8 ms (Apple M4, Chrome).

**Cross-fades.** A style uniform set has slots A, B and T. `fadeStyle()` puts the old option in A, the new one in B, and eases T 0 → 1,
so patterns dissolve into each other instead of popping. Colors and numbers go through the shared `run()` animation list.

**Rest space.** Deformed meshes get an `aRest` attribute (their undeformed world positions), so grip and saddle patterns stay glued to
the surface while it moves. Frame and tire shaders use live world position (those meshes never deform).

Details per style:
- **Frame paint**: fade runs along the head tube → rear axle line; split is a plane through the frame center at `splitAngle`; camo is two
  thresholded fbm layers (third tone = dark mix of both colors); splatter is 2D Worley splats in the side-view plane with noisy rims, so
  splats look sprayed on rather than solid; carbon weave is a 2×2 twill, triplanar with sharp blend zones, fading to its average when the
  tows get sub-pixel. All of them sit under the existing finish (gloss, satin, matte, metallic) because they only replace the base color.
- **Sidewall**: radial distance from the hub picks the band (tan wall 316–341 mm, stripe 320–323 mm).
- **Grips**: cylindrical projection around the bar axis, with the atan seam handled by picking the branch with the smaller derivative.
- **Bar**: the bar stretches with a smooth falloff between the stem clamp and the bends; grips, levers, bar ends and collars move rigidly
  with the bar ends (the grip rubber is never stretched); brake lines bend along near the bar.
- **Lock-on collars**: the collar primitive is split by distance from the bar center into inner and outer rings at load time.
- **Wheels**: deep rims scale the rim cross-section toward the hub; nipples slide along their spoke by the same depth; bladed spokes
  flatten each spoke's cross-section (wider along the axle, thinner in the direction of travel). Nipple pieces are found by connectivity
  (`pieces()`), which also gives each nipple its own vertex color for "Rainbow".

## Section rows

Each row shows a 36px icon tile (`SECTION_ICONS`) with the part's current color as a 13px badge (`dotColor()`, conic gradient for Oil Slick).
Hovering or keyboard-focusing a row makes that section's materials glow (`highlight()`): every highlightable material gets a white
`emissive` at load and only `emissiveIntensity` animates (a uniform), rising to .2 over 180 ms, settling to .09, and fading out over 260 ms.
On touch, the glow plays once when a section opens. Materials come from `SLOT_SECTION`, plus the nipples (anodized) and all decals (text & stickers).

## Looks (presets)

"Start from a look" shows one card per `PRESETS` entry: a rendered thumbnail, `desc`, and the price change (`extrasTotal()` of the look's full build).

- **Thumbnails** are rendered after the model loads, one look per idle frame (`thumbStep()` in the render loop). The look's state is
  applied instantly, the scene is drawn with `thumbCam` into a scissored 336×184 corner of the main canvas, copied to a 2D canvas, and
  the state is restored, all before that frame's normal render paints over the corner, so the shopper never sees it.
  Using the main canvas keeps the same compiled shaders: three renders a `WebGLRenderTarget` with linear output and no tone mapping,
  which would compile a second set of programs and stall. Each thumbnail is cached as a data URL per theme and re-rendered on a theme change.
- To keep a thumbnail frame within budget: lettering is drawn into small 256 px copies of the text decals (`tdThumb`) and uploaded a
  frame early, every look's deformation targets and bounding spheres are computed at load, the shadow map is reused, and the sub-pixel
  spoke nipples are skipped. Measured: no frame over 16.8 ms while the 8 thumbnails render (Apple M4, Chrome, 1440×900 and 375×812 @2x).
- **Applying** a look keeps text the shopper typed (see `applyPreset()`), shows a toast with the number of parts that changed
  (`changedParts()`) and an Undo that restores the previous state exactly. `look` remembers the applied look and the build right after it;
  any later change marks its card "edited".

## Coordinates

World units are meters. The ground is y = 0, the bike faces +X, and the drive side faces +Z.
Approximate positions: front wheel center (0.63, 0.355, 0), rear wheel center (−0.625, 0.365, 0), bar ≈ y 1.05, saddle ≈ (−0.31, 0.9, 0).
The seat tube axis is (−0.546, 0.838, 0) in world space.

## Performance (details and numbers in docs/PERF.md)

- **Loading:** poster (`assets/poster/`) → `bike-lod1.glb` (configurable) → `bike-lod0.glb` in the background (workers,
  idle-time build, hidden 1×1 upload render, swapped in at rest). `data-lod` on `<html>`: `light` → `detail`, or
  `light-only` in Fast mode.
- **Two models in the scene** (`models`, `low`, `detail` in main.js): same materials, decal materials and text canvases;
  per-model geometry state (`syncModel()`). lod0 draws at rest, lod1 while dragging, for thumbnails and for picking.
  Static meshes that share a material are merged per model (`mergeStatic()`).
- **Render on demand:** `requestRender()`; `frame()` renders and asks for another frame only while the camera, an
  animation (`run()`), a deformation or a thumbnail job is active. Idle pages render nothing.
- **Adaptive resolution** (`Resolution` in `src/quality.js`): full DPR at rest, 1.5/1.25 while the camera moves, 1.0 while
  dragging or zooming, one full-quality frame 200 ms after it stops; a GPU-timer governor steps the moving resolution.
- **Static shadows:** `shadowMap.autoUpdate = false`; `shadowDirty` is set when the silhouette changes.
- **Quality modes** (`setFast()`): Auto / High / Fast. Fast = lod1, DPR 1, standard material twins, contact shadow, no
  auto-rotate. Switching compiles with `compileAsync` while `holdRender` keeps the last frame.
- **Tools:** `?perf` overlay; `tools/perf/` has `bench.mjs`, `check.mjs` (regression), `diff.mjs`, `poster.mjs`.
