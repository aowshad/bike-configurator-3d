// Simplifies the Blender export per part and compresses it for the web.
// Usage: node --max-old-space-size=12288 optimize.mjs fuzz_full.glb ../../assets/models/bike.glb
// Note: quantize() moves vertex offsets into node transforms, so the app must treat
// node.position as a base value (see basePos in src/main.js) instead of assuming 0.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { weldPrimitive, simplifyPrimitive, dedup, prune, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(process.argv[2]);

const RATIO = {
  Frame: 0.16, Front_tire: 0.22, Rear_Tire: 0.22, Spokes: 0.07, Spoke_nipples: 0.03,
  Brake_Discs: 0.14, Chain: 0.16, Lines: 0.1, Seatpost: 0.12, Brakes: 0.3, Cassette: 0.4,
  Cranks: 0.4, Derailleur: 0.4, Brake_levers: 0.4, Pedals: 0.4, Damper: 0.5, Shock: 0.7,
  Front_Hub: 0.3, Rear_Hub: 0.3, Guard: 0.5, Seat: 0.6, Stem: 0.5, Grips: 0.8, Frame_Bearings: 0.5,
};
let before = 0, after = 0;
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const ratio = RATIO[node.getName()] ?? 1;
  for (const prim of mesh.listPrimitives()) {
    const n0 = prim.getIndices().getCount() / 3; before += n0;
    if (ratio < 1) {
      weldPrimitive(prim, { overwrite: true });
      simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: node.getName()==='Spoke_nipples' ? 0.05 : 0.0015, lockBorder: false });
    }
    const n1 = prim.getIndices().getCount() / 3; after += n1; if (n0 > 20000) console.log('  ', node.getName(), prim.getMaterial()?.getName(), Math.round(n0), '→', Math.round(n1));
  }
}
console.log('tris', Math.round(before), '→', Math.round(after));
await doc.transform(
  dedup(), prune(),
  reorder({ encoder: MeshoptEncoder }),
  quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(process.argv[3], doc);
console.log('written', process.argv[3]);
