# Export the Blender source bike to GLB with all modifiers applied.
# Usage (macOS):
#   /Applications/Blender.app/Contents/MacOS/Blender -b Fuzz.blend --python export.py -- fuzz_full.glb
# The decal PNGs must sit in a `textures/` folder next to the .blend (the file references //decals/).
import bpy, sys

out = sys.argv[sys.argv.index('--') + 1]

for img in bpy.data.images:
    if img.filepath.startswith('//decals/'):
        img.filepath = '//textures/' + img.filepath.split('/')[-1]
        img.reload()

bpy.ops.export_scene.gltf(
    filepath=out, export_format='GLB', use_visible=True, export_apply=True,
    export_yup=True, export_texcoords=True, export_normals=True, export_materials='EXPORT',
    export_image_format='AUTO', export_cameras=False, export_lights=False, export_animations=False,
)
print('EXPORTED', out)
