import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { BASE_PRICE, OIL, PAINT, ANO, SECTIONS, PRESETS, DEFAULT, VIEWS, slotFor, SLOT_SECTION, SLOT_LABEL, FINISH,
  SECTION_ICONS, FONTS, TEXT_SPOTS, TEXT_PRICE, TEXT_PRICE_MAX, TEXT_CHARS, BAR_RISE, BAR_WIDTH, SADDLE_SHAPES, RIM_DEPTHS, SPOKE_SHAPES, PEDAL_STYLES } from './config.js';
import { initPerf } from './perf.js';
import { Resolution, savedQuality, saveQuality, lowEndScore, probeFrame } from './quality.js';
import { patchFrame, patchTires, patchGrips, patchSaddle, makeTires, Deformer, pieces, GRIP_TEX, SADDLE_TEX, SADDLE_PARAMS } from './looks.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = { ...DEFAULT };
const TEXT_MAX = Object.fromEntries(TEXT_SPOTS.map(s => [s.key, s.max]));
const cleanText = (v, k) => String(v).replace(TEXT_CHARS, '').slice(0, TEXT_MAX[k] ?? 14);
function readHash(){
  const p = new URLSearchParams(location.hash.slice(1));
  for (const k of Object.keys(DEFAULT)) if (p.has(k)) state[k] = typeof DEFAULT[k]==='string' ? cleanText(p.get(k), k) : (+p.get(k) || 0);
}
function writeHash(){
  const p = new URLSearchParams();
  for (const [k,v] of Object.entries(state)) if (v !== DEFAULT[k]) p.set(k, v);
  try { history.replaceState(null, '', p.toString() ? '#'+p : location.pathname); } catch(e) {}
}
readHash();

/* ============ renderer ============ */
const stage = document.getElementById('stage');
// preserveDrawingBuffer stays off: the image button and look thumbnails read the canvas in the same task they render it
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
const coarse = matchMedia('(pointer: coarse)').matches;
const RES_HIGH = { rest: Math.min(devicePixelRatio, 2), cap: coarse ? 1.25 : 1.5, input: 1 }, RES_FAST = { rest: 1, cap: 1, input: 1 };
const res = new Resolution(renderer, RES_HIGH);
renderer.setPixelRatio(res.rest);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;   // static shadows: redrawn only when geometry or visibility changes (shadowDirty)
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
{ // studio lighting: render the room once into an environment map, then free the generator and room (and their programs)
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose(); pmrem.dispose();
}
scene.environmentIntensity = 0.9;
const camera = new THREE.PerspectiveCamera(30, 1, 0.03, 60);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
controls.minDistance = 0.45; controls.maxDistance = 6; controls.maxPolarAngle = THREE.MathUtils.degToRad(86);
controls.autoRotateSpeed = 0.7;

const perfTick = initPerf(renderer, scene, camera);
const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.position.set(1.5, 4, 2.4); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left:-.95, right:.95, top:.95, bottom:-.95, near:3, far:6.5 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.006; sun.shadow.radius = 5;
scene.add(sun);
const back = new THREE.DirectionalLight(0xffffff, .6); back.position.set(-2.5, 2, -2); scene.add(back);
const ground = new THREE.Mesh(new THREE.CircleGeometry(3.4, 64), new THREE.ShadowMaterial({ opacity:.22 }));
ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
// Fast mode's ground shadow: a soft contact shadow baked from the real one (tools/perf/poster.mjs), no shadow map at all.
// CONTACT is the ground area the texture covers (meters); the poster script captures exactly this rectangle.
const CONTACT = { x0: -1.6, x1: 1.4, z0: -1.3, z1: .6 };
const contact = new THREE.Mesh(new THREE.PlaneGeometry(CONTACT.x1 - CONTACT.x0, CONTACT.z1 - CONTACT.z0),
  new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: .22, color: 0xffffff }));
contact.rotation.x = -Math.PI/2; contact.position.set((CONTACT.x0 + CONTACT.x1) / 2, .001, (CONTACT.z0 + CONTACT.z1) / 2);
contact.visible = false;   // added to the scene the first time Fast mode turns on

/* ============ camera views (meters, bike faces +X, drive side +Z) ============ */
let tween = null;
function flyTo(name, instant){
  const v = VIEWS[name]; if (!v) return;
  const to = { c:new THREE.Vector3(...v.cam), t:new THREE.Vector3(...v.tgt) };
  const f = THREE.MathUtils.clamp(1.0 / camera.aspect, 1, 2.1);
  to.c.sub(to.t).multiplyScalar(f).add(to.t);
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  if (instant || reduceMotion) { tween = null; camera.position.copy(to.c); controls.target.copy(to.t); controls.update(); requestRender(); return; }
  tween = { from:{ c:camera.position.clone(), t:controls.target.clone() }, to, start:performance.now(), dur:950 };
  requestRender();
}
const easeInOut = t => t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;

/* ============ materials ============ */
// MeshPhysicalMaterial only where its features show (clearcoat paint, iridescent anodizing and chain, saddle sheen);
// everything else is the cheaper MeshStandardMaterial
const phys = o => new THREE.MeshPhysicalMaterial(o);
const std = o => new THREE.MeshStandardMaterial(o);
// procedural detail textures (the Blender procedural shaders don't survive export)
// seeded, so every load renders the same pixels (lets before/after screenshots be diffed)
function noiseNormal(size=256, strength=1.2, seed=1){
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const h = new Float32Array(size*size); for (let i=0;i<h.length;i++) h[i] = (seed = (seed * 16807) % 2147483647) / 2147483647;
  const im = g.createImageData(size,size);
  for (let y=0;y<size;y++) for (let x=0;x<size;x++){
    const i=y*size+x, dx=(h[y*size+(x+1)%size]-h[i])*strength, dy=(h[((y+1)%size)*size+x]-h[i])*strength;
    const n=new THREE.Vector3(-dx,-dy,1).normalize(); im.data.set([(n.x*.5+.5)*255,(n.y*.5+.5)*255,(n.z*.5+.5)*255,255], i*4);
  }
  g.putImageData(im,0,0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const flake = noiseNormal(256, 1.6, 7); flake.repeat.set(40, 40);
const grain = noiseNormal(256, .7, 11); grain.repeat.set(10, 10);

const M = {
  frame:   phys({ color:'#5B6067', roughness:.3, metalness:.15, clearcoat:1, clearcoatRoughness:.05, normalMap:flake, normalScale:new THREE.Vector2(0,0) }),
  rear:    phys({ color:'#5B6067', roughness:.3, metalness:.15, clearcoat:1, clearcoatRoughness:.05, normalMap:flake, normalScale:new THREE.Vector2(0,0) }),
  accent:  phys({ color:'#2457E6', roughness:.28, metalness:.9, iridescence:.0001, iridescenceIOR:1.8, iridescenceThicknessRange:[250,900] }),
  forkLow: phys({ color:'#18181A', roughness:.32, metalness:.1, clearcoat:.9, clearcoatRoughness:.08 }),
  forkUp:  phys({ color:'#121214', roughness:.12, metalness:.8, clearcoat:1, clearcoatRoughness:.03 }),
  stanch:  std({ color:'#C9CCD1', roughness:.15, metalness:1 }),
  knob:    std({ color:'#C81E2A', roughness:.25, metalness:.85 }),
  spring:  phys({ color:'#D4A33A', roughness:.3, metalness:.6, clearcoat:.8, clearcoatRoughness:.12 }),
  shockBody: std({ color:'#1C1C1F', roughness:.28, metalness:.85 }),
  rims:    std({ color:'#18181A', roughness:.35, metalness:.75 }),
  spokes:  std({ color:'#1E1E20', roughness:.3, metalness:.9 }),
  tires:   std({ color:'#1B1B1B', roughness:.9, metalness:0, normalMap:grain, normalScale:new THREE.Vector2(.35,.35) }),
  grips:   std({ color:'#2457E6', roughness:.85, metalness:0, normalMap:grain, normalScale:new THREE.Vector2(.6,.6) }),
  bar:     std({ color:'#18181A', roughness:.32, metalness:.8 }),
  saddle:  phys({ color:'#151515', roughness:.62, metalness:0, sheen:.4, sheenRoughness:.7, normalMap:grain, normalScale:new THREE.Vector2(.25,.25) }),
  saddleBase: std({ color:'#141416', roughness:.4, metalness:.1 }),
  seatpost:std({ color:'#131315', roughness:.25, metalness:.6 }),
  chain:   phys({ color:'#BFC3C8', roughness:.3, metalness:1, iridescence:.0001, iridescenceIOR:1.8, iridescenceThicknessRange:[250,900] }),
  rotor:   std({ color:'#B8BBC0', roughness:.35, metalness:1 }),
  cranks:  std({ color:'#1C1C1E', roughness:.3, metalness:.8 }),
  pedals:  std({ color:'#18181A', roughness:.5, metalness:.5 }),
  rubber:  std({ color:'#141414', roughness:.88, metalness:0 }),
  black:   std({ color:'#161618', roughness:.32, metalness:.35 }),
  blackMetal: std({ color:'#1A1A1D', roughness:.3, metalness:.85 }),
};
M.saddle.sheenColor.set('#9a9a9a');   // three's default sheen color is black, which hides the sheen
M.nipples = M.accent.clone(); M.nipples.vertexColors = true;   // per-nipple colors for "Rainbow"
// style shaders: compiled once with the scene, switched with uniforms
const U = { frame: patchFrame([M.frame, M.rear]), tires: patchTires(M.tires), grips: patchGrips(M.grips, new THREE.Vector2(.267, 1.059)), saddle: patchSaddle(M.saddle) };
/* smooth transitions: materials, uniforms and style cross-fades share one animation list */
const anims = new Map();
function run(key, step, instant, dur = 340){
  requestRender();
  if (instant || reduceMotion) { anims.delete(key); step(1); return; }
  anims.set(key, { step, start: performance.now(), dur });
}
function setMat(mat, target, instant){
  const from = { color: mat.color.clone() }; for (const k in target) if (k !== 'color') from[k] = mat[k];
  const to = { ...target, color: new THREE.Color(target.color ?? from.color) };
  if (Object.keys(to).every(k => k === 'color' ? mat.color.equals(to.color) : mat[k] === to[k])) return;
  run(mat, t => lerpMat(mat, from, to, t), instant);
}
function lerpMat(mat, from, to, t){
  mat.color.copy(from.color).lerp(to.color, t);
  for (const k in to) if (k !== 'color' && typeof to[k] === 'number') mat[k] = from[k] + (to[k] - from[k]) * t;
}
// tween a {value} uniform (number or Color)
function tweenU(u, to, instant){
  if (u.value.isColor) { const t = new THREE.Color(to); if (u.value.equals(t)) return; const f = u.value.clone(); run(u, k => u.value.copy(f).lerp(t, k), instant); }
  else { if (u.value === to) return; const f = u.value; run(u, k => { u.value = f + (to - f) * k; }, instant); }
}
// cross-fade a style: slot A shows the old option, slot B the new one, T eases 0 → 1
function fadeStyle(T, setSlot, idx, instant){
  if (T.idx === idx) return;
  const prev = T.idx; T.idx = idx;
  if (prev === undefined || instant || reduceMotion) { anims.delete(T); setSlot('A', idx); setSlot('B', idx); T.a = idx; T.value = 0; return; }
  const visible = anims.has(T) && T.value > .5 ? prev : T.a;
  setSlot('A', visible); T.a = visible; setSlot('B', idx); T.value = 0;
  run(T, k => { T.value = k; if (k >= 1) { setSlot('A', idx); T.a = idx; T.value = 0; } }, false, 300);
}

/* ============ model: two LODs ============ */
// bike-lod1 (≈190k triangles) loads first and is what the shopper configures on; bike-lod0 (≈660k, the at-rest look)
// streams in afterwards. Both stay in the scene with the same materials: lod0 draws at rest, lod1 while the user drags
// (and during any camera motion on touch devices), for look thumbnails and for picking. Geometry state (nodes,
// deformers, collars, decal meshes) lives per model; materials, generated tires and decal canvases are shared.
const models = [];                  // every loaded LOD
let low = null, detail = null, drawn = null;
const treads = [[]];                // [1..3] generated tires (shared); [0] = knobby, each model has its own (m.knobby)
const decalInfo = {};               // decal node name → { mat, baseMap, spot, td, tdThumb }, shared by both LODs
const HUBS = [[.63, .355], [-.625, .365]];   // front, rear wheel centers (world x, y)
const SEAT_AXIS = new THREE.Vector3(-.546, .838, 0).normalize();

function whiteAlpha(img){
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i=0;i<d.data.length;i+=4){ const lum=(d.data[i]+d.data[i+1]+d.data[i+2])/3; d.data[i]=d.data[i+1]=d.data[i+2]=255; d.data[i+3]=Math.min(d.data[i+3], 255-lum*.0 ); }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.flipY = false; return t;
}
const decalMat = std({ color:'#F4F4F2', roughness:.35, metalness:.05, transparent:true, alphaTest:.3, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4 });

/* ============ text decals ============ */
// Every decal mesh gets its own canvas, sized to the part of the original image its UVs use.
// Texture offset/repeat maps that canvas onto the same UV rectangle, so the GLB UVs stay as they are.
// Text is white on transparent; the decal material color tints it, like the original logos.
const WHEEL = { front:new THREE.Vector2(.63, .355), rear:new THREE.Vector2(-.625, .365) };
const fontKey = f => `${f[2]} 64px "${f[1]}"`;
const fontLoads = new Map(), fontsReady = new Set();
function loadFont(f){
  const k = fontKey(f);
  if (!fontLoads.has(k)) fontLoads.set(k, document.fonts.load(k, 'AZaz09').then(r => { if (r.length) fontsReady.add(k); return r.length > 0; }, () => false));
  return fontLoads.get(k);
}
function paintText(g, s, x, y, size, fx){
  g.save();
  if (fx === 3) { g.translate(x, y); g.transform(1, 0, -.24, 1, 0, 0); g.translate(-x, -y); }   // italic slant
  if (fx === 2) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(s, x + size*.05, y + size*.06); } // drop shadow
  if (fx === 1) { g.lineJoin = 'round'; g.lineWidth = size*.15; g.strokeStyle = 'rgba(8,8,10,.92)'; g.strokeText(s, x, y); } // outline
  g.fillStyle = '#fff'; g.fillText(s, x, y);
  g.restore();
}
const fxPad = (fx, size) => fx === 1 ? size*.16 : fx === 2 ? size*.07 : fx === 3 ? size*.22 : 0;

