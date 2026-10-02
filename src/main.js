import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

import { BASE_PRICE, OIL, PAINT, ANO, SECTIONS, PRESETS, DEFAULT, VIEWS, slotFor, SLOT_SECTION, SLOT_LABEL, FINISH,
  FONTS, TEXT_SPOTS, TEXT_PRICE, TEXT_PRICE_MAX, TEXT_CHARS } from './config.js';

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
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;
const camera = new THREE.PerspectiveCamera(30, 1, 0.03, 60);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
controls.minDistance = 0.45; controls.maxDistance = 6; controls.maxPolarAngle = THREE.MathUtils.degToRad(86);
controls.autoRotateSpeed = 0.7;

const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.position.set(1.5, 4, 2.4); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left:-1.5, right:1.5, top:1.5, bottom:-1.5, near:.5, far:9 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.006; sun.shadow.radius = 5;
scene.add(sun);
const back = new THREE.DirectionalLight(0xffffff, .6); back.position.set(-2.5, 2, -2); scene.add(back);
const ground = new THREE.Mesh(new THREE.CircleGeometry(3.4, 64), new THREE.ShadowMaterial({ opacity:.22 }));
ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);

/* ============ camera views (meters, bike faces +X, drive side +Z) ============ */
let tween = null;
function flyTo(name){
  const v = VIEWS[name]; if (!v) return;
  const to = { c:new THREE.Vector3(...v.cam), t:new THREE.Vector3(...v.tgt) };
  const f = THREE.MathUtils.clamp(1.0 / camera.aspect, 1, 2.1);
  to.c.sub(to.t).multiplyScalar(f).add(to.t);
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  if (reduceMotion) { camera.position.copy(to.c); controls.target.copy(to.t); return; }
  tween = { from:{ c:camera.position.clone(), t:controls.target.clone() }, to, start:performance.now(), dur:950 };
}
const easeInOut = t => t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;

