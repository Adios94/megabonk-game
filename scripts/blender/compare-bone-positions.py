"""Compare handslot.r position between:
  1. original Minion glb (skin IBM)
  2. our merged Minion glb (skin IBM)
  3. Blender's bone.matrix_local at merge time

This will tell us if matrix_local is what we expect, or if there's a hidden
transform we're not accounting for."""
import json
import os
import struct

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def read_glb_json(path):
    with open(path, "rb") as f:
        struct.unpack("<4sII", f.read(12))
        chunk_len, _ = struct.unpack("<I4s", f.read(8))
        return json.loads(f.read(chunk_len).rstrip(b"\x00").decode("utf-8"))


def read_glb_bin(path):
    with open(path, "rb") as f:
        struct.unpack("<4sII", f.read(12))
        chunk_len, _ = struct.unpack("<I4s", f.read(8))
        f.read(chunk_len).rstrip(b"\x00")
        chunk_len, _ = struct.unpack("<I4s", f.read(8))
        return f.read(chunk_len)


def get_ibm_for_bone(gltf, bin_data, bone_name):
    skin = gltf["skins"][0]
    joints = skin["joints"]
    # Find joint index whose node name matches
    for j_idx, node_idx in enumerate(joints):
        if gltf["nodes"][node_idx].get("name") == bone_name:
            break
    else:
        return None
    ibm_acc = skin["inverseBindMatrices"]
    acc = gltf["accessors"][ibm_acc]
    bv = gltf["bufferViews"][acc["bufferView"]]
    offset = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    matrix_offset = offset + j_idx * 16 * 4
    floats = struct.unpack_from("<16f", bin_data, matrix_offset)
    # Column major: translation is at indices 12, 13, 14
    return floats, (floats[12], floats[13], floats[14])


def find_mesh_node_transform(gltf):
    """Find any node that references a mesh + skin and return its transform."""
    for ni, n in enumerate(gltf["nodes"]):
        if "mesh" in n and "skin" in n:
            return ni, n.get("translation", [0,0,0]), n.get("rotation", [0,0,0,1]), n.get("scale", [1,1,1]), n.get("matrix")
    return None


def show(path, label):
    gltf = read_glb_json(path)
    bin_data = read_glb_bin(path)
    print(f"\n=== {label}: {os.path.basename(path)} ===")
    info = find_mesh_node_transform(gltf)
    if info:
        ni, t, r, s, m = info
        print(f"  mesh node[{ni}] name='{gltf['nodes'][ni].get('name','?')}'")
        print(f"    translation={t}")
        print(f"    rotation={r}")
        print(f"    scale={s}")
        if m:
            print(f"    matrix={m}")
    for bone in ["handslot.r", "hand.r", "wrist.r", "head"]:
        r = get_ibm_for_bone(gltf, bin_data, bone)
        if r:
            ibm_flat, ibm_t = r
            bind_pos = (-ibm_t[0], -ibm_t[1], -ibm_t[2])  # ASSUMING pure translation IBM
            print(f"  bone '{bone}' IBM_t={ibm_t} (rough bind pos = {bind_pos})")


orig = os.path.join(ROOT, "assets-archive", "models", "_kaykit-original", "Skeleton_Minion.glb")
merged = os.path.join(ROOT, "scripts", "blender", "out", "Skeleton_Minion.glb")

show(orig, "ORIGINAL")
show(merged, "MERGED")
