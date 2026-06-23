"""
Inspect KayKit character + weapon glb structure.

Run:
  blender --background --python scripts/blender/inspect-skins.py

Writes JSON report to scripts/blender/out/inspect-report.json
"""
import bpy
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SKIN_DIR = os.path.join(ROOT, "public", "models", "skins", "kaykit")
OUT_PATH = os.path.join(ROOT, "scripts", "blender", "out", "inspect-report.json")

FILES = [
    ("character", "Skeleton_Warrior.glb"),
    ("character", "Skeleton_Mage.glb"),
    ("character", "Skeleton_Minion.glb"),
    ("weapon", os.path.join("weapons", "Skeleton_Blade.gltf")),
    ("weapon", os.path.join("weapons", "Skeleton_Axe.gltf")),
    ("weapon", os.path.join("weapons", "Skeleton_Staff.gltf")),
    ("weapon", os.path.join("weapons", "Skeleton_Shield_Large_A.gltf")),
]


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_file(path):
    if path.lower().endswith(".glb") or path.lower().endswith(".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)


def list_image_for_material(mat):
    if not mat or not mat.use_nodes:
        return None
    for node in mat.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image is not None:
            return node.image.name
    return None


def inspect_current_scene():
    report = {
        "objects": [],
        "armatures": [],
        "materials": [],
        "images": [],
    }
    seen_mats = set()
    seen_imgs = set()
    for obj in bpy.data.objects:
        info = {
            "name": obj.name,
            "type": obj.type,
            "parent": obj.parent.name if obj.parent else None,
            "modifiers": [m.type for m in obj.modifiers],
        }
        if obj.type == "MESH":
            mesh = obj.data
            info["vertex_count"] = len(mesh.vertices)
            info["poly_count"] = len(mesh.polygons)
            info["vertex_groups"] = [vg.name for vg in obj.vertex_groups]
            info["material_slots"] = []
            for slot in obj.material_slots:
                if slot.material is None:
                    info["material_slots"].append(None)
                else:
                    info["material_slots"].append(slot.material.name)
                    if slot.material.name not in seen_mats:
                        seen_mats.add(slot.material.name)
                        img = list_image_for_material(slot.material)
                        report["materials"].append({
                            "name": slot.material.name,
                            "image": img,
                        })
                        if img and img not in seen_imgs:
                            seen_imgs.add(img)
                            report["images"].append(img)
            # Armature modifier target
            for m in obj.modifiers:
                if m.type == "ARMATURE":
                    info["armature_target"] = m.object.name if m.object else None
        elif obj.type == "ARMATURE":
            arm = obj.data
            info["bone_count"] = len(arm.bones)
            info["bone_names"] = [b.name for b in arm.bones]
            info["handslot_bones"] = [b.name for b in arm.bones if "handslot" in b.name.lower()]
            report["armatures"].append(info["name"])
        report["objects"].append(info)
    return report


def main():
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    full_report = {}
    for kind, rel in FILES:
        path = os.path.join(SKIN_DIR, rel)
        if not os.path.exists(path):
            print(f"[skip] missing {path}", file=sys.stderr)
            continue
        reset_scene()
        try:
            import_file(path)
        except Exception as e:
            print(f"[fail] import {rel}: {e}", file=sys.stderr)
            full_report[rel] = {"error": str(e)}
            continue
        rep = inspect_current_scene()
        rep["kind"] = kind
        full_report[rel] = rep
        print(f"[ok] {rel}: objects={len(rep['objects'])} mats={len(rep['materials'])} imgs={len(rep['images'])}")
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(full_report, f, indent=2, ensure_ascii=False)
    print(f"[done] report written to {OUT_PATH}")


if __name__ == "__main__":
    main()
