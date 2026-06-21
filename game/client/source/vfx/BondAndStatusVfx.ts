/**
 * 羁绊 / 状态 VFX 集中点（玩家头顶 UI + 羁绊事件 + 敌人状态粒子）。
 *
 * 包含四块互相协作的逻辑：
 *
 * - **奥术奥秘计数 Sprite**（{@link BondAndStatusVfx.updateMysteryNumber}）：
 *   奥术羁绊 T2+ 时在玩家头顶飘一个蓝紫渐变数字（runtime 用 canvas 画）。
 *   值变化时换贴图 + 触发 pulse；按 threshold（T3 用 thresholdT3）归一缩放。
 *
 * - **羁绊 VFX 事件消费**（{@link BondAndStatusVfx.processBondVfxEvents}）：
 *   每"新 tick" 扫一次 state.bondVfxEvents：
 *   - `arcane_burst` → 从玩家头顶生成抛物线奥术光球 Sprite，并起手两闪。
 *   - `ember_explode` → 委托 ParticlePool 喷红色爆炸烟雾。
 *
 * - **奥术光球推进**（{@link BondAndStatusVfx.updateArcaneBurstOrbs}）：
 *   生命周期 0.42s，沿 from→to lerp + 抛物线 y 偏移，沿途撒蓝紫粒子拖尾 +
 *   billboard 拖影；命中目标时 emitArcaneSmoke 收尾。
 *
 * - **敌人状态粒子**（{@link BondAndStatusVfx.updateEnemyStatusVfx}）：
 *   每 N tick 给中毒（绿）/ 减速（黄电）的敌人喷少量提示粒子。
 *
 * 依赖：scene + BillboardPool + ParticlePool。不持有 HUD / session 引用，
 * 调用方按需传入 GameState / player 位置 / frameDt。
 */

import * as THREE from 'three';
import { BONDS, type GameState } from '@minigame/core';
import { BillboardPool } from './BillboardPool.ts';
import { ParticlePool } from './ParticlePool.ts';
import { getArcaneOrbTexture } from '../materials/proceduralTextures.ts';
import { UI_FONT_FACE } from '../ui/fonts.ts';

interface ArcaneBurstOrb {
  sprite: THREE.Sprite;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  life: number;
}

export class BondAndStatusVfx {
  private mysteryNumberSprite: THREE.Sprite | null = null;
  private mysteryNumberValue = -1;
  private mysteryNumberPulse = 0;
  private readonly arcaneBurstOrbs: ArcaneBurstOrb[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly billboards: BillboardPool,
    private readonly particles: ParticlePool,
  ) {}

