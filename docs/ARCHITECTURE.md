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

Any control can carry `when: [key, value]`: it is only shown while `state[key] === value`.
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

## Coordinates

World units are meters. The ground is y = 0, the bike faces +X, and the drive side faces +Z.
Approximate positions: front wheel center (0.63, 0.355, 0), rear wheel center (−0.625, 0.365, 0), bar ≈ y 1.05, saddle ≈ (−0.31, 0.9, 0).
The seat tube axis is (−0.546, 0.838, 0) in world space.

## Performance

- Rendering 1.36M triangles plus a 2048 shadow map runs at about 75 fps on an Apple M4 in Chrome.
- Materials are shared per slot, so draw calls stay at about 100.
- Avoid shader recompiles (see CLAUDE.md, gotcha 3).
