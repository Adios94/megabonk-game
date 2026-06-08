/**
 * 客户端"视图系统"：主角视觉特效（无敌闪烁等）。
 *
 * 设计要点：
 *   - 用平滑半透明脉冲（sin 波形）替代硬 visible 开关，避免每帧频闪伤眼。
 *   - opacity 变化 < 阈值时跳过 traverse，减少 GC 和无效赋值。
 *   - 进入/退出半透明状态时才切换 `material.transparent`，避免每帧 shader 重建。
 *
 * 用法：
 *   const fx = new PlayerInvincibilityFx();
 *   fx.update(this.playerMesh, player.invincibleTimer, time);  // 每帧
 *
 * 注：mesh 作为方法参数而非构造参数，因为 GameScene 的 playerMesh 在 GLTF
 * 加载完成后会被替换（先用 fallback capsule，后换成模型），fx 实例不需重建。
 * 实例只持有 opacity 状态。
 */

import * as THREE from 'three';

const SKIP_THRESHOLD = 0.02; // opacity 变化小于此值跳过 traverse
const FLASH_FREQ = 14; // sin 脉冲频率（弧度/秒）
const FLASH_BASE = 0.5; // 半透明基础值
const FLASH_AMP = 0.3; // 半透明摆动幅度

export class PlayerInvincibilityFx {
  private opacity = 1;
  private lastMesh: THREE.Object3D | null = null;

  /**
   * 每帧调用。`invincibleTimer > 0` 时呈半透明脉冲，否则恢复不透明。
   *
   * @param mesh            主角 mesh（可被换掉，class 自动检测并重置 opacity 状态）
   * @param invincibleTimer 剩余无敌时间（秒）。来自 `state.player.invincibleTimer`
   * @param time            当前秒数 (= `performance.now() * 0.001`)
   */
  update(mesh: THREE.Object3D, invincibleTimer: number, time: number): void {
    // mesh 换了 → 重置内部 opacity 跟踪（新 mesh 默认不透明）
    if (mesh !== this.lastMesh) {
      this.lastMesh = mesh;
      this.opacity = 1;
    }
    const target =
      invincibleTimer > 0 ? FLASH_BASE + FLASH_AMP * (0.5 + 0.5 * Math.sin(time * FLASH_FREQ)) : 1;
    this.setOpacity(mesh, target);
  }

  private setOpacity(mesh: THREE.Object3D, a: number): void {
    if (Math.abs(a - this.opacity) < SKIP_THRESHOLD) return;
    const wasOpaque = this.opacity >= 1;
    const isOpaque = a >= 1;
    const flipTransparent = wasOpaque !== isOpaque;
    this.opacity = a;
    mesh.traverse((c) => {
      const mat = (c as THREE.Mesh).material;
      if (!mat) return;
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) {
        const mm = m as THREE.Material & { opacity: number };
        mm.opacity = a;
        if (flipTransparent) mm.transparent = !isOpaque;
      }
    });
  }
}