/* ============ materials ============ */
const phys = o => new THREE.MeshPhysicalMaterial(o);
// procedural detail textures (the Blender procedural shaders don't survive export)
function noiseNormal(size=256, strength=1.2){
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const h = new Float32Array(size*size); for (let i=0;i<h.length;i++) h[i] = Math.random();
  const im = g.createImageData(size,size);
  for (let y=0;y<size;y++) for (let x=0;x<size;x++){
    const i=y*size+x, dx=(h[y*size+(x+1)%size]-h[i])*strength, dy=(h[((y+1)%size)*size+x]-h[i])*strength;
    const n=new THREE.Vector3(-dx,-dy,1).normalize(); im.data.set([(n.x*.5+.5)*255,(n.y*.5+.5)*255,(n.z*.5+.5)*255,255], i*4);
  }
  g.putImageData(im,0,0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const flake = noiseNormal(256, 1.6); flake.repeat.set(40, 40);
const grain = noiseNormal(256, .7); grain.repeat.set(10, 10);

const M = {
  frame:   phys({ color:'#5B6067', roughness:.3, metalness:.15, clearcoat:1, clearcoatRoughness:.05 }),
  rear:    phys({ color:'#5B6067', roughness:.3, metalness:.15, clearcoat:1, clearcoatRoughness:.05 }),
  accent:  phys({ color:'#2457E6', roughness:.28, metalness:.9, iridescence:.0001, iridescenceIOR:1.8, iridescenceThicknessRange:[250,900] }),
  forkLow: phys({ color:'#18181A', roughness:.32, metalness:.1, clearcoat:.9, clearcoatRoughness:.08 }),
  forkUp:  phys({ color:'#121214', roughness:.12, metalness:.8, clearcoat:1, clearcoatRoughness:.03 }),
  stanch:  phys({ color:'#C9CCD1', roughness:.15, metalness:1 }),
  knob:    phys({ color:'#C81E2A', roughness:.25, metalness:.85 }),
  spring:  phys({ color:'#D4A33A', roughness:.3, metalness:.6, clearcoat:.8, clearcoatRoughness:.12 }),
  shockBody: phys({ color:'#1C1C1F', roughness:.28, metalness:.85 }),
  rims:    phys({ color:'#18181A', roughness:.35, metalness:.75 }),
  spokes:  phys({ color:'#1E1E20', roughness:.3, metalness:.9 }),
  tires:   phys({ color:'#1B1B1B', roughness:.9, metalness:0, normalMap:grain, normalScale:new THREE.Vector2(.35,.35) }),
  grips:   phys({ color:'#2457E6', roughness:.85, metalness:0, normalMap:grain, normalScale:new THREE.Vector2(.6,.6) }),
  bar:     phys({ color:'#18181A', roughness:.32, metalness:.8 }),
  saddle:  phys({ color:'#151515', roughness:.62, metalness:0, sheen:.4, sheenRoughness:.7, normalMap:grain, normalScale:new THREE.Vector2(.25,.25) }),
  saddleBase: phys({ color:'#141416', roughness:.4, metalness:.1 }),
  seatpost:phys({ color:'#131315', roughness:.25, metalness:.6 }),
  chain:   phys({ color:'#BFC3C8', roughness:.3, metalness:1, iridescence:.0001, iridescenceIOR:1.8, iridescenceThicknessRange:[250,900] }),
  rotor:   phys({ color:'#B8BBC0', roughness:.35, metalness:1 }),
  cranks:  phys({ color:'#1C1C1E', roughness:.3, metalness:.8 }),
  pedals:  phys({ color:'#18181A', roughness:.5, metalness:.5 }),
  rubber:  phys({ color:'#141414', roughness:.88, metalness:0 }),
  black:   phys({ color:'#161618', roughness:.32, metalness:.35 }),
  blackMetal: phys({ color:'#1A1A1D', roughness:.3, metalness:.85 }),
};
/* smooth material transitions */
const anims = new Map();
function setMat(mat, target, instant){
  const from = { color: mat.color.clone() }; for (const k in target) if (k !== 'color') from[k] = mat[k];
  const to = { ...target, color: new THREE.Color(target.color ?? from.color) };
  if (instant || reduceMotion) { lerpMat(mat, from, to, 1); return; }
  anims.set(mat, { from, to, start: performance.now(), dur: 340 });
}
function lerpMat(mat, from, to, t){
  mat.color.copy(from.color).lerp(to.color, t);
  for (const k in to) if (k !== 'color' && typeof to[k] === 'number') mat[k] = from[k] + (to[k] - from[k]) * t;
}

/* ============ model ============ */
const nodes = {}; const decals = []; const pickables = [];
let slickTires = [], knobbyTires = [];
const SEAT_AXIS = new THREE.Vector3(-.546, .838, 0).normalize();

function whiteAlpha(img){
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i=0;i<d.data.length;i+=4){ const lum=(d.data[i]+d.data[i+1]+d.data[i+2])/3; d.data[i]=d.data[i+1]=d.data[i+2]=255; d.data[i+3]=Math.min(d.data[i+3], 255-lum*.0 ); }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.flipY = false; return t;
}
const decalMat = phys({ color:'#F4F4F2', roughness:.35, metalness:.05, clearcoat:.6, transparent:true, alphaTest:.3, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4 });

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
  constructor(mesh, spot, img){
    const uv = mesh.geometry.attributes.uv;
    let u0 = 1, v0 = 1, u1 = 0, v1 = 0;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); u0 = Math.min(u0, u); v0 = Math.min(v0, v); u1 = Math.max(u1, u); v1 = Math.max(v1, v); }
    const du = Math.max(u1 - u0, 1e-3), dv = Math.max(v1 - v0, 1e-3);
    const w = du * img.width, h = dv * img.height, s = 1024 / Math.max(w, h);
    const c = this.canvas = document.createElement('canvas');
    c.width = Math.max(16, Math.round(w * s)); c.height = Math.max(16, Math.round(h * s));
    const t = this.tex = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 8;
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
const spotMeshes = Object.fromEntries(TEXT_SPOTS.map(s => [s.id, []]));
const spotOf = node => TEXT_SPOTS.find(s => s.nodes.test(node));

function makeSlick(cx, cy){
  const geo = new THREE.TorusGeometry(.333, .031, 40, 160);
  const m = new THREE.Mesh(geo, M.tires); m.position.set(cx, cy, 0); m.scale.set(1, 1, 1.22);
  m.castShadow = m.receiveShadow = true; m.visible = false; m.userData.slot = 'tires'; return m;
}

