// All product data lives here: options, prices, presets, camera views and
// which mesh/material of bike.glb belongs to which configurable slot.
// Edit this file to add colors, options or parts; main.js reads it.

export const BASE_PRICE = 4499;
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
  ...styleControls(s.id + 'Font', s.id + 'Col', s.id + 'Fx', ['sameStyle', 0]),
];

export const SECTIONS = [
  { id:'frame', name:'Frame', focus:'frame', controls:[
    { type:'color', key:'frame', label:'Main frame', opts:PAINT },
    { type:'seg', key:'finish', label:'Finish', opts:[['Gloss',0],['Satin',0],['Matte',0],['Metallic',150]] },
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
    { type:'color', key:'spokes', label:'Spokes', opts:[['Black','#1E1E20'],['Silver','#D3D6DA']] },
  ]},
  { id:'tires', name:'Tires', focus:'wheel', controls:[
    { type:'cards', key:'tread', label:'Tread', opts:[['Knobby DH','Max grip, loose & wet',0],['Semi-slick','Bike park & dry hardpack',0]] },
    { type:'color', key:'rubber', label:'Rubber', opts:[['Black','#1B1B1B'],['Charcoal','#3A3A3C'],['Gum Brown','#6A4A2E',39]] },
  ]},
  { id:'cockpit', name:'Cockpit', focus:'cockpit', controls:[
    { type:'color', key:'grips', label:'Grips', opts:[['Blue','#2457E6'],['Black','#171717'],['Red','#B3121C'],['Orange','#E8641E'],['Mint','#93D1BA'],['Grey','#7A7D82']] },
    { type:'color', key:'bar', label:'Handlebar', opts:[['Black','#18181A'],['Raw Alloy','#BFC3C8'],['Gold','#C99A2E',60]] },
  ]},
  { id:'saddle', name:'Saddle', focus:'saddle', controls:[
    { type:'color', key:'saddle', label:'Cover', opts:[['Black','#151515'],['Brown','#6B3F22',35],['Tan','#B07A45',35],['White','#E9E7E2'],['Blue','#2457E6']] },
    { type:'range', key:'height', label:'Saddle height', min:-6, max:4, unit:'cm' },
  ]},
  { id:'drive', name:'Drivetrain', focus:'drive', controls:[
    { type:'color', key:'chain', label:'Chain', opts:[['Silver','#BFC3C8'],['Black','#1E1E20'],['Gold','#D1A843',45],['Oil Slick','#6E6A86',65]] },
    { type:'color', key:'cranks', label:'Cranks & cassette', opts:[['Black','#1C1C1E'],['Silver','#C4C7CC']] },
    { type:'seg', key:'guide', label:'Chain guide', opts:[['Included',0],['Remove',-49]] },
  ]},
  { id:'pedals', name:'Pedals', focus:'pedals', controls:[
    { type:'seg', key:'pedalsOn', label:'Pedals', opts:[['Flat pedals',0],['No pedals',-79]] },
    { type:'color', key:'pedals', label:'Body color', opts:[['Black','#18181A'],['Red','#B5121B'],['Blue','#1E5AA8'],['Orange','#E8641E'],['Gold','#C9A24A']] },
  ]},
  { id:'stickers', name:'Text & stickers', focus:'frame', controls:[
    { type:'seg', key:'logos', label:'Original logos', opts:[['Show',0],['Hide',0]] },
    { type:'toggle', key:'sameStyle', label:'Use same text style everywhere' },
    ...styleControls('txtFont', 'logoColor', 'txtFx', ['sameStyle', 1]),
    { type:'spots', key:'spots', label:'Text spots', spots:TEXT_SPOTS },
  ]},
];

export const PRESETS = [
  { name:'Factory', c:{} },
  { name:'Stealth', c:{ frame:1, finish:2, rear:0, accent:5, fork:0, spring:2, rims:0, spokes:0, grips:1, bar:0, saddle:0, chain:1, cranks:0, pedals:0, logoColor:1 } },
  { name:'Race Red', c:{ frame:2, finish:0, rear:4, accent:1, fork:0, spring:1, rims:0, spokes:0, grips:2, saddle:0, chain:0, logoColor:1 } },
  { name:'Papaya', c:{ frame:6, finish:1, rear:2, accent:5, fork:1, spring:2, rims:0, grips:1, logoColor:1 } },
  { name:'Oil & Gold', c:{ frame:8, finish:3, rear:0, accent:6, fork:3, uppers:1, spring:0, rims:2, grips:1, chain:3, cranks:0, logoColor:2 } },
];

export const DEFAULT = { frame:0, finish:0, rear:0, accent:0, fork:0, uppers:0, spring:0, rims:0, spokes:0, tread:0, rubber:0,
  grips:0, bar:0, saddle:0, height:0, chain:0, cranks:0, guide:0, pedalsOn:0, pedals:0, logos:0, logoColor:0,
  sameStyle:1, txtFont:0, txtFx:0 };
for (const s of TEXT_SPOTS) Object.assign(DEFAULT, { [s.key]:'', [s.id+'Case']:0, [s.id+'Font']:0, [s.id+'Col']:0, [s.id+'Fx']:0 });

/* ============ camera views (meters, bike faces +X, drive side +Z) ============ */
export const VIEWS = {
  overview:{ cam:[1.5,1.08,3.0], tgt:[0,.52,0] },
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

