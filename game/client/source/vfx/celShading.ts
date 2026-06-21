/**
 * 把任意已创建好的材质切换到 cel-shaded 实心模式：
 *   - transparent: false        → 走 opaque 管线，颜色不再与背景叠加
 *   - alphaTest:  0.5           → 用贴图 alpha 做硬剪裁，边缘锐利
 *   - blending:   NormalBlending → 覆盖而非加色
 *
 * 关于"特效消失太突兀"的处理：
 *   阈值 0.5 时 `material.opacity = ratio` 衰减到 0.5 以下会整体 pop。
 *   解决方案不是降阈值（会出现半透 cel 边缘，破坏风格），而是把对应
 *   特效的 `lifetime` / `maxLife` 拉长，让"前半段满亮+后半段被切掉"
 *   的总时长落在 0.3–0.5s 量级，主观节奏即可恢复。
 *
 * 不改 `depthWrite`：保留各调用点既有设置，避免共面 plane 之间 z-fight
 * （例：闪电 core + glow 同 y）。
 *
 * 使用：`new THREE.MeshBasicMaterial({...}); applyCelShade(mat);`
 */

import * as THREE from 'three';

export function applyCelShade(
  mat: THREE.Material & {
    transparent?: boolean;
    alphaTest?: number;
    blending?: THREE.Blending;
  },
): void {
  mat.transparent = false;
  mat.alphaTest = 0.5;
  mat.blending = THREE.NormalBlending;
  mat.needsUpdate = true;
}
