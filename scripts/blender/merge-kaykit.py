"""
Merge KayKit characters with their weapons into single SkinnedMesh glbs.

Run:
  blender --background --python scripts/blender/merge-kaykit.py

Outputs to scripts/blender/out/Skeleton_*.glb (does NOT touch public/).
After visual verification, manually copy to public/models/skins/kaykit/.
"""
import bpy
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# Read from the immutable backup so this script is idempotent. The backup is
# created once at the start of work (see project docs).
SKIN_DIR = os.path.join(ROOT, "_legacy", "assets-archive", "models", "_kaykit-original")
OUT_DIR = os.path.join(ROOT, "scripts", "blender", "out")

# (character_file, [(weapon_file, target_bone), ...])
CHARACTERS = [
    {
        "name": "Skeleton_Warrior",
        "file": "Skeleton_Warrior.glb",
        "weapons": [
            ("weapons/Skeleton_Blade.gltf", "handslot.r"),
            ("weapons/Skeleton_Shield_Large_A.gltf", "handslot.l"),
        ],
    },
    {
        "name": "Skeleton_Mage",
        "file": "Skeleton_Mage.glb",
        "weapons": [
            ("weapons/Skeleton_Staff.gltf", "handslot.r"),
        ],
    },
    {
        "name": "Skeleton_Minion",
        "file": "Skeleton_Minion.glb",
        "weapons": [
            ("weapons/Skeleton_Axe.gltf", "handslot.r"),
        ],
    },
]