class TextDecal {
  constructor(mesh, spot, img, res = 512){
    const uv = mesh.geometry.attributes.uv;
    let u0 = 1, v0 = 1, u1 = 0, v1 = 0;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); u0 = Math.min(u0, u); v0 = Math.min(v0, v); u1 = Math.max(u1, u); v1 = Math.max(v1, v); }
    const du = Math.max(u1 - u0, 1e-3), dv = Math.max(v1 - v0, 1e-3);
    const w = du * img.width, h = dv * img.height, s = res / Math.max(w, h);
    const c = this.canvas = document.createElement('canvas');
    c.width = Math.max(16, Math.round(w * s)); c.height = Math.max(16, Math.round(h * s));
    const t = this.tex = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 4;
    t.repeat.set(1 / du, 1 / dv); t.offset.set(-u0 / du, -v0 / dv);
    // world positions and canvas pixel positions of every vertex
    const pos = mesh.geometry.attributes.position, P = [], X = [];
    for (let i = 0; i < pos.count; i++) {
      P.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
      X.push([(uv.getX(i) - u0) / du * c.width, (uv.getY(i) - v0) / dv * c.height]);
    }
    this.flip = !!spot.flip?.test(mesh.userData.node);
    // tall spots (fork leg, shock) run the text along canvas y, letters pointing up in the world
    this.rot = c.height > c.width ? (this.canvasXDir(mesh, P, X).y >= 0 ? 90 : 270) : 0;
    this.fit = spot.fit || [.92, .72];
    this.arc = spot.arc ? this.fitArc(P, X, spot.arc) : null;
    this.sig = '';
    // decals of the same spot that would draw the same canvas (same size, orientation, arc and UV rectangle) share one
    // TextDecal. Never across spots: the down tube and the frame use the same logo image but carry different text.
    const r = v => Math.round(v * 100) / 100, a = this.arc;
    this.key = [spot.id, res, c.width, c.height, this.rot, this.flip, this.fit, a && [a.cx, a.cy, a.r0, a.r1, a.a0, a.a1].map(v => Math.round(v / 2) * 2),
      r(t.repeat.x), r(t.repeat.y), r(t.offset.x), r(t.offset.y)].join();
  }
  // world direction of canvas +x, area-weighted over all triangles
  canvasXDir(mesh, P, X){
    const idx = mesh.geometry.index, n = idx ? idx.count : P.length, T = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let i = 0; i < n; i += 3) {
      const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i+1) : i+1, c = idx ? idx.getX(i+2) : i+2;
      const du1 = X[b][0]-X[a][0], dv1 = X[b][1]-X[a][1], du2 = X[c][0]-X[a][0], dv2 = X[c][1]-X[a][1], det = du1*dv2 - du2*dv1;
      if (Math.abs(det) < 1e-9) continue;
      e1.subVectors(P[b], P[a]); e2.subVectors(P[c], P[a]);
      T.addScaledVector(e1, dv2 / det).addScaledVector(e2, -dv1 / det);
    }
    return T.normalize();
  }
  // Sidewall decals are planar projections, so world (x,y) → canvas px is affine.
  // Fit it, map the wheel center into canvas space, and keep the band's radii and angles.
  fitArc(P, X, band){
    const mx = P.reduce((a, p) => a + p.x, 0) / P.length, C = mx > 0 ? WHEEL.front : WHEEL.rear;
    const A = new THREE.Matrix3(), bx = new THREE.Vector3(), by = new THREE.Vector3(), r = new THREE.Vector3(), e = A.elements;
    e.fill(0);
    P.forEach((p, i) => {
      r.set(p.x, p.y, 1);
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) e[a*3+b] += r.getComponent(a) * r.getComponent(b);
      bx.addScaledVector(r, X[i][0]); by.addScaledVector(r, X[i][1]);
    });
    A.invert(); bx.applyMatrix3(A); by.applyMatrix3(A);
    const cx = bx.x*C.x + bx.y*C.y + bx.z, cy = by.x*C.x + by.y*C.y + by.z;
    // px per meter, from how far each vertex sits from the hub in both spaces
    const rad = X.map(q => Math.hypot(q[0] - cx, q[1] - cy));
    const k = P.reduce((a, p, i) => a + rad[i] / Math.hypot(p.x - C.x, p.y - C.y), 0) / P.length;
    const r0 = band[0] * k, r1 = band[1] * k, rm = (r0 + r1) / 2;
    const mid = Math.atan2(X.reduce((a, q) => a + q[1] - cy, 0), X.reduce((a, q) => a + q[0] - cx, 0));
    // angular room at the text radius (fall back to the whole mesh)
    let a0 = Infinity, a1 = -Infinity;
    for (const near of [true, false]) {
      X.forEach((q, i) => {
        if (near && Math.abs(rad[i] - rm) > (r1 - r0) * .5) return;
        const t = Math.atan2(q[1] - cy, q[0] - cx) - mid, d = Math.atan2(Math.sin(t), Math.cos(t));
        a0 = Math.min(a0, d); a1 = Math.max(a1, d);
      });
      if (a1 > a0) break;
    }
    return { cx, cy, r0, r1, a0: mid + a0, a1: mid + a1 };
  }
  draw(text, f, fx){
    const sig = `${text}|${f[1]}|${f[2]}|${fx}|${fontsReady.has(fontKey(f))}`;   // redraw once the font arrives
    if (sig === this.sig) return; this.sig = sig;
    const c = this.canvas, g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
    if (this.flip) { g.translate(c.width, 0); g.scale(-1, 1); }
    const font = px => `${f[2]} ${px}px "${f[1]}", Inter, sans-serif`;
    if (this.arc) this.drawArc(g, text, font, fx); else this.drawLine(g, text, font, fx);
    this.tex.needsUpdate = true;
  }
  drawLine(g, text, font, fx){
    const W = this.canvas.width, H = this.canvas.height, vert = this.rot !== 0;
    const len = vert ? H : W, thick = vert ? W : H;
    g.translate(W / 2, H / 2); if (vert) g.rotate(this.rot * Math.PI / 180);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    let size = thick * .8; g.font = font(size);
    let m = g.measureText(text);
    const fitW = len * this.fit[0] / (m.width + fxPad(fx, size)), fitH = thick * this.fit[1] / (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + fxPad(fx, size) || 1);
    size *= Math.min(fitW, fitH); g.font = font(size); m = g.measureText(text);
    paintText(g, text, 0, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2, size, fx);
  }
  // letters stand on the arc and point away from the hub, like molded tire lettering
  drawArc(g, text, font, fx){
    const { cx, cy, r0, r1, a0, a1 } = this.arc, chars = [...text], band = r1 - r0, rm = (r0 + r1) / 2;
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    let size = band * .85, ws, total, cap, rb;
    for (let pass = 0; pass < 3; pass++) {
      g.font = font(size);
      ws = chars.map(ch => g.measureText(ch).width);
      const track = size * .1;
      total = ws.reduce((a, b) => a + b, 0) + track * (chars.length - 1) + fxPad(fx, size);
      cap = g.measureText('H').actualBoundingBoxAscent; rb = rm - cap / 2;
      const avail = (a1 - a0) * .88 * rb;
      if (total <= avail) break;
      size *= avail / total;
    }
    const track = size * .1;
    let a = (a0 + a1) / 2 - (total - fxPad(fx, size)) / 2 / rb;
    chars.forEach((ch, i) => {
      const ac = a + ws[i] / 2 / rb;
      g.save(); g.translate(cx + Math.cos(ac) * rb, cy + Math.sin(ac) * rb); g.rotate(ac + Math.PI / 2);
      paintText(g, ch, 0, 0, size, fx); g.restore();
      a += (ws[i] + track) / rb;
    });
  }
}
const spotDecals = Object.fromEntries(TEXT_SPOTS.map(s => [s.id, []]));   // spot id → decalInfo entries
const spotOf = node => TEXT_SPOTS.find(s => s.nodes.test(node));
const logoMaps = new Map();       // source image → its white-on-transparent texture (several decals share a logo image)
const textShare = new Map();      // TextDecal.key → TextDecal
const sharedText = td => { if (!textShare.has(td.key)) textShare.set(td.key, td); return textShare.get(td.key); };


MeshoptDecoder.useWorkers?.(2);   // decode GLB buffers off the main thread
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const glbParam = new URLSearchParams(location.search).get('glb');   // ?glb=… loads one file only (pipeline checks)
const LOD_URL = { low: 'assets/models/bike-lod1.glb', detail: 'assets/models/bike-lod0.glb' };
const idle = () => new Promise(r => (window.requestIdleCallback || setTimeout)(r, { timeout: 300 }));

