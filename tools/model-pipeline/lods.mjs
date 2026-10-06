// Build the two web LODs from the full web model (assets/models/bike.glb, made by optimize.mjs).
// Usage: node lods.mjs [../../assets/models/bike.glb] [../../assets/models]
//   bike-lod0.glb  desktop at rest: the same look, simplified only where it doesn't show (≤ 700k triangles)
//   bike-lod1.glb  phones, dragging and the first quick load (~300k triangles, ≤ 2 MB)
// Every part is simplified within a world-space error budget (meters), so detail goes where it shows.
// Node, mesh and material names never change, so slots, decals and deformations map the same in both LODs
// (check-lods.mjs verifies it). Decals are never touched: their UVs carry the logos and the custom text.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dequantize, weld, dedup, prune, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const src = process.argv[2] || '../../assets/models/bike.glb', outDir = process.argv[3] || '../../assets/models';
await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

// world-space error per LOD (m), with per-node overrides; `tris` caps a node's triangle count
const LODS = {
  lod0: { error: .00012, normal: .008, nodes: {
    // small, reflective parts whose outlines and highlights show at rest: kept as they are
    Front_rim: { keep: true }, Rear_rim: { keep: true }, Front_Hub: { keep: true }, Rear_Hub: { keep: true }, Brake_Discs: { keep: true },
    Shock: { keep: true }, Seat: { keep: true }, Brake_levers: { keep: true },
    // 143k triangles of tiny separate cylinders with hard edges: collapse across the edges
    Spoke_nipples: { error: .0007, permissive: true, tris: 9000 },
    Chain: { error: .0004 },
  } },
  lod1: { error: .0011, normal: .0015, nodes: {
    Spoke_nipples: { error: .0008, permissive: true, tris: 3000 },
    Front_tire: { error: .0008 }, Rear_Tire: { error: .0008 },   // keep the knobs readable
    Spokes: { error: .0015 }, Chain: { error: .0015 },
  } },
};

function worldScale(node){
  const m = node.getWorldMatrix();
  return Math.cbrt(Math.hypot(m[0], m[1], m[2]) * Math.hypot(m[4], m[5], m[6]) * Math.hypot(m[8], m[9], m[10]));
}
// drop vertices no triangle uses
function compact(prim){
  const idx = prim.getIndices(), a = idx.getArray(), n = prim.getAttribute('POSITION').getCount();
  const remap = new Int32Array(n).fill(-1); let next = 0;
  for (let i = 0; i < a.length; i++) { if (remap[a[i]] < 0) remap[a[i]] = next++; a[i] = remap[a[i]]; }
  idx.setArray(next > 65535 ? Uint32Array.from(a) : Uint16Array.from(a));
  for (const sem of prim.listSemantics()) {
    const attr = prim.getAttribute(sem), size = attr.getElementSize(), old = attr.getArray();
    const out = new old.constructor(next * size);
    for (let v = 0; v < n; v++) if (remap[v] >= 0) for (let k = 0; k < size; k++) out[remap[v] * size + k] = old[v * size + k];
    attr.setArray(out);
  }
}

for (const [name, cfg] of Object.entries(LODS)) {
  const doc = await io.read(src);
  await doc.transform(dequantize(), weld());
  let before = 0, after = 0; const report = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    if (/Decal/i.test(node.getName()) || process.env.NOSIMPLIFY) { for (const p of mesh.listPrimitives()) { const t = p.getIndices().getCount() / 3; before += t; after += t; } continue; }
    const o = cfg.nodes[node.getName()] || {};
    if (o.keep) { for (const p of mesh.listPrimitives()) { const t = p.getIndices().getCount() / 3; before += t; after += t; } continue; }
    const err = (o.error ?? cfg.error) / worldScale(node);
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices(), n0 = idx.getCount() / 3; before += n0;
      const pos = prim.getAttribute('POSITION').getArray();
      const target = Math.min(idx.getCount(), (o.tris ?? 0) * 3);
      const P = pos instanceof Float32Array ? pos : Float32Array.from(pos), I = Uint32Array.from(idx.getArray());
      // normals count against the error budget (weight in m per unit of normal change), so glossy shading holds
      const N = prim.getAttribute('NORMAL')?.getArray(), w = (cfg.normal ?? 0) / worldScale(node), flags = ['ErrorAbsolute', ...(o.permissive ? ['Permissive'] : [])];
      const [out] = o.sloppy ? MeshoptSimplifier.simplifySloppy(I, P, 3, null, o.sloppy * 3, 1)
        : N && w ? MeshoptSimplifier.simplifyWithAttributes(I, P, 3, Float32Array.from(N), 3, [w, w, w], null, target, err, flags)
        : MeshoptSimplifier.simplify(I, P, 3, target, err, flags);
      idx.setArray(out); compact(prim);
      const n1 = out.length / 3; after += n1;
      if (n0 > 8000) report.push(`${node.getName().padEnd(16)} ${(prim.getMaterial()?.getName() || '').padEnd(14)} ${String(n0).padStart(7)} → ${String(n1).padStart(6)}`);
    }
  }
  await doc.transform(dedup(), prune(), reorder({ encoder: MeshoptEncoder }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const file = `${outDir}/bike-${name}.glb`;
  await io.write(file, doc);
  const { size } = await import('node:fs').then(fs => fs.statSync(file));
  console.log(`\n${name}: ${before} → ${after} triangles, ${(size / 1048576).toFixed(2)} MB → ${file}`);
  console.log(report.join('\n'));
}
