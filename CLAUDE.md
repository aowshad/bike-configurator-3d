# CLAUDE.md: working on Bike Configurator 3D

Read this before you change anything. It is written so any Claude session (or person) can pick up the project.

## What this is

A realistic 3D bike configurator that runs in the browser. Shoppers can change paint, finish, anodized parts, fork, shock spring, wheels, tires, cockpit, saddle, drivetrain, pedals and stickers, including custom down tube text. It shows a live price, can share a build as a link, and can save an image of the bike.

- Live demo: https://aowshad.github.io/bike-configurator-3d/
- Owner: Aowshad (ParseLab). The long-term goal is a production configurator, possibly a Shopify app or an Optionia feature.

## Run it

```bash
npm start            # zero dependencies → http://localhost:5181
```

Claude desktop users can start the preview named `bike-configurator` from `.claude/launch.json`.
A server is required, because `file://` cannot load the GLB.

## Layout

```
index.html                 page shell (stage + panel markup, importmap)
src/styles.css             all UI styles, design tokens, light/dark theme
src/config.js              ALL product data: options, prices, presets, camera views,
                           mesh→slot mapping, paint finishes  ← most edits happen here
src/main.js                three.js scene, materials, model loading, applying state, UI rendering
src/looks.js               generated styles: shader patches, normal maps, procedural tires, vertex Deformer
assets/models/bike.glb     web-ready model (7.2 MB, 1.36M tris, meshopt compressed)
legacy/v1-trail26/         first prototype (old free model), kept for reference
tools/model-pipeline/      Blender export + optimize scripts that produce bike.glb
docs/                      ARCHITECTURE, MODEL-PIPELINE, CUSTOMIZING, ROADMAP
```

No build step and no bundler. three.js r170 loads from jsDelivr through the importmap in `index.html`.
Keep it that way unless the roadmap item says otherwise.

## Rules (from the owner, do not break)

- **Never use monospace fonts** anywhere, for values, hex codes or labels. Use Inter or the sans stack with `font-variant-numeric: tabular-nums`.
- Motion should be calm and subtle. Use only the tokens `--fast 120ms`, `--base 180ms`, `--slow 260ms` and `--ease`/`--ease-io`. Never use bounce, `transition: all` or scale-on-hover. Respect `prefers-reduced-motion`.
- Use native scrolling only. Don't add scroll-jacking libraries.
- Light and dark themes must both work. Every color comes from the CSS tokens in `styles.css`.
- Mobile at 375px must not scroll horizontally. The stage is on top and the panel scrolls below it.
- Keep the UI clean and professional. Don't add filler sections.

## How things work (short)

- **State** is a flat object of option indexes, plus `height` (a number) and the text spot strings (`name` for the down tube, `<spot>Txt` for the rest). Values that differ from `DEFAULT` are written to the URL hash. That is what the Share button copies.
- **Slots:** every mesh primitive in the GLB is mapped by `node/material` name to a slot such as `frame`, `rear`, `accent` or `tires` (`slotFor()` in `config.js`). Each slot has one shared `MeshPhysicalMaterial` in `main.js` (`M.*`). Changing a color animates that material.
- **`applyState()`** in `main.js` turns the state into material colors and finishes, part visibility (tire swap, chain guide, pedals), the saddle offset and stickers. Add new behavior there.
- **Click on bike:** a raycast finds the mesh, reads its slot from `SLOT_SECTION`, and opens that panel section. The camera then flies to `VIEWS[section.focus]`.

## Gotchas (each one cost time already)

1. **three.js strips dots from node names.** `nsbikeslogoDecal.001` becomes `nsbikeslogoDecal001`. Match names with `\.?`.
2. **Quantized GLB:** node positions and scales are not zero. Store `basePos` and add offsets to it. Never overwrite `position`.
3. **Shader recompiles stall for about 1 second.** Don't set `material.needsUpdate` unless a texture or define really changes. Keep `iridescence` at `.0001` and `clearcoat` at `.001` instead of 0, so switching options never recompiles. `renderer.compileAsync()` runs before the loader hides.
4. **Orientation:** the GLB is Y-up with forward = −Z. The root is rotated `-π/2` around Y, so in world space the bike faces **+X** and its **drive side faces +Z** (toward the default camera). The units are meters, and the ground is y = 0.
5. Decal PNGs are black on transparent. `whiteAlpha()` turns them white so a material color can tint them.
   Custom text uses its own canvas per decal mesh (`TextDecal`), mapped onto the mesh's UV rectangle with texture offset/repeat.
   `document.fonts.check()` can say true before a Google font has loaded; track readiness from `document.fonts.load()` instead.
6. **Style options** switch with uniforms only (see docs/ARCHITECTURE.md, "Style options"). Every hidden variant is made visible for
   `compileAsync()` at load. `sheen` and other optional features must stay > 0, or three drops the define and recompiles.
   three's default `sheenColor` is black, which makes `sheen` invisible.
7. The Blender materials are procedural and do not export. Detail comes from geometry plus the small generated normal maps (`flake`, `grain`). Baked textures are on the roadmap.

## Verify every change

1. Run `npm start`, open the page, and check the console for errors.
2. Change the option you touched. The bike must update with no frame stall, and price and summary must be correct.
3. Test at 1440×900 and at 375×812, in light and dark themes.
4. Reload with the share hash. The same build must come back.

## Git workflow

- Commit small, focused changes to `main`. Use clear messages (`feat: semi-slick tire swap`, `fix: decal z-fighting`).
- GitHub Pages deploys `main` automatically, and the live demo updates about 1 minute after a push.
- Don't commit `.blend`, `.zip` or raw exports. They are large and stay outside git (see docs/MODEL-PIPELINE.md).

## Licensing note

The current model (NS Bikes "Fuzz" downhill bike) is a third-party free model. Its decals are real brand logos: NS Bikes, Maxxis, RockShox, SRAM, Öhlins and Race Face. That is fine for a demo. Before any commercial use, confirm the model license and replace the logos and frame design (see ROADMAP).
