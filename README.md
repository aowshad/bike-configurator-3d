# Bike Configurator 3D

A realistic, real-time 3D bike configurator for the browser. Pick paint and finish, anodized parts, fork, shock, wheels, tires, cockpit, saddle, drivetrain, pedals and stickers, and the bike updates live.

**▶ Live demo:** https://aowshad.github.io/bike-configurator-3d/

## Features

- **High-detail model:** a 61-part downhill bike, optimized from 5.6M to 1.36M triangles and 7.2 MB.
- **Paint:** 12 frame colors and 4 finishes (Gloss, Satin, Matte, Metallic flake). The rear triangle can match the frame or take its own color for a two-tone look.
- **Anodized kit:** hubs, stem, nipples, clamps and fork knobs change color together, including an iridescent **Oil Slick** option.
- **Components:** fork lowers, Kashima uppers, shock spring, rims, spokes, grips, bar, saddle, chain, cranks and pedals.
- **Styles, not just colors:** frame paint styles (fade, split, camo, splatter, carbon weave), 4 tire treads and 3 sidewalls, bar rise and width, 4 grip patterns, lock-on collars, saddle shape and cover, deep rims, bladed spokes, rainbow nipples. All generated in code with no shader recompiles.
- **Part swaps:** chain guide on/off, pedals on/off (flat or clip-in look), and a saddle height slider.
- **Text & stickers:** custom text on all 8 logo spots (down tube, frame, tires, fork, shock, cranks, brakes, drivetrain) with 5 fonts, sticker colors and outline, shadow or italic effects. Tire text follows the sidewall.
- **UX:** presets, click any part to edit it, a camera that flies to the part you're editing, live price, share link (the build is saved in the URL), image export, and light/dark themes.
- **Stack:** a static site with three.js r170 from a CDN. No build step.

## Run locally

```bash
git clone https://github.com/aowshad/bike-configurator-3d.git
cd bike-configurator-3d
npm start        # → http://localhost:5181
```

## Project structure

| Path | What |
|---|---|
| `index.html` | Page shell |
| `src/config.js` | Options, prices, presets, camera views, mesh→slot mapping |
| `src/main.js` | three.js scene, materials, model loading, UI |
| `src/looks.js` | Generated styles: shader patches, normal maps, procedural tires, vertex deformation |
| `src/styles.css` | UI styles and theme tokens |
| `assets/models/bike.glb` | Web-ready model |
| `tools/model-pipeline/` | Blender → GLB export and optimization |
| `legacy/v1-trail26/` | First prototype ([open](https://aowshad.github.io/bike-configurator-3d/legacy/v1-trail26/)) |
| `docs/` | [Architecture](docs/ARCHITECTURE.md) · [Model pipeline](docs/MODEL-PIPELINE.md) · [Customizing](docs/CUSTOMIZING.md) · [Roadmap](docs/ROADMAP.md) |

## Continuing with Claude

Open the repo in Claude Code and say what you want next. [`CLAUDE.md`](CLAUDE.md) gives Claude the context, rules and gotchas it needs. Pick the next item from the [roadmap](docs/ROADMAP.md).

## Credits & license

- The 3D model is a third-party free model of the NS Bikes Fuzz. Brand names and logos (NS Bikes, Maxxis, RockShox, SRAM, Öhlins, Race Face) belong to their owners and appear here for demo purposes only.
- **TODO (owner):** add the model's source link and license here, and replace the logos and frame design before any commercial use.
- Code © ParseLab.