function buildModel(gltf, name){
  const root = gltf.scene; root.rotation.y = -Math.PI/2; root.updateMatrixWorld(true);
  const m = { name, root, nodes: {}, meshes: {}, decals: [], knobby: [], collars: { inner: [], outer: [] }, deform: {}, pickables: [] };
  const bitmaps = new Set();
  root.traverse(o => {
    if (!o.isMesh) return;
    const nodeName = (o.parent && o.parent !== root && o.parent.name) ? o.parent.name : o.name;
    const owner = (o.parent && o.parent !== root) ? o.parent : o;
    m.nodes[nodeName] = owner; owner.userData.basePos ??= owner.position.clone();
    o.castShadow = true; o.receiveShadow = true;
    o.userData.node = nodeName;
    if (/Decal/i.test(nodeName)) {
      let info = decalInfo[nodeName];
      const src = o.material.map?.image;
      if (src) bitmaps.add(src);
      if (!info) {   // first LOD: build the shared material, original logo and text canvases for this decal
        const mat = decalMat.clone();
        if (src) { if (!logoMaps.has(src)) logoMaps.set(src, whiteAlpha(src)); mat.map = logoMaps.get(src); }
        const spot = src ? spotOf(nodeName) : null;
        info = decalInfo[nodeName] = { mat, baseMap: mat.map, spot, shown: true };
        if (spot) { info.td = sharedText(new TextDecal(o, spot, src)); info.tdThumb = sharedText(new TextDecal(o, spot, src, 256)); spotDecals[spot.id].push(info); }
      }
      o.material = info.mat; o.castShadow = false; o.userData.slot = 'decal'; o.userData.spot = info.spot?.id;
      m.decals.push(o);
    } else {
      const slot = slotFor(nodeName, o.material.name);
      o.material = M[slot] || M.black; o.userData.slot = slot;
      if (slot === 'tires') m.knobby.push(o);
    }
    m.meshes[o.name] = o;
    m.pickables.push(o);
  });
  for (const b of bitmaps) b.close?.();   // the glTF's own decal images: copied into canvases above, or not needed (second LOD)
  setupDeformers(m);
  if (m.meshes.Spoke_nipples) m.meshes.Spoke_nipples.material = M.nipples;
  mergeStatic(m);
  scene.add(root); models.push(m);
  return m;
}
// warm every look's deformation targets, so applying a look or rendering its thumbnail never computes geometry mid-frame
function warmDeforms(m){
  for (const s of [state, ...PRESETS.map(p => ({ ...DEFAULT, ...p.c }))]) { const dp = deformParams(s); for (const k in m.deform) m.deform[k].warm(dp[k]); }
}

// Static, non-configurable parts that share a material become one mesh per material: fewer draw calls.
// Anything deformed, toggled, moved, per-mesh textured (decals) or instanced stays separate.
const DYNAMIC = /^(Handlebars|Grips|BarEnds|Brake_levers|Lines|Seat|Seatpost|Front_rim|Rear_rim|Spoke_nipples|Spokes|Pedals|Guard|Front_tire|Rear_Tire)$/;
function toFloat(src, matrix){
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.attributes[name]; if (!a) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  g.setIndex(src.index ? Array.from(src.index.array) : null);
  return g.applyMatrix4(matrix);
}
function mergeStatic(m){
  const groups = new Map();
  m.root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || /Decal/i.test(o.userData.node) || DYNAMIC.test(o.userData.node)) return;
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(o);
  });
  const inv = m.root.matrixWorld.clone().invert();
  for (const [mat, list] of groups) {
    if (list.length < 2) continue;
    const names = ['position', 'normal', 'uv'].filter(n => list.every(o => o.geometry.attributes[n]));
    if (mat.normalMap && !names.includes('uv')) continue;
    const geos = list.map(o => {
      const g = toFloat(o.geometry, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
      return g;
    });
    const merged = mergeGeometries(geos); if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData = { slot: list[0].userData.slot, node: 'merged', parts: list.map(o => o.userData.node) };
    m.root.add(mesh); m.pickables.push(mesh);
    for (const o of list) { o.removeFromParent(); o.geometry.dispose(); m.pickables.splice(m.pickables.indexOf(o), 1); delete m.meshes[o.name]; }
  }
}
// draw this model only (the others hidden); returns the previous one
function showModel(m){
  const prev = drawn;
  if (m && drawn !== m) { for (const x of models) x.root.visible = x === m; drawn = m; }
  return prev;
}

loader.load(glbParam || LOD_URL.low, gltf => {
  low = buildModel(gltf, 'low'); showModel(low);
  FONTS.forEach(f => loadFont(f).then(ok => { if (ok) { drawTexts(); requestRender(); } }));
  // generated treads (1 semi-slick, 2 slick street, 3 mud spike), shared by both LODs
  makeTires(M.tires, HUBS).forEach((list, i) => { if (i) treads[i] = list; for (const m of list) scene.add(m); });
  // compile every variant up front (hidden parts included), so no option ever stalls on a shader compile
  const variants = [...treads.slice(1).flat(), ...low.knobby, ...low.collars.inner, ...low.collars.outer, low.nodes.Guard, low.nodes.Pedals].filter(Boolean);
  variants.forEach(o => o.visible = true);
  document.getElementById('loadTxt').textContent = 'Preparing materials…';
  warmDeforms(low);
  // compileAsync covers the main pass only: one render with every variant visible also compiles the shadow-pass
  // programs (e.g. the instanced mud-spike knobs). Same task as applyState below, so this frame is never shown.
  const ready = async () => {
    renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); sectionMats(); applyState(true);
    // Auto quality: a short probe of the light model at DPR 1 decides with the device signals (quality.js)
    if (quality === 'auto' && !fastOn) {
      const was = renderer.getPixelRatio(); renderer.setPixelRatio(1);
      const ms = probeFrame(() => renderer.render(scene, camera), renderer.getContext());
      renderer.setPixelRatio(was);
      autoFast = lowEndScore(ms) >= 3;
      if (autoFast) await setFast(true);
    }
    // start exactly where the poster was rendered, then cross-fade the poster away
    flyTo('overview', true); frame(performance.now());
    document.getElementById('loader').classList.add('done'); document.getElementById('poster')?.classList.add('gone');
    if (!performance.getEntriesByName('first-visual').length) performance.mark('first-visual');
    performance.mark('interactive');
    modelReady = true; queueThumbs();
    // data-lod: light → detail once the at-rest model is in; 'single' when only one file loads (tools)
    document.documentElement.dataset.lod = glbParam ? 'single' : fastOn ? 'light-only' : 'light';
    if (!glbParam && !fastOn) loadDetail();
    syncQualityUI();
  };
  // devices that are clearly low-end start in Fast before anything compiles, so they compile one shader set only
  if (quality === 'fast' || (quality === 'auto' && lowEndScore() >= 3)) { if (quality === 'auto') autoFast = true; setFast(true, { compile: false }); }
  (renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve()).then(ready, ready);
}, e => {
  if (!e.total) return;
  const p = Math.round(e.loaded / e.total * 100);
  document.getElementById('loadTxt').textContent = `Loading bike… ${p}%`;
  document.getElementById('loadBar').style.width = p + '%';
}, err => { document.getElementById('loadTxt').textContent = 'Could not load the 3D model.'; console.error(err); });

// the at-rest model: parsed in workers, built in idle time, uploaded in a hidden 1×1 render, then swapped in at rest
let pendingUpload = null, detailLoading = false;
function loadDetail(){
  if (detailLoading || detail) return; detailLoading = true;
  loader.load(LOD_URL.detail, async gltf => {
    await idle();
    const m = buildModel(gltf, 'detail'); m.root.visible = false;
    await idle(); warmDeforms(m);
    await idle(); syncModel(m, true);
    if (twins && fastOn) m.root.traverse(o => { if (o.isMesh && twins.has(o.material)) o.material = twins.get(o.material); });
    pendingUpload = m; requestRender();   // frame() uploads it, then picks it at the next rest frame
  }, undefined, err => console.warn('Detailed model not loaded, staying on the light one.', err));
}
// render a model once into a 1×1 corner so its buffers are on the GPU before it is first shown (runs inside frame())
function uploadModel(m){
  const prev = showModel(m), size = renderer.getSize(new THREE.Vector2());
  renderer.setScissorTest(true); renderer.setScissor(0, 0, 1, 1); renderer.setViewport(0, 0, 1, 1);
  renderer.render(scene, camera);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, size.x, size.y);
  showModel(prev);
}
camera.position.set(2.6, 1.6, 4.6); controls.target.set(0, .52, 0);

