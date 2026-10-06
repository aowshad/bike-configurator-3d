// Fails (exit 1) if the LODs don't share the same scene structure: every node, mesh, primitive material, decal texture
// and vertex attribute set must match, because slots, decals and deformations are looked up by these names.
// Usage: node check-lods.mjs [../../assets/models/bike-lod0.glb ../../assets/models/bike-lod1.glb]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['../../assets/models/bike-lod0.glb', '../../assets/models/bike-lod1.glb'];
const signature = async file => {
  const doc = await io.read(file), out = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    out.push(`node ${node.getName()} parent=${node.getParentNode()?.getName() ?? ''} mesh=${mesh?.getName() ?? '-'}`);
    for (const [i, p] of (mesh?.listPrimitives() ?? []).entries()) {
      const m = p.getMaterial();
      out.push(`  prim ${node.getName()}#${i} material=${m?.getName() ?? '-'} map=${m?.getBaseColorTexture()?.getName() ?? '-'} attrs=${p.listSemantics().sort().join(',')}`);
    }
  }
  return out;
};
const [a, ...rest] = await Promise.all(files.map(signature));
let fail = 0;
for (const [k, b] of rest.entries()) {
  const A = new Set(a), B = new Set(b);
  const missing = a.filter(x => !B.has(x)), extra = b.filter(x => !A.has(x));
  if (missing.length || extra.length) {
    fail = 1; console.log(`✗ ${files[k + 1]} differs from ${files[0]}`);
    missing.slice(0, 20).forEach(x => console.log('  - ' + x)); extra.slice(0, 20).forEach(x => console.log('  + ' + x));
  } else console.log(`✓ ${files[k + 1]} matches ${files[0]} (${a.length} entries)`);
}
process.exit(fail);
