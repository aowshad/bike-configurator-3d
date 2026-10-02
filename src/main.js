import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

import { BASE_PRICE, OIL, PAINT, ANO, SECTIONS, PRESETS, DEFAULT, VIEWS, slotFor, SLOT_SECTION, SLOT_LABEL, FINISH } from './config.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = { ...DEFAULT };
function readHash(){
  const p = new URLSearchParams(location.hash.slice(1));
  for (const k of Object.keys(DEFAULT)) if (p.has(k)) state[k] = typeof DEFAULT[k]==='string' ? p.get(k).slice(0,14) : (+p.get(k) || 0);
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
let downTubeDecals = [], tireDecals = [], slickTires = [], knobbyTires = [];
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
const textCanvas = document.createElement('canvas'); textCanvas.width = 1024; textCanvas.height = 124;
const textTex = new THREE.CanvasTexture(textCanvas); textTex.colorSpace = THREE.SRGBColorSpace; textTex.flipY = false; textTex.anisotropy = 8;
function drawText(txt){
  const g = textCanvas.getContext('2d'); g.clearRect(0,0,1024,124);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 112; g.font = `800 ${size}px Inter, sans-serif`;
  while (g.measureText(txt).width > 980 && size > 30) { size -= 4; g.font = `800 ${size}px Inter, sans-serif`; }
  g.fillText(txt, 512, 66); textTex.needsUpdate = true;
}

function makeSlick(cx, cy){
  const geo = new THREE.TorusGeometry(.333, .031, 40, 160);
  const m = new THREE.Mesh(geo, M.tires); m.position.set(cx, cy, 0); m.scale.set(1, 1, 1.22);
  m.castShadow = m.receiveShadow = true; m.visible = false; m.userData.slot = 'tires'; return m;
}

const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
loader.load('assets/models/bike.glb', gltf => {
  const bike = gltf.scene; bike.rotation.y = -Math.PI/2;
  bike.traverse(o => {
    if (!o.isMesh) return;
    const nodeName = (o.parent && o.parent !== bike && o.parent.name) ? o.parent.name : o.name;
    const owner = (o.parent && o.parent !== bike) ? o.parent : o;
    nodes[nodeName] = owner; owner.userData.basePos ??= owner.position.clone();
    o.castShadow = true; o.receiveShadow = true;
    if (/Decal/i.test(nodeName)) {
      const src = o.material.map?.image;
      const m = decalMat.clone(); if (src) m.map = whiteAlpha(src);
      o.material = m; o.castShadow = false; o.userData.slot = 'decal'; o.userData.baseMap = m.map;
      decals.push(o);
      if (/^nsbikeslogoDecal\.?00[13]$/.test(nodeName)) downTubeDecals.push(o);
      if (/highroller|maxxis/i.test(nodeName)) tireDecals.push(o);
    } else {
      const slot = slotFor(nodeName, o.material.name);
      o.material = M[slot] || M.black; o.userData.slot = slot;
      if (slot === 'tires') knobbyTires.push(o);
    }
    o.userData.node = nodeName;
    pickables.push(o);
  });
  scene.add(bike);
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
const opt = (key) => { for (const s of SECTIONS) for (const c of s.controls) if (c.key === key) return c; };
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

  // stickers
  const lc = pick('logoColor'); const tint = lc[1] ?? ano[1];
  const hasName = state.name.trim().length > 0; if (hasName) drawText(state.name.trim().toUpperCase());
  for (const d of decals) {
    const isTire = tireDecals.includes(d), isDown = downTubeDecals.includes(d);
    d.visible = (state.logos === 0 || (isDown && hasName)) && !(isTire && slick);
    d.material.color.set(tint);
    const map = isDown && hasName ? textTex : d.userData.baseMap;
    if (d.material.map !== map) { d.material.map = map; d.material.needsUpdate = true; }
  }
  updateUI();
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
  const slot = hit.object.userData.slot, sec = SLOT_SECTION[slot];
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

function control(c){
  if (c.type === 'color') return `<div class="ctrl"><div class="glabel">${c.label} <b data-cl="${c.key}"></b></div><div class="swatches" role="radiogroup" aria-label="${c.label}">` +
    c.opts.map((o,i) => `<button class="sw${o[1]===null?' match':''}" role="radio" aria-checked="false" data-k="${c.key}" data-i="${i}" title="${o[0]}${o[2]?` (+${fmt(o[2])})`:''}" aria-label="${o[0]}${o[2]?`, plus ${fmt(o[2])}`:''}"><i style="background:${bg(o)}"></i>${o[2]?`<span class="plus">+${o[2]}</span>`:''}</button>`).join('') + '</div></div>';
  if (c.type === 'seg') return `<div class="ctrl"><div class="glabel">${c.label}</div><div class="seg" role="radiogroup" aria-label="${c.label}">` +
    c.opts.map((o,i) => `<button role="radio" aria-checked="false" data-k="${c.key}" data-i="${i}">${o[0]}${o[1]?`<small>${o[1]>0?'+':'−'}${Math.abs(o[1])}</small>`:''}</button>`).join('') + '</div></div>';
  if (c.type === 'cards') return `<div class="ctrl"><div class="glabel">${c.label}</div><div class="cards" role="radiogroup" aria-label="${c.label}">` +
    c.opts.map((o,i) => `<button class="card" role="radio" aria-checked="false" data-k="${c.key}" data-i="${i}"><b>${o[0]}</b><span>${o[1]}</span></button>`).join('') + '</div></div>';
  if (c.type === 'range') return `<div class="ctrl"><div class="glabel">${c.label} <b data-cl="${c.key}"></b></div><input class="range" type="range" min="${c.min}" max="${c.max}" step="1" data-range="${c.key}" aria-label="${c.label}"><div class="rangeRow"><span>${c.min} ${c.unit}</span><span>+${c.max} ${c.unit}</span></div></div>`;
  if (c.type === 'text') return `<div class="ctrl"><div class="glabel">${c.label} <b>+${fmt(c.price)}</b></div><input class="textIn" maxlength="${c.max}" placeholder="${c.placeholder}" data-text="${c.key}" aria-label="${c.label}" autocomplete="off" spellcheck="false"><div class="help">Replaces the down tube logo on both sides. Up to ${c.max} characters.</div></div>`;
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

function extrasTotal(){
  let sum = 0;
  for (const s of SECTIONS) for (const c of s.controls) {
    if (c.type === 'text') { if (state[c.key].trim()) sum += c.price; continue; }
    if (c.type === 'range') continue;
    const o = c.opts[state[c.key]]; if (!o) continue;
    const p = c.type === 'cards' ? o[2] : (c.type === 'seg' ? o[1] : o[2]); if (p) sum += p;
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
    case 'stickers': return state.logos && !state.name ? 'Hidden' : (state.name ? `“${state.name.toUpperCase()}”` : v('logoColor'));
    default: return v(s.controls[0].key);
  }
}
function dotColor(s){
  const k = { frame:'frame', rear:'rear', accent:'accent', fork:'fork', shock:'spring', wheels:'rims', tires:'rubber', cockpit:'grips', saddle:'saddle', drive:'chain', pedals:'pedals', stickers:'logoColor' }[s.id];
  const o = pick(k);
  if (o[1] === null) return k === 'rear' ? pick('frame')[1] : bg(pick('accent'));
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
    const o = c.opts[state[c.key]]; el.textContent = o[0] + (o[2] ? ` · +${fmt(o[2])}` : '');
  });
  document.querySelectorAll('[data-k]').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.i === state[b.dataset.k])));
  document.querySelectorAll('[data-range]').forEach(r => { if (+r.value !== state[r.dataset.range]) r.value = state[r.dataset.range]; });
  document.querySelectorAll('[data-text]').forEach(t => { if (document.activeElement !== t) t.value = state[t.dataset.text]; });
  const ex = extrasTotal();
  document.getElementById('total').textContent = fmt(BASE_PRICE + ex);
  document.getElementById('extra').textContent = ex ? `incl. ${fmt(ex)} in options` : '';
  const match = PRESETS.findIndex(p => Object.keys(DEFAULT).every(k => ({ ...DEFAULT, ...p.c })[k] === state[k]));
  document.querySelectorAll('.preset').forEach((b,i) => b.classList.toggle('on', i === match));
}