/* ============ deformations (see looks.js) ============ */
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function setupDeformers(model){
  const { meshes, deform, collars } = model;
  const pick = names => names.map(n => meshes[n]).filter(Boolean);
  // cockpit: the bar stretches between the stem clamp and the bends; grips, levers, bar ends and
  // collars move rigidly with the bar ends; brake lines bend along near the bar
  const cockpit = pick(['Handlebars', 'Plane034', 'Plane034_1', 'BarEnds', 'Plane011', 'Plane011_1', 'Lines',
    'GuideLeverDecal', 'GuideLeverDecal001', 'GuideLeverDecal002', 'GuideLeverDecal003', 'GuideLeverDecal004']);
  for (const m of cockpit) m.userData.rigid = !/^(Handlebars|Lines)$/.test(m.name);
  deform.cockpit = new Deformer(cockpit, (p, { rise, dw }, it) => {
    const lines = it.mesh.name === 'Lines';
    for (let i = 0; i < p.length; i += 3) {
      const y = p[i+1], z = p[i+2], az = Math.abs(z);
      let w = it.data.rigid ? 1 : smooth(.04, .15, az);
      if (lines) w *= smooth(.93, 1.0, y);
      p[i+1] += rise * w; p[i+2] += Math.sign(z) * dw * w;
    }
    return p;
  });
  deform.cockpit.restAttribute(m => m.name === 'Plane034_1');
  // lock-on collars: split the collar primitive into its inner and outer rings (they share the deformed positions)
  const col = meshes.Plane034;
  if (col) {
    const rest = deform.cockpit.items.find(it => it.mesh === col).rest, idx = col.geometry.index.array, sets = { inner: [], outer: [], keep: [] };
    for (let i = 0; i < idx.length; i += 3) {
      const z = Math.abs(rest[idx[i]*3+2] + rest[idx[i+1]*3+2] + rest[idx[i+2]*3+2]) / 3;
      (z > .372 ? sets.outer : z < .262 ? sets.inner : sets.keep).push(idx[i], idx[i+1], idx[i+2]);
    }
    for (const k of ['inner', 'outer']) {
      const g = new THREE.BufferGeometry(); for (const [n, a] of Object.entries(col.geometry.attributes)) g.setAttribute(n, a);
      g.setIndex(sets[k]); g.boundingSphere = col.geometry.boundingSphere;
      const m = new THREE.Mesh(g, col.material); m.castShadow = m.receiveShadow = true; Object.assign(m.userData, col.userData);
      col.parent.add(m); m.position.copy(col.position); m.quaternion.copy(col.quaternion); m.scale.copy(col.scale);
      collars[k].push(m); model.pickables.push(m);
    }
    col.geometry.setIndex(sets.keep);
  }
  // saddle: narrower and flatter, or thicker padding; falloffs keep the nose and rails in place
  const seat = pick(['Cylinder002', 'Cylinder002_1']);
  deform.saddle = new Deformer(seat, (p, shape) => {
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i+1], z = p[i+2], rear = smooth(-.22, -.42, x), y0 = .852;
      if (shape === 1) { p[i+2] = z * (1 - .05 - .13 * rear); p[i+1] = y0 + (y - y0) * (.84 - .04 * rear); }
      if (shape === 2) { const crown = Math.max(0, 1 - (z / .075) ** 2) * smooth(-.18, -.27, x);
        p[i+2] = z * (1 + .05 * rear); p[i+1] = y0 + (y - y0) * (1.12 + .14 * crown); }
    }
    return p;
  });
  deform.saddle.restAttribute(m => m.name === 'Cylinder002');
  // wheels: deep rims scale the rim cross-section toward the hub; nipples slide along their spoke;
  // bladed spokes flatten the spoke cross-section (wide along the axle, thin in the direction of travel)
  const wheel = pick(['Front_rim', 'Rear_rim', 'Spoke_nipples', 'Spokes']);
  deform.wheels = new Deformer(wheel, (p, { depth, bladed }, it) => {
    const name = it.mesh.name;
    if (name.endsWith('_rim') && depth) {
      const rOut = .306, k = (rOut - .2877 + depth) / (rOut - .2877);
      for (let i = 0; i < p.length; i += 3) {
        const [cx, cy] = p[i] > 0 ? HUBS[0] : HUBS[1], dx = p[i] - cx, dy = p[i+1] - cy, r = Math.hypot(dx, dy);
        if (r < rOut) { const r2 = rOut - (rOut - r) * k; p[i] = cx + dx / r * r2; p[i+1] = cy + dy / r * r2; }
      }
    }
    if (name === 'Spoke_nipples' && depth) for (const g of it.data.pieces.groups) {
      const s = g.shift; for (const v of g.verts) { p[v*3] += s.x * depth; p[v*3+1] += s.y * depth; p[v*3+2] += s.z * depth; }
    }
    if (name === 'Spokes' && bladed) for (const g of it.data.pieces.groups) {
      if (!g.axis) continue;
      const { a, o, len } = g.axis, zd = new THREE.Vector3(0, 0, 1).addScaledVector(a, -a.z).normalize(), td = new THREE.Vector3().crossVectors(a, zd);
      for (const v of g.verts) {
        const q = new THREE.Vector3(p[v*3], p[v*3+1], p[v*3+2]).sub(o), along = q.dot(a), off = q.clone().addScaledVector(a, -along);
        const w = smooth(.03, .07, along) * (1 - smooth(len - .03, len - .012, along));
        const f = off.clone().addScaledVector(zd, off.dot(zd) * 1.3 * w).addScaledVector(td, -off.dot(td) * .5 * w);
        p[v*3] = o.x + a.x * along + f.x; p[v*3+1] = o.y + a.y * along + f.y; p[v*3+2] = o.z + a.z * along + f.z;
      }
    }
    return p;
  });
  const wi = n => deform.wheels.items.find(it => it.mesh.name === n);
  const sp = wi('Spokes'), np = wi('Spoke_nipples');
  if (sp) {
    sp.data.pieces = pieces(sp.mesh.geometry, sp.rest, .001);
    for (const g of sp.data.pieces.groups) {   // spoke axis from its hub end to its rim end
      const [cx, cy] = g.c.x > 0 ? HUBS[0] : HUBS[1];
      let lo = null, hi = null, rl = Infinity, rh = -Infinity;
      for (const v of g.verts) { const r = Math.hypot(sp.rest[v*3] - cx, sp.rest[v*3+1] - cy); if (r < rl) { rl = r; lo = v; } if (r > rh) { rh = r; hi = v; } }
      const o = new THREE.Vector3().fromArray(sp.rest, lo*3), e = new THREE.Vector3().fromArray(sp.rest, hi*3), len = o.distanceTo(e);
      if (len > .15) g.axis = { o, a: e.sub(o).normalize(), len };
    }
  }
  if (np) {
    np.data.pieces = pieces(np.mesh.geometry, np.rest, .004);
    const axes = (sp?.data.pieces.groups || []).filter(g => g.axis);
    const colors = new Float32Array(np.rest.length).fill(1);
    np.mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    for (const g of np.data.pieces.groups) {
      const [cx, cy] = g.c.x > 0 ? HUBS[0] : HUBS[1], rad = new THREE.Vector3(g.c.x - cx, g.c.y - cy, 0).normalize();
      let best = null, bd = Infinity;   // the spoke whose rim end is closest to this nipple
      for (const s of axes) { const end = s.axis.o.clone().addScaledVector(s.axis.a, s.axis.len), d = end.distanceTo(g.c); if (d < bd) { bd = d; best = s; } }
      const dir = best && bd < .03 ? best.axis.a.clone() : rad;
      g.shift = dir.multiplyScalar(-1 / Math.max(.5, dir.dot(rad)));   // radial inward move of exactly 1 per unit depth
      g.hue = (Math.atan2(g.c.y - cy, g.c.x - cx) / (Math.PI * 2) + 1) % 1;
    }
  }
  // pedals: smaller platform, thicker body, inner edge stays on the spindle
  const ped = pick(['Plane006']);
  deform.pedals = new Deformer(ped, (p, style, it) => {
    if (!style) return p;
    for (const side of [1, -1]) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zi = Infinity;
      for (let i = 0; i < p.length; i += 3) if (Math.sign(p[i+2]) === side) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i+1]); y1 = Math.max(y1, p[i+1]); zi = Math.min(zi, Math.abs(p[i+2])); }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      for (let i = 0; i < p.length; i += 3) if (Math.sign(p[i+2]) === side) {
        p[i] = cx + (p[i] - cx) * .62; p[i+1] = cy + (p[i+1] - cy) * 1.55; p[i+2] = side * (zi + (Math.abs(p[i+2]) - zi) * .66);
      }
    }
    return p;
  });
}
function rainbow(model, on, instant){
  const np = model.deform.wheels?.items.find(it => it.mesh.name === 'Spoke_nipples'); if (!np) return;
  const attr = np.mesh.geometry.attributes.color, from = attr.array.slice(), to = new Float32Array(from.length).fill(1), c = new THREE.Color();
  if (on) for (const g of np.data.pieces.groups) { c.setHSL(g.hue, .85, .55); for (const v of g.verts) to.set([c.r, c.g, c.b], v * 3); }
  run(attr, k => { for (let i = 0; i < to.length; i++) attr.array[i] = from[i] + (to[i] - from[i]) * k; attr.needsUpdate = true; }, instant);
}

/* ============ apply configuration ============ */
const CTRL = {};
const addCtrl = c => { if (c.key) CTRL[c.key] = c; for (const cc of c.controls || []) addCtrl(cc); for (const sp of c.spots || []) sp.controls.forEach(addCtrl); };
SECTIONS.forEach(s => s.controls.forEach(addCtrl));
const opt = key => CTRL[key];
const pick = key => opt(key).opts[state[key]] || opt(key).opts[0];

// shape parameters for a state (also used to warm the deformation caches for every look)
const deformParams = s => ({
  cockpit: { rise: BAR_RISE[s.rise]?.[2] ?? 0, dw: BAR_WIDTH[s.width]?.[2] ?? 0 },
  saddle: SADDLE_SHAPES[s.saddleShape]?.[2] ?? 0,
  wheels: { depth: RIM_DEPTHS[s.rimDepth]?.[2] ?? 0, bladed: SPOKE_SHAPES[s.spokeShape]?.[2] ?? 0 },
  pedals: PEDAL_STYLES[s.pedalStyle]?.[2] ?? 0,
});
// `targets`: the models whose geometry follows the state (look thumbnails only touch the light model)
function applyState(instant=false, ui=true, targets=models){
  const paint = pick('frame')[1], fin = FINISH[state.finish] || FINISH[0];
  const finish = { roughness:fin.roughness, metalness:fin.metalness, clearcoat:fin.clearcoat, clearcoatRoughness:fin.clearcoatRoughness };
  for (const m of [M.frame, M.rear]) m.normalScale.set(fin.ns, fin.ns);   // flake map stays bound: no recompile
  setMat(M.frame, { color: paint, ...finish }, instant);
  setMat(M.rear, { color: pick('rear')[1] ?? paint, ...finish }, instant);
  // paint style
  const F = U.frame;
  fadeStyle(F.uStyleT, (slot, i) => { F['uStyle' + slot].value = i; }, state.paint, instant);
  tweenU(F.uC2, pick('paint2')[1], instant);
  F.uScale.value = state.paintScale; F.uAngle.value = state.splitAngle * Math.PI / 180; F.uFade.value = state.fadeLen / 100;
  const ano = pick('accent'); const oil = ano[0] === 'Oil Slick';
  const anoMat = { color: ano[1], iridescence: oil ? 1 : .0001, roughness: oil ? .18 : .28 };
  setMat(M.accent, anoMat, instant);
  setMat(M.nipples, { ...anoMat, color: state.nipples ? '#ffffff' : ano[1] }, instant);
  setMat(M.forkLow, { color: pick('fork')[1] }, instant);
  const up = pick('uppers'); setMat(M.forkUp, { color: up[1], metalness: up[0]==='Black' ? .8 : 1, roughness: up[0]==='Black' ? .12 : .18 }, instant);
  setMat(M.spring, { color: pick('spring')[1] }, instant);
  const rim = pick('rims'); setMat(M.rims, { color: rim[1], metalness: rim[0]==='Black' ? .75 : .95, roughness: rim[0]==='Raw Alloy' ? .25 : .35 }, instant);
  setMat(M.spokes, { color: pick('spokes')[1] }, instant);
  setMat(M.tires, { color: pick('rubber')[1] }, instant);
  fadeStyle(U.tires.uWallT, (slot, i) => { U.tires['uWall' + slot].value = i; }, state.sidewall, instant);
  tweenU(U.tires.uStripe, ano[1], instant);
  setMat(M.grips, { color: pick('grips')[1] }, instant);
  fadeStyle(U.grips.uPatT, (slot, i) => { U.grips['uPat' + slot].value = GRIP_TEX[i]; }, state.gripPat, instant);
  setMat(M.bar, { color: pick('bar')[1] }, instant);
  const suede = state.cover === 3;
  // sheen stays > 0 (sheen = 0 would drop the USE_SHEEN define and recompile)
  setMat(M.saddle, { color: pick('saddle')[1], roughness: suede ? 1 : .62, sheen: suede ? 1 : .05, sheenRoughness: suede ? .32 : .7 }, instant);
  fadeStyle(U.saddle.uCovT, (slot, i) => { U.saddle['uCov' + slot].value = SADDLE_TEX[i]; U.saddle['uPar' + slot].value.set(...SADDLE_PARAMS[i]); }, state.cover, instant);
  const ch = pick('chain'); const coil = ch[0] === 'Oil Slick';
  setMat(M.chain, { color: ch[1], iridescence: coil ? 1 : .0001, roughness: coil ? .16 : .3 }, instant);
  setMat(M.cranks, { color: pick('cranks')[1], metalness: state.cranks ? 1 : .8 }, instant);
  setMat(M.pedals, { color: pick('pedals')[1] }, instant);

  // generated treads are shared; each model's own knobby tire is toggled in syncModel()
  treads.forEach((list, i) => { if (i) list.forEach(t => t.visible = i === state.tread); });

  // stickers & custom text: shared materials and canvases
  const slick = state.tread !== 0;   // the sidewall decals only fit the GLB's knobby tire
  drawTexts();
  for (const info of Object.values(decalInfo)) {
    const sp = info.spot, custom = sp ? spotText(sp).length > 0 : false;
    info.shown = (state.logos === 0 || custom) && !(sp?.arc && slick);
    setMat(info.mat, { color: matchColor(pick(sp ? spotStyle(sp).col : 'logoColor')) }, instant);
    const map = custom ? textDecal(info).tex : info.baseMap;
    if (info.mat.map !== map) info.mat.map = map;   // both are sRGB maps: same shader, no recompile
  }
  for (const m of targets) syncModel(m, instant);
  // shadow signature: anything that changes the bike's silhouette (look thumbnails don't count)
  if (!thumbMode) {
    const sig = [state.tread, state.collars, state.guide, state.pedalsOn, state.height, state.pedalStyle, state.rise, state.width, state.saddleShape, state.rimDepth, state.spokeShape].join();
    if (sig !== shadowSig) { shadowSig = sig; shadowDirty = true; }
  }
  if (ui) updateUI();
  requestRender();
}
// one model's geometry: part swaps, toggles, saddle height, deformations, decal visibility, rainbow nipples
function syncModel(m, instant){
  m.knobby.forEach(t => t.visible = state.tread === 0);
  m.collars.outer.forEach(c => c.visible = state.collars === 0);
  m.collars.inner.forEach(c => c.visible = state.collars !== 2);
  if (m.nodes.Guard) m.nodes.Guard.visible = state.guide === 0;
  if (m.nodes.Pedals) m.nodes.Pedals.visible = state.pedalsOn === 0;
  const local = SEAT_AXIS.clone().multiplyScalar(state.height / 100).applyAxisAngle(new THREE.Vector3(0,1,0), Math.PI/2); // world → bike-local
  for (const n of ['Seat', 'Seatpost']) if (m.nodes[n]) m.nodes[n].position.copy(m.nodes[n].userData.basePos).add(local);
  // shape changes (cached, eased over --slow)
  const dp = deformParams(state);
  for (const k in m.deform) m.deform[k].set(dp[k], instant, thumbMode ? thumbMesh : undefined);
  for (const d of m.decals) d.visible = decalInfo[d.userData.node].shown;
  if (!thumbMode && m.rainbow !== state.nipples) { m.rainbow = state.nipples; rainbow(m, !!state.nipples, instant); }
}
const spotText = sp => { const t = state[sp.key].trim(); return state[sp.id + 'Case'] ? t : t.toUpperCase(); };
const spotStyle = sp => state.sameStyle ? { font: state.txtFont, col: 'logoColor', fx: state.txtFx }
  : { font: state[sp.id + 'Font'], col: sp.id + 'Col', fx: state[sp.id + 'Fx'] };
