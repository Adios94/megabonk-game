// 一次性资源优化：把体积大的 UI PNG 转成 WebP（quality 82，保留 alpha）。
// 包体优化用——大背景/立绘/标题图 PNG 未压缩，转 WebP 通常省 80%+，视觉接近无损。
// 用法：node scripts/assets/optimize-ui-images.mjs
// 转码后需手动把代码里这些路径的 .png 引用改成 .webp，并归档原 PNG。
import sharp from 'sharp';
import { statSync } from 'node:fs';

const FILES = [
  'public/ui/common/bg_lobby.png',
  'public/ui/common/bg_ui_common.png',
  'public/ui/characters/megachad_full.png',
  'public/ui/characters/roberto_full.png',
  'public/ui/characters/skateboard_skeleton_full.png',
  'public/ui/title/title_cn.png',
  'public/ui/title/title_en.png',
  'public/ui/characters/skateboard_skeleton_avatar.png',
  'public/ui/characters/megachad_avatar.png',
  'public/ui/characters/roberto_avatar.png',
  'public/ui/title/final_swarm_cn.png',
  'public/ui/title/final_swarm_en.png',
  'public/ui/title/overtime_cn.png',
  'public/ui/title/overtime_en.png',
];

let before = 0;
let after = 0;
for (const f of FILES) {
  const out = f.replace(/\.png$/, '.webp');
  const b = statSync(f).size;
  await sharp(f).webp({ quality: 82, effort: 6 }).toFile(out);
  const a = statSync(out).size;
  before += b;
  after += a;
  console.log(`${out.replace('public', '')}: ${(b / 1024).toFixed(0)}K -> ${(a / 1024).toFixed(0)}K (-${(100 - (a / b) * 100).toFixed(0)}%)`);
}
console.log(`\nTOTAL: ${(before / 1024 / 1024).toFixed(1)}M -> ${(after / 1024 / 1024).toFixed(2)}M  (省 ${((before - after) / 1024 / 1024).toFixed(1)}M)`);
