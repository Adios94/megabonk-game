"""Inspect merged output glbs to verify structure."""
import bpy
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "scripts", "blender", "out")
REPORT = os.path.join(ROOT, "scripts", "blender", "out", "merged-report.json")

FILES = ["Skeleton_Warrior.glb", "Skeleton_Mage.glb", "Skeleton_Minion.glb"]


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def inspect(path):
    reset()
    bpy.ops.import_scene.gltf(filepath=path)
    rep = {"meshes": [], "armatures": []}
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            slots = [s.material.name if s.material else None for s in o.material_slots]
            rep["meshes"].append({
                "name": o.name,
                "verts": len(o.data.vertices),
                "polys": len(o.data.polygons),
                "vgroups": len(o.vertex_groups),
                "material_slots": slots,
                "modifiers": [m.type for m in o.modifiers],
                "parent": o.parent.name if o.parent else None,
            })
        elif o.type == "ARMATURE":
            bones = [b.name for b in o.data.bones]
            rep["armatures"].append({
                "name": o.name,
                "bone_count": len(bones),
                "has_handslot_r": "handslot.r" in bones,
                "has_handslot_l": "handslot.l" in bones,
                "bones": bones,
            })
    return rep


def main():
    full = {}
    for f in FILES:
        p = os.path.join(OUT_DIR, f)
        if not os.path.exists(p):
            print(f"[skip] {p}")
            continue
        rep = inspect(p)
        full[f] = rep
        n_mesh = len(rep["meshes"])
        n_mat = sum(len(set(m["material_slots"])) for m in rep["meshes"])
        verts = sum(m["verts"] for m in rep["meshes"])
        arm = rep["armatures"][0] if rep["armatures"] else None
        hs = f"handslot.r={arm['has_handslot_r']} handslot.l={arm['has_handslot_l']}" if arm else "NO ARMATURE"
        print(f"[ok] {f}: meshes={n_mesh} unique_mats={n_mat} verts={verts} {hs}")
    with open(REPORT, "w") as fp:
        json.dump(full, fp, indent=2)
    print(f"[done] -> {REPORT}")


if __name__ == "__main__":
    main()
