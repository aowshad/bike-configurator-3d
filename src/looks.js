// Style options generated in code (the GLB has no swappable parts yet):
//   • shader patches: frame paint styles, tire sidewalls, grip and saddle patterns
//   • generated tiling normal maps (drawn on a canvas once, cached)
//   • procedural tires (slick, mud spike)
//   • cached vertex deformations (bar rise/width, saddle shape, rim depth, bladed spokes, pedals)
// Every shader variant is switched with uniforms, never defines, so nothing recompiles after load.
import * as THREE from 'three';

/* ============ shader patching ============ */
const GLSL = `
float lk_hash(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec3 lk_hash3(vec3 p){ return fract(sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))) * 43758.5453); }
float lk_noise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(lk_hash(i), lk_hash(i + vec3(1,0,0)), f.x), mix(lk_hash(i + vec3(0,1,0)), lk_hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(lk_hash(i + vec3(0,0,1)), lk_hash(i + vec3(1,0,1)), f.x), mix(lk_hash(i + vec3(0,1,1)), lk_hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float lk_fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * lk_noise(p); p = p * 2.03 + 7.1; a *= .5; } return s; }
// bump from a scalar height (any units), using screen-space derivatives
vec3 lk_bump(vec3 n, float h){
  vec3 sp = -vViewPosition, dx = dFdx(sp), dy = dFdy(sp);
  vec3 r1 = cross(dy, n), r2 = cross(n, dx); float det = dot(dx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - g);
}
vec3 lk_worldN(vec3 viewN){ return normalize((vec4(viewN, 0.) * viewMatrix).xyz); }
vec3 lk_viewN(vec3 worldN){ return normalize((viewMatrix * vec4(worldN, 0.)).xyz); }
`;
const glslType = v => typeof v === 'number' ? 'float' : v.isColor || v.isVector3 ? 'vec3' : v.isVector2 ? 'vec2' : v.isTexture ? 'sampler2D' : 'float';

