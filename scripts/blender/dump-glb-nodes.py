"""Dump raw node names from a glb by reading its JSON chunk directly,
without going through Blender's importer (which might add stuff)."""
import json
import os
import struct
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
files = [
    os.path.join(ROOT, "scripts", "blender", "out", "Skeleton_Warrior.glb"),
    os.path.join(ROOT, "scripts", "blender", "out", "Skeleton_Mage.glb"),
    os.path.join(ROOT, "scripts", "blender", "out", "Skeleton_Minion.glb"),
]

for p in files:
    with open(p, "rb") as f:
        magic, version, length = struct.unpack("<4sII", f.read(12))
        assert magic == b"glTF", f"not a glb: {p}"
        chunk_len, chunk_type = struct.unpack("<I4s", f.read(8))
        assert chunk_type == b"JSON"
        data = json.loads(f.read(chunk_len).rstrip(b"\x00").decode("utf-8"))
    nodes = data.get("nodes", [])
    meshes = data.get("meshes", [])
    skins = data.get("skins", [])
    materials = data.get("materials", [])
    print(f"\n=== {os.path.basename(p)} ===")
    print(f"  nodes={len(nodes)} meshes={len(meshes)} skins={len(skins)} materials={len(materials)}")
    print(f"  node names: {[n.get('name', '?') for n in nodes]}")
    print(f"  mesh names: {[m.get('name', '?') for m in meshes]}")
    print(f"  material names: {[m.get('name', '?') for m in materials]}")
    if skins:
        for i, s in enumerate(skins):
            print(f"  skin[{i}]: joints={len(s.get('joints', []))}")
