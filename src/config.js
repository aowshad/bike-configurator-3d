// All product data lives here: options, prices, presets, camera views and
// which mesh/material of bike.glb belongs to which configurable slot.
// Edit this file to add colors, options or parts; main.js reads it.

export const BASE_PRICE = 4499;
// true: the top bar's main button is "Add to cart" (a store integration handles it). false (the demo): it is "Share build".
export const SHOW_CART = false;
export const OIL = 'conic-gradient(from 200deg,#6a5acd,#2bb3a3,#d4b13c,#c2457a,#6a5acd)';

/* ============ options ============ */
export const PAINT = [
  ['Storm Grey','#5B6067'],['Jet Black','#121214'],['Arctic White','#ECECEA'],['Race Red','#B3121C'],
  ['Cobalt','#1F4FB8'],['Moss Green','#4C6B3C'],['Safety Orange','#F06A16'],['Sand','#C8B08A'],
  ['Purple Haze','#5D3FA0'],['Petrol','#0E5866'],['Mint','#93D1BA'],['Acid Yellow','#D9D21C'],
];
export const ANO = [['Blue','#2457E6'],['Red','#C81E2A'],['Gold','#C99A2E'],['Purple','#6B3FCF'],['Orange','#E8641E'],['Black','#1C1C1F'],['Oil Slick','#6E6A86',120]];

