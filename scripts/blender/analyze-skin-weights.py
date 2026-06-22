"""Parse a glb's binary buffer and print JOINTS_0 + WEIGHTS_0 for each
vertex of each mesh primitive. Helps verify that weapon vertices are
actually weighted to the expected bone after merge."""
import json
import struct
import sys
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PATH = os.path.join(ROOT, "scripts", "blender", "out", "Skeleton_Minion.glb")


def read_glb(path):
    with open(path, "rb") as f:
        magic, version, length = struct.unpack("<4sII", f.read(12))
        chunk_len, chunk_type = struct.unpack("<I4s", f.read(8))
        assert chunk_type == b"JSON"
        gltf = json.loads(f.read(chunk_len).rstrip(b"\x00").decode("utf-8"))
        # BIN chunk
        chunk_len, chunk_type = struct.unpack("<I4s", f.read(8))
        assert chunk_type == b"BIN\x00"
        bin_data = f.read(chunk_len)
    return gltf, bin_data


COMPONENT_TYPES = {
    5120: ("b", 1),  # BYTE
    5121: ("B", 1),  # UNSIGNED_BYTE
    5122: ("h", 2),  # SHORT
    5123: ("H", 2),  # UNSIGNED_SHORT
    5125: ("I", 4),  # UNSIGNED_INT
    5126: ("f", 4),  # FLOAT
}

TYPE_COUNTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_accessor(gltf, bin_data, idx):
    acc = gltf["accessors"][idx]
    bv = gltf["bufferViews"][acc["bufferView"]]
    fmt, comp_size = COMPONENT_TYPES[acc["componentType"]]
    n_comp = TYPE_COUNTS[acc["type"]]
    offset = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    count = acc["count"]
    out = []
    stride = comp_size * n_comp
    for i in range(count):
        vals = struct.unpack_from(f"<{n_comp}{fmt}", bin_data, offset + i * stride)
        out.append(vals)
    return out


def main():
    gltf, bin_data = read_glb(PATH)
    print(f"=== {os.path.basename(PATH)} ===")
    print(f"meshes: {len(gltf.get('meshes', []))}")

    # Build node -> parent map
    parent_of = {}
    for ni, n in enumerate(gltf["nodes"]):
        for c in n.get("children", []):
            parent_of[c] = ni

    # Get skin joints (list of node indices)
    skin = gltf["skins"][0]
    joints = skin["joints"]
    ibm_acc = skin.get("inverseBindMatrices")
    ibms = read_accessor(gltf, bin_data, ibm_acc) if ibm_acc is not None else None
    print(f"skin joints (count={len(joints)}):")
    for j_idx, node_idx in enumerate(joints):
        name = gltf["nodes"][node_idx].get("name", "?")
        parent_idx = parent_of.get(node_idx)
        parent_name = gltf["nodes"][parent_idx].get("name", "?") if parent_idx is not None else "ROOT"
        ibm_str = ""
        if ibms:
            ibm = ibms[j_idx]
            # IBM stored column-major (16 floats); show translation (m12,m13,m14)
            ibm_str = f" IBM_translate=({ibm[12]:.3f},{ibm[13]:.3f},{ibm[14]:.3f})"
        # Also show node's own translation
        n = gltf["nodes"][node_idx]
        t = n.get("translation", [0,0,0])
        print(f"  joint[{j_idx}] node[{node_idx}] '{name}' parent='{parent_name}' "
              f"node_t=({t[0]:.3f},{t[1]:.3f},{t[2]:.3f}){ibm_str}")

    # Iterate primitives
    for m_idx, mesh in enumerate(gltf["meshes"]):
        for p_idx, prim in enumerate(mesh["primitives"]):
            attrs = prim["attributes"]
            joints_acc = attrs.get("JOINTS_0")
            weights_acc = attrs.get("WEIGHTS_0")
            pos_acc = attrs.get("POSITION")
            mat_idx = prim.get("material", "?")
            mat_name = gltf["materials"][mat_idx]["name"] if isinstance(mat_idx, int) else "?"
            print(f"\nmesh[{m_idx}].primitive[{p_idx}] material='{mat_name}' "
                  f"joints_acc={joints_acc} weights_acc={weights_acc}")
            if joints_acc is None or weights_acc is None:
                continue
            joints_data = read_accessor(gltf, bin_data, joints_acc)
            weights_data = read_accessor(gltf, bin_data, weights_acc)
            pos_data = read_accessor(gltf, bin_data, pos_acc)
            vcount = len(joints_data)
            print(f"  vertex_count={vcount}")
            # Histogram of dominant joint
            dom = {}
            for w, j in zip(weights_data, joints_data):
                # find max weight index
                max_i = max(range(4), key=lambda i: w[i])
                dom_joint = j[max_i]
                joint_node = joints[dom_joint]
                joint_name = gltf["nodes"][joint_node].get("name", "?")
                dom[joint_name] = dom.get(joint_name, 0) + 1
            print("  dominant joint histogram:")
            for name, n in sorted(dom.items(), key=lambda x: -x[1]):
                print(f"    {name}: {n}")
            # Print last 10 verts (likely from weapons since they're added last)
            print("  last 5 verts (joints, weights, position):")
            for i in range(max(0, vcount - 5), vcount):
                j = joints_data[i]
                w = weights_data[i]
                p = pos_data[i]
                joint_names = [gltf["nodes"][joints[ji]].get("name", "?") if w[k] > 0 else "-"
                               for k, ji in enumerate(j)]
                print(f"    [{i}] joints={joint_names} weights={[round(x,3) for x in w]} pos={[round(x,3) for x in p]}")


if __name__ == "__main__":
    main()
