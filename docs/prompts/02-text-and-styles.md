# Prompt: custom text everywhere + style options (not just color)

Paste everything below the line into Claude Code, opened in the `bike-configurator-3d` repo.

---

Read `CLAUDE.md` and `docs/ARCHITECTURE.md` first and follow their rules: no monospace fonts, calm motion tokens, light and dark themes, a 375px mobile layout, no build step, and no shader-recompile stalls.

Right now the configurator mostly changes **colors**. I want two upgrades: **editable text on every logo spot**, and **real style options** that change shape, pattern or texture, not only color. Work in the phases below. Commit after each phase with a clear message, and verify in the browser before you move on.

## Phase 1: Custom text on every text/logo spot

Every decal mesh in the GLB is a spot where a logo sits. The current names are below. Remember that three.js strips the dots, so `nsbikeslogoDecal.001` becomes `nsbikeslogoDecal001`.

| Spot | Decal nodes | Default text |
|---|---|---|
| Down tube (both sides) | `nsbikeslogoDecal.001`, `.003` | already supports custom text, so refactor it into the new system |
| Top tube / small frame logos | `nsbikeslogoDecal`, `nsbikeslogoDecal.002`, `nsbikeslogoDecal2`, `fuzzDecal` | model name |
| Tire sidewalls (front + rear, both sides) | `maxxislogoDecal*`, `highrolleriilogoDecal*` | brand + tire model |
| Fork lowers | `boxxerlogoDecal*` | fork name |
| Rear shock | `ohlinsDecal*` | shock name |
| Cranks | `racefaceDecal*` | crank name |
| Brakes | `GuideLeverDecal*`, `guideCaliperDecal*` | brake name |
| Derailleur | `gxDecal` | drivetrain name |

Build a reusable **TextDecal** system in `main.js`:
- Each spot gets its own canvas texture, sized to the spot's original image aspect. `whiteAlpha()` already reads the original image size.
- Draw the text white on transparent, auto-fit it to the width, and center it vertically. The material color tints it, as it does now.
- **Options per spot:**
  - text: max length per spot, uppercase toggle, or "Original logo".
  - **font style:** 4–5 Google Fonts, all sans or display, **no mono**. For example Inter Black, Archivo Black, Bebas Neue, Racing Sans One, Permanent Marker. Load them with `document.fonts.load()` before drawing.
  - color: reuse the sticker colors plus "match anodized" and "match frame".
  - **effect:** None / Outline / Drop shadow / Italic slant, drawn on the canvas.
- **Tire sidewall text** must follow the sidewall. The existing decal meshes already wrap the tire, so drawing into their UV space is enough. Check that it reads correctly on both sides. If one side shows mirrored text, flip it in the canvas for that mesh only.
- **Panel:** a "Text & stickers" section with one row per spot (Down tube, Frame, Tires, Fork, Shock, Cranks, Brakes, Drivetrain). Each row opens its inline editor. Add a "Use same text style everywhere" toggle.
- **Click on bike:** clicking a decal opens its own spot editor and flies the camera to it. Add camera views for tire sidewall, fork lowers, cranks and shock.
- **State:** text strings are URL-encoded into the share hash. Keep the hash short: write only the values that differ from `DEFAULT`, and sanitize the input to letters, digits, space and `- . & '`.
- **Price:** +€25 per custom spot, with a maximum shown in the summary.

## Phase 2: Style options (shape, pattern, texture)

Add a "Style" control next to color inside each relevant section. Use the existing `cards` control type, and give each card a tiny preview label. For each item, pick the technique listed. Real swappable GLB parts don't exist yet, so these are all generated in code.

**Tires: tread style** (extend the current Knobby/Semi-slick)
- Knobby DH (original geometry) · Semi-slick (current torus) · **Slick street** (smoother, thinner torus) · **Mud spike** (procedural: torus plus instanced knobs, using `InstancedMesh` around the circumference, with tall, spaced knobs).
- **Sidewall style:** All black · **Tan wall** · **Colored stripe**. Do this with a shader on the tire material (`onBeforeCompile`): compute the radial distance from the wheel center in object/world space and color the sidewall band. No UVs are needed.