function openSection(id, fromModel=false){
  document.querySelectorAll('.sec').forEach(el => {
    const open = el.id === 'sec-' + id && (fromModel || !el.classList.contains('open'));
    el.classList.toggle('open', open); el.querySelector('.shead').setAttribute('aria-expanded', String(open));
  });
  const el = document.getElementById('sec-' + id);
  if (el.classList.contains('open')) {
    flyTo(SECTIONS.find(s => s.id === id).focus);
    setTimeout(() => el.scrollIntoView({ block:'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }), 280);
  }
}
const commit = () => { applyState(); writeHash(); };
document.addEventListener('click', e => {
  const h = e.target.closest('[data-sec]'); if (h) { openSection(h.dataset.sec); return; }
  const o = e.target.closest('[data-k]'); if (o) { state[o.dataset.k] = +o.dataset.i; commit(); return; }
  const p = e.target.closest('[data-preset]'); if (p) { Object.assign(state, DEFAULT, PRESETS[+p.dataset.preset].c, { name: state.name }); commit(); flyTo('overview'); return; }
  const v = e.target.closest('[data-view]'); if (v) flyTo(v.dataset.view);
});
document.addEventListener('input', e => {
  if (e.target.dataset.range) { state[e.target.dataset.range] = +e.target.value; commit(); }
  if (e.target.dataset.text) { state[e.target.dataset.text] = e.target.value.slice(0, 14); commit(); }
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
