# Roadmap

Work top to bottom, one item per session or commit. Tick items off here when they're done.

## Now: demo polish
- [ ] Add README screenshots (desktop + mobile, light + dark) in `docs/images/`.
- [ ] Use a better studio lighting setup: a CC0 HDRI (for example Poly Haven "studio_small_09" at 1k) with RoomEnvironment as the fallback.
- [ ] Show a "What's included" summary drawer listing every chosen option and its price.
- [ ] Add undo/redo for option changes (Ctrl/Cmd+Z).
- [ ] Add a hover highlight: a subtle outline on the part under the cursor (throttled raycast, or three-mesh-bvh).

## Done: text & styles (docs/prompts/02-text-and-styles.md)
- [x] Custom text on all 8 logo spots (down tube, frame, tires, fork, shock, cranks, brakes, drivetrain): 5 fonts, sticker colors
      incl. match anodized / match frame, outline / shadow / italic. Tire text follows the sidewall. Click a logo to edit it.
- [x] Frame paint styles: solid, fade, split, camo, splatter, carbon weave (with second color, pattern scale, split angle, fade length).
- [x] Tire tread: knobby DH, semi-slick, slick street, mud spike. Sidewall: all black, tan wall, colored stripe.
- [x] Handlebar rise (low / high / flat) and width (760 / 780 / 800 mm); grip pattern (waffle / diamond / ribbed / smooth); lock-on collars.
- [x] Saddle shape (standard / slim race / plush) and cover (smooth / perforated / stitched / suede).
- [x] Rim depth (standard / deep), bladed spokes, rainbow nipples, clip-in-look pedals.
- [x] Presets: Team Edition, Camo Raw, Street Slick.

### Dropped or changed (and why)
- **Chain hollow-pin look**: not shipped. The pin heads are about 3 mm across on a 123k-vertex chain, so a normal-mapped hole is
  smaller than a pixel in every camera view, and up close it reads as a painted dot, not a hole. Needs real geometry (a chain GLB part).
- **Grip pattern uses a cylindrical projection, not triplanar.** Triplanar on a cylinder blends two projections at 45° around the grip,
  which smears the waffle and diamond patterns into a visible seam. The grips are true cylinders around the bar axis, so a cylindrical
  projection maps the tile exactly.
- **Custom tire text is hidden on the generated tires** (semi-slick, slick street, mud spike): the sidewall decal meshes are shaped for
  the GLB's knobby tire and would float off the thinner tori. The tan wall and stripe shaders work on all four treads.
- **Spoke "silver / black" stays a color**, and "bladed" is a separate shape option, so bladed spokes come in both colors.

## Next: realism
- [ ] Bake the procedural Blender detail into normal and roughness maps: tire rubber, frame flake (grip and saddle patterns are now generated).
- [ ] Curved sidewall text on the generated tires (needs their own decal geometry or a sidewall-projected text shader).
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