def log(msg):
    print(f"[merge] {msg}", flush=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_gltf(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    after = set(bpy.context.scene.objects)
    return list(after - before)


def find_armature():
    for o in bpy.context.scene.objects:
        if o.type == "ARMATURE":
            return o
    raise RuntimeError("No armature in scene")


def assign_all_to_vgroup(obj, bone_name, weight=1.0):
    """Add a vertex group named `bone_name`, weight everything to it."""
    vg = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(name=bone_name)
    indices = [v.index for v in obj.data.vertices]
    vg.add(indices, weight, "REPLACE")
    return vg


def ensure_armature_modifier(obj, armature):
    for m in obj.modifiers:
        if m.type == "ARMATURE":
            m.object = armature
            return m
    m = obj.modifiers.new("Armature", "ARMATURE")
    m.object = armature
    return m


def remove_stray_icospheres():
    n = 0
    for o in list(bpy.context.scene.objects):
        if o.type == "MESH" and o.name.lower().startswith("icosphere"):
            bpy.data.objects.remove(o, do_unlink=True)
            n += 1
    if n:
        log(f"  removed {n} stray icosphere(s)")


def fix_static_meshes(armature, fallback_bone="head"):
    """Static meshes (helmet, hat) have no armature modifier and no vertex groups.
    Without skinning data they'd collapse to origin after gltf skinned export.
    Bind them rigidly to `fallback_bone` (head)."""
    fixed = []
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        if o.parent != armature:
            continue
        has_arm = any(m.type == "ARMATURE" for m in o.modifiers)
        has_vg = len(o.vertex_groups) > 0
        if not has_arm or not has_vg:
            ensure_armature_modifier(o, armature)
            assign_all_to_vgroup(o, fallback_bone, 1.0)
            fixed.append(o.name)
    if fixed:
        log(f"  rigidly skinned to '{fallback_bone}': {', '.join(fixed)}")


def attach_weapon(armature, weapon_path, bone_name):
    """Import weapon, snap to bone via Child Of constraint (equivalent to the
    runtime `bone.add(weapon)`), then bake transform and rigid-skin to bone."""
    log(f"  attaching {os.path.basename(weapon_path)} -> {bone_name}")
    new_objs = import_gltf(weapon_path)
    weapon_meshes = [
        o for o in new_objs
        if o.type == "MESH"
        and not any(m.type == "ARMATURE" for m in o.modifiers)
        and not o.name.lower().startswith("icosphere")
    ]
    if not weapon_meshes:
        raise RuntimeError(f"weapon import yielded no usable mesh in {weapon_path}")
    weapon = weapon_meshes[0]

    # Remove strays from the weapon import (extra meshes, lights, etc.)
    for o in new_objs:
        if o is not weapon and o.type in {"MESH", "EMPTY", "LIGHT", "CAMERA"}:
            bpy.data.objects.remove(o, do_unlink=True)

    # Position the weapon at the bone's rest-world matrix. After Ctrl+J
    # (with body as active, body.matrix_world == armature.matrix_world == identity),
    # the weapon vertices end up at bone.matrix_local @ vertex_in_weapon_local
    # in skin local space, which is exactly the bone's bind position.
    bone = armature.data.bones[bone_name]
    weapon.matrix_world = armature.matrix_world @ bone.matrix_local
    bpy.context.view_layer.update()
    log(f"    weapon.matrix_world.translation = {tuple(round(x, 4) for x in weapon.matrix_world.to_translation())}")

    # Skin rigidly to the bone (weight 1.0 to all vertices). NO parenting —
    # leaving weapon as a top-level orphan keeps Ctrl+J's vertex transform
    # math straightforward (it uses matrix_world directly).
    ensure_armature_modifier(weapon, armature)
    assign_all_to_vgroup(weapon, bone_name, 1.0)


def dedupe_materials_by_name():
    """Blender appends .001/.002 suffix to materials with duplicate names on
    repeated imports. Remap all mesh material slots to the canonical (first)
    material datablock per base name, then delete the orphan duplicates."""
    canon = {}
    suffix = re.compile(r"\.\d+$")
    # First pass: pick canonical (no suffix wins; else first encountered)
    for mat in bpy.data.materials:
        base = suffix.sub("", mat.name)
        cur = canon.get(base)
        if cur is None or (suffix.search(cur.name) and not suffix.search(mat.name)):
            canon[base] = mat
    # Second pass: remap slots
    remapped = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for slot in obj.material_slots:
            if slot.material is None:
                continue
            base = suffix.sub("", slot.material.name)
            target = canon[base]
            if slot.material != target:
                slot.material = target
                remapped += 1
    # Third pass: remove orphans
    removed = 0
    for mat in list(bpy.data.materials):
        if mat.users == 0 and mat is not canon.get(suffix.sub("", mat.name)):
            bpy.data.materials.remove(mat)
            removed += 1
    if remapped or removed:
        log(f"  dedupe materials: remapped {remapped} slot(s), removed {removed} orphan(s)")


def join_all_meshes(armature, target_name):
    """Join all MESH children of armature into one mesh."""
    bpy.ops.object.select_all(action="DESELECT")
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("no meshes to join")

    # Pick the 'Body' mesh as active (largest, has all the body vertex groups)
    body = next((m for m in meshes if "Body" in m.name), meshes[0])
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = body
    log(f"  joining {len(meshes)} meshes into '{body.name}' (will rename to '{target_name}')")
    bpy.ops.object.join()

    joined = bpy.context.view_layer.objects.active
    joined.name = target_name
    joined.data.name = target_name
    return joined


def export_glb(out_path):
    log(f"  exporting -> {out_path}")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_animations=False,
        export_skins=True,
        export_morph=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=False,
        use_visible=True,
        use_selection=False,
    )


def process_character(char_def):
    log(f"=== {char_def['name']} ===")
    reset_scene()

    char_path = os.path.join(SKIN_DIR, char_def["file"])
    log(f"  importing {char_def['file']}")
    import_gltf(char_path)
    armature = find_armature()
    log(f"  armature='{armature.name}' bones={len(armature.data.bones)}")

    remove_stray_icospheres()
    fix_static_meshes(armature, fallback_bone="head")

    for weapon_rel, bone_name in char_def["weapons"]:
        if bone_name not in armature.data.bones:
            raise RuntimeError(f"bone '{bone_name}' missing in armature; have: "
                               f"{[b.name for b in armature.data.bones]}")
        attach_weapon(armature, os.path.join(SKIN_DIR, weapon_rel), bone_name)

    dedupe_materials_by_name()
    joined = join_all_meshes(armature, char_def["name"])
    log(f"  merged mesh: verts={len(joined.data.vertices)} "
        f"materials={len(joined.material_slots)} vgroups={len(joined.vertex_groups)}")

    # Final pre-export cleanup: keep only the joined mesh + its armature.
    keep = {joined, armature}
    removed = 0
    for o in list(bpy.context.scene.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
            removed += 1
    if removed:
        log(f"  pre-export cleanup: removed {removed} extra object(s)")

    scene_objs = [(o.name, o.type) for o in bpy.context.scene.objects]
    log(f"  scene at export: {scene_objs}")

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, char_def["name"] + ".glb")
    export_glb(out_path)
    log(f"  done: {out_path}")
    return out_path


def main():
    outputs = []
    for char in CHARACTERS:
        try:
            outputs.append(process_character(char))
        except Exception as e:
            log(f"FAIL {char['name']}: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)
    log("=== ALL DONE ===")
    for p in outputs:
        log(f"  -> {p}")


if __name__ == "__main__":
    main()
