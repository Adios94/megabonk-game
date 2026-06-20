// 把 public/models/**/*.glb 全部 Draco 压缩（in-place）。
//
// 工作原理：
//   - 遍历 public/models/ 下所有 .glb
//   - 调用 node_modules/.bin/gltf-transform draco <in> <tmp> ，再覆盖原文件
//   - Draco 仅压缩三角网格几何（顶点 / 法线 / UV / 索引），不动动画轨道和贴图
//
// 前置：备份原始资源到 assets-archive/models-pre-draco/（已由人工 / shell 完成）
// 运行：
//   node scripts/draco-compress-all.mjs
//
// 还原（如果想退回未压缩版本）：
//   Remove-Item -Recurse public/models; Copy-Item -Recurse assets-archive/models-pre-draco public/models
//
// 运行时配合：game/client/source/index.ts 已挂 DRACOLoader（解码器在 public/draco/）。
import { spawnSync, execSync } from 'node:child_process';
import { readdirSync, statSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(SCRIPT_DIR, '..');
const MODELS_DIR = join(ROOT, 'public', 'models');
const CLI = process.platform === 'win32'
  ? join(ROOT, 'node_modules', '.bin', 'gltf-transform.CMD')
  : join(ROOT, 'node_modules', '.bin', 'gltf-transform');

if (!existsSync(CLI)) {
  console.error(`找不到 gltf-transform CLI：${CLI}\n请先跑 pnpm install`);
  process.exit(1);
}

/** 递归列 dir 下所有 .glb（不含已压缩标记 .draco.tmp）。 */
function walkGlbs(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkGlbs(p));
    else if (entry.isFile() && entry.name.endsWith('.glb') && !entry.name.endsWith('.draco.tmp')) {
      out.push(p);
    }
  }
  return out;
}

/** 调用 gltf-transform draco 压一个文件。in-place 覆盖。
 *  返回 'compressed' / 'kept-original'（Draco 反而变大时不动原文件）。 */
function compressOne(file) {
  const tmp = file + '.draco.tmp';
  if (existsSync(tmp)) unlinkSync(tmp);
  // Windows: 调 .CMD 必须 shell:true，路径中含空格需引号。
  const res = spawnSync(CLI, ['draco', `"${file}"`, `"${tmp}"`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
    shell: true,
  });
  if (res.status !== 0) {
    if (existsSync(tmp)) unlinkSync(tmp);
    throw new Error(`gltf-transform 失败 (exit=${res.status})\n${res.stderr || res.stdout}`);
  }
  // 几何过简单时 Draco 头开销会让文件反而变大（典型：碰撞体几个三角面）。这种情况下保留原文件。
  const before = statSync(file).size;
  const after = statSync(tmp).size;
  if (after >= before) {
    unlinkSync(tmp);
    return 'kept-original';
  }
  renameSync(tmp, file);
  return 'compressed';
}

const files = walkGlbs(MODELS_DIR).sort();
console.log(`找到 ${files.length} 个 glb，开始压缩...\n`);

const results = [];
let idx = 0;
for (const file of files) {
  idx++;
  const rel = relative(ROOT, file).split(sep).join('/');
  const beforeKB = statSync(file).size / 1024;
  process.stdout.write(`[${idx}/${files.length}] ${rel}  ${beforeKB.toFixed(1)}KB ... `);
  try {
    const status = compressOne(file);
    const afterKB = statSync(file).size / 1024;
    if (status === 'kept-original') {
      process.stdout.write(`KEEP (Draco 反而更大)\n`);
    } else {
      const pct = ((1 - afterKB / beforeKB) * 100).toFixed(1);
      process.stdout.write(`${afterKB.toFixed(1)}KB (-${pct}%)\n`);
    }
    results.push({ rel, beforeKB, afterKB, ok: true });
  } catch (err) {
    process.stdout.write(`SKIP (${err.message.split('\n')[0]})\n`);
    results.push({ rel, beforeKB, afterKB: beforeKB, ok: false });
  }
}

const totalBefore = results.reduce((a, b) => a + b.beforeKB, 0);
const totalAfter = results.reduce((a, b) => a + b.afterKB, 0);
const totalPct = ((1 - totalAfter / totalBefore) * 100).toFixed(1);
const skipped = results.filter((r) => !r.ok).length;

console.log('\n=== Summary ===');
console.log(`总计  : ${totalBefore.toFixed(1)}KB → ${totalAfter.toFixed(1)}KB (-${totalPct}%)`);
console.log(`成功  : ${results.length - skipped}/${results.length}`);
if (skipped > 0) console.log(`跳过  : ${skipped}（看上方 SKIP 行；通常是无网格 / 已是 Draco / 极端模型）`);
