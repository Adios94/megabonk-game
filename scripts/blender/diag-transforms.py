"""Dump all the relevant transforms after importing original Minion glb."""
import bpy
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PATH = os.path.join(ROOT, "_legacy", "assets-archive", "models", "_kaykit-original", "Skeleton_Minion.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=PATH)


def show_matrix(label, m):
    print(f"  {label}:")
    for row in m:
        print(f"    [{row[0]:7.3f}, {row[1]:7.3f}, {row[2]:7.3f}, {row[3]:7.3f}]")


for o in bpy.context.scene.objects:
    if o.type == "ARMATURE":
        arm = o
        print(f"\nArmature '{arm.name}':")
        show_matrix("matrix_world", arm.matrix_world)
        show_matrix("matrix_local", arm.matrix_local)
        for b in arm.data.bones:
            if b.name in ("handslot.r", "hand.r", "head"):
                print(f"\n  bone '{b.name}':")
                print(f"    head_local: {tuple(b.head_local)}")
                print(f"    tail_local: {tuple(b.tail_local)}")
                show_matrix("matrix_local", b.matrix_local)
        print()

for o in bpy.context.scene.objects:
    if o.type == "MESH" and "Body" in o.name:
        print(f"Mesh '{o.name}':")
        show_matrix("matrix_world", o.matrix_world)
        show_matrix("matrix_local", o.matrix_local)
        show_matrix("matrix_parent_inverse", o.matrix_parent_inverse)
        print(f"  parent: {o.parent.name if o.parent else None}")
        break

# Now import the axe weapon and show its raw transform
weapon_path = os.path.join(ROOT, "_legacy", "assets-archive", "models", "_kaykit-original",
                          "weapons", "Skeleton_Axe.gltf")
print(f"\nImporting weapon: {weapon_path}")
bpy.ops.import_scene.gltf(filepath=weapon_path)
for o in bpy.context.scene.objects:
    if o.type == "MESH" and "Axe" in o.name:
        print(f"Axe Mesh '{o.name}':")
        show_matrix("matrix_world", o.matrix_world)
        show_matrix("matrix_local", o.matrix_local)
        print(f"  vertex_count: {len(o.data.vertices)}")
        # Sample a few vertex positions in local space
        for i, v in enumerate(o.data.vertices[:3]):
            print(f"  vertex[{i}].co (local): {tuple(v.co)}")
        # World position of the first vertex
        v0_world = o.matrix_world @ o.data.vertices[0].co
        print(f"  vertex[0] world position: {tuple(v0_world)}")
        break

# Now simulate what my merge script does: set weapon matrix_world = armature.matrix_world @ bone.matrix_local
import bpy
arm = bpy.data.objects["Rig_Medium"]
bone = arm.data.bones["handslot.r"]
weapon = None
for o in bpy.context.scene.objects:
    if o.type == "MESH" and "Axe" in o.name:
        weapon = o
        break

target_world = arm.matrix_world @ bone.matrix_local
print(f"\nWould set weapon.matrix_world to:")
show_matrix("target", target_world)
print(f"  target translation: {tuple(target_world.to_translation())}")
weapon.matrix_world = target_world
bpy.context.view_layer.update()
v0_after = weapon.matrix_world @ weapon.data.vertices[0].co
print(f"  weapon vertex[0] world after: {tuple(v0_after)}")

# Now what does Ctrl+J equivalent give? body.matrix_world.inv() @ weapon.matrix_world @ vertex_local
body = None
for o in bpy.context.scene.objects:
    if o.type == "MESH" and "Body" in o.name:
        body = o
        break
v0_in_body = body.matrix_world.inverted() @ weapon.matrix_world @ weapon.data.vertices[0].co
print(f"  weapon vertex[0] in body local: {tuple(v0_in_body)}")
v_origin_in_body = body.matrix_world.inverted() @ weapon.matrix_world @ bpy.context.scene.cursor.location.zero()
# Simpler: compute (0,0,0) of weapon in body local
from mathutils import Vector
v_origin_in_body = body.matrix_world.inverted() @ weapon.matrix_world @ Vector((0,0,0))
print(f"  weapon origin in body local: {tuple(v_origin_in_body)}")
