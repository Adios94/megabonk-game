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
 *   pool.end();                        // 回收本帧未用到的贴片
 *
 * 实现：共享一张径向渐变 CanvasTexture + 共享材质 + 共享几何体，
 * 用 Mesh 池循环复用，无每帧分配。
 */

import * as THREE from 'three';

const TEX_SIZE = 128;
const BASE_OPACITY = 0.4; // 整体阴影浓度（克制，不压住纯色块）

export class BlobShadowPool {
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly texture: THREE.Texture;
  private readonly pool: THREE.Mesh[] = [];
  private cursor = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.texture = this.makeRadialTexture();
    // 黑色 + map 当 alpha：贴片整体为黑，软边来自贴图 alpha。
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      color: 0x000000,
      transparent: true,
      opacity: BASE_OPACITY,
      depthWrite: false, // 不写深度，避免挡住其它透明物
      depthTest: true,   // 仍受遮挡：平台下方的 blob 不会透上来
    });
    // 单位 1×1 平面，绕 X 转 -90° 平铺在地面（法线朝上）。
    this.geometry = new THREE.PlaneGeometry(1, 1);
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
    let mesh = this.pool[this.cursor];
    if (!mesh) {
      mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.rotation.x = -Math.PI / 2; // 平铺
      mesh.renderOrder = 1;           // 地面之后再画
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.pool[this.cursor] = mesh;
    }
    const d = radius * 2; // plane 是 1×1，scale = 直径
    mesh.position.set(x, footY + 0.02, z); // 抬一点防 z-fighting
    mesh.scale.set(d, d, 1);
    mesh.visible = true;
    this.cursor++;
  }

  /** 每帧贴完后调用：隐藏本帧未用到的贴片。 */
  end(): void {
    for (let i = this.cursor; i < this.pool.length; i++) {
      this.pool[i].visible = false;
    }
  }

  dispose(): void {
    for (const m of this.pool) this.scene.remove(m);
    this.pool.length = 0;
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