const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
loader.load('assets/models/bike.glb', gltf => {
  const bike = gltf.scene; bike.rotation.y = -Math.PI/2; bike.updateMatrixWorld(true);
  bike.traverse(o => {
    if (!o.isMesh) return;
    const nodeName = (o.parent && o.parent !== bike && o.parent.name) ? o.parent.name : o.name;
    const owner = (o.parent && o.parent !== bike) ? o.parent : o;
    nodes[nodeName] = owner; owner.userData.basePos ??= owner.position.clone();
    o.castShadow = true; o.receiveShadow = true;
    o.userData.node = nodeName;
    if (/Decal/i.test(nodeName)) {
      const src = o.material.map?.image;
      const m = decalMat.clone(); if (src) m.map = whiteAlpha(src);
      o.material = m; o.castShadow = false; o.userData.slot = 'decal'; o.userData.baseMap = m.map;
      decals.push(o);
      const spot = spotOf(nodeName);
      if (spot && src) { o.userData.spot = spot.id; o.userData.td = new TextDecal(o, spot, src); spotMeshes[spot.id].push(o); }
    } else {
      const slot = slotFor(nodeName, o.material.name);
      o.material = M[slot] || M.black; o.userData.slot = slot;
      if (slot === 'tires') knobbyTires.push(o);
    }
    pickables.push(o);
  });
  scene.add(bike);
  FONTS.forEach(f => loadFont(f).then(ok => { if (ok) drawTexts(); }));
  for (const s of [makeSlick(.63, .355), makeSlick(-.625, .365)]) { scene.add(s); slickTires.push(s); pickables.push(s); }
  applyState(true);
  document.getElementById('loadTxt').textContent = 'Preparing materials…';
  const ready = () => { document.getElementById('loader').classList.add('done'); flyTo('overview'); };
  (renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve()).then(ready, ready);
}, e => {
  if (!e.total) return;
  const p = Math.round(e.loaded / e.total * 100);
  document.getElementById('loadTxt').textContent = `Loading bike… ${p}%`;
  document.getElementById('loadBar').style.width = p + '%';
}, err => { document.getElementById('loadTxt').textContent = 'Could not load the 3D model.'; console.error(err); });
camera.position.set(2.6, 1.6, 4.6); controls.target.set(0, .52, 0);

/* ============ apply configuration ============ */
const CTRL = {};
for (const s of SECTIONS) for (const c of s.controls) { CTRL[c.key] = c; for (const sp of c.spots || []) for (const cc of sp.controls) CTRL[cc.key] = cc; }
const opt = key => CTRL[key];
const pick = key => opt(key).opts[state[key]] || opt(key).opts[0];