// vRest = the fragment's position in rest world space: the aRest attribute for deformable meshes
// (so patterns stay glued to the surface while it moves), else the live world position.
function patch(mat, key, { uniforms, rest = false, frag = '', color = '', rough = '', normal = '' }){
  mat.userData.u = uniforms;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRest;\n${rest ? 'attribute vec3 aRest;' : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${rest ? 'vRest = aRest;'
        : 'vec4 lkW = vec4(transformed, 1.);\n#ifdef USE_INSTANCING\nlkW = instanceMatrix * lkW;\n#endif\nvRest = (modelMatrix * lkW).xyz;'}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRest;\n${Object.entries(uniforms).map(([k, u]) => `uniform ${glslType(u.value)} ${k};`).join('\n')}\n${GLSL}\n${frag}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${color}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${rough}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${normal}`);
  };
  mat.customProgramCacheKey = () => key;
  return uniforms;
}
// A / B / T uniforms cross-fade between two styles; main.js animates T and swaps A ← B when done.
const ab = (a = 0) => ({ value: a });

/* ============ frame paint styles ============ */
// 0 solid · 1 fade · 2 split · 3 camo · 4 splatter · 5 carbon weave. Shared by the front and rear frame materials.
export function patchFrame(mats){
  const u = { uStyleA: ab(), uStyleB: ab(), uStyleT: ab(), uC2: { value: new THREE.Color('#121214') },
    uScale: ab(4), uAngle: ab(60 * Math.PI / 180), uFade: ab(.8) };
  const frag = `
  // splats are sprayed from the side, so they live in the side-view plane (x, y); edges broken up with noise
  float lk_splats(vec2 q, float density, float rmin, float rmax, float seed){
    vec2 i = floor(q); float d = 1e3;
    for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
      vec2 c = i + vec2(x, y); vec3 h = lk_hash3(vec3(c, seed));
      if (h.x > density) continue;
      float r = mix(rmin, rmax, h.y * h.y);
      vec2 v = q - c - h.yz * .8 - .1; float l = length(v); vec2 dir = v / max(l, 1e-4);
      vec3 k = vec3(dir * 2.2, seed * 7. + h.x * 13.);
      float edge = .72 + .5 * lk_noise(k) + .38 * pow(lk_noise(vec3(dir * 7., k.z)), 3.);   // lumpy rim with spikes
      d = min(d, l - r * edge);
    }
    return d;
  }
  // tows of a 2x2 twill, x: brightness, y: rounded tow height
  vec2 lk_weave(vec2 uv){
    vec2 c = floor(uv), f = fract(uv);
    bool warp = mod(c.x + c.y, 4.) < 2.;
    float across = warp ? f.y : f.x, h = sin(across * 3.14159);
    return vec2((warp ? 1. : .68) * (.78 + .22 * h), h);
  }
  vec3 lk_paint(float s, vec3 c1, vec3 p, out float carb){
    carb = 0.;
    if (s < .5) return c1;
    if (s < 1.5) {          // fade from head tube to rear axle
      vec2 H = vec2(.31, .95), A = vec2(-.625, .365), d = A - H;
      float t = dot(p.xy - H, d) / dot(d, d), hw = uFade * .5;
      return mix(c1, uC2, smoothstep(.5 - hw, .5 + hw, t));
    }
    if (s < 2.5) {          // hard split through the middle of the frame
      float d = dot(p.xy - vec2(-.16, .62), vec2(cos(uAngle), sin(uAngle))), w = fwidth(d) * .8 + 1e-5;
      return mix(c1, uC2, smoothstep(-w, w, d));
    }
    if (s < 3.5) {          // camo: base, second color and a dark mix of both
      vec3 q = p * (2.5 + uScale * 1.6);
      float a = lk_fbm(q), b = lk_fbm(q * 1.13 + 31.7), wa = fwidth(a) * .8 + 1e-4, wb = fwidth(b) * .8 + 1e-4;
      vec3 c = mix(c1, uC2, smoothstep(.5 - wa, .5 + wa, a));
      return mix(c, mix(c1, uC2, .5) * .42, smoothstep(.57 - wb, .57 + wb, b));
    }
    if (s < 4.5) {          // splatter: big splats plus droplets
      vec2 q = p.xy * (4. + uScale * 2.);
      float d = min(min(lk_splats(q, .55, .16, .42, 1.), lk_splats(q * 2.3 + 5.1, .5, .1, .26, 2.) / 2.3), lk_splats(q * 5.7 + 11.3, .45, .06, .18, 3.) / 5.7);
      float w = fwidth(d) * .8 + 1e-4;
      return mix(c1, uC2, 1. - smoothstep(-w, w, d));
    }
    carb = 1.;
    return c1;
  }`;
  const color = `
  float lkCarbA, lkCarbB, lkWeaveH = 0.;
  vec3 lkPA = lk_paint(uStyleA, diffuseColor.rgb, vRest, lkCarbA), lkPB = lk_paint(uStyleB, diffuseColor.rgb, vRest, lkCarbB);
  float lkCarb = mix(lkCarbA, lkCarbB, uStyleT);
  vec3 lkPaint = mix(lkPA, lkPB, uStyleT);
  if (lkCarb > 0.) {        // carbon weave, triplanar in world space with tight blend zones
    vec3 n = lk_worldN(vNormal), w = pow(abs(n), vec3(8.)); w /= w.x + w.y + w.z;
    float k = 1. / .0042;  // 4.2 mm squares
    vec2 wx = lk_weave(vRest.zy * k), wy = lk_weave(vRest.xz * k), wz = lk_weave(vRest.xy * k);
    vec2 wv = wx * w.x + wy * w.y + wz * w.z;
    float fw = clamp(length(fwidth(vRest)) * k * .7, 0., 1.);      // fade to the average when tows get sub-pixel
    float bright = mix(wv.x, .62, fw); lkWeaveH = wv.y * (1. - fw);
    vec3 carbon = (vec3(.018) + uC2 * .05) * (.5 + 1.1 * bright);
    lkPaint = mix(lkPaint, carbon, lkCarb);
  }
  diffuseColor.rgb = lkPaint;`;
  const normal = `if (lkCarb > 0.) normal = normalize(mix(normal, lk_bump(normal, lkWeaveH * .00025), lkCarb));`;
  for (const m of mats) patch(m, 'lk-frame', { uniforms: u, frag, color, normal });
  return u;
}

/* ============ tire sidewalls ============ */
// Radial distance from the hub in world space picks the sidewall band; no UVs needed.
// 0 all black · 1 tan wall · 2 colored stripe
export function patchTires(mat){
  const u = { uWallA: ab(), uWallB: ab(), uWallT: ab(), uTan: { value: new THREE.Color('#B48756') }, uStripe: { value: new THREE.Color('#2457E6') } };
  const frag = `
  vec3 lk_wall(float s, vec3 c, float side, float stripe){
    if (s < .5) return c;
    if (s < 1.5) return mix(c, uTan, side);
    return mix(c, uStripe, stripe);
  }`;
  const color = `
  vec2 lkHub = vRest.x > 0. ? vec2(.63, .355) : vec2(-.625, .365);
  float lkR = length(vRest.xy - lkHub);
  float lkSide = smoothstep(.3165, .3185, lkR) * (1. - smoothstep(.3395, .3425, lkR));
  float lkStripe = smoothstep(.3196, .3206, lkR) * (1. - smoothstep(.3228, .3238, lkR));
  diffuseColor.rgb = mix(lk_wall(uWallA, diffuseColor.rgb, lkSide, lkStripe), lk_wall(uWallB, diffuseColor.rgb, lkSide, lkStripe), uWallT);`;
  return patch(mat, 'lk-tires', { uniforms: u, frag, color });
}

/* ============ generated normal maps ============ */
// Draw a tiling height map on a canvas, then turn it into RGB = normal, A = height (cavity).
function heightTexture(size, draw, strength = 2, blur = 1.2){
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  // draw 3×3 copies so shapes crossing the edge wrap around
  for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) { g.save(); g.translate(ox, oy); draw(g, size); g.restore(); }
  if (blur) { const c2 = document.createElement('canvas'); c2.width = c2.height = size; const g2 = c2.getContext('2d');
    g2.filter = `blur(${blur}px)`; for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) g2.drawImage(c, ox, oy); g.drawImage(c2, 0, 0); }
  const src = g.getImageData(0, 0, size, size).data, h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = src[i * 4] / 255;
  const data = new Uint8Array(size * size * 4), at = (x, y) => h[((y + size) % size) * size + (x + size) % size];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    data[i] = (-dx / l * .5 + .5) * 255; data[i + 1] = (-dy / l * .5 + .5) * 255; data[i + 2] = (1 / l * .5 + .5) * 255; data[i + 3] = at(x, y) * 255;
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t;
}
const roundRect = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
function rng(seed){ return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

// Grip tiles: u runs around the grip, v along it.
export const GRIP_TEX = [
  heightTexture(128, (g, s) => { g.fillStyle = '#fff'; roundRect(g, s * .16, s * .16, s * .68, s * .68, s * .14); }, 3),             // waffle
  heightTexture(128, (g, s) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(s / 2, s * .1); g.lineTo(s * .9, s / 2); g.lineTo(s / 2, s * .9); g.lineTo(s * .1, s / 2); g.fill(); }, 3), // diamond
  heightTexture(128, (g, s) => { g.fillStyle = '#fff'; roundRect(g, -s, s * .22, s * 3, s * .56, s * .2); }, 3),                     // ribbed rings
  heightTexture(64, (g, s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, s, s); }, 0, 0),                                              // smooth
];
// Saddle tiles (12 mm): smooth, perforated, quilted panel with stitches, suede nap
export const SADDLE_TEX = [
  heightTexture(64, (g, s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, s, s); }, 0, 0),
  heightTexture(128, (g, s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, s, s); g.fillStyle = '#000';
    for (const [x, y] of [[.25, .25], [.75, .75]]) { g.beginPath(); g.arc(x * s, y * s, s * .085, 0, 7); g.fill(); } }, 2.5, .8),
  heightTexture(256, (g, s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#000'; g.lineWidth = s * .05;                               // seams: diagonal grooves
    for (const d of [-1, 0, 1]) { g.beginPath(); g.moveTo(d * s, 0); g.lineTo(d * s + s, s); g.stroke(); g.beginPath(); g.moveTo(d * s + s, 0); g.lineTo(d * s, s); g.stroke(); }
    g.strokeStyle = '#bbb'; g.lineWidth = s * .018; g.setLineDash([s * .04, s * .035]); // stitches beside each seam
    for (const d of [-1, 0, 1]) for (const o of [-.045, .045]) { g.beginPath(); g.moveTo(d * s + o * s, 0); g.lineTo(d * s + s + o * s, s); g.stroke(); g.beginPath(); g.moveTo(d * s + s + o * s, 0); g.lineTo(d * s + o * s, s); g.stroke(); }
  }, 3.5, 1.5),
  heightTexture(128, (g, s) => { const r = rng(7); g.fillStyle = '#888'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 5200; i++) { const v = 60 + r() * 160 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * s, r() * s, 1.6, 1.6); } }, 2.2, .5),
];
// per pattern: [strength, top-only, cavity darkening]
export const SADDLE_PARAMS = [[0, 0, 0], [1, 1, .75], [1, 1, .35], [1, 0, .3]];

/* ============ grip pattern (cylindrical projection) ============ */
// The grips are cylinders around the bar axis, so a cylindrical projection maps the tile seamlessly;
// triplanar would blend two projections at 45° and smear the pattern (see docs/ROADMAP.md).
export function patchGrips(mat, axis){
  const u = { uPatA: { value: GRIP_TEX[0] }, uPatB: { value: GRIP_TEX[0] }, uPatT: ab(), uAxis: { value: axis }, uGripK: ab(1.5) };
  const color = `
  vec2 lkD = vRest.xy - uAxis;
  float lkA1 = atan(lkD.y, lkD.x) / 6.2831853 + .5, lkA2 = fract(lkA1 + .5);
  float lkU = fwidth(lkA1) < fwidth(lkA2) - .001 ? lkA1 : lkA2;      // pick the branch without the atan seam
  vec2 lkUV = vec2(lkU * 18., vRest.z / .0055);
  vec4 lkTex = mix(texture2D(uPatA, lkUV), texture2D(uPatB, lkUV), uPatT);
  diffuseColor.rgb *= mix(.74, 1., lkTex.a);`;
  const normal = `
  vec3 lkT = lkTex.xyz * 2. - 1.;
  vec3 lkRad = normalize(vec3(lkD, 0.)), lkTan = vec3(-lkRad.y, lkRad.x, 0.);
  normal = lk_viewN(lk_worldN(normal) + (lkTan * lkT.x + vec3(0., 0., 1.) * lkT.y) * uGripK);`;
  return patch(mat, 'lk-grips', { uniforms: u, rest: true, color, normal });
}

/* ============ saddle cover (triplanar) ============ */
export function patchSaddle(mat){
  const u = { uCovA: { value: SADDLE_TEX[0] }, uCovB: { value: SADDLE_TEX[0] }, uCovT: ab(),
    uParA: { value: new THREE.Vector3(...SADDLE_PARAMS[0]) }, uParB: { value: new THREE.Vector3(...SADDLE_PARAMS[0]) } };
  const frag = `
  vec4 lk_tri(sampler2D t, vec3 p, vec3 w){
    float k = 1. / .012;
    return texture2D(t, p.zy * k) * w.x + texture2D(t, p.xz * k) * w.y + texture2D(t, p.xy * k) * w.z;
  }`;
  const color = `
  vec3 lkN0 = lk_worldN(vNormal), lkW = pow(abs(lkN0), vec3(4.)); lkW /= lkW.x + lkW.y + lkW.z;
  vec4 lkA = lk_tri(uCovA, vRest, lkW), lkB = lk_tri(uCovB, vRest, lkW);
  float lkTop = smoothstep(.55, .85, lkN0.y);
  float lkKA = uParA.x * mix(1., lkTop, uParA.y), lkKB = uParB.x * mix(1., lkTop, uParB.y);
  float lkCav = mix(1. - (1. - lkA.a) * uParA.z * lkKA, 1. - (1. - lkB.a) * uParB.z * lkKB, uCovT);
  diffuseColor.rgb *= lkCav;`;
  const normal = `
  vec3 lkNw = lk_worldN(normal);
  vec3 lkTA = lkA.xyz * 2. - 1., lkTB = lkB.xyz * 2. - 1.;
  vec3 lkT = mix(lkTA * lkKA, lkTB * lkKB, uCovT);
  // whiteout-style: perturb in the plane of the dominant projection
  vec3 lkP = vec3(0., lkT.y, lkT.x) * lkW.x + vec3(lkT.x, 0., lkT.y) * lkW.y + vec3(lkT.x, lkT.y, 0.) * lkW.z;
  normal = lk_viewN(lkNw + lkP);`;
  return patch(mat, 'lk-saddle', { uniforms: u, rest: true, frag, color, normal });
}

/* ============ procedural tires ============ */
// index matches TREADS in config.js; 0 is the GLB tire
export function makeTires(mat, hubs){
  const torus = (R, r, zs, seg = 40, rad = 192) => { const g = new THREE.TorusGeometry(R, r, seg, rad); g.scale(1, 1, zs); return g; };
  const shapes = [null,
    () => torus(.333, .031, 1.22),        // semi-slick: round, wide
    () => torus(.336, .0255, 1.12, 48),   // slick street: thinner and smoother
    () => torus(.328, .0245, 1.12),       // mud spike carcass, knobs added below
  ];
  const out = [[], [], [], []];
  for (const [cx, cy] of hubs) for (let t = 1; t < 4; t++) {
    const m = new THREE.Mesh(shapes[t](), mat); m.position.set(cx, cy, 0);
    m.castShadow = m.receiveShadow = true; m.userData.slot = 'tires'; out[t].push(m);
  }
  // mud spike: tall, spaced, tapered knobs in a center row and two staggered shoulder rows
  const knob = new THREE.CylinderGeometry(.0026, .0044, .0115, 6, 1).rotateY(Math.PI / 6).translate(0, .005, 0);   // tapered hex spike
  knob.scale(1.25, 1, 1);
  const rows = [[0, 0], [.5, .5], [-.5, .5], [1.0, 0], [-1.0, 0]], N = 60, R = .328, r = .0245, zs = 1.12;
  const inst = new THREE.InstancedMesh(knob, mat, hubs.length * rows.length * N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), up = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  let n = 0;
  for (const [cx, cy] of hubs) for (const [phi, off] of rows) for (let i = 0; i < N; i++) {
    const a = (i + off) / N * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    pos.set(cx + ca * (R + r * Math.cos(phi) * .92), cy + sa * (R + r * Math.cos(phi) * .92), r * Math.sin(phi) * zs * .92);
    up.set(ca * Math.cos(phi), sa * Math.cos(phi), Math.sin(phi) / zs).normalize();
    const tangent = new THREE.Vector3(-sa, ca, 0), side = new THREE.Vector3().crossVectors(tangent, up);
    q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangent, up, side));
    inst.setMatrixAt(n++, m4.compose(pos, q, one));
  }
  inst.castShadow = inst.receiveShadow = true; inst.userData.slot = 'tires';
  out[3].push(inst);
  return out;
}

/* ============ cached vertex deformation ============ */
// Positions are dequantized to float once. Each option combination's target positions are computed once
// and cached; switching eases from the current positions to the cached target.
export class Deformer {
  constructor(meshes, fn, dur = 260){
    this.fn = fn; this.dur = dur; this.cache = new Map(); this.spheres = new WeakMap(); this.anim = null; this.key = null;
    const v = new THREE.Vector3();
    this.items = meshes.map(m => {
      const a = m.geometry.attributes.position, rest = new Float32Array(a.count * 3), local = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i); local.set([v.x, v.y, v.z], i * 3); v.applyMatrix4(m.matrixWorld); rest.set([v.x, v.y, v.z], i * 3); }
      const attr = new THREE.BufferAttribute(local, 3); attr.setUsage(THREE.DynamicDrawUsage);
      m.geometry.setAttribute('position', attr);
      return { mesh: m, rest, attr, inv: m.matrixWorld.clone().invert(), data: m.userData };
    });
  }
  // rest positions as an attribute, so shader patterns stay glued to the surface while it deforms
  restAttribute(filter = () => true){ for (const it of this.items) if (filter(it.mesh)) it.mesh.geometry.setAttribute('aRest', new THREE.BufferAttribute(it.rest, 3)); }
  // compute and cache a target (and its bounding spheres) ahead of time
  warm(params){
    const to = this.target(JSON.stringify(params), params);
    to.forEach(a => { if (!this.spheres.has(a)) { const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(a, 3)); g.computeBoundingSphere(); this.spheres.set(a, g.boundingSphere); } });
  }
  target(key, params){
    if (!this.cache.has(key)) {
      const v = new THREE.Vector3();
      this.cache.set(key, this.items.map(it => {
        const w = this.fn(it.rest.slice(), params, it), out = new Float32Array(w.length);
        for (let i = 0; i < w.length; i += 3) { v.set(w[i], w[i + 1], w[i + 2]).applyMatrix4(it.inv); out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z; }
        return out;
      }));
    }
    return this.cache.get(key);
  }
  // `only` limits an instant set to some meshes (look thumbnails skip the sub-pixel spoke nipples)
  set(params, instant, only){
    const key = JSON.stringify(params);
    if (instant) {
      const to = this.target(key, params); this.anim = null; this.key = key;
      this.items.forEach((it, i) => { if (it.key === key || (only && !only(it))) return; this.write(it, null, to[i], 1); it.key = key; });
      return;
    }
    if (key === this.key) return; this.key = key;
    const to = this.target(key, params);
    this.anim = { from: this.items.map(it => it.attr.array.slice()), to, start: performance.now() };
    this.items.forEach(it => it.key = key);
  }
  // called every frame; returns true while animating
  step(now){
    if (!this.anim) return false;
    const t = Math.min(1, Math.max(0, (now - this.anim.start) / this.dur)), k = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    this.items.forEach((it, i) => this.write(it, this.anim.from[i], this.anim.to[i], k));
    if (t >= 1) this.anim = null;
    return true;
  }
  // the final step is a plain copy of the cached target, with its bounding sphere cached too
  write(it, from, to, k){
    const a = it.attr.array, g = it.mesh.geometry;
    if (k >= 1) a.set(to); else for (let i = 0; i < a.length; i++) a[i] = from[i] + (to[i] - from[i]) * k;
    it.attr.needsUpdate = true;
    if (k < 1) return;
    const s = this.spheres.get(to);
    if (s) { if (g.boundingSphere) g.boundingSphere.copy(s); else g.boundingSphere = s.clone(); }
    else { g.computeBoundingSphere(); this.spheres.set(to, g.boundingSphere.clone()); }
  }
}

// connected pieces of a mesh, merged when their centers are within `merge` meters (rest world space)
export function pieces(geometry, rest, merge){
  const n = rest.length / 3, parent = new Int32Array(n).map((_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const idx = geometry.index.array;
  for (let i = 0; i < idx.length; i += 3) { const a = find(idx[i]), b = find(idx[i + 1]), c = find(idx[i + 2]); parent[b] = a; parent[c] = a; }
  const roots = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); let g = roots.get(r); if (!g) roots.set(r, g = { verts: [], c: new THREE.Vector3() }); g.verts.push(i); g.c.x += rest[i*3]; g.c.y += rest[i*3+1]; g.c.z += rest[i*3+2]; }
  const groups = [];
  for (const g of roots.values()) {
    g.c.divideScalar(g.verts.length);
    const near = groups.find(o => o.c.distanceTo(g.c) < merge);
    if (near) { const t = near.verts.length + g.verts.length; near.c.multiplyScalar(near.verts.length / t).addScaledVector(g.c, g.verts.length / t); near.verts.push(...g.verts); }
    else groups.push(g);
  }
  const id = new Int32Array(n); groups.forEach((g, k) => { for (const i of g.verts) id[i] = k; });
  return { id, groups };
}
