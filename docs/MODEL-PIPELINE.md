# Model pipeline: Blender → web GLB

## Source

- `Blend.zip` contains `Fuzz.blend` (450 MB) and `textures/` with 12 decal PNGs. The owner keeps it outside git.
- It has 61 mesh objects in two collections: `Parts` and `Decals`. Units are meters and Z is up.
- Heaviest objects: Frame (1.7M tris), tires (496k each), spokes, nipples, brake discs, chain.
- Materials are Principled BSDF with procedural nodes (noise, voronoi, brick). Only the base values export to glTF.

## Steps

1. **Export from Blender** (Blender 5.x, headless):
   ```bash
   cd tools/model-pipeline
   # place Fuzz.blend + textures/ here (git-ignored)
   /Applications/Blender.app/Contents/MacOS/Blender -b Fuzz.blend --python export.py -- fuzz_full.glb
   ```
   This applies the modifiers (geometry nodes), relinks the decal images, and writes about 183 MB.
2. **Optimize:**
   ```bash
   npm install
   npm run optimize      # → ../../assets/models/bike.glb
   ```
   This runs a per-part simplify (ratios are in `RATIO` in `optimize.mjs`), then dedup, prune, reorder, quantize, and meshopt compression.
   The result is 5.6M → 1.36M triangles and 183 MB → 7.2 MB.

## Material IDs that matter (after dedup)

| node / material | meaning |
|---|---|
| Frame / Material.001 | front triangle paint |
| Frame / Material.018 | rear triangle (swingarm) paint |
| Frame / Material.005 | anodized pivot hardware |
| Shock / Material.002 | fork lowers and fender |
| Shock / Material.003 | fork upper tubes |
| Shock / Material.011 | stanchions |
| Damper / Material.010 | rear shock spring |
| Material.005 (everywhere) | blue anodized parts |
| Grips / Material.012 | grip rubber |

If the model changes, rebuild this table. Use `tools/debug-materials.html?mat=Material.018` (or `?node=Shock`) to highlight one part in red.

## Adding a swappable part

1. Model or buy the alternative part. It must use the same scale, origin and orientation as the bike.
2. Export it as a separate GLB in `assets/models/parts/` (for example `saddle-race.glb`).
3. Load it lazily in `main.js` when the option is picked, and toggle visibility between the original node and the new part.
4. Add the option to `config.js` (the `cards` type works well for parts).

## Planned improvements

- Bake procedural detail (grip pattern, tire rubber, saddle grain, frame flake) into normal and roughness maps with Cycles. This needs the UVs to be checked first.
- Use KTX2 textures and LOD meshes for mobile.
