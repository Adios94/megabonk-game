/**
 * 程序化生成的 CanvasTexture 工厂集合。
 *
 * 每个 getter：
 *  - 第一次调用时构造 128×128 canvas + 各自的绘制逻辑；
 *  - 缓存到模块级单例，再次调用直接返回；
 *  - 关键 getter（emoji）支持异步替换：先画 fallback，PNG 加载完后 `texture.needsUpdate = true`。
 *
 * 没有 dispose —— 这些贴图整局都在用，模块卸载（页面关闭）时一起 GC。
 */
import * as THREE from 'three';
import { CONSUMABLE_COLORS, CONSUMABLE_EMOJI, consumableIconSrc } from '../data/visualConfig.ts';

const consumableEmojiTextureCache = new Map<string, THREE.Texture>();
let paralysisTriangleTexture: THREE.Texture | null = null;
let neuroTriangleTexture: THREE.Texture | null = null;
let hunterCrosshairTexture: THREE.Texture | null = null;
let conductorGlowTexture: THREE.Texture | null = null;
let arcaneOrbTexture: THREE.Texture | null = null;

export function getConsumableEmojiTexture(consumableId: string): THREE.Texture {
  const cached = consumableEmojiTextureCache.get(consumableId);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  const glow = CONSUMABLE_COLORS[consumableId] ?? 0xcc66ff;
  const r = ((glow >> 16) & 0xff);
  const g = ((glow >> 8) & 0xff);
  const b = (glow & 0xff);
  const grad = ctx.createRadialGradient(64, 64, 10, 64, 64, 58);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(0.55, `rgba(${r},${g},${b},0.22)`);
  grad.addColorStop(1, 'rgba(20,10,40,0.05)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(${r},${g},${b},0.75)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.stroke();

  const drawEmojiFallback = () => {
    ctx.font = '68px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(CONSUMABLE_EMOJI[consumableId] ?? '✨', 64, 66);
  };

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  consumableEmojiTextureCache.set(consumableId, texture);

  // PNG 图标异步加载：加载完绘制到画布中心并刷新纹理；失败则回退 emoji。
  const iconImg = new Image();
  iconImg.onload = () => {
    const box = 88;
    const ar = iconImg.width / iconImg.height || 1;
    let w = box, h = box;
    if (ar > 1) h = box / ar; else w = box * ar;
    ctx.drawImage(iconImg, 64 - w / 2, 64 - h / 2, w, h);
    texture.needsUpdate = true;
  };
  iconImg.onerror = () => {
    drawEmojiFallback();
    texture.needsUpdate = true;
  };
  iconImg.src = consumableIconSrc(consumableId);

  return texture;
}

export function getParalysisTriangleTexture(): THREE.Texture {
  if (paralysisTriangleTexture) return paralysisTriangleTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = 'rgba(30,20,8,0.95)';
  ctx.beginPath();
  ctx.moveTo(20, 26);
  ctx.lineTo(108, 26);
  ctx.lineTo(64, 110);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(194,128,32,0.92)';
  ctx.beginPath();
  ctx.moveTo(29, 34);
  ctx.lineTo(99, 34);
  ctx.lineTo(64, 98);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(12,8,4,0.98)';
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(20, 26);
  ctx.lineTo(108, 26);
  ctx.lineTo(64, 110);
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(238,190,72,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(38, 43);
  ctx.lineTo(90, 43);
  ctx.stroke();

  paralysisTriangleTexture = new THREE.CanvasTexture(canvas);
  paralysisTriangleTexture.colorSpace = THREE.SRGBColorSpace;
  return paralysisTriangleTexture;
}

/** 毒师神经毒素：墨绿色倒三角标记（形似麻痹三角，配色改墨绿）。 */
export function getNeuroTriangleTexture(): THREE.Texture {
  if (neuroTriangleTexture) return neuroTriangleTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = 'rgba(6,28,12,0.95)';
  ctx.beginPath();
  ctx.moveTo(20, 26);
  ctx.lineTo(108, 26);
  ctx.lineTo(64, 110);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(31,94,42,0.95)'; // 墨绿
  ctx.beginPath();
  ctx.moveTo(29, 34);
  ctx.lineTo(99, 34);
  ctx.lineTo(64, 98);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(4,18,8,0.98)';
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(20, 26);
  ctx.lineTo(108, 26);
  ctx.lineTo(64, 110);
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(120,200,110,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(38, 43);
  ctx.lineTo(90, 43);
  ctx.stroke();

  neuroTriangleTexture = new THREE.CanvasTexture(canvas);
  neuroTriangleTexture.colorSpace = THREE.SRGBColorSpace;
  return neuroTriangleTexture;
}

/** 猎标烙印：红色狙击瞄准标识（圆环 + 十字）。 */
export function getHunterCrosshairTexture(): THREE.Texture {
  if (hunterCrosshairTexture) return hunterCrosshairTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  ctx.shadowColor = 'rgba(255,40,40,0.7)';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = 'rgba(255,40,40,0.95)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(64, 64, 40, 0, Math.PI * 2);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.lineWidth = 5;
  // 十字（四段，留出中心空隙）
  ctx.beginPath();
  ctx.moveTo(64, 8); ctx.lineTo(64, 40);
  ctx.moveTo(64, 88); ctx.lineTo(64, 120);
  ctx.moveTo(8, 64); ctx.lineTo(40, 64);
  ctx.moveTo(88, 64); ctx.lineTo(120, 64);
  ctx.stroke();

  // 中心点
  ctx.fillStyle = 'rgba(255,60,60,0.95)';
  ctx.beginPath();
  ctx.arc(64, 64, 5, 0, Math.PI * 2);
  ctx.fill();

  hunterCrosshairTexture = new THREE.CanvasTexture(canvas);
  hunterCrosshairTexture.colorSpace = THREE.SRGBColorSpace;
  return hunterCrosshairTexture;
}

/** 弧光导体：蓝色径向发光（加色混合贴敌人身上）。 */
export function getConductorGlowTexture(): THREE.Texture {
  if (conductorGlowTexture) return conductorGlowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(120,200,255,0.85)');
  grad.addColorStop(0.4, 'rgba(40,120,255,0.45)');
  grad.addColorStop(1, 'rgba(20,60,200,0.0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  conductorGlowTexture = new THREE.CanvasTexture(canvas);
  conductorGlowTexture.colorSpace = THREE.SRGBColorSpace;
  return conductorGlowTexture;
}

/** 奥术奥秘爆发光球：蓝紫径向发光。 */
export function getArcaneOrbTexture(): THREE.Texture {
  if (arcaneOrbTexture) return arcaneOrbTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, 'rgba(220,210,255,0.95)');
  grad.addColorStop(0.35, 'rgba(150,90,255,0.8)');
  grad.addColorStop(0.7, 'rgba(80,60,230,0.35)');
  grad.addColorStop(1, 'rgba(60,40,180,0.0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  arcaneOrbTexture = new THREE.CanvasTexture(canvas);
  arcaneOrbTexture.colorSpace = THREE.SRGBColorSpace;
  return arcaneOrbTexture;
}
