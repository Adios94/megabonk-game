"""Properly invert the IBM to get bone's bind position in skin local space,
and compare with where the axe was actually placed."""
import json
import struct
import os
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PATH = os.path.join(ROOT, "scripts", "blender", "out", "Skeleton_Minion.glb")

with open(PATH, "rb") as f:
    struct.unpack("<4sII", f.read(12))
    cl, _ = struct.unpack("<I4s", f.read(8))
    gltf = json.loads(f.read(cl).rstrip(b"\x00").decode())
    cl, _ = struct.unpack("<I4s", f.read(8))
    bin_data = f.read(cl)

skin = gltf["skins"][0]
joints = skin["joints"]
ibm_acc = gltf["accessors"][skin["inverseBindMatrices"]]
bv = gltf["bufferViews"][ibm_acc["bufferView"]]
offset = bv.get("byteOffset", 0) + ibm_acc.get("byteOffset", 0)

print("Bone bind positions (in skin local space):")
for j_idx, node_idx in enumerate(joints):
    name = gltf["nodes"][node_idx].get("name", "?")
    floats = struct.unpack_from("<16f", bin_data, offset + j_idx * 64)
    # Column major to numpy (row major)
    ibm = np.array(floats).reshape((4, 4), order="F")
    bind = np.linalg.inv(ibm)
    pos = bind[:3, 3]
    if name in ("handslot.r", "handslot.l", "hand.r", "head"):
        print(f"  {name}: bind_pos = ({pos[0]:.4f}, {pos[1]:.4f}, {pos[2]:.4f})")

# Now look at axe vertex positions (vertices weighted 1.0 to handslot.r in primitive 0)
mesh = gltf["meshes"][0]
prim = mesh["primitives"][0]
pos_acc = gltf["accessors"][prim["attributes"]["POSITION"]]
weights_acc = gltf["accessors"][prim["attributes"]["WEIGHTS_0"]]
joints_acc = gltf["accessors"][prim["attributes"]["JOINTS_0"]]


def read_acc(acc):
    bv = gltf["bufferViews"][acc["bufferView"]]
    off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    count = acc["count"]
    if acc["type"] == "VEC3":
        n = 3
    elif acc["type"] == "VEC4":
        n = 4
    else:
        raise Exception(acc["type"])
    fmt_map = {5121: "B", 5123: "H", 5126: "f"}
    fmt = fmt_map[acc["componentType"]]
    size = {"B": 1, "H": 2, "f": 4}[fmt] * n
    out = []
    for i in range(count):
        out.append(struct.unpack_from(f"<{n}{fmt}", bin_data, off + i * size))
    return out


pos = read_acc(pos_acc)
weights = read_acc(weights_acc)
jjoints = read_acc(joints_acc)

# Find handslot.r joint index
hs_r_idx = None
for j_idx, node_idx in enumerate(joints):
    if gltf["nodes"][node_idx].get("name") == "handslot.r":
        hs_r_idx = j_idx
        break

print(f"\nhandslot.r joint index: {hs_r_idx}")

# Find verts dominantly weighted to handslot.r
hs_verts = []
for i, (w, j) in enumerate(zip(weights, jjoints)):
    max_i = max(range(4), key=lambda k: w[k])
    if j[max_i] == hs_r_idx and w[max_i] > 0.9:
        hs_verts.append((i, pos[i]))

print(f"\nverts dominantly weighted to handslot.r: {len(hs_verts)}")
if hs_verts:
    xs = [v[1][0] for v in hs_verts]
    ys = [v[1][1] for v in hs_verts]
    zs = [v[1][2] for v in hs_verts]
    print(f"  X range: [{min(xs):.3f}, {max(xs):.3f}], center={sum(xs)/len(xs):.3f}")
    print(f"  Y range: [{min(ys):.3f}, {max(ys):.3f}], center={sum(ys)/len(ys):.3f}")
    print(f"  Z range: [{min(zs):.3f}, {max(zs):.3f}], center={sum(zs)/len(zs):.3f}")
