/**
 * Blob 阴影池：在每个单位脚下贴一张软圆形阴影贴片（decal）。
 *
 * 用途：替代昂贵的实时方向光阴影（每帧多渲一遍全场景）——blob 阴影零额外场景渲染，
 * 手机上立竿见影。视觉上是 Q 版/手游常见做法，不影响 cel 着色与描边。
 *
 * 用法（每帧）：
 *   pool.begin();
 *   pool.place(x, footY, z, radius);   // 每个可见单位调一次
 *   ...
 *   pool.end();                        // 提交本帧实例数
 *
 * 实现：**单个 InstancedMesh** 承载所有阴影 —— 不管同屏多少单位都只占 1 个 draw call。
 * （早期版本每个单位一个独立 Mesh，超时狂潮 400+ 怪时贡献几百个 draw，是 draw call 大户。）
 * 共享一张径向渐变 CanvasTexture + 共享材质 + 共享几何体，每帧只更新实例矩阵，无每帧分配。
 */

import * as THREE from 'three';

const TEX_SIZE = 128;
const BASE_OPACITY = 0.4; // 整体阴影浓度（克制，不压住纯色块）
// 实例上限：玩家(1) + 敌人(overtime 狂潮峰值 ~400+) + boss(1)，留足余量。超出的阴影本帧丢弃（不崩）。
const MAX_SHADOWS = 1024;

export class BlobShadowPool {
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly texture: THREE.Texture;
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private cursor = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.texture = this.makeRadialTexture();
    // 黑色 + map 当 alpha：贴片整体为黑，软边来自贴图 alpha。
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      color: 0x000000,
      transparent: true,
      opacity: BASE_OPACITY,
      depthWrite: false, // 不写深度，避免挡住其它透明物（也使屏幕空间描边不会描到阴影）
      depthTest: true,   // 仍受遮挡：平台下方的 blob 不会透上来
    });
    // 单位 1×1 平面，每个实例矩阵自带绕 X 转 -90°（平铺地面，法线朝上）。
    this.geometry = new THREE.PlaneGeometry(1, 1);

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, MAX_SHADOWS);
    this.mesh.name = 'BlobShadow'; // 场景对象标识（dev overlay 的 draw 分类亦按此名归类阴影）
    this.mesh.frustumCulled = false; // 实例分布全场，整体包围球不可靠，关剔除
    this.mesh.renderOrder = 1;       // 地面之后再画
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // 每帧更新矩阵
    this.mesh.count = 0;             // 首帧 end() 前不画任何实例
    // 平铺旋转固定，place 时只改 position/scale。
    this.dummy.rotation.x = -Math.PI / 2;
    this.scene.add(this.mesh);
  }

  /** 每帧渲染前调用：重置游标。 */
  begin(): void {
    this.cursor = 0;
  }

  /**
   * 在 (x, z)、脚底高度 footY 处贴一个半径 radius 的圆阴影。
   * footY 应为单位站立面的高度（= 单位 y 脚位）。
   */
  place(x: number, footY: number, z: number, radius: number): void {
    if (this.cursor >= MAX_SHADOWS) return; // 超上限：本帧丢弃，不扩容不崩
    const d = radius * 2; // plane 是 1×1，scale = 直径
    this.dummy.position.set(x, footY + 0.02, z); // 抬一点防 z-fighting
    this.dummy.scale.set(d, d, 1);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(this.cursor, this.dummy.matrix);
    this.cursor++;
  }

  /** 每帧贴完后调用：提交本帧实例数 + 标记矩阵更新。 */
  end(): void {
    this.mesh.count = this.cursor;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }

  /** 一次性绘制软径向渐变（中心不透明 → 边缘透明）。 */
  private makeRadialTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = TEX_SIZE;
    canvas.height = TEX_SIZE;
    const ctx = canvas.getContext('2d')!;
    const c = TEX_SIZE / 2;
    const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0.0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }
}