  /**
   * 奥术 T2+：在玩家头顶显示当前奥秘数值（蓝紫渐变 canvas 贴图）。
   * 未达 T2 / 玩家死亡时 → 隐藏 Sprite。
   * 值变化时换贴图 + 触发 0.18s pulse；缩放按 mystery/threshold 归一。
   */
  updateMysteryNumber(state: GameState, frameDt: number): void {
    const player = state.player;
    const arcaneTier = player.bonds?.find(b => b.bondId === 'arcane')?.tier ?? 0;
    const value = Math.floor(player.bondMystery ?? 0);
    if (arcaneTier < 2 || !player.alive) {
      if (this.mysteryNumberSprite) this.mysteryNumberSprite.visible = false;
      return;
    }
    if (!this.mysteryNumberSprite) {
      const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, opacity: 0.96 });
      this.mysteryNumberSprite = new THREE.Sprite(mat);
      this.mysteryNumberSprite.renderOrder = 20;
      this.scene.add(this.mysteryNumberSprite);
    }
    const sprite = this.mysteryNumberSprite;
    if (value !== this.mysteryNumberValue) {
      if (this.mysteryNumberValue >= 0 && value > this.mysteryNumberValue) {
        this.mysteryNumberPulse = 0.18;
      }
      this.mysteryNumberValue = value;
      const oldMap = sprite.material.map;
      sprite.material.map = makeMysteryNumberTexture(value);
      sprite.material.needsUpdate = true;
      oldMap?.dispose();
    }
    this.mysteryNumberPulse = Math.max(0, this.mysteryNumberPulse - frameDt);
    const pulse = this.mysteryNumberPulse > 0
      ? 1 + Math.sin((this.mysteryNumberPulse / 0.18) * Math.PI) * 0.22
      : 1;
    const arcaneParams = BONDS.arcane.params;
    const threshold = arcaneTier >= 3 ? arcaneParams.thresholdT3 : arcaneParams.threshold;
    const mysteryScale = 0.5 + Math.min(1, value / threshold) * 0.5;
    const visualScale = Math.min(1, mysteryScale * pulse);
    sprite.visible = true;
    sprite.position.set(player.x, player.y + 2.5, player.z);
    sprite.scale.set(1.15 * visualScale, 0.86 * visualScale, 1);
  }

  /**
   * 消费 state.bondVfxEvents 一帧：
   * - `arcane_burst` → 从玩家头顶 (player.x, y+2.5, z) 朝目标点发射光球 Sprite
   *   + 起手 muzzle/light 双闪 billboard；orb 进 {@link updateArcaneBurstOrbs} 推进。
   * - `ember_explode` → 委托 ParticlePool 红色爆炸烟雾。
   * 调用方需保证每 tick 仅消费一次（事件新鲜度判断）。
   */
  processBondVfxEvents(state: GameState): void {
    const player = state.player;
    for (const evt of state.bondVfxEvents ?? []) {
      if (evt.kind === 'arcane_burst') {
        const from = new THREE.Vector3(player.x, player.y + 2.5, player.z);
        const to = new THREE.Vector3(evt.x, evt.y, evt.z);
        const mat = new THREE.SpriteMaterial({
          map: getArcaneOrbTexture(), transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, opacity: 1,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.renderOrder = 18;
        sprite.scale.setScalar(1.8);
        sprite.position.copy(from);
        this.scene.add(sprite);
        this.billboards.spawn({
          texture: 'muzzle', x: from.x, y: from.y, z: from.z,
          scale: 1.6, endScale: 2.6, lifetime: 0.22, opacityCurve: 'flash',
          opacity: 0.95, color: 0xa97bff, rotation: Math.random() * Math.PI * 2,
        });
        this.billboards.spawn({
          texture: 'light', x: from.x, y: from.y, z: from.z,
          scale: 1.2, endScale: 2.2, lifetime: 0.28, opacityCurve: 'fadeOut',
          opacity: 0.75, color: 0x6f7cff, rotation: Math.random() * Math.PI * 2,
          blending: 'additive',
        });
        this.arcaneBurstOrbs.push({ sprite, from, to, t: 0, life: 0.42 });
      } else if (evt.kind === 'ember_explode') {
        this.particles.emitEmberExplosion(evt.x, evt.y, evt.z);
      }
    }
  }

  /**
   * 推进当前所有奥术光球：
   * - 位置：lerp(from → to, k) + 抛物线 y 偏移 sin(kπ)*0.8。
   * - 缩放：1.7 + sin(t*40)*0.25 脉动。
   * - 拖尾：本帧位移区间补 3 颗蓝紫粒子 + 朝相机 smoke/light billboard 拖影。
   * - 抵达目标（k≥1）：emitArcaneSmoke 收尾 + 移除 Sprite。
   * 贴图为共享缓存，仅 dispose material。
   */
  updateArcaneBurstOrbs(dt: number): void {
    for (let i = this.arcaneBurstOrbs.length - 1; i >= 0; i--) {
      const orb = this.arcaneBurstOrbs[i];
      const prevK = Math.min(1, orb.t / orb.life);
      orb.t += dt;
      const k = Math.min(1, orb.t / orb.life);
      orb.sprite.position.lerpVectors(orb.from, orb.to, k);
      orb.sprite.position.y += Math.sin(k * Math.PI) * 0.8;
      orb.sprite.scale.setScalar(1.7 + Math.sin(orb.t * 40) * 0.25);

      const pos = orb.sprite.position;
      const trailCount = 3;
      for (let s = 0; s < trailCount; s++) {
        const kk = prevK + (k - prevK) * (s / trailCount);
        const tx = orb.from.x + (orb.to.x - orb.from.x) * kk + (Math.random() - 0.5) * 0.25;
        const ty = orb.from.y + (orb.to.y - orb.from.y) * kk + Math.sin(kk * Math.PI) * 0.8 + (Math.random() - 0.5) * 0.25;
        const tz = orb.from.z + (orb.to.z - orb.from.z) * kk + (Math.random() - 0.5) * 0.25;
        this.particles.spawn(
          tx, ty, tz,
          (Math.random() - 0.5) * 0.6, (Math.random() - 0.3) * 0.6, (Math.random() - 0.5) * 0.6,
          1.4 + Math.random() * 0.8, 0.3 + Math.random() * 0.2,
          0.62 + Math.random() * 0.2, 0.45 + Math.random() * 0.15, 1.0,
        );
      }
      this.billboards.spawn({
        texture: 'smoke', x: pos.x, y: pos.y, z: pos.z,
        scale: 1.3, endScale: 0.5, lifetime: 0.28, opacityCurve: 'fadeOut',
        opacity: 0.65, color: 0x9a6bff, blending: 'additive',
        rotation: Math.random() * Math.PI * 2,
      });
      this.billboards.spawn({
        texture: 'light', x: pos.x, y: pos.y, z: pos.z,
        scale: 0.85, endScale: 0.25, lifetime: 0.18, opacityCurve: 'fadeOut',
        opacity: 0.55, color: 0x5f7cff, blending: 'additive',
        rotation: Math.random() * Math.PI * 2,
      });

      if (k >= 1) {
        this.particles.emitArcaneSmoke(orb.to.x, orb.to.y, orb.to.z);
        this.scene.remove(orb.sprite);
        orb.sprite.material.dispose();
        this.arcaneBurstOrbs.splice(i, 1);
      }
    }
  }

  /**
   * 给中毒（poisonTimer>0）/ 减速（slowTimer>0）的敌人喷少量提示粒子。
   * 节流：中毒每 4 tick 一颗绿雾，减速每 5 tick 一颗黄电。
   */
  updateEnemyStatusVfx(state: GameState): void {
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      if ((e.poisonTimer ?? 0) > 0 && state.tick % 4 === 0) {
        const a = Math.random() * Math.PI * 2;
        this.particles.spawn(
          e.x + Math.cos(a) * 0.4, e.y + 0.6 + Math.random() * 0.6, e.z + Math.sin(a) * 0.4,
          0, 0.4 + Math.random() * 0.4, 0,
          0.4, 0.45, 0.3, 0.85, 0.2,
        );
      }
      if ((e.slowTimer ?? 0) > 0 && state.tick % 5 === 0) {
        const a = Math.random() * Math.PI * 2;
        this.particles.spawn(
          e.x + Math.cos(a) * 0.5, e.y + 0.8 + Math.random() * 0.5, e.z + Math.sin(a) * 0.5,
          (Math.random() - 0.5) * 1.2, 0.6, (Math.random() - 0.5) * 1.2,
          0.4, 0.18, 1.0, 0.85, 0.1,
        );
      }
    }
  }
}

/**
 * 生成奥术「奥秘」计数贴图（蓝紫三段渐变 + 深紫描边 + 紫光阴影）。
 * 每次数值变化都重画一张 CanvasTexture（旧贴图由调用方 dispose）。
 */
function makeMysteryNumberTexture(value: number): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 96);
  const text = String(value);
  ctx.font = `bold 60px ${UI_FONT_FACE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const grad = ctx.createLinearGradient(0, 18, 0, 78);
  grad.addColorStop(0, '#f0d8ff');
  grad.addColorStop(0.45, '#b06bff');
  grad.addColorStop(1, '#4d8dff');
  ctx.shadowColor = 'rgba(122,88,255,0.8)';
  ctx.shadowBlur = 14;
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(10,4,30,0.92)';
  ctx.strokeText(text, 64, 50);
  ctx.fillStyle = grad;
  ctx.fillText(text, 64, 50);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
