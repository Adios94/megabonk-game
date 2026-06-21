"""Check use_deform flag on bones of original KayKit armature."""
import bpy
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PATH = os.path.join(ROOT, "_legacy", "assets-archive", "models", "_kaykit-original", "Skeleton_Warrior.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=PATH)

for o in bpy.context.scene.objects:
    if o.type == "ARMATURE":
        print(f"Armature: {o.name}")
        for b in o.data.bones:
            print(f"  {b.name}: use_deform={b.use_deform}")