function applyState(instant=false){
  const paint = pick('frame')[1], fin = FINISH[state.finish] || FINISH[0];
  const finish = { roughness:fin.roughness, metalness:fin.metalness, clearcoat:fin.clearcoat, clearcoatRoughness:fin.clearcoatRoughness };
  for (const m of [M.frame, M.rear]) { const nm = fin.ns ? flake : null; if (m.normalMap !== nm) { m.normalMap = nm; m.needsUpdate = true; } m.normalScale.set(fin.ns, fin.ns); }
  setMat(M.frame, { color: paint, ...finish }, instant);
  setMat(M.rear, { color: pick('rear')[1] ?? paint, ...finish }, instant);
  const ano = pick('accent'); const oil = ano[0] === 'Oil Slick';
  setMat(M.accent, { color: ano[1], iridescence: oil ? 1 : .0001, roughness: oil ? .18 : .28 }, instant);
  setMat(M.forkLow, { color: pick('fork')[1] }, instant);
  const up = pick('uppers'); setMat(M.forkUp, { color: up[1], metalness: up[0]==='Black' ? .8 : 1, roughness: up[0]==='Black' ? .12 : .18 }, instant);
  setMat(M.spring, { color: pick('spring')[1] }, instant);
  const rim = pick('rims'); setMat(M.rims, { color: rim[1], metalness: rim[0]==='Black' ? .75 : .95, roughness: rim[0]==='Raw Alloy' ? .25 : .35 }, instant);
  setMat(M.spokes, { color: pick('spokes')[1] }, instant);
  setMat(M.tires, { color: pick('rubber')[1] }, instant);
  setMat(M.grips, { color: pick('grips')[1] }, instant);
  setMat(M.bar, { color: pick('bar')[1] }, instant);
  setMat(M.saddle, { color: pick('saddle')[1] }, instant);
  const ch = pick('chain'); const coil = ch[0] === 'Oil Slick';
  setMat(M.chain, { color: ch[1], iridescence: coil ? 1 : .0001, roughness: coil ? .16 : .3 }, instant);
  setMat(M.cranks, { color: pick('cranks')[1], metalness: state.cranks ? 1 : .8 }, instant);
  setMat(M.pedals, { color: pick('pedals')[1] }, instant);

  // part swaps & toggles
  const slick = state.tread === 1;
  knobbyTires.forEach(t => t.visible = !slick); slickTires.forEach(t => t.visible = slick);
  if (nodes.Guard) nodes.Guard.visible = state.guide === 0;
  if (nodes.Pedals) nodes.Pedals.visible = state.pedalsOn === 0;
  const off = SEAT_AXIS.clone().multiplyScalar(state.height / 100);
  const local = off.applyAxisAngle(new THREE.Vector3(0,1,0), Math.PI/2); // world → bike-local
  for (const n of ['Seat', 'Seatpost']) if (nodes[n]) nodes[n].position.copy(nodes[n].userData.basePos).add(local);

  // stickers & custom text
  drawTexts();
  for (const d of decals) {
    const sp = TEXT_SPOTS.find(s => s.id === d.userData.spot), custom = sp ? spotText(sp).length > 0 : false;
    d.visible = (state.logos === 0 || custom) && !(sp?.arc && slick);
    setMat(d.material, { color: matchColor(pick(sp ? spotStyle(sp).col : 'logoColor')) }, instant);
    const map = custom ? d.userData.td.tex : d.userData.baseMap;
    if (d.material.map !== map) d.material.map = map;   // both are sRGB maps: same shader, no recompile
  }
  updateUI();
}
const spotText = sp => { const t = state[sp.key].trim(); return state[sp.id + 'Case'] ? t : t.toUpperCase(); };
const spotStyle = sp => state.sameStyle ? { font: state.txtFont, col: 'logoColor', fx: state.txtFx }
  : { font: state[sp.id + 'Font'], col: sp.id + 'Col', fx: state[sp.id + 'Fx'] };
// a "match" option (null hex) borrows the color of the slot named in opts[i][3]
const matchColor = o => o[1] ?? (o[3] === 'frame' ? pick('frame')[1] : pick('accent')[1]);
function drawTexts(){
  for (const sp of TEXT_SPOTS) {
    const txt = spotText(sp); if (!txt) continue;
    const st = spotStyle(sp), f = FONTS[st.font] || FONTS[0];
    for (const d of spotMeshes[sp.id]) d.userData.td.draw(txt, f, st.fx);
  }
}

/* ============ render loop ============ */
function resize(){
  const r = stage.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height; camera.fov = camera.aspect < .9 ? 42 : 30; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage); resize();
renderer.setAnimationLoop(now => {
  if (tween) {
    const t = Math.min(1, (now - tween.start) / tween.dur), k = easeInOut(t);
    camera.position.lerpVectors(tween.from.c, tween.to.c, k); controls.target.lerpVectors(tween.from.t, tween.to.t, k);
    if (t >= 1) tween = null;
  }
  for (const [mat, a] of anims) { const t = Math.min(1, (now - a.start) / a.dur); lerpMat(mat, a.from, a.to, 1 - Math.pow(1 - t, 3)); if (t >= 1) anims.delete(mat); }
  controls.update(); renderer.render(scene, camera);
});
controls.addEventListener('start', () => { tween = null; document.getElementById('hint').style.opacity = 0; document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('on')); });

/* click a part → open its section */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables.filter(p => p.visible && p.parent.visible), false)[0]; if (!hit) return;
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