// a "match" option (null hex) borrows the color of the slot named in opts[i][3]
const matchColor = o => o[1] ?? (o[3] === 'frame' ? pick('frame')[1] : pick('accent')[1]);
let thumbMode = false;   // true while a look thumbnail renders
const thumbMesh = it => it.mesh.name !== 'Spoke_nipples';   // nipples are sub-pixel in a thumbnail: skip and hide them
const textDecal = info => thumbMode ? info.tdThumb : info.td;
function drawTexts(){
  for (const sp of TEXT_SPOTS) {
    const txt = spotText(sp); if (!txt) continue;
    const st = spotStyle(sp), f = FONTS[st.font] || FONTS[0];
    for (const info of spotDecals[sp.id]) textDecal(info).draw(txt, f, st.fx);
  }
}

/* ============ render loop ============ */
function resize(){
  const r = stage.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height; camera.fov = camera.aspect < .9 ? 42 : 30; camera.updateProjectionMatrix();
  // resizing clears the canvas, and ResizeObserver runs after this frame's rAF: render now so nothing flashes
  if (frameReq) { cancelAnimationFrame(frameReq); frameReq = 0; }
  frame(performance.now());
}

/* ============ render on demand ============ */
// Nothing renders unless something changed: the camera (controls, tweens, auto-rotate), a material or uniform
// animation (run()), a deformation, a text redraw, a thumbnail job, or a resize. Idle = 0 renders per second.
let frameReq = 0, lastFrame = 0, lastMove = -1e9, restTimer = 0, stageVisible = true, interactUntil = 0, pointerHeld = false;
let shadowDirty = true, shadowSig = '';
function requestRender(){
  if (!frameReq && stageVisible && !document.hidden) frameReq = requestAnimationFrame(frame);
}
function frame(now){
  frameReq = 0;
  let cameraMoving = false;
  if (tween) {
    const t = Math.min(1, Math.max(0, (now - tween.start) / tween.dur)), k = easeInOut(t);
    camera.position.lerpVectors(tween.from.c, tween.to.c, k); controls.target.lerpVectors(tween.from.t, tween.to.t, k);
    if (t >= 1) tween = null;
    cameraMoving = true;
  }
  // clamp at 0 too: rAF's `now` can be earlier than the performance.now() an animation started at, and a negative
  // step would overshoot (iridescence .0001 → -.005 drops the define and recompiles the shader)
  for (const [key, a] of anims) { const t = Math.min(1, Math.max(0, (now - a.start) / a.dur)); if (t >= 1) anims.delete(key); a.step(1 - Math.pow(1 - t, 3)); }
  let deforming = false;
  for (const m of models) for (const k in m.deform) if (m.deform[k].step(now)) deforming = true;
  if (controls.update()) cameraMoving = true;   // true while damping or auto-rotate moves the camera
  if (controls.autoRotate) cameraMoving = true;
  if (!stageVisible || document.hidden || holdRender) return;   // holdRender: a quality switch is compiling its shaders
  if (twins && fastOn) syncTwins();
  // resolution: full at rest, capped while the camera moves, 1.0 while the user drags or zooms. A click that doesn't
  // move the camera keeps full resolution, and the moving resolution is held for 200 ms so quick drags don't thrash.
  if (cameraMoving) lastMove = now;
  const input = pointerHeld || now < interactUntil;
  let mode = cameraMoving ? (input ? 'input' : 'move') : 'rest';
  if (mode === 'rest' && now - lastMove < 200) mode = null;
  if (mode && mode !== 'rest' && lastFrame) res.sample(now - lastFrame);
  if (mode) res.apply(res.target(mode));
  // LOD: the detailed model at rest, the light one while the user drags (and while the camera moves on touch devices)
  if (pendingUpload) { uploadModel(pendingUpload); detail = pendingUpload; pendingUpload = null; }
  if (mode && detail) {
    const want = fastOn || mode === 'input' || (coarse && mode === 'move') ? low : detail;
    if (want === detail && !detail.shown) {   // first time: its silhouette replaces the light model's in the shadow map
      detail.shown = true; shadowDirty = true; document.documentElement.dataset.lod = 'detail'; performance.mark('detail');
    }
    showModel(want);
  }
  if (thumbPending) { thumbPending = false; thumbStep(now); scheduleThumb(); }   // draws into a corner; the full render below paints over it
  // static shadows: one shadow pass when parts move, appear or disappear (after thumbStep, so a look's shadow never leaks in)
  if (deforming) shadowDirty = true;
  const shadowPass = shadowDirty;
  if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
  res.begin();
  const r0 = performance.now(); renderer.render(scene, camera); perfTick(r0, performance.now(), shadowPass);
  res.end();
  lastFrame = now;
  const busy = cameraMoving || deforming || anims.size > 0 || tween;
  clearTimeout(restTimer);
  if (busy) { requestRender(); return; }
  lastFrame = 0;
  // settled: about 200 ms later, one full-quality frame (only if the last one wasn't already full quality)
  if (Math.abs(renderer.getPixelRatio() - res.target('rest')) > .01) restTimer = setTimeout(requestRender, 200);
}
new ResizeObserver(resize).observe(stage);
controls.addEventListener('change', requestRender);
renderer.domElement.addEventListener('pointerdown', () => { pointerHeld = true; });
addEventListener('pointerup', () => { pointerHeld = false; });
addEventListener('pointercancel', () => { pointerHeld = false; });
renderer.domElement.addEventListener('wheel', () => { interactUntil = performance.now() + 150; requestRender(); }, { passive: true });
// pause while the tab is hidden or the stage is scrolled out of view
document.addEventListener('visibilitychange', () => { if (!document.hidden) requestRender(); });
new IntersectionObserver(([e]) => { stageVisible = e.isIntersecting; if (stageVisible) requestRender(); }).observe(stage);

/* ============ quality mode: Auto / High / Fast ============ */
// Fast: the light model only, DPR 1, standard materials, no shadow map (a baked contact shadow instead), no auto-rotate.
// Auto picks Fast on low-end devices (quality.js). Switching compiles the other shader set with compileAsync while the
// last frame stays on screen, so a switch never stalls; the choice is saved in localStorage.
let quality = savedQuality(), fastOn = false, autoFast = null, holdRender = false, twins = null;
const PHYS_KEYS = ['frame', 'rear', 'accent', 'forkLow', 'forkUp', 'spring', 'saddle', 'chain', 'nipples'];
// standard twins of the physical materials; they share the shader-patch uniforms and copy animated values each frame
function makeTwins(){
  twins = new Map();
  for (const k of PHYS_KEYS) {
    const m = M[k];
    twins.set(m, new THREE.MeshStandardMaterial({ color: m.color, roughness: m.roughness, metalness: m.metalness,
      normalMap: m.normalMap, normalScale: m.normalScale.clone(), vertexColors: m.vertexColors }));
  }
  patchFrame([twins.get(M.frame), twins.get(M.rear)], U.frame);
  patchSaddle(twins.get(M.saddle), U.saddle);
}
function syncTwins(){
  for (const [m, t] of twins) {
    t.color.copy(m.color); t.emissive.copy(m.emissive); t.normalScale.copy(m.normalScale);
    t.emissiveIntensity = m.emissiveIntensity; t.roughness = m.roughness; t.metalness = m.metalness;
  }
}
async function setFast(on, { compile = true } = {}){
  if (on === fastOn) return;
  fastOn = on;
  if (on && !twins) makeTwins();
  const swap = new Map(on ? twins : [...twins].map(([a, b]) => [b, a]));
  scene.traverse(o => { if (o.isMesh && swap.has(o.material)) o.material = swap.get(o.material); });
  renderer.shadowMap.enabled = !on; ground.visible = !on; contact.visible = on;
  if (on && !contact.parent) scene.add(contact);
  if (on && !contact.material.map) contact.material.map = new THREE.TextureLoader().load('assets/poster/contact-shadow.webp', () => requestRender());
  res.configure(on ? RES_FAST : RES_HIGH);
  if (on && controls.autoRotate) spinBtn.click();
  spinBtn.disabled = on;
  if (on) { if (low) showModel(low); if (modelReady) document.documentElement.dataset.lod = 'light-only'; }
  else if (modelReady && !glbParam) { if (detail) detail.shown = false; else loadDetail(); document.documentElement.dataset.lod = 'light'; }
  shadowDirty = true; syncTwins();
  if (compile && low) { holdRender = true; await compileVariants(); holdRender = false; }
  syncQualityUI(); requestRender();
}
// compile every variant (hidden tires, collars, guide, pedals) for the current mode, then restore the build's visibility
async function compileVariants(){
  const list = [...treads.slice(1).flat(), ...models.flatMap(m => [...m.knobby, ...m.collars.inner, ...m.collars.outer, m.nodes.Guard, m.nodes.Pedals])].filter(Boolean);
  const roots = models.map(m => m.root.visible);
  list.forEach(o => o.visible = true); models.forEach(m => m.root.visible = !fastOn || m === low);
  try { await renderer.compileAsync(scene, camera); } catch (e) {}
  models.forEach((m, i) => m.root.visible = roots[i]);
  treads.forEach((l, i) => { if (i) l.forEach(t => t.visible = i === state.tread); });
  models.forEach(m => syncModel(m, true));
}

