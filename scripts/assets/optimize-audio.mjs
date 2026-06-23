// 音频资源优化：无损/高码率 → 128kbps MP3（浏览器 SFX/BGM 足够）。
// 用法：node scripts/assets/optimize-audio.mjs
// 需要本机已安装 ffmpeg，或通过 FFMPEG_PATH 指向 ffmpeg 可执行文件。
import { execFileSync } from 'node:child_process';
import { renameSync, statSync, unlinkSync } from 'node:fs';

const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

/** @type {Array<{ in: string; out?: string; bitrate?: string; mono?: boolean }>} */
const JOBS = [
  // 无损 → MP3
  { in: 'public/audio/sfx/weapons/sword.flac', out: 'public/audio/sfx/weapons/sword.mp3' },
  { in: 'public/audio/sfx/weapons/gun.wav', out: 'public/audio/sfx/weapons/gun.mp3', mono: true },
  { in: 'public/audio/sfx/weapons/raygun.wav', out: 'public/audio/sfx/weapons/raygun.mp3' },
  // 体积偏大 MP3 重编码
  { in: 'public/audio/music/begin.mp3', bitrate: '128k' },
  { in: 'public/audio/music/fight1.mp3', bitrate: '128k' },
  { in: 'public/audio/sfx/weapons/firering.mp3', bitrate: '128k' },
  { in: 'public/audio/sfx/player/gameover.mp3', bitrate: '128k' },
  { in: 'public/audio/sfx/weapons/burn.mp3', bitrate: '128k' },
  { in: 'public/audio/sfx/weapons/poison.mp3', bitrate: '128k', mono: true },
  { in: 'public/audio/sfx/weapons/needle.mp3', bitrate: '128k', mono: true },
  { in: 'public/audio/sfx/pickups/eat.mp3', bitrate: '128k' },
];

function kb(size) {
  return `${(size / 1024).toFixed(1)}K`;
}

let beforeTotal = 0;
let afterTotal = 0;

for (const job of JOBS) {
  const input = job.in;
  const output = job.out ?? input;
  const tmp = `${output}.tmp.mp3`;
  const before = statSync(input).size;
  beforeTotal += before;

  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', input,
    '-codec:a', 'libmp3lame',
    '-b:a', job.bitrate ?? '128k',
    '-ar', '44100',
  ];
  if (job.mono) args.push('-ac', '1');
  args.push(tmp);

  execFileSync(ffmpegPath, args);

  unlinkSync(input);
  renameSync(tmp, output);

  const after = statSync(output).size;
  afterTotal += after;
  const label = output === input ? input : `${input} → ${output}`;
  console.log(`${label}: ${kb(before)} → ${kb(after)} (-${Math.round(100 - (after / before) * 100)}%)`);
}

console.log(`\nTOTAL: ${kb(beforeTotal)} → ${kb(afterTotal)} (saved ${kb(beforeTotal - afterTotal)})`);
