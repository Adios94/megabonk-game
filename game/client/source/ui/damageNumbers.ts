/**
 * 浮动伤害数字 / 升级补偿浮字 DOM 池。
 *
 * 30 个固定定位 div 通过 round-robin 复用：spawn 时按 index 选下一个槽位，由 GSAP
 * (showDamageNumber / showFloatText) 接管动画。所有数字共用同一池，避免突发高频伤害
 * 触发 DOM thrash；GSAP 用 element 作为 key，复用时自动 cancel 上一个 tween。
 *
 * 不需要每帧 update —— 动画整体由 GSAP 推进。
 */

import * as THREE from 'three';
import type { DamageEvent, LevelUpCompensationEvent } from '@minigame/core';
import { t } from '@minigame/i18n';
import { gsapAnimations } from '../gsapAnimations.ts';
import { uiPx } from './scale.ts';
import { UI_TEXT_OUTLINE_SHADOW } from './textStyle.ts';
import { DAMAGE_NUMBER_FONT_FAMILY } from '../data/visualConfig.ts';

const POOL_SIZE = 30;

export class DamageNumbersOverlay {
  private readonly elements: HTMLDivElement[] = [];
  private nextIndex = 0;
  private readonly tempVec = new THREE.Vector3();

  constructor(private readonly camera: THREE.Camera) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const el = document.createElement('div');
      el.style.cssText = `position:fixed;pointer-events:none;font-size:16px;font-weight:bold;opacity:0;transition:none;z-index:200;text-shadow:${UI_TEXT_OUTLINE_SHADOW};white-space:nowrap;padding-inline:3px;box-sizing:border-box;font-family:${DAMAGE_NUMBER_FONT_FAMILY};`;
      el.dataset.animId = String(i);  // 稳定 id：GSAP 按元素 keying，池复用时 cancel 上一个 tween
      document.body.appendChild(el);
      this.elements.push(el);
    }
  }

  /** 弹出伤害数字（含暴击放大 / 护盾蓝色 / 玩家受伤红色）。 */
  spawnDamage(evt: DamageEvent): void {
    const el = this.elements[this.nextIndex];
    this.nextIndex = (this.nextIndex + 1) % POOL_SIZE;

    this.tempVec.set(evt.x, evt.y, evt.z);
    this.tempVec.project(this.camera);

    const hw = window.innerWidth / 2;
    const hh = window.innerHeight / 2;
    const screenX = this.tempVec.x * hw + hw;
    const screenY = -(this.tempVec.y * hh) + hh;

    let color = '#ffffff';
    if (evt.isShield) color = '#66ddff';
    else if (evt.isPlayerDamage) color = '#ff4444';
    else if (evt.isCrit) color = '#ffd700'; // gold for crits

    // Damage number scaling by value
    let fontSize = 14;
    if (evt.damage > 50) fontSize = 24;
    else if (evt.damage > 20) fontSize = 18;

    // Crits: 1.5x size; color already communicates the critical hit state.
    if (evt.isCrit) {
      fontSize = Math.round(fontSize * 1.5);
    }

    // 按视口短边缩放，避免小屏伤害数字过大遮挡画面
    fontSize = uiPx(fontSize);

    const dmgText = evt.isShield ? `+${Math.round(evt.damage)}` : String(Math.round(evt.damage));
    gsapAnimations.showDamageNumber(el, {
      text: dmgText,
      color: color,
      x: screenX,
      y: screenY,
      fontSize: fontSize,
      isCrit: evt.isCrit,
      damage: evt.damage
    });
  }

  /** 升级补偿浮字（金币 / 白银），与伤害数字共用同一池。 */
  spawnCompensationFloat(evt: LevelUpCompensationEvent): void {
    const el = this.elements[this.nextIndex];
    this.nextIndex = (this.nextIndex + 1) % POOL_SIZE;

    this.tempVec.set(evt.x, evt.y + 1.2, evt.z);
    this.tempVec.project(this.camera);
    const hw = window.innerWidth / 2;
    const hh = window.innerHeight / 2;
    const screenX = this.tempVec.x * hw + hw;
    const screenY = -(this.tempVec.y * hh) + hh;

    const isSilver = evt.kind === 'silver';
    const label = isSilver
      ? t('upgrade.compensationSilver', { amount: String(evt.amount) })
      : t('upgrade.compensationGold', { amount: String(evt.amount) });

    // 走 GSAP（与伤害数字共用同一池 + 同一 keying），避免 CSS transition 与 GSAP 争 transform。
    gsapAnimations.showFloatText(el, {
      text: label,
      color: isSilver ? '#cce0ff' : '#ffd700',
      x: screenX,
      y: screenY,
      fontSize: uiPx(20),
      textShadow: isSilver
        ? '0 0 8px rgba(120,160,255,0.9)'
        : '0 0 8px rgba(255,200,0,0.9)',
    });
  }

  /** 销毁池：逐个 remove DOM 节点（GSAP tween 会跟随元素 GC）。 */
  dispose(): void {
    for (const el of this.elements) el.remove();
    this.elements.length = 0;
  }
}
