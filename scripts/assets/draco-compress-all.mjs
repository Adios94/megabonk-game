// 把 public/models/**/*.glb 全部 Draco 压缩（in-place）。
//
// 工作原理：
//   - 遍历 public/models/ 下所有 .glb
//   - 调用 node_modules/.bin/gltf-transform draco <in> <tmp> ，再覆盖原文件
//   - Draco 仅压缩三角网格几何（顶点 / 法线 / UV / 索引），不动动画轨道和贴图
//
// 前置：备份原始资源到 _legacy/assets-archive/models-pre-draco/（已由人工 / shell 完成）
// 运行：
//   node scripts/assets/draco-compress-all.mjs
//
// 还原（如果想退回未压缩版本）：
//   Remove-Item -Recurse public/models; Copy-Item -Recurse _legacy/assets-archive/models-pre-draco public/models
//
// 运行时配合：game/client/source/index.ts 已挂 DRACOLoader（解码器在 public/draco/）。
import { spawnSync, execSync } from 'node:child_process';
import { readdirSync, statSync, renameSync, unlinkSync, existsSync, copyFileSync, readFileSync } from 'node:fs';
import { join, relative, sep, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(SCRIPT_DIR, '..', '..');
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

/** 列出 glb 引用的所有 sidecar 文件（buffers[].uri / images[].uri 中的本地相对路径）。
 *  binary .glb（magic=`glTF`）没有引用，返回空数组。 */
function listSidecars(file) {
  const b = readFileSync(file);
  // binary glb 头 4 字节是 'glTF'，跳过
  if (b.length >= 4 && b.toString('ascii', 0, 4) === 'glTF') return [];
  // JSON gltf
  let j;
  try { j = JSON.parse(b.toString('utf8')); } catch { return []; }
  const uris = [];
  for (const buf of (j.buffers ?? [])) {
    if (buf.uri && !buf.uri.startsWith('data:')) uris.push(buf.uri);
  }
  for (const img of (j.images ?? [])) {
    if (img.uri && !img.uri.startsWith('data:')) uris.push(img.uri);
  }
  const dir = dirname(file);
  return uris.map((u) => join(dir, u)).filter((p) => existsSync(p));
}

/** 调用 gltf-transform draco 压一个文件。in-place 覆盖。
 *  返回 'compressed' / 'kept-original'（Draco 反而变大时不动原文件）。
 *
 *  ⚠️ separated 格式 .glb（JSON 引用 .bin / .png sidecar）的坑：
 *  gltf-transform draco 写 tmp 时会**同名覆盖原 sidecar 文件**。如果之后判定
 *  KEEP 只删 tmp，sidecar 已经被破坏（新 bin 内容 ↔ 旧 .glb 元数据不一致），
 *  浏览器加载时 DRACOLoader 会报 "Not a Draco file"。修复：跑之前把 sidecar
 *  备份到 .bak，KEEP 时恢复，compressed 时清理 .bak。 */
function compressOne(file) {
  const tmp = file + '.draco.tmp';
  if (existsSync(tmp)) unlinkSync(tmp);
  const sidecars = listSidecars(file);
  const backups = sidecars.map((s) => ({ src: s, bak: s + '.bak' }));
  for (const { src, bak } of backups) copyFileSync(src, bak);
  try {
    // Windows: 调 .CMD 必须 shell:true，路径中含空格需引号。
    const res = spawnSync(CLI, ['draco', `"${file}"`, `"${tmp}"`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
      shell: true,
    });
    if (res.status !== 0) {
      if (existsSync(tmp)) unlinkSync(tmp);
      // gltf-transform 失败也可能改过 sidecar，恢复一下
      for (const { src, bak } of backups) renameSync(bak, src);
      throw new Error(`gltf-transform 失败 (exit=${res.status})\n${res.stderr || res.stdout}`);
    }
    // 几何过简单时 Draco 头开销会让文件反而变大（典型：碰撞体几个三角面）。这种情况下保留原文件。
    const before = statSync(file).size;
    const after = statSync(tmp).size;
    if (after >= before) {
      unlinkSync(tmp);
      // 关键：sidecar 已被 gltf-transform 重写，必须从备份恢复
      for (const { src, bak } of backups) renameSync(bak, src);
      return 'kept-original';
    }
    renameSync(tmp, file);
    // compressed 成功，新 sidecar 已 in-place 替换旧 sidecar，备份不需要了
    for (const { bak } of backups) { if (existsSync(bak)) unlinkSync(bak); }
    return 'compressed';
  } catch (err) {
    // 兜底清理 .bak（异常路径）
    for (const { src, bak } of backups) {
      if (!existsSync(bak)) continue;
      if (!existsSync(src)) renameSync(bak, src); else unlinkSync(bak);
    }
    throw err;
  }
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
