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
                         │     adds 2 generated "semi-slick" torus tires (hidden by default)
                         ├─ renderer.compileAsync() → hide loader → flyTo('overview')
                         └─ UI built from SECTIONS → clicks update `state` → applyState() → writeHash()
```

## State

`DEFAULT` in `config.js` lists every key. Most keys are indexes into a control's `opts` array.
`height` is centimeters (a number), and `name` is the down tube text (a string). Only values that differ from `DEFAULT` go into the URL hash.

## Control types (in `SECTIONS[].controls`)

| type | shape | price field |
|---|---|---|
| `color` | swatches; `opts: [name, hex \| null, price?]`; `null` means "match" | `opts[i][2]` |
| `seg` | segmented buttons; `opts: [label, price]` | `opts[i][1]` (may be negative) |
| `cards` | two-line option cards; `opts: [title, subtitle, price]` | `opts[i][2]` |
| `range` | slider; `min`, `max`, `unit` | none |
| `text` | text input; `max`, `price` | `price` if not empty |

## Slots → materials

`slotFor(node, material)` returns a slot key. `main.js` defines one material per slot in `M`.
`SLOT_SECTION` maps a slot to the panel section opened on click, and `SLOT_LABEL` sets the tooltip text.

Current slots: `frame`, `rear`, `accent`, `forkLow`, `forkUp`, `stanch`, `knob`, `spring`, `shockBody`, `rims`, `spokes`, `tires`, `grips`, `bar`, `saddle`, `saddleBase`, `seatpost`, `chain`, `rotor`, `cranks`, `pedals`, `rubber`, `black`, `blackMetal`, and `decal`.

## Coordinates

World units are meters. The ground is y = 0, the bike faces +X, and the drive side faces +Z.
Approximate positions: front wheel center (0.63, 0.355, 0), rear wheel center (−0.625, 0.365, 0), bar ≈ y 1.05, saddle ≈ (−0.31, 0.9, 0).
The seat tube axis is (−0.546, 0.838, 0) in world space.

## Performance

- Rendering 1.36M triangles plus a 2048 shadow map runs at about 75 fps on an Apple M4 in Chrome.
- Materials are shared per slot, so draw calls stay at about 100.
- Avoid shader recompiles (see CLAUDE.md, gotcha 3).
