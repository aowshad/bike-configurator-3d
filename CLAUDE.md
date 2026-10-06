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
src/quality.js             adaptive resolution, quality modes (Auto/High/Fast), low-end detection
src/perf.js                ?perf overlay and bench hooks
assets/models/bike-lod1.glb  light model (190k tris, 1.5 MB): first load, dragging, thumbnails, picking, Fast mode
assets/models/bike-lod0.glb  at-rest model (661k tris, 3.5 MB), streamed in after the page is configurable
assets/models/bike.glb     full web model (1.36M tris): source for the LODs only, the app doesn't load it
assets/poster/             loading posters and Fast mode's contact shadow (tools/perf/poster.mjs)
tools/perf/                bench.mjs, check.mjs (regression), diff.mjs, poster.mjs — see docs/PERF.md
legacy/v1-trail26/         first prototype (old free model), kept for reference
tools/model-pipeline/      Blender export + optimize scripts that produce bike.glb
docs/                      ARCHITECTURE, MODEL-PIPELINE, CUSTOMIZING, ROADMAP, PERF
```

No build step and no bundler. three.js r170 loads from jsDelivr through the importmap in `index.html`.
Keep it that way unless the roadmap item says otherwise.

## Rules (from the owner, do not break)

- **Never use monospace fonts** anywhere, for values, hex codes or labels. Use Inter or the sans stack with `font-variant-numeric: tabular-nums`.
- Motion should be calm and subtle. Use only the tokens `--fast 120ms`, `--base 180ms`, `--slow 260ms` and `--ease`/`--ease-io`. Never use bounce, `transition: all` or scale-on-hover. Respect `prefers-reduced-motion`.
  The one exception, requested by the owner: the "Live preview" dot pulses (opacity 1 → .4, 2 s, ease-in-out), and stops under reduced motion.
- Use native scrolling only. Don't add scroll-jacking libraries.
- Light and dark themes must both work. Every color comes from the CSS tokens in `styles.css`.
- Mobile at 375px must not scroll horizontally. The stage is on top and the panel scrolls below it.
- Keep the UI clean and professional. Don't add filler sections.

## Performance rules (see docs/PERF.md)

- **Never render in a loop.** Call `requestRender()` after changing anything visible; use `run()` for animations (it keeps
  frames coming until they finish). An idle page must show **0 renders/s** in the `?perf` overlay.
- **Never render outside `frame()`** (or the same task as a full render): `preserveDrawingBuffer` is off, so a partial
  render would be presented on its own. Corner renders (thumbnails, uploads) happen inside `frame()` before the main render.
- **Silhouette changes set `shadowDirty`.** Shadows are static; add new toggles or deformations to the shadow signature in `applyState()`.
- **Both LODs must follow the state.** Put per-model geometry changes in `syncModel()`, never on `low` or `detail` alone.
  After changing the model, run `npm run lods && npm run check` in `tools/model-pipeline` and `node poster.mjs` in `tools/perf`.
- **No new shader programs after load.** Hidden variants are compiled up front; `node check.mjs` (and `--quality fast`)
  fails on any new program, missed shadow update, or console warning.
- **At rest, the look must not change.** Compare with `node bench.mjs <label> --only shots` and `node diff.mjs base <label>`.

## How things work (short)

- **State** is a flat object of option indexes, plus `height` (a number) and the text spot strings (`name` for the down tube, `<spot>Txt` for the rest). Values that differ from `DEFAULT` are written to the URL hash. That is what Share copies (the top bar's "Share build" button, or its Share icon when `SHOW_CART` is on).
- **Slots:** every mesh primitive in the GLB is mapped by `node/material` name to a slot such as `frame`, `rear`, `accent` or `tires` (`slotFor()` in `config.js`). Each slot has one shared material in `main.js` (`M.*`): `MeshPhysicalMaterial` only where clearcoat, iridescence or sheen shows, `MeshStandardMaterial` elsewhere. Changing a color animates that material.
- **`applyState()`** in `main.js` turns the state into material colors and finishes, part visibility (tire swap, chain guide, pedals), the saddle offset and stickers. Add new behavior there.
- **Layout:** a top bar (name, camera controls, price, main button) above the stage and the panel. Below 900px the camera
  controls move onto the stage as a vertical stack (inline script in `index.html`), and `resize()` offsets the camera view
  so the bike centers in the space left of them. The option list scrolls with edge fades (`syncFade()` in `main.js`).
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
7. **Never render to a `WebGLRenderTarget` for previews.** three renders targets with linear output and no tone mapping, which compiles
   a second set of shader programs (a stall). Look thumbnails render into a scissored corner of the main canvas instead (ARCHITECTURE.md, "Looks").
8. **Clamp animation progress at 0 as well as 1.** rAF's `now` can be earlier than the `performance.now()` an animation started at.
   A negative step overshoots backwards, e.g. iridescence .0001 → −.005, which drops the define and recompiles (an intermittent stall).
9. The Blender materials are procedural and do not export. Detail comes from geometry plus the small generated normal maps (`flake`, `grain`). Baked textures are on the roadmap.

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