const when = c => c.when ? ` data-when="${c.when[0]}:${c.when[1]}"` : '';
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
  if (c.type === 'cards') return `<div class="ctrl"${w}><div class="glabel">${c.label}</div><div class="cards" role="radiogroup" aria-label="${c.label}">` +
    c.opts.map((o,i) => `<button class="card" role="radio" aria-checked="false" data-k="${c.key}" data-i="${i}"><b>${o[0]}</b><span>${o[1]}</span></button>`).join('') + '</div></div>';
  if (c.type === 'range') return `<div class="ctrl"${w}><div class="glabel">${c.label} <b data-cl="${c.key}"></b></div><input class="range" type="range" min="${c.min}" max="${c.max}" step="1" data-range="${c.key}" aria-label="${c.label}"><div class="rangeRow"><span>${c.min} ${c.unit}</span><span>+${c.max} ${c.unit}</span></div></div>`;
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
      <span class="sdot" id="dot-${s.id}"></span><span class="sname">${s.name}</span><span class="sval" id="val-${s.id}"></span>${chev}
    </button>
    <div class="sbody" id="body-${s.id}"><div><div class="sinner">${s.controls.map(control).join('')}</div></div></div>
  </div>`).join('');

document.getElementById('presets').innerHTML = PRESETS.map((p,i) => {
  const c = { ...DEFAULT, ...p.c };
  const dots = [PAINT[c.frame][1], (c.rear ? PAINT[c.rear-1][1] : PAINT[c.frame][1]), ANO[c.accent][0]==='Oil Slick' ? OIL : ANO[c.accent][1]];
  return `<button class="preset" data-preset="${i}"><span class="dots">${dots.map(d => `<i style="background:${d}"></i>`).join('')}</span>${p.name}</button>`;
}).join('');

const customSpots = () => TEXT_SPOTS.filter(sp => state[sp.key].trim()).length;
const textTotal = () => Math.min(customSpots() * TEXT_PRICE, TEXT_PRICE_MAX);
function extrasTotal(){
  let sum = textTotal();
  for (const c of Object.values(CTRL)) {
    if (!c.opts || c.type === 'font') continue;
    const o = c.opts[state[c.key]]; if (!o) continue;
    const p = c.type === 'seg' || c.type === 'effect' ? o[1] : o[2]; if (p) sum += p;
  }
  return sum;
}
function summary(s){
  const v = k => pick(k)[0];
  switch (s.id) {
    case 'frame': return `${v('frame')} · ${v('finish')}`;
    case 'rear': return v('rear');
    case 'fork': return v('fork') + (state.uppers ? ' · Kashima' : '');
    case 'shock': return v('spring') + ' spring';
    case 'wheels': return `${v('rims')} rims`;
    case 'tires': return `${v('tread')} · ${v('rubber')}`;
    case 'cockpit': return `${v('grips')} grips`;
    case 'saddle': return v('saddle') + (state.height ? ` · ${state.height>0?'+':''}${state.height} cm` : '');
    case 'drive': return `${v('chain')} chain${state.guide ? ' · no guide' : ''}`;
    case 'pedals': return state.pedalsOn ? 'No pedals' : v('pedals');
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
    if (c.type === 'range') { const h = state[c.key]; el.textContent = h === 0 ? 'Standard' : `${h>0?'+':''}${h} ${c.unit}`; return; }
    const o = c.opts[state[c.key]]; el.textContent = o[0] + (c.type === 'color' && o[2] ? ` · +${fmt(o[2])}` : '');
  });
  document.querySelectorAll('[data-k]').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.i === state[b.dataset.k])));
  document.querySelectorAll('[data-range]').forEach(r => { if (+r.value !== state[r.dataset.range]) r.value = state[r.dataset.range]; });
  document.querySelectorAll('[data-text]').forEach(t => { if (document.activeElement !== t) t.value = state[t.dataset.text]; });
  // "match" swatches preview the color they borrow
  document.querySelectorAll('[data-match]').forEach(b => { b.firstElementChild.style.background = `conic-gradient(from 45deg, ${b.dataset.match === 'frame' ? pick('frame')[1] : bg(pick('accent'))} 0 50%, var(--surface) 0 100%)`; });
  document.querySelectorAll('[data-when]').forEach(el => { const [k, v] = el.dataset.when.split(':'); el.hidden = state[k] !== +v; });
  document.querySelectorAll('[data-toggle]').forEach(b => b.setAttribute('aria-checked', String(!!state[b.dataset.toggle])));
  for (const sp of TEXT_SPOTS) {
    const custom = !!state[sp.key].trim();
    document.getElementById('spot-' + sp.id).classList.toggle('custom', custom);
    document.getElementById('spval-' + sp.id).textContent = custom ? `“${spotText(sp)}”` : (state.logos ? 'Hidden' : 'Original logo');
    document.querySelectorAll(`[data-mode="${sp.id}"]`).forEach(b => b.setAttribute('aria-checked', String(+b.dataset.v === +custom)));
    document.querySelector(`[data-text="${sp.key}"]`).classList.toggle('asis', state[sp.id + 'Case'] === 1);
  }
  const ex = extrasTotal();
  document.getElementById('total').textContent = fmt(BASE_PRICE + ex);
  document.getElementById('extra').textContent = ex ? `incl. ${fmt(ex)} in options` : '';
  const match = PRESETS.findIndex(presetMatches);
  document.querySelectorAll('.preset').forEach((b,i) => b.classList.toggle('on', i === match));
}

// Presets are looks: text the shopper typed survives a preset change, text that came from a preset does not.
const TEXT_KEYS = TEXT_SPOTS.map(sp => sp.key);
let presetText = {};
const presetMatches = p => Object.keys(DEFAULT).every(k => (TEXT_KEYS.includes(k) && !(k in p.c) && state[k] !== presetText[k]) || ({ ...DEFAULT, ...p.c })[k] === state[k]);
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
    flyTo(view || SECTIONS.find(s => s.id === id).focus);
    setTimeout(() => (scrollTo ? document.getElementById(scrollTo) : el).scrollIntoView({ block:'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }), 280);
  }
}
const commit = () => { applyState(); writeHash(); };
document.addEventListener('click', e => {
  const h = e.target.closest('[data-sec]'); if (h) { openSection(h.dataset.sec); return; }
  const o = e.target.closest('[data-k]'); if (o) { state[o.dataset.k] = +o.dataset.i; commit(); return; }
  const sh = e.target.closest('[data-spot]'); if (sh) { openSpot(sh.dataset.spot); return; }
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
  const p = e.target.closest('[data-preset]'); if (p) { applyPreset(PRESETS[+p.dataset.preset]); commit(); flyTo('overview'); return; }
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
spinBtn.onclick = () => { controls.autoRotate = !controls.autoRotate; spinBtn.classList.toggle('on', controls.autoRotate); spinBtn.setAttribute('aria-pressed', controls.autoRotate); };
let toastT; function toast(m){ const t = document.getElementById('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2000); }
document.getElementById('shareBtn').onclick = async () => {
  writeHash(); try { await navigator.clipboard.writeText(location.href); } catch(e) {}
  const l = document.getElementById('shareLbl'); l.textContent = 'Link copied'; toast('Link to this build copied'); setTimeout(() => l.textContent = 'Share', 1500);
};
document.getElementById('cartBtn').onclick = () => toast(`Demo only · ${document.getElementById('total').textContent} build added to cart`);
document.getElementById('shotBtn').onclick = () => {
  renderer.render(scene, camera);
  const a = document.createElement('a'); a.download = 'gravity-dh-build.png'; a.href = renderer.domElement.toDataURL('image/png'); a.click(); toast('Image saved');
};
function syncGround(){ const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; ground.material.opacity = dark ? .5 : .22; }
document.getElementById('themeBtn').onclick = () => {
  const r = document.documentElement;
  const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  r.dataset.theme = dark ? 'light' : 'dark'; syncGround();
  try { localStorage.setItem('dh-theme', r.dataset.theme); } catch(e) {}
};
try { const t = localStorage.getItem('dh-theme'); if (t) document.documentElement.dataset.theme = t; } catch(e) {}
syncGround();
updateUI();
if (new URLSearchParams(location.search).has('debug')) window.__bike = { THREE, scene, camera, controls, renderer, state, applyState, flyTo, spotMeshes, M, nodes };