/* ============ look thumbnails ============ */
// Each look is rendered once with the main renderer into a scissored corner of the canvas, copied out, and cached
// as a data URL per theme. Same renderer and default framebuffer means the same compiled shaders: no recompiles.
// (A render target would compile new programs: three renders targets with linear output and no tone mapping.)
const TW = 336, TH = 184;   // 2x of the 168×92 card thumbnail
const thumbCam = new THREE.PerspectiveCamera(22, TW / TH, .1, 30);
thumbCam.position.set(.45, .82, 3.55); thumbCam.lookAt(0, .5, 0);
const thumbCanvas = Object.assign(document.createElement('canvas'), { width: TW, height: TH });
const thumbCache = new Map();   // `${theme}|${look}` → data URL, mirrored in sessionStorage for the session
let thumbQueue = [], lastThumb = 0, modelReady = false, thumbPending = false, looksVisible = false, thumbIdle = 0;
// session cache key: changes whenever the looks or the model change
const THUMB_KEY = 'looks:' + [...JSON.stringify(PRESETS) + LOD_URL.low].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7).toString(36);
const thumbStore = { get: k => { try { return sessionStorage.getItem(THUMB_KEY + '|' + k); } catch (e) { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(THUMB_KEY + '|' + k, v); } catch (e) {} } };
// lazily: only while the look cards are on screen, one thumbnail per idle callback (each costs one frame)
function scheduleThumb(){
  if (thumbIdle || !modelReady || !looksVisible || !thumbQueue.length) return;
  thumbIdle = (window.requestIdleCallback || setTimeout)(() => { thumbIdle = 0; thumbPending = true; requestRender(); }, { timeout: 500 });
}
const themeName = () => { const r = document.documentElement; return (r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; };
function queueThumbs(){
  const t = themeName(); thumbQueue = [];
  PRESETS.forEach((p, i) => {
    const url = thumbCache.get(t + '|' + i) || thumbStore.get(t + '|' + i);
    if (url) { thumbCache.set(t + '|' + i, url); setThumb(i, url); return; }
    if (TEXT_SPOTS.some(sp => p.c[sp.key])) thumbQueue.push({ i, prep: true });   // draw and upload its lettering a frame early
    thumbQueue.push({ i });
  });
  scheduleThumb();
}
// draw a look's text into the small thumbnail decals and upload them, so its thumbnail frame only renders
function prepThumbText(i){
  const saved = { ...state };
  thumbMode = true; Object.assign(state, DEFAULT, PRESETS[i].c); drawTexts(); thumbMode = false;
  Object.assign(state, saved);
  for (const sp of TEXT_SPOTS) if (PRESETS[i].c[sp.key]) for (const info of spotDecals[sp.id]) renderer.initTexture(info.tdThumb.tex);
}
function thumbStep(now){
  // one look per frame, only while nothing is animating (the swap below applies states instantly)
  if (!modelReady || !thumbQueue.length || anims.size || tween || models.some(m => Object.values(m.deform).some(d => d.anim))) return;
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2()); if (buf.x < TW || buf.y < TH) return;
  lastThumb = now;
  const job = thumbQueue.shift(), i = job.i, theme = themeName(), saved = { ...state };
  if (job.prep) { prepThumbText(i); return; }
  const lit = Object.values(hlMats || {}).flat().filter(m => m.emissiveIntensity > 0).map(m => [m, m.emissiveIntensity]);
  lit.forEach(([m]) => m.emissiveIntensity = 0);   // a hovered part's glow must not end up in a thumbnail
  thumbMode = true; Object.assign(state, DEFAULT, PRESETS[i].c); applyState(true, false, [low]);   // thumbnails come from the light model
  const was = showModel(low);
  const pr = renderer.getPixelRatio(), size = renderer.getSize(new THREE.Vector2()), clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
  renderer.setScissorTest(true); renderer.setViewport(0, 0, TW / pr, TH / pr); renderer.setScissor(0, 0, TW / pr, TH / pr);
  const nip = low.meshes.Spoke_nipples; if (nip) nip.visible = false;
  renderer.setClearColor(0x000000, 0); renderer.render(scene, thumbCam);
  if (nip) nip.visible = true;
  const g = thumbCanvas.getContext('2d'); g.clearRect(0, 0, TW, TH);
  g.drawImage(renderer.domElement, 0, buf.y - TH, TW, TH, 0, 0, TW, TH);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, size.x, size.y); renderer.setClearColor(clear, alpha);
  showModel(was);
  thumbMode = false; Object.assign(state, saved); applyState(true, false, [low]);
  lit.forEach(([m, v]) => m.emissiveIntensity = v);
  // encode off the main thread, then hand over a data URL
  thumbCanvas.toBlob(b => { const r = new FileReader(); r.onload = () => { thumbCache.set(theme + '|' + i, r.result); thumbStore.set(theme + '|' + i, r.result); if (theme === themeName()) setThumb(i, r.result); }; r.readAsDataURL(b); }, 'image/webp', .85);
}
// cross-fade: load into the hidden layer, then swap
function setThumb(i, url){
  const card = document.querySelector(`[data-preset="${i}"]`); if (!card) return;
  const [a, b] = card.querySelectorAll('.lthumb img'), cur = a.classList.contains('on') ? a : b.classList.contains('on') ? b : null;
  if (cur?.getAttribute('src') === url) return;
  const next = cur === a ? b : a;
  next.onload = () => { next.classList.add('on'); cur?.classList.remove('on'); card.classList.add('ready'); };
  next.src = url;
}
controls.addEventListener('start', () => { tween = null; document.getElementById('hint').style.opacity = 0; document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('on')); });

/* click a part → open its section */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  // pick against the light model (its geometry follows the same state), whichever model is drawn
  const shown = o => { for (let x = o; x && x !== low.root; x = x.parent) if (!x.visible) return false; return true; };
  const hit = ray.intersectObjects([...low.pickables, ...treads.slice(1).flat()].filter(shown), false)[0]; if (!hit) return;
  const slot = hit.object.userData.slot, sec = SLOT_SECTION[slot], sp = TEXT_SPOTS.find(s => s.id === hit.object.userData.spot);
  if (sp) { showTip(e, sp.name + ' text'); openSection('stickers', true, sp.view, 'spot-' + sp.id); openSpot(sp.id, true, false); return; }
  showTip(e, SLOT_LABEL[slot] || 'Part'); if (sec) openSection(sec, true);
});
const tip = document.getElementById('partTip'); let tipT;
function showTip(e, label){
  const r = stage.getBoundingClientRect();
  tip.textContent = label; tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px';
  tip.classList.add('on'); clearTimeout(tipT); tipT = setTimeout(() => tip.classList.remove('on'), 1200);
}

/* ============ UI ============ */
const fmt = n => (n < 0 ? '−€' : '€') + Math.abs(n).toLocaleString('en-US');
const chev = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
const bg = o => o[0] === 'Oil Slick' ? OIL : (o[1] ?? 'transparent');

