# Roadmap

Work top to bottom, one item per session or commit. Tick items off here when they're done.

## Now: demo polish
- [ ] Add README screenshots (desktop + mobile, light + dark) in `docs/images/`.
- [ ] Use a better studio lighting setup: a CC0 HDRI (for example Poly Haven "studio_small_09" at 1k) with RoomEnvironment as the fallback.
- [ ] Show a "What's included" summary drawer listing every chosen option and its price.
- [ ] Add undo/redo for option changes (Ctrl/Cmd+Z).
- [ ] Add a hover highlight: a subtle outline on the part under the cursor (throttled raycast, or three-mesh-bvh).

## Next: realism
- [ ] Bake the procedural Blender detail into normal and roughness maps: grip waffle, tire rubber, saddle grain, frame flake.
- [ ] Add a tan-wall tire option (needs a sidewall mask texture).
- [ ] Add a raw carbon finish with a weave texture on the frame UVs.
- [ ] Add an optional turntable shot: a pre-rendered hero image for social and OG previews.

## Then: real part swaps
- [ ] Source or model alternative parts (saddle styles, handlebars, wheels, fork variants) at the same scale and origin.
- [ ] Load parts lazily from `assets/models/parts/*.glb` and use the `cards` control for each one.
- [ ] Add compatibility rules (for example, coil vs air shock changes the spring options).

## Branding & legal (before any commercial use)
- [ ] Confirm the model license and add credits to the README.
- [ ] Replace the third-party logos with your own brand or customer stickers.
- [ ] Let shoppers upload their own logo as a sticker (canvas texture on the down tube decal UVs).

## Product
- [ ] Shopify integration: put the configurator on a product page and pass the build to the cart as line-item properties (pairs well with Optionia).
- [ ] Add an admin config: options and prices from JSON or an API instead of `config.js`.
- [ ] Save builds to an account, and track analytics on option choices.
- [ ] AR: `<model-viewer>` with GLB (Android) and USDZ (iOS), generated from the GLB.
- [ ] Mobile performance: LOD meshes, KTX2 textures, and lower shadow resolution on small screens.
