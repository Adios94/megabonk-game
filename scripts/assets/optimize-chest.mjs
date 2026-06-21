// Prop_Chest 宝箱模型「源 → 优化 glb」重建脚本（可重复跑）。
//
// 编辑纹理的工作流：
//   1. 改 _legacy/assets-archive/models/items/_unused/T_Props_Batch2_BaseColor.png(宝箱颜色/花纹源图)
//   2. node scripts/assets/optimize-chest.mjs   ← 重新生成 public/models/items/Prop_Chest.glb
//   3. dev 刷新看效果
//
// 它经 convertToToonMaterials 转成 MeshToonMaterial，运行时只用 baseColor 贴图，
// Normal/ORM(metallicRoughness/occlusion)被 toon 丢弃但仍随 gltf 加载(1.7M 浪费)。
// 故：解除 Normal/ORM 引用 → prune 删掉 → baseColor 转 WebP → 输出 glb。
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { statSync } from 'node:fs';

const SRC = '_legacy/assets-archive/models/items/_unused/Prop_Chest.gltf';
const OUT = 'public/models/items/Prop_Chest.glb';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(SRC);

let removed = 0;
for (const mat of doc.getRoot().listMaterials()) {
  if (mat.getNormalTexture()) { mat.setNormalTexture(null); removed++; }
  if (mat.getMetallicRoughnessTexture()) { mat.setMetallicRoughnessTexture(null); removed++; }
  if (mat.getOcclusionTexture()) { mat.setOcclusionTexture(null); removed++; }
}
console.log(`解除 ${removed} 个 toon 不用的贴图槽(Normal/ORM/AO)`);

await doc.transform(
  prune(),                                                    // 删无引用的 texture/accessor
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80 }), // 剩下的 baseColor → webp
);

await io.write(OUT, doc);
console.log(`${SRC} → ${OUT}: ${(statSync(SRC).size / 1024).toFixed(0)}K(+3 png 2.1M)→ ${(statSync(OUT).size / 1024).toFixed(0)}K`);