const when = c => c.when ? ` data-when="${c.when[0]}:${[].concat(c.when[1]).join(',')}"` : '';
const pv = c => ` data-pv="${c.key}"`;
let moreId = 0;
function control(c){
  const w = when(c);
  if (c.type === 'color') return `<div class="ctrl"${w}><div class="glabel">${c.label} <b data-cl="${c.key}"></b></div><div class="swatches" role="radiogroup" aria-label="${c.label}">` +
    c.opts.map((o,i) => `<button class="sw${o[1]===null?' match':''}"${o[3]?` data-match="${o[3]}"`:''} role="radio" aria-checked="false" data-k="${c.key}" data-i="${i}" title="${o[0]}${o[2]?` (+${fmt(o[2])})`:''}" aria-label="${o[0]}${o[2]?`, plus ${fmt(o[2])}`:''}"><i style="background:${bg(o)}"></i>${o[2]?`<span class="plus">+${o[2]}</span>`:''}</button>`).join('') + '</div></div>';
  if (c.type === 'seg') return `<div class="ctrl"${w}><div class="glabel">${c.label}</div><div class="seg" role="radiogroup" aria-label="${c.label}">` +
    c.opts.map((o,i) => `<button role="radio" aria-checked="false" data-k="${c.key}" data-i="${i}">${o[0]}${o[1]?`<small>${o[1]>0?'+':'−'}${Math.abs(o[1])}</small>`:''}</button>`).join('') + '</div></div>';
  if (c.type === 'effect') return `<div class="ctrl"${w}><div class="glabel">${c.label}</div><div class="seg" role="radiogroup" aria-label="${c.label}">` +
    c.opts.map((o,i) => `<button role="radio" aria-checked="false" data-k="${c.key}" data-i="${i}"><span class="fxp fx${i}" aria-hidden="true">A</span>${o[0]}</button>`).join('') + '</div></div>';
  if (c.type === 'font') return `<div class="ctrl"${w}><div class="glabel">${c.label} <b data-cl="${c.key}"></b></div><div class="fonts" role="radiogroup" aria-label="${c.label}">` +
    c.opts.map((o,i) => `<button class="fontcard" role="radio" aria-checked="false" data-k="${c.key}" data-i="${i}" title="${o[0]}" aria-label="${o[0]}"><span style="font-family:'${o[1]}',sans-serif;font-weight:${o[2]}">Ab</span></button>`).join('') + '</div></div>';
  if (c.type === 'style' || c.type === 'pattern') return `<div class="ctrl"${w}><div class="glabel">${c.label} <b data-cl="${c.key}"></b></div><div class="cards"${pv(c)} role="radiogroup" aria-label="${c.label}">` +
    c.opts.map((o,i) => `<button class="card pcard" role="radio" aria-checked="false" data-k="${c.key}" data-i="${i}"><i class="chip" style="background:${o[3] || 'var(--c1)'}" aria-hidden="true"></i><b>${o[0]}</b><span>${o[2]?`+${fmt(o[2])} · `:''}${o[1]}</span></button>`).join('') + '</div></div>';
  if (c.type === 'deform') return `<div class="ctrl"${w}><div class="glabel">${c.label}</div><div class="seg" role="radiogroup" aria-label="${c.label}">` +
    c.opts.map((o,i) => `<button role="radio" aria-checked="false" data-k="${c.key}" data-i="${i}">${o[0]}${o[1]?`<small>+${o[1]}</small>`:''}</button>`).join('') + '</div></div>';
  if (c.type === 'more') { const id = 'more-' + (++moreId); return `<div class="ctrl more"><button class="moreBtn" aria-expanded="false" aria-controls="${id}" data-more>More options ${chev}</button><div class="moreBody" id="${id}"><div><div class="moreInner">${c.controls.map(control).join('')}</div></div></div></div>`; }
  if (c.type === 'cards') return `<div class="ctrl"${w}><div class="glabel">${c.label}</div><div class="cards" role="radiogroup" aria-label="${c.label}">` +
    c.opts.map((o,i) => `<button class="card" role="radio" aria-checked="false" data-k="${c.key}" data-i="${i}"><b>${o[0]}</b><span>${o[1]}</span></button>`).join('') + '</div></div>';
  if (c.type === 'range') { const [lo, hi] = c.labels || (c.min < 0 ? [`${c.min} ${c.unit}`, `+${c.max} ${c.unit}`] : [`${c.min}${c.unit}`, `${c.max}${c.unit}`]);
    return `<div class="ctrl"${w}><div class="glabel">${c.label} <b data-cl="${c.key}"></b></div><input class="range" type="range" min="${c.min}" max="${c.max}" step="${c.step || 1}" data-range="${c.key}" aria-label="${c.label}"><div class="rangeRow"><span>${lo}</span><span>${hi}</span></div></div>`; }
  if (c.type === 'toggle') return `<div class="ctrl"${w}><button class="toggle" role="switch" aria-checked="false" data-toggle="${c.key}"><span>${c.label}</span><i aria-hidden="true"></i></button></div>`;
  if (c.type === 'text') return `<div class="ctrl"${w}><input class="textIn" maxlength="${c.max}" placeholder="${c.placeholder}" data-text="${c.key}" aria-label="${c.label}" autocomplete="off" spellcheck="false"><div class="help">Letters, numbers, spaces and - . &amp; ' · up to ${c.max}</div></div>`;
  if (c.type === 'spots') return `<div class="ctrl"><div class="glabel">${c.label} <b>+${fmt(TEXT_PRICE)} each · max ${fmt(TEXT_PRICE_MAX)}</b></div><div class="spots">` +
    c.spots.map(sp => `<div class="spot" id="spot-${sp.id}">
      <button class="sphead" data-spot="${sp.id}" aria-expanded="false" aria-controls="spb-${sp.id}"><span class="spname">${sp.name}</span><span class="spval" id="spval-${sp.id}"></span>${chev}</button>
      <div class="spbody" id="spb-${sp.id}"><div><div class="spinner">
        <div class="ctrl"><div class="seg" role="radiogroup" aria-label="${sp.name} text">${['Original logo','Custom text'].map((l,v) => `<button role="radio" aria-checked="false" data-mode="${sp.id}" data-v="${v}">${l}</button>`).join('')}</div></div>
        ${control(sp.controls[0])}<div class="ifcustom">${sp.controls.slice(1).map(control).join('')}</div>
      </div></div></div></div>`).join('') + '</div></div>';
}
document.getElementById('sections').innerHTML = SECTIONS.map(s => `
  <div class="sec" id="sec-${s.id}">
    <button class="shead" aria-expanded="false" aria-controls="body-${s.id}" data-sec="${s.id}">
      <span class="sicon">${SECTION_ICONS[s.id] ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SECTION_ICONS[s.id]}</svg>` : ''}<i class="sdot" id="dot-${s.id}"></i></span><span class="sname">${s.name}</span><span class="sval" id="val-${s.id}"></span>${chev}
    </button>
    <div class="sbody" id="body-${s.id}"><div><div class="sinner">${s.controls.map(control).join('')}</div></div></div>
  </div>`).join('');

// sidewall text only fits the GLB's knobby tire (see docs/ROADMAP.md), so it is neither shown nor charged on other treads
const spotShown = (sp, s = state) => !(sp.arc && s.tread !== 0);
const customSpots = (s = state) => TEXT_SPOTS.filter(sp => s[sp.key].trim() && spotShown(sp, s)).length;
const textTotal = (s = state) => Math.min(customSpots(s) * TEXT_PRICE, TEXT_PRICE_MAX);
function extrasTotal(s = state){
  let sum = textTotal(s);
  for (const c of Object.values(CTRL)) {
    if (!c.opts || c.type === 'font') continue;
    const o = c.opts[s[c.key]]; if (!o) continue;
    const p = ['seg', 'effect', 'deform'].includes(c.type) ? o[1] : o[2]; if (p) sum += p;
  }
  return sum;
}
/* hover or focus a section row → its parts glow softly on the bike */
// Every highlightable material gets a fixed emissive color at load; only emissiveIntensity animates (a uniform: no recompile).
// pulse: rise to `peak` over `in`, settle to `hold` over `out` while the row stays hovered, fade out over `out`
const HL = { color: '#ffffff', peak: .2, hold: .09, in: 180, out: 260 };
let hlMats = null, hlSec = null;
function sectionMats(){
  if (hlMats) return hlMats;
  hlMats = {};
  for (const [slot, sec] of Object.entries(SLOT_SECTION)) if (M[slot]) (hlMats[sec] ??= []).push(M[slot]);
  hlMats.accent.push(M.nipples);
  hlMats.stickers = Object.values(decalInfo).map(i => i.mat);
  for (const m of Object.values(hlMats).flat()) { m.emissive.set(HL.color); m.emissiveIntensity = 0; m.userData.hl = {}; }
  return hlMats;
}
function highlight(id){
  if (id === hlSec || !low) return; hlSec = id;
  for (const [sec, mats] of Object.entries(sectionMats())) for (const m of mats) {
    const from = m.emissiveIntensity, key = m.userData.hl;
    if (sec !== id) {
      if (from > 0 || anims.has(key)) run(key, k => { m.emissiveIntensity = from * (1 - k); }, false, HL.out);
      continue;
    }
    run(key, k => {
      m.emissiveIntensity = from + (HL.peak - from) * k;
      if (k >= 1 && hlSec === id) run(key, j => { m.emissiveIntensity = HL.peak + (HL.hold - HL.peak) * j; }, false, HL.out);
    }, false, HL.in);
  }
}
// the last pointer decides hover vs touch (media queries misreport on hybrid and emulated devices)
let lastPointer = 'mouse', hlOnce;
addEventListener('pointerdown', e => { lastPointer = e.pointerType; }, true);
for (const h of document.querySelectorAll('.shead')) {
  const id = h.dataset.sec;
  h.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') highlight(id); });
  h.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !h.matches(':focus-visible')) highlight(null); });
  h.addEventListener('focus', () => { if (h.matches(':focus-visible')) highlight(id); });
  h.addEventListener('blur', () => { if (hlSec === id && !h.matches(':hover')) highlight(null); });
}
// touch: play the glow once when a section opens
function playHighlight(id){
  if (lastPointer !== 'touch' && lastPointer !== 'pen') return;
  clearTimeout(hlOnce); highlight(id); hlOnce = setTimeout(() => highlight(null), HL.in + 520);
}

const check = '<svg class="chk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
document.getElementById('presets').innerHTML = '<i class="lookSel" aria-hidden="true"></i>' + PRESETS.map((p,i) => {
  const ex = extrasTotal({ ...DEFAULT, ...p.c });
  return `<button class="look" data-preset="${i}" aria-pressed="false" aria-label="${p.name}: ${p.desc}, ${ex ? 'plus ' + fmt(ex) : 'base price'}. Replaces your whole build.">
    <span class="lthumb"><img alt=""><img alt=""></span>
    <span class="lmeta"><span class="lname"><b>${p.name}</b><span class="ledit">· edited</span>${check}</span>
    <span class="ldesc">${p.desc}</span><span class="lprice">${ex ? '+' + fmt(ex) : 'Base price'}</span></span>
  </button>`;
}).join('');
function summary(s){
  const v = k => pick(k)[0];
  switch (s.id) {
    case 'frame': {
      const st = v('paint'), a = v('frame'), b = v('paint2');
      if (!state.paint) return `${a} · ${v('finish')}`;
      if (state.paint === 5) return `Carbon weave · ${v('finish')}`;
      return state.paint === 1 ? `Fade · ${a} → ${b}` : `${st} · ${a} / ${b}`;
    }
    case 'rear': return v('rear');
    case 'fork': return v('fork') + (state.uppers ? ' · Kashima' : '');
    case 'shock': return v('spring') + ' spring';
    case 'wheels': return `${v('rims')} rims` + (state.rimDepth ? ' · Deep' : '') + (state.spokeShape ? ' · Bladed' : '') + (state.nipples ? ' · Rainbow' : '');
    case 'tires': return `${v('tread')} · ${state.sidewall ? v('sidewall') : v('rubber')}`;
    case 'cockpit': return `${v('grips')} ${v('gripPat').toLowerCase()} grips · ${v('width')}` + (state.rise ? ` · ${v('rise').toLowerCase()}` : '');
    case 'saddle': return [state.saddleShape ? v('saddleShape') : '', `${v('saddle')} ${v('cover').toLowerCase()}`, state.height ? `${state.height>0?'+':''}${state.height} cm` : ''].filter(Boolean).join(' · ');
    case 'drive': return `${v('chain')} chain${state.guide ? ' · no guide' : ''}`;
    case 'pedals': return state.pedalsOn ? 'No pedals' : `${v('pedals')}${state.pedalStyle ? ' · clip-in look' : ''}`;
    case 'stickers': { const n = customSpots(); return n ? `${n} custom · ${fmt(textTotal())}` : (state.logos ? 'Logos hidden' : 'Original logos'); }
    default: return v(s.controls[0].key);
  }
}
function dotColor(s){
  const k = { frame:'frame', rear:'rear', accent:'accent', fork:'fork', shock:'spring', wheels:'rims', tires:'rubber', cockpit:'grips', saddle:'saddle', drive:'chain', pedals:'pedals', stickers:'logoColor' }[s.id];
  const o = pick(k);
  if (o[1] === null) return k === 'rear' ? pick('frame')[1] : o[3] === 'frame' ? pick('frame')[1] : bg(pick('accent'));
  return bg(o);
}
function updateUI(){
  for (const s of SECTIONS) {
    document.getElementById('val-' + s.id).textContent = summary(s);
    document.getElementById('dot-' + s.id).style.background = dotColor(s);
  }
  document.querySelectorAll('[data-cl]').forEach(el => {
    const c = opt(el.dataset.cl);
    if (c.type === 'range') { const h = state[c.key]; el.textContent = c.labels ? '' : c.min < 0 ? (h === 0 ? 'Standard' : `${h>0?'+':''}${h} ${c.unit}`) : `${h}${c.unit}`; return; }
    const o = c.opts[state[c.key]]; el.textContent = o[0] + (c.type === 'color' && o[2] ? ` · +${fmt(o[2])}` : '');
  });
  document.querySelectorAll('[data-k]').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.i === state[b.dataset.k])));
  document.querySelectorAll('[data-range]').forEach(r => { if (+r.value !== state[r.dataset.range]) r.value = state[r.dataset.range]; });
  document.querySelectorAll('[data-text]').forEach(t => { if (document.activeElement !== t) t.value = state[t.dataset.text]; });
  // "match" swatches preview the color they borrow
  document.querySelectorAll('[data-match]').forEach(b => { b.firstElementChild.style.background = `conic-gradient(from 45deg, ${b.dataset.match === 'frame' ? pick('frame')[1] : bg(pick('accent'))} 0 50%, var(--surface) 0 100%)`; });
  document.querySelectorAll('[data-when]').forEach(el => { const [k, v] = el.dataset.when.split(':'); el.hidden = !v.split(',').map(Number).includes(state[k]); });
  document.querySelectorAll('.more').forEach(el => { el.hidden = ![...el.querySelectorAll('.moreInner>.ctrl')].some(c => !c.hidden); });
  // card previews use the part's live colors
  const pvc = { paint: [pick('frame')[1], pick('paint2')[1]], tread: [pick('rubber')[1]], sidewall: [pick('rubber')[1]], gripPat: [pick('grips')[1]], cover: [pick('saddle')[1]] };
  document.querySelectorAll('[data-pv]').forEach(el => {
    const [c1, c2 = c1] = pvc[el.dataset.pv] || [];
    el.style.setProperty('--c1', c1); el.style.setProperty('--c2', c2);
    el.style.setProperty('--c3', `color-mix(in srgb, ${c1} 50%, ${c2}) `); el.style.setProperty('--ac', bg(pick('accent'))); el.style.setProperty('--c0', 'var(--hover)');
  });
  document.querySelectorAll('[data-toggle]').forEach(b => b.setAttribute('aria-checked', String(!!state[b.dataset.toggle])));
  for (const sp of TEXT_SPOTS) {
    const custom = !!state[sp.key].trim();
    document.getElementById('spot-' + sp.id).classList.toggle('custom', custom);
    document.getElementById('spval-' + sp.id).textContent = !spotShown(sp) ? 'Knobby tread only' : custom ? `“${spotText(sp)}”` : (state.logos ? 'Hidden' : 'Original logo');
    document.querySelectorAll(`[data-mode="${sp.id}"]`).forEach(b => b.setAttribute('aria-checked', String(+b.dataset.v === +custom)));
    document.querySelector(`[data-text="${sp.key}"]`).classList.toggle('asis', state[sp.id + 'Case'] === 1);
  }
  const ex = extrasTotal();
  document.getElementById('total').textContent = fmt(BASE_PRICE + ex);
  document.getElementById('extra').textContent = ex ? `incl. ${fmt(ex)} in options` : '';
  syncLooks();
}
// which look card is selected: the look the shopper applied (marked edited once anything changes),
// or, with no look applied (e.g. a shared link), the look this build matches
function syncLooks(){
  let sel = -1, edited = false;
  if (look) { sel = look.i; edited = Object.keys(DEFAULT).some(k => state[k] !== look.snap[k]); }
  else sel = PRESETS.findIndex(presetMatches);
  const wrap = document.getElementById('presets'), ind = wrap.querySelector('.lookSel');
  document.querySelectorAll('.look').forEach((b, i) => { b.setAttribute('aria-pressed', String(i === sel)); b.classList.toggle('edited', i === sel && edited); });
  const card = wrap.querySelector(`[data-preset="${sel}"]`);
  ind.classList.toggle('on', !!card); ind.classList.toggle('edited', edited);
  if (card) Object.assign(ind.style, { transform: `translateX(${card.offsetLeft}px)`, width: card.offsetWidth + 'px', height: card.offsetHeight + 'px', top: card.offsetTop + 'px' });
}

// Presets are looks: text the shopper typed survives a preset change, text that came from a preset does not.
const TEXT_KEYS = TEXT_SPOTS.map(sp => sp.key);
let presetText = {};
const presetMatches = p => Object.keys(DEFAULT).every(k => (TEXT_KEYS.includes(k) && !(k in p.c) && state[k] !== presetText[k]) || ({ ...DEFAULT, ...p.c })[k] === state[k]);
let look = null;   // { i, snap }: the look applied last and the build right after applying it
// how many parts a change touches: changed options that are visible in either build; a text spot's style counts with its text
function changedParts(a, b){
  const shown = (k, s) => { const w = CTRL[k]?.when; return !w || [].concat(w[1]).includes(s[w[0]]); };
  const parts = new Set();
  for (const k of Object.keys(DEFAULT)) {
    if (a[k] === b[k] || k === 'sameStyle' || !(shown(k, a) || shown(k, b))) continue;
    const sp = TEXT_SPOTS.find(sp => k !== sp.key && k.startsWith(sp.id) && /^(Case|Font|Col|Fx)$/.test(k.slice(sp.id.length)));
    if (sp) { if (a[sp.key].trim() || b[sp.key].trim()) parts.add(sp.key); continue; }
    parts.add(k);
  }
  return parts.size;
}
function applyLook(i){
  const p = PRESETS[i], prev = { state: { ...state }, look, presetText: { ...presetText } };
  applyPreset(p); commit(); flyTo('overview');
  const n = changedParts(prev.state, state);
  look = { i, snap: { ...state } }; syncLooks();
  document.querySelector(`[data-preset="${i}"]`).scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  if (!n) { toast(`${p.name} is already your build`); return; }
  toast(`${p.name} applied to ${n} part${n === 1 ? '' : 's'}`, 'Undo', () => {
    Object.assign(state, prev.state); look = prev.look; presetText = prev.presetText; commit();
    toast('Previous build restored');
  });
}
function applyPreset(p){
  const keep = {};
  for (const k of TEXT_KEYS) keep[k] = k in p.c ? p.c[k] : (state[k] !== (presetText[k] ?? '') ? state[k] : '');
  Object.assign(state, DEFAULT, p.c, keep);
  presetText = Object.fromEntries(TEXT_KEYS.map(k => [k, k in p.c ? p.c[k] : '']));
}

function openSpot(id, force, fly=true){
  document.querySelectorAll('.spot').forEach(el => {
    const open = el.id === 'spot-' + id && (force || !el.classList.contains('open'));
    el.classList.toggle('open', open); el.querySelector('.sphead').setAttribute('aria-expanded', String(open));
  });
  const sp = TEXT_SPOTS.find(s => s.id === id);
  if (fly && document.getElementById('spot-' + id).classList.contains('open')) flyTo(sp.view);
}
function openSection(id, fromModel=false, view, scrollTo){
  document.querySelectorAll('.sec').forEach(el => {
    const open = el.id === 'sec-' + id && (fromModel || !el.classList.contains('open'));
    el.classList.toggle('open', open); el.querySelector('.shead').setAttribute('aria-expanded', String(open));
  });
  const el = document.getElementById('sec-' + id);
  if (el.classList.contains('open')) {
    playHighlight(id);
    flyTo(view || SECTIONS.find(s => s.id === id).focus);
    setTimeout(() => (scrollTo ? document.getElementById(scrollTo) : el).scrollIntoView({ block:'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }), 280);
  }
}
const commit = () => { applyState(); writeHash(); };
document.addEventListener('click', e => {
  const h = e.target.closest('[data-sec]'); if (h) { openSection(h.dataset.sec); return; }
  const o = e.target.closest('[data-k]'); if (o) { state[o.dataset.k] = +o.dataset.i; commit(); return; }
  const sh = e.target.closest('[data-spot]'); if (sh) { openSpot(sh.dataset.spot); return; }
  const mo = e.target.closest('[data-more]'); if (mo) { const open = mo.getAttribute('aria-expanded') !== 'true'; mo.setAttribute('aria-expanded', String(open)); mo.parentElement.classList.toggle('open', open); return; }
  const md = e.target.closest('[data-mode]'); if (md) {
    const sp = TEXT_SPOTS.find(s => s.id === md.dataset.mode), input = document.querySelector(`[data-text="${sp.key}"]`);
    if (+md.dataset.v) { if (!state[sp.key].trim()) state[sp.key] = sp.def; commit(); input.focus(); input.select(); }
    else { state[sp.key] = ''; commit(); }
    return;
  }
  const tg = e.target.closest('[data-toggle]'); if (tg) {
    const k = tg.dataset.toggle; state[k] = state[k] ? 0 : 1;
    // turning "same style" off starts every spot from the shared style, so nothing jumps
    if (k === 'sameStyle' && !state[k]) for (const sp of TEXT_SPOTS) Object.assign(state, { [sp.id+'Font']: state.txtFont, [sp.id+'Col']: state.logoColor, [sp.id+'Fx']: state.txtFx });
    commit(); return;
  }
  const p = e.target.closest('[data-preset]'); if (p) { applyLook(+p.dataset.preset); return; }
  const v = e.target.closest('[data-view]'); if (v) flyTo(v.dataset.view);
});
document.addEventListener('input', e => {
  if (e.target.dataset.range) { state[e.target.dataset.range] = +e.target.value; commit(); }
  if (e.target.dataset.text) {
    const k = e.target.dataset.text, v = cleanText(e.target.value, k);
    if (v !== e.target.value) { const at = Math.max(0, e.target.selectionStart - (e.target.value.length - v.length)); e.target.value = v; e.target.setSelectionRange(at, at); }
    state[k] = v; commit();
  }
});
document.addEventListener('keydown', e => {
  const b = e.target.closest('[role="radio"]'); if (!b || !['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(e.key)) return;
  const list = [...b.parentElement.querySelectorAll('[role="radio"]')]; let i = list.indexOf(b);
  i = (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
  list[i].focus(); list[i].click(); e.preventDefault();
});

const spinBtn = document.getElementById('spinBtn');
// quality menu
const qBtn = document.getElementById('qualityBtn'), qMenu = document.getElementById('qualityMenu');
const Q_LABEL = { auto: 'Auto', high: 'High', fast: 'Fast' };
function syncQualityUI(){
  document.getElementById('qualityLbl').textContent = Q_LABEL[quality];
  qBtn.title = `Quality: ${Q_LABEL[quality]}` + (quality === 'auto' ? ` (${fastOn ? 'Fast' : 'High'} on this device)` : '');
  const autoPick = autoFast ?? lowEndScore() >= 3;
  document.getElementById('qAutoNote').textContent = `Picks for this device · ${autoPick ? 'Fast' : 'High'} here`;
  qMenu.querySelectorAll('[data-q]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.q === quality)));
}
function openQuality(open){
  qMenu.hidden = !open; qBtn.setAttribute('aria-expanded', String(open));
  if (open) qMenu.querySelector('[aria-checked="true"]')?.focus();
}
qBtn.addEventListener('click', e => { e.stopPropagation(); openQuality(qMenu.hidden); });
qMenu.addEventListener('click', async e => {
  const b = e.target.closest('[data-q]'); if (!b) return;
  quality = b.dataset.q; saveQuality(quality); openQuality(false); qBtn.focus();
  autoFast ??= lowEndScore() >= 3;
  await setFast(quality === 'fast' || (quality === 'auto' && autoFast));
  syncQualityUI();
});
qMenu.addEventListener('keydown', e => {
  const items = [...qMenu.querySelectorAll('[data-q]')], i = items.indexOf(document.activeElement);
  if (e.key === 'Escape') { openQuality(false); qBtn.focus(); e.preventDefault(); }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); e.preventDefault(); }
});
document.addEventListener('click', e => { if (!qMenu.hidden && !e.target.closest('.qwrap')) openQuality(false); });
syncQualityUI();
spinBtn.onclick = () => { controls.autoRotate = !controls.autoRotate; requestRender(); spinBtn.classList.toggle('on', controls.autoRotate); spinBtn.setAttribute('aria-pressed', controls.autoRotate); };
let toastT;
function toast(m, action, fn){
  const t = document.getElementById('toast'); t.textContent = m;
  if (action) {
    const b = Object.assign(document.createElement('button'), { className: 'tact', textContent: action });
    b.onclick = () => { clearTimeout(toastT); t.classList.remove('on', 'act'); fn(); };
    t.append(' · ', b);
  }
  t.classList.add('on'); t.classList.toggle('act', !!action);
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on', 'act'), action ? 6000 : 2000);
}
document.getElementById('shareBtn').onclick = async () => {
  writeHash(); try { await navigator.clipboard.writeText(location.href); } catch(e) {}
  const l = document.getElementById('shareLbl'); l.textContent = 'Link copied'; toast('Link to this build copied'); setTimeout(() => l.textContent = 'Share', 1500);
};
document.getElementById('cartBtn').onclick = () => toast(`Demo only · ${document.getElementById('total').textContent} build added to cart`);
document.getElementById('shotBtn').onclick = () => {
  renderer.render(scene, camera);
  const a = document.createElement('a'); a.download = 'gravity-dh-build.png'; a.href = renderer.domElement.toDataURL('image/png'); a.click(); toast('Image saved');
};
function syncGround(){ const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; ground.material.opacity = contact.material.opacity = dark ? .5 : .22; requestRender(); }
document.getElementById('themeBtn').onclick = () => {
  const r = document.documentElement;
  const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  r.dataset.theme = dark ? 'light' : 'dark'; syncGround(); queueThumbs();
  try { localStorage.setItem('dh-theme', r.dataset.theme); } catch(e) {}
};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!document.documentElement.dataset.theme) { syncGround(); queueThumbs(); } });
new ResizeObserver(syncLooks).observe(document.getElementById('presets'));
new IntersectionObserver(([e]) => { looksVisible = e.isIntersecting; scheduleThumb(); }).observe(document.getElementById('presets'));
try { const t = localStorage.getItem('dh-theme'); if (t) document.documentElement.dataset.theme = t; } catch(e) {}
syncGround();
updateUI();
if (new URLSearchParams(location.search).has('debug')) window.__bike = { THREE, scene, camera, controls, renderer, state, applyState, flyTo, M, models, get low(){ return low; }, get detail(){ return detail; }, showModel };