/* ============ custom text ============ */
// [label, CSS family, weight]. Sans/display only, never mono. Loaded in index.html.
export const FONTS = [['Inter Black','Inter',900],['Archivo Black','Archivo Black',400],['Bebas Neue','Bebas Neue',400],['Racing Sans','Racing Sans One',400],['Marker','Permanent Marker',400]];
export const EFFECTS = [['None',0],['Outline',0],['Shadow',0],['Italic',0]];
// a null hex means "match": opts[i][3] names the slot whose color is used
export const STICKER_COLORS = [['White','#F4F4F2'],['Black','#111111'],['Gold','#C99A2E'],['Match anodized',null,0,'accent'],['Match frame',null,0,'frame'],['Red','#B3121C']];
export const TEXT_PRICE = 25, TEXT_PRICE_MAX = 100;   // per custom spot, capped
export const TEXT_CHARS = /[^\p{L}\p{N} \-.&']/gu;     // everything else is stripped
// Every logo spot on the bike. `nodes` matches GLB node names (three.js strips the dots).
// `arc`: text follows the tire sidewall, between these radii from the hub (m). `fit`: [width, height] share of the spot.
// `flip`: meshes whose UVs are mirrored (none in the current model, both sides were checked).
export const TEXT_SPOTS = [
  { id:'down',   name:'Down tube',  key:'name', def:'GRAVITY DH',   max:14, view:'downtube', nodes:/^nsbikeslogoDecal\.?00[13]$/ },
  { id:'frame',  name:'Frame',      def:'GRAVITY',      max:12, view:'frame',    nodes:/^(nsbikeslogoDecal(\.?002)?|nsbikeslogoDecal2|fuzzDecal)$/ },
  { id:'tires',  name:'Tires',      def:'GRAVITY TRAX', max:16, view:'tire',     nodes:/^(maxxis|highrollerii)logoDecal/, arc:[.314,.352] },
  { id:'fork',   name:'Fork',       def:'GRAVITY 200',  max:12, view:'forkLow',  nodes:/^boxxerlogoDecal/, fit:[.9,.62] },
  { id:'shock',  name:'Shock',      def:'COIL',         max:8,  view:'shockLogo',nodes:/^ohlinsDecal/ },
  { id:'cranks', name:'Cranks',     def:'GRAVITY',      max:10, view:'cranks',   nodes:/^racefaceDecal/, fit:[.6,.5] },
  { id:'brakes', name:'Brakes',     def:'4 PISTON',     max:10, view:'brakes',   nodes:/^(GuideLeverDecal(\.?00[0-4])?|guideCaliperDecal.*)$/ },
  { id:'drive',  name:'Drivetrain', def:'7 SPEED',      max:8,  view:'derailleur', nodes:/^(gxDecal|GuideLeverDecal\.?005)$/ },
];
for (const s of TEXT_SPOTS) s.key ??= s.id + 'Txt';
const styleControls = (font, col, fx, when) => [
  { type:'font', key:font, label:'Font', opts:FONTS, when },
  { type:'color', key:col, label:'Color', opts:STICKER_COLORS, match:true, when },
  { type:'effect', key:fx, label:'Effect', opts:EFFECTS, when },
];
for (const s of TEXT_SPOTS) s.controls = [
  { type:'text', key:s.key, label:'Text', placeholder:s.def, max:s.max },
  { type:'seg', key:s.id + 'Case', label:'Letters', opts:[['UPPERCASE',0],['As typed',0]] },
  ...styleControls(s.id + 'Font', s.id + 'Col', s.id + 'Fx', ['sameStyle', [0]]),
];

/* ============ styles (shape, pattern, texture) ============ */
// style / pattern opts: [title, subtitle, price, preview]. The preview is a CSS background for the tiny chip
// on the card; --c1 / --c2 are filled in with the part's current colors.
const CARBON_PV = 'repeating-conic-gradient(#2a2a2e 0 25%,#141416 0 50%) 0 0/6px 6px';
export const PAINT_STYLES = [
  ['Solid','One color',0,'var(--c1)'],
  ['Fade','Head tube to rear axle',150,'linear-gradient(120deg,var(--c1) 15%,var(--c2) 85%)'],
  ['Split','Hard color split',120,'linear-gradient(120deg,var(--c1) 50%,var(--c2) 50%)'],
  ['Camo','Three-tone pattern',190,'radial-gradient(circle at 30% 35%,var(--c2) 0 22%,transparent 23%),radial-gradient(circle at 72% 70%,var(--c3) 0 26%,transparent 27%),var(--c1)'],
  ['Splatter','Paint splats',160,'radial-gradient(circle at 28% 32%,var(--c2) 0 14%,transparent 15%),radial-gradient(circle at 66% 60%,var(--c2) 0 20%,transparent 21%),radial-gradient(circle at 80% 22%,var(--c2) 0 7%,transparent 8%),var(--c1)'],
  ['Carbon weave','Raw carbon, clear coated',450,CARBON_PV],
];
export const TREADS = [
  ['Knobby DH','Max grip, loose & wet',0,'radial-gradient(circle,var(--c1) 0 38%,transparent 40%) 0 0/6px 6px,var(--c0)'],
  ['Semi-slick','Bike park & dry hardpack',0,'radial-gradient(circle,var(--c1) 0 30%,transparent 32%) 0 0/8px 8px,linear-gradient(var(--c0),var(--c0)) center/100% 40% no-repeat,var(--c1)'],
  ['Slick street','Pump track & tarmac',0,'var(--c1)'],
  ['Mud spike','Deep mud & roots',20,'linear-gradient(90deg,var(--c1) 0 40%,transparent 40%) 0 0/7px 100%,var(--c0)'],
];
export const SIDEWALLS = [
  ['All black','Classic',0,'var(--c1)'],
  ['Tan wall','Gum sidewall',30,'radial-gradient(circle,transparent 0 38%,var(--c1) 39% 60%,#B98A5B 61%)'],
  ['Colored stripe','Matches anodized parts',25,'radial-gradient(circle,transparent 0 38%,var(--c1) 39% 52%,var(--ac) 53% 58%,var(--c1) 59%)'],
];
export const GRIP_PATTERNS = [
  ['Waffle','Classic DH',0,'linear-gradient(90deg,rgb(0 0 0/.45) 1px,transparent 1px) 0 0/5px 5px,linear-gradient(rgb(0 0 0/.45) 1px,transparent 1px) 0 0/5px 5px,var(--c1)'],
  ['Diamond','Knurled',0,'repeating-linear-gradient(45deg,rgb(0 0 0/.45) 0 1px,transparent 1px 5px),repeating-linear-gradient(-45deg,rgb(0 0 0/.45) 0 1px,transparent 1px 5px),var(--c1)'],
  ['Ribbed','Thin rings',0,'repeating-linear-gradient(90deg,rgb(0 0 0/.45) 0 1px,transparent 1px 4px),var(--c1)'],
  ['Smooth','Soft compound',0,'var(--c1)'],
];
export const SADDLE_COVERS = [
  ['Smooth','Microfiber',0,'var(--c1)'],
  ['Perforated','Vented top',0,'radial-gradient(circle,rgb(0 0 0/.55) 0 22%,transparent 26%) 0 0/5px 5px,var(--c1)'],
  ['Stitched','Quilted panel',25,'repeating-linear-gradient(45deg,rgb(255 255 255/.35) 0 1px,transparent 1px 7px),repeating-linear-gradient(-45deg,rgb(255 255 255/.35) 0 1px,transparent 1px 7px),var(--c1)'],
  ['Suede','Soft, high grip',35,'radial-gradient(circle at 30% 30%,rgb(255 255 255/.18),transparent 60%),var(--c1)'],
];
// deform opts: [label, price, value]; the value drives the geometry deformation in main.js
export const BAR_RISE  = [['Low rise',0,0],['High rise',0,.02],['Flat',0,-.0205]];      // m at the grips (stock bar rises 20 mm)
export const BAR_WIDTH = [['760 mm',0,-.01],['780 mm',0,0],['800 mm',0,.01]];           // m per side
export const SADDLE_SHAPES = [['Standard',0,0],['Slim race',40,1],['Plush',20,2]];
export const RIM_DEPTHS = [['Standard',0,0],['Deep',120,.018]];                          // m deeper toward the hub
export const SPOKE_SHAPES = [['Round',0,0],['Bladed',90,1]];
export const PEDAL_STYLES = [['Flat',0,0],['Clip-in look',40,1]];

export const SECTIONS = [
  { id:'frame', name:'Frame', focus:'frame', controls:[
    { type:'color', key:'frame', label:'Main frame', opts:PAINT },
    { type:'style', key:'paint', label:'Paint style', opts:PAINT_STYLES },
    { type:'color', key:'paint2', label:'Second color', opts:PAINT, when:['paint',[1,2,3,4,5]] },
    { type:'range', key:'paintScale', label:'Pattern scale', min:1, max:9, labels:['Fine','Bold'], when:['paint',[3,4]] },
    { type:'seg', key:'finish', label:'Finish', opts:[['Gloss',0],['Satin',0],['Matte',0],['Metallic',150]] },
    { type:'more', controls:[
      { type:'range', key:'splitAngle', label:'Split angle', min:0, max:170, step:10, unit:'°', when:['paint',[2]] },
      { type:'range', key:'fadeLen', label:'Fade length', min:20, max:100, step:10, unit:'%', when:['paint',[1]] },
    ]},
  ]},
  { id:'rear', name:'Rear triangle', focus:'rear', controls:[
    { type:'color', key:'rear', label:'Rear triangle', opts:[['Match frame',null],...PAINT], match:true },
  ]},
  { id:'accent', name:'Anodized parts', focus:'cockpit', controls:[
    { type:'color', key:'accent', label:'Hubs, stem, nipples, clamps, fork knobs', opts:ANO },
  ]},
  { id:'fork', name:'Fork', focus:'fork', controls:[
    { type:'color', key:'fork', label:'Lowers & fender', opts:[['Black','#18181A'],['White','#EDEDEB'],['Red','#B3121C'],['Gold','#C99A2E',90]] },
    { type:'color', key:'uppers', label:'Upper tubes', opts:[['Black','#121214'],['Kashima Gold','#B98C3C',180]] },
  ]},
  { id:'shock', name:'Rear shock', focus:'shock', controls:[
    { type:'color', key:'spring', label:'Spring', opts:[['Gold','#D4A33A'],['Red','#C0151F'],['Black','#1A1A1C'],['Orange','#EA6A1F'],['Blue','#2463B8'],['White','#EDEDEB']] },
  ]},
  { id:'wheels', name:'Wheels', focus:'wheel', controls:[
    { type:'color', key:'rims', label:'Rims', opts:[['Black','#18181A'],['Raw Alloy','#BFC3C8'],['Gold','#C99A2E',90],['Red','#A3121B',90],['Blue','#1E5AA8',90]] },
    { type:'deform', key:'rimDepth', label:'Rim depth', opts:RIM_DEPTHS },
    { type:'color', key:'spokes', label:'Spokes', opts:[['Black','#1E1E20'],['Silver','#D3D6DA']] },
    { type:'more', controls:[
      { type:'deform', key:'spokeShape', label:'Spoke shape', opts:SPOKE_SHAPES },
      { type:'seg', key:'nipples', label:'Nipples', opts:[['Match anodized',0],['Rainbow',29]] },
    ]},
  ]},
  { id:'tires', name:'Tires', focus:'wheel', controls:[
    { type:'color', key:'rubber', label:'Rubber', opts:[['Black','#1B1B1B'],['Charcoal','#3A3A3C'],['Gum Brown','#6A4A2E',39]] },
    { type:'style', key:'tread', label:'Tread', opts:TREADS },
    { type:'style', key:'sidewall', label:'Sidewall', opts:SIDEWALLS },
  ]},
  { id:'cockpit', name:'Cockpit', focus:'cockpit', controls:[
    { type:'color', key:'grips', label:'Grips', opts:[['Blue','#2457E6'],['Black','#171717'],['Red','#B3121C'],['Orange','#E8641E'],['Mint','#93D1BA'],['Grey','#7A7D82']] },
    { type:'pattern', key:'gripPat', label:'Grip pattern', opts:GRIP_PATTERNS },
    { type:'color', key:'bar', label:'Handlebar', opts:[['Black','#18181A'],['Raw Alloy','#BFC3C8'],['Gold','#C99A2E',60]] },
    { type:'deform', key:'rise', label:'Bar shape', opts:BAR_RISE },
    { type:'deform', key:'width', label:'Bar width', opts:BAR_WIDTH },
    { type:'more', controls:[
      { type:'seg', key:'collars', label:'Lock-on collars', opts:[['Double',0],['Single',0],['None',0]] },
    ]},
  ]},
  { id:'saddle', name:'Saddle', focus:'saddle', controls:[
    { type:'color', key:'saddle', label:'Cover', opts:[['Black','#151515'],['Brown','#6B3F22',35],['Tan','#B07A45',35],['White','#E9E7E2'],['Blue','#2457E6']] },
    { type:'deform', key:'saddleShape', label:'Shape', opts:SADDLE_SHAPES },
    { type:'pattern', key:'cover', label:'Cover texture', opts:SADDLE_COVERS },
    { type:'range', key:'height', label:'Saddle height', min:-6, max:4, unit:'cm' },
  ]},
  { id:'drive', name:'Drivetrain', focus:'drive', controls:[
    { type:'color', key:'chain', label:'Chain', opts:[['Silver','#BFC3C8'],['Black','#1E1E20'],['Gold','#D1A843',45],['Oil Slick','#6E6A86',65]] },
    { type:'color', key:'cranks', label:'Cranks & cassette', opts:[['Black','#1C1C1E'],['Silver','#C4C7CC']] },
    { type:'seg', key:'guide', label:'Chain guide', opts:[['Included',0],['Remove',-49]] },
  ]},
  { id:'pedals', name:'Pedals', focus:'pedals', controls:[
    { type:'seg', key:'pedalsOn', label:'Pedals', opts:[['Flat pedals',0],['No pedals',-79]] },
    { type:'color', key:'pedals', label:'Body color', opts:[['Black','#18181A'],['Red','#B5121B'],['Blue','#1E5AA8'],['Orange','#E8641E'],['Gold','#C9A24A']], when:['pedalsOn',[0]] },
    { type:'deform', key:'pedalStyle', label:'Platform', opts:PEDAL_STYLES, when:['pedalsOn',[0]] },
  ]},
  { id:'stickers', name:'Text & stickers', focus:'frame', controls:[
    { type:'seg', key:'logos', label:'Original logos', opts:[['Show',0],['Hide',0]] },
    { type:'toggle', key:'sameStyle', label:'Use same text style everywhere' },
    ...styleControls('txtFont', 'logoColor', 'txtFx', ['sameStyle', [1]]),
    { type:'spots', key:'spots', label:'Text spots', spots:TEXT_SPOTS },
  ]},
];

export const PRESETS = [
// desc: one line on the look card. The card price is extrasTotal() of the look's full build.
  { name:'Factory', desc:'Storm grey, stock parts', c:{} },
  { name:'Stealth', desc:'Matte black on black', c:{ frame:1, finish:2, rear:0, accent:5, fork:0, spring:2, rims:0, spokes:0, grips:1, bar:0, saddle:0, chain:1, cranks:0, pedals:0, logoColor:1 } },
  { name:'Race Red', desc:'White and red two-tone', c:{ frame:2, finish:0, rear:4, accent:1, fork:0, spring:1, rims:0, spokes:0, grips:2, saddle:0, chain:0, logoColor:1 } },
  { name:'Papaya', desc:'Orange and black two-tone', c:{ frame:6, finish:1, rear:2, accent:5, fork:1, spring:2, rims:0, grips:1, logoColor:1 } },
  { name:'Oil & Gold', desc:'Purple flake, oil slick, gold', c:{ frame:8, finish:3, rear:0, accent:6, fork:3, uppers:1, spring:0, rims:2, grips:1, chain:3, cranks:0, logoColor:2 } },
  { name:'Team Edition', desc:'Split paint, team lettering', c:{ frame:2, paint:2, paint2:3, splitAngle:60, finish:0, accent:1, fork:2, spring:1, grips:1, sidewall:2, rimDepth:1, txtFont:1, logoColor:1,
    frameTxt:'TEAM GRAVITY', tiresTxt:'GRAVITY RACE', forkTxt:'GRAVITY 200', name:'TEAM EDITION' } },
  { name:'Camo Raw', desc:'Matte camo, tan walls, suede', c:{ frame:5, paint:3, paint2:7, paintScale:5, finish:2, accent:5, fork:0, spring:2, grips:1, gripPat:0, saddle:0, cover:3, sidewall:1, logoColor:1 } },
  { name:'Street Slick', desc:'Petrol fade, slicks, flat bar', c:{ frame:9, paint:1, paint2:1, finish:1, accent:2, spring:0, tread:2, sidewall:1, rise:2, width:0, saddleShape:1, cover:1, pedalStyle:1, rims:0, logoColor:0 } },
];

export const DEFAULT = { frame:0, finish:0, rear:0, accent:0, fork:0, uppers:0, spring:0, rims:0, spokes:0, tread:0, rubber:0,
  grips:0, bar:0, saddle:0, height:0, chain:0, cranks:0, guide:0, pedalsOn:0, pedals:0, logos:0, logoColor:0,
  sameStyle:1, txtFont:0, txtFx:0,
  paint:0, paint2:1, paintScale:4, splitAngle:60, fadeLen:80, sidewall:0, gripPat:0, rise:0, width:1, collars:0,
  saddleShape:0, cover:0, rimDepth:0, spokeShape:0, nipples:0, pedalStyle:0 };
for (const s of TEXT_SPOTS) Object.assign(DEFAULT, { [s.key]:'', [s.id+'Case']:0, [s.id+'Font']:0, [s.id+'Col']:0, [s.id+'Fx']:0 });

/* ============ section icons ============ */
// section id → inner SVG markup on a 24px grid. main.js wraps it in
// <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">.
// Line art only (no fills), so the set reads as one family. A section without an entry gets a plain tile.
export const SECTION_ICONS = {
  frame:    '<path d="M8.6 17.2 6.9 6.4M5.6 6.4h2.8M7.4 8.1l9.4-1.4M16.2 4.6l1.4 5.6M17.2 8.6l-7.3 7.6"/><circle cx="9" cy="17.4" r="1.7"/>',
  rear:     '<path d="M6.9 16.6 12.6 7.8M7.2 17.6h7.6l-2.2-9.8"/><circle cx="5.4" cy="17.4" r="2"/><circle cx="12.6" cy="7.8" r="1.4"/>',
  accent:   '<path d="M12 3.6 19.3 7.8v8.4L12 20.4 4.7 16.2V7.8Z"/><circle cx="12" cy="12" r="3.1"/>',
  fork:     '<path d="M6.5 4h11M6.5 7.6h11M9.2 4v6.4M14.8 4v6.4M9.4 18.6h5.2"/><rect x="8" y="10.4" width="2.4" height="8.4" rx="1.2"/><rect x="13.6" y="10.4" width="2.4" height="8.4" rx="1.2"/>',
  shock:    '<circle cx="12" cy="4" r="1.6"/><circle cx="12" cy="20" r="1.6"/><path d="M12 5.6v12.8M8.4 7.6l7.2 1.4M8.4 10.6l7.2 1.4M8.4 13.6l7.2 1.4M8.6 16.8h6.8"/>',
  wheels:   '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="1.9"/><path d="M12 3.4v6.7M12 13.9v6.7M3.4 12h6.7M13.9 12h6.7M5.9 5.9l4.8 4.8M13.3 13.3l4.8 4.8M18.1 5.9l-4.8 4.8M10.7 13.3l-4.8 4.8"/>',
  tires:    '<rect x="6.8" y="2.8" width="10.4" height="18.4" rx="5.2"/><path d="M9.4 7.6 12 9.4l2.6-1.8M9.4 11.2 12 13l2.6-1.8M9.4 14.8 12 16.6l2.6-1.8"/>',
  cockpit:  '<path d="M2.8 10.2h3.1c1.7 0 2.6 2.3 4.3 2.3h3.6c1.7 0 2.6-2.3 4.3-2.3h3.1M2.8 8.6v3.2M21.2 8.6v3.2M12 12.5v5M9.8 17.5h4.4"/>',
  saddle:   '<path d="M3.6 9.4c3.2-1.3 7-1.6 10.6-.8 2.4.5 4.3.9 6.2.5-.5 1.7-2.2 2.8-4.6 2.8h-5.6c-2.8 0-5-.9-6.6-2.5Z"/><path d="m9.8 11.9 2.2 2.4 2.2-2.4M12 14.3v6.3"/>',
  drive:    '<circle cx="12" cy="12" r="7"/><path d="M19.00 12.00 20.70 12.00M18.31 15.04 19.84 15.77M16.36 17.47 17.42 18.80M13.56 18.82 13.94 20.48M10.44 18.82 10.06 20.48M7.64 17.47 6.58 18.80M5.69 15.04 4.16 15.77M5.00 12.00 3.30 12.00M5.69 8.96 4.16 8.23M7.64 6.53 6.58 5.20M10.44 5.18 10.06 3.52M13.56 5.18 13.94 3.52M16.36 6.53 17.42 5.20M18.31 8.96 19.84 8.23"/><circle cx="12" cy="12" r="1.8"/><path d="M13.3 13.3l3.4 3.4"/>',
  pedals:   '<rect x="6" y="6.5" width="13" height="11" rx="2.6"/><path d="M2.6 12H6M12.5 6.5v11M9 9.6h.01M16 9.6h.01M9 14.4h.01M16 14.4h.01"/>',
  stickers: '<path d="M3.8 18.2 8.4 5.8l4.6 12.4M5.5 13.9h5.8"/><circle cx="16.8" cy="15.1" r="3.1"/><path d="M19.9 11.6v6.6"/>',
};

/* ============ camera views (meters, bike faces +X, drive side +Z) ============ */
export const VIEWS = {
  overview:{ cam:[1.6,1.08,2.95], tgt:[.1,.52,-.05] },   // panned 11 cm right: the near front wheel looks bigger, this re-centers the bike
  side:    { cam:[0,.6,4.3],       tgt:[0,.52,0] },
  frame:   { cam:[.85,1.05,2.75],  tgt:[0,.62,0] },
  rear:    { cam:[-1.1,.95,1.95],  tgt:[-.35,.52,0] },
  fork:    { cam:[1.6,1.05,1.75],  tgt:[.42,.66,0] },
  shock:   { cam:[-.1,.95,1.5],    tgt:[.02,.62,0] },
  wheel:   { cam:[1.85,.75,1.75],  tgt:[.63,.37,0] },
  cockpit: { cam:[1.05,1.5,1.25],  tgt:[.27,1.02,0] },
  saddle:  { cam:[-1.05,1.3,1.2],  tgt:[-.31,.9,0] },
  drive:   { cam:[-.75,.62,1.55],  tgt:[-.36,.36,.06] },
  pedals:  { cam:[.35,.66,1.45],   tgt:[-.18,.36,.08] },
  // text spots
  downtube:  { cam:[.5,.85,1.45],   tgt:[.13,.71,0] },
  tire:      { cam:[.95,.5,1.95],   tgt:[.63,.37,0] },
  forkLow:   { cam:[1.05,.68,1.05], tgt:[.5,.5,.05] },
  shockLogo: { cam:[-.05,.66,.75],  tgt:[-.09,.52,0] },
  cranks:    { cam:[-.02,.5,.82],   tgt:[-.12,.35,.08] },
  brakes:    { cam:[.85,1.28,.72],  tgt:[.31,1.04,.12] },
  derailleur:{ cam:[-.42,.45,.78],  tgt:[-.59,.31,.12] },
};

/* ============ mesh → slot mapping ============ */
// [node, material] → slot
export function slotFor(node, mat){
  const k = node + '/' + mat;
  const map = {
    'Frame/Material.001':'frame', 'Frame/Material.018':'rear', 'Frame/Material.005':'accent',
    'Shock/Material.002':'forkLow', 'Shock/Material.003':'forkUp', 'Shock/Material.011':'stanch', 'Shock/Material.004':'knob', 'Shock/Material.014':'accent', 'Shock/Material.007':'rubber',
    'Damper/Material.010':'spring', 'Damper/Material.008':'shockBody', 'Damper/Material.006':'black',
    'Front_rim/Material.008':'rims', 'Rear_rim/Material.006':'rims', 'Spokes/Material.008':'spokes',
    'Front_tire/Material.007':'tires', 'Rear_Tire/Material.007':'tires',
    'Grips/Material.012':'grips', 'Grips/Material.005':'accent', 'Handlebars/Material.006':'bar', 'BarEnds/Material.002':'accent',
    'Seat/Material.007':'saddle', 'Seat/Material.008':'saddleBase', 'Seatpost/Material.013':'seatpost',
    'Chain/Material.009':'chain', 'Brake_Discs/Material.009':'rotor', 'Brake_Discs/Material.006':'black',
    'Cassette/Material.008':'cranks', 'Cranks/Material.008':'cranks', 'Cranks/Material.007':'rubber', 'Cranks/Material.005':'accent',
    'Pedals/Material.019':'pedals', 'Pedals/Material.005':'accent',
    'Guard/Material.006':'black', 'Top_Cap/Material.007':'black', 'Frame_Bearings/Material.008':'blackMetal',
  };
  if (map[k]) return map[k];
  if (mat === 'Material.005') return 'accent';
  if (mat === 'Material.008') return 'blackMetal';
  return 'black';
}
export const SLOT_SECTION = { frame:'frame', rear:'rear', accent:'accent', forkLow:'fork', forkUp:'fork', stanch:'fork', knob:'fork', spring:'shock', shockBody:'shock',
  rims:'wheels', spokes:'wheels', tires:'tires', grips:'cockpit', bar:'cockpit', saddle:'saddle', saddleBase:'saddle', seatpost:'saddle',
  chain:'drive', cranks:'drive', rotor:'wheels', pedals:'pedals', decal:'stickers' };
export const SLOT_LABEL = { frame:'Main frame', rear:'Rear triangle', accent:'Anodized part', forkLow:'Fork lowers', forkUp:'Fork upper tubes', stanch:'Fork stanchions', knob:'Fork knobs',
  spring:'Shock spring', shockBody:'Rear shock', rims:'Rim', spokes:'Spokes', tires:'Tire', grips:'Grip', bar:'Handlebar', saddle:'Saddle', saddleBase:'Saddle', seatpost:'Seat post',
  chain:'Chain', cranks:'Cranks', rotor:'Brake rotor', pedals:'Pedal', decal:'Sticker' };


/* ============ frame paint finishes ============ */
export const FINISH = [
  { roughness:.3,  metalness:.15, clearcoat:1,  clearcoatRoughness:.05, ns:0 },
  { roughness:.5,  metalness:.1,  clearcoat:.5, clearcoatRoughness:.35, ns:0 },
  { roughness:.82, metalness:.05, clearcoat:.001, clearcoatRoughness:1, ns:0 },
  { roughness:.32, metalness:.7,  clearcoat:1,  clearcoatRoughness:.03, ns:.18 },
];

