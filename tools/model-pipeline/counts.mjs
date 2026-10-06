// Print triangles per node/material of a GLB. Usage: node counts.mjs <file.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const rows = []; let total = 0;
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  for (const prim of mesh.listPrimitives()) {
    const t = (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3; total += t;
    rows.push([node.getName(), prim.getMaterial()?.getName() ?? '', t, prim.getAttribute('POSITION').getCount()]);
  }
}
rows.sort((a, b) => b[2] - a[2]);
for (const r of rows) console.log(r[0].padEnd(26), r[1].padEnd(22), String(r[2]).padStart(8), String(r[3]).padStart(8));
console.log('total tris', total, 'primitives', rows.length);
