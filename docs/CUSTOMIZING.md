# Customizing (common edits)

All of these happen in `src/config.js` unless noted.

## Add a color to an existing option
Add `['Name', '#HEX', priceOptional]` to that control's `opts`. Example: add a frame paint to `PAINT`.
Existing share links keep working only if you **append** new items, because state stores the index.

## Add a new color control for an existing slot
1. Add `{ type:'color', key:'myKey', label:'…', opts:[…] }` to a section's `controls`.
2. Add `myKey: 0` to `DEFAULT`.
3. In `applyState()` (main.js): `setMat(M.someSlot, { color: pick('myKey')[1] }, instant);`
4. Optional: show it in `summary()` and `dotColor()` (main.js).

## Make a new part colorable
1. Find its `node/material` name (see docs/MODEL-PIPELINE.md).
2. Map it to a new slot in `slotFor()`, and add `SLOT_SECTION` and `SLOT_LABEL` entries.
3. Create the material: `M.newSlot = phys({...})` in main.js.
4. Add a control as described above.

## Add a section
Push to `SECTIONS`: `{ id, name, focus:'<VIEWS key>', controls:[…] }`. Add a camera view to `VIEWS` if you need one.

## Text spots
- Change a spot's default text, length or camera view in `TEXT_SPOTS`.
- Change the price with `TEXT_PRICE` (per spot) and `TEXT_PRICE_MAX` (cap for all spots together).
- Add a font: append `['Label', 'CSS family', weight]` to `FONTS` and add the family to the Google Fonts link in `index.html`. Sans or display only, never mono.
- Add a sticker color: append to `STICKER_COLORS`. Use `[name, null, 0, 'frame' | 'accent']` for a "match" color.
- A new decal mesh in the GLB: add its node name to a spot's `nodes` regex. If its text reads mirrored on the bike, also add it to `flip`.

## Add a preset
Push `{ name, c:{ key:index, … } }` to `PRESETS`. Keys you leave out fall back to `DEFAULT`.

## Change prices
- Base price: `BASE_PRICE`.
- Option prices: the price field of each option (see the table in ARCHITECTURE.md).