**Handlebar & grips**
- **Bar shape:** Low rise / High rise / Flat, and **Width** 760 / 780 / 800 mm. Do this with **vertex deformation** on the Handlebars, Grips, BarEnds and Brake_levers geometry.
  - Width: move vertices outward in proportion to |z| from the bar center, and move grips, levers and bar ends rigidly with the bar ends.
  - Rise: offset the outer vertices in y with a smooth falloff.
  - Keep the original geometry so you can reset it. Don't stretch the grip rubber: move it rigidly.
- **Grip pattern:** Waffle / Diamond / Ribbed / Smooth. Generate a tiling normal map per pattern on a canvas and apply it with **triplanar mapping** in `onBeforeCompile`, because the grip UVs aren't reliable. The grip color stays separate.
- **Lock-on collars:** Single / Double / None (toggle the grip collar primitives, or scale them).

**Frame paint style** (not just a solid color)
- Solid (current) · **Fade** (two-color gradient along the frame length, from head tube to rear axle) · **Split** (hard color split at a set angle) · **Camo** (3-tone noise) · **Splatter** (paint splats) · **Carbon weave** (raw carbon look with clearcoat).
- Use world/object-space triplanar or position-based shading in `onBeforeCompile` on the frame material, so it works without good UVs.
- Each style gets a secondary color picker, plus a pattern scale slider for Camo and Splatter.
- These must work with every existing finish (Gloss, Satin, Matte, Metallic).

**Saddle**
- **Shape:** Standard / Slim race / Plush. Use vertex deformation with a smooth falloff on the Seat geometry: thinner and narrower, or thicker with more padding.
- **Cover texture:** Smooth / Perforated / Stitched panel / Suede. Use generated normal maps with triplanar mapping. Suede also gets higher roughness and sheen.

**Wheels**
- **Rim depth:** Standard / Deep (generated: scale the rim cross-section outward toward the hub with a radial vertex offset).
- **Spoke look:** Silver / Black / Bladed, where Bladed flattens the spoke cross-section with a vertex scale perpendicular to each spoke.
- **Hub/nipple color mix:** Match anodized / Rainbow nipples (instanced color per nipple chunk if the geometry allows it, otherwise skip it and say so).

**Pedals:** Flat / Clip-in look (scale the platform smaller and thicker). **Chain:** Standard / Hollow-pin look (normal map).

## Rules

- **Keep it real.** Every style must look believable up close. If a technique looks fake (stretched, faceted or seamy), drop that option and note why in `docs/ROADMAP.md`. Don't ship it.
- **Data first:** all new options live in `src/config.js`, using the same patterns as the existing ones. Update `docs/CUSTOMIZING.md` and `docs/ARCHITECTURE.md` with the new control types: `font`, `effect`, `style`, `deform`, `pattern`.
- **Performance:** no frame stalls when an option changes. Prebuild every generated texture once and cache it. Compile all `onBeforeCompile` variants upfront (use uniforms to switch styles, not shader defines). Store deformed geometry in caches. Keep 60 fps on a laptop and check for console errors.
- **UX:**
  - The panel must not get crowded. Inside each section, show Color first, then Style. Advanced options go behind a "More options" disclosure.
  - Every change animates smoothly (cross-fade the colors, ease vertex deformations over `--slow`).
  - The summary line of each section mentions the style, for example "Fade · Orange → Black".
- **Presets:** add 3 new presets that show off text and styles, for example "Team Edition" (custom text on frame, tires and fork), "Camo Raw" and "Street Slick".
- **Share link:** every new option round-trips through the URL hash.

## Done when

- Text on all 8 spots works, with font, color and effect choices, in both light and dark themes, and it reads correctly from both sides.
- At least these style options work and look real: tire tread (4), sidewall (3), bar width and rise, grip pattern (4), frame paint style (6), saddle shape (3) and cover (4), rim depth (2).
- Desktop at 1440 and mobile at 375 are both clean, and the console shows no errors.
- `docs/ROADMAP.md` is updated: finished items ticked, and anything dropped is noted with the reason.
- Everything is committed and pushed to `main`, so the live demo updates.
- Send me screenshots of 3 presets and the text editor open.
