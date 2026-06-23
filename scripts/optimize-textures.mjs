/**
 * 一次性脚本：用 sharp 把 public/textures 下的 PNG 用 palette 量化压缩。
 * VFX 贴图（火光 / 烟雾 / 法阵）颜色少，palette 模式可在视觉无明显损失的前提下大幅瘦身。
 * 运行：node scripts/optimize-textures.mjs
 */
import sharp from 'sharp';
import { readdir, stat, writeFile, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', 'public', 'textures');

/** 递归收集 .png 路径。 */
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else if (entry.isFile() && p.toLowerCase().endsWith('.png')) out.push(p);
  }
  return out;
}

async function main() {
  const files = await walk(ROOT);
  let beforeTotal = 0;
  let afterTotal = 0;
  const rows = [];
  for (const file of files) {
    const before = (await stat(file)).size;
    const buf = await readFile(file);
    const out = await sharp(buf)
      .png({
        palette: true,
        quality: 90,
        effort: 10,
        compressionLevel: 9,
      })
      .toBuffer();
    let finalBuf = out;
    let finalSize = out.length;
    if (out.length >= before) {
      // 量化反而更大 → 仅做无损 zlib 重压缩
      const lossless = await sharp(buf)
        .png({ compressionLevel: 9, effort: 10, palette: false })
        .toBuffer();
      if (lossless.length < before) {
        finalBuf = lossless;
        finalSize = lossless.length;
      } else {
        finalSize = before;
      }
    }
    if (finalSize < before) await writeFile(file, finalBuf);
    beforeTotal += before;
    afterTotal += finalSize;
    rows.push({
      file: relative(ROOT, file).replace(/\\/g, '/'),
      beforeKB: (before / 1024).toFixed(1),
      afterKB: (finalSize / 1024).toFixed(1),
      saved: `${(((before - finalSize) / before) * 100).toFixed(1)}%`,
    });
  }
  console.table(rows);
  console.log(
    `Total: ${(beforeTotal / 1024).toFixed(1)} KB → ${(afterTotal / 1024).toFixed(1)} KB ` +
      `(saved ${(((beforeTotal - afterTotal) / beforeTotal) * 100).toFixed(1)}%)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
