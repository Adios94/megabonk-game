/**
 * GPU 点云粒子池 + 高层 emit 辅助。
 *
 * - 500 槽固定大小池，shader 自定义（curved-world 顶点变形 + sprite 贴图）。
 * - `spawn()` 找空闲槽位写入 vx/vy/vz/color/life；满了静默丢弃。
 * - `update()` 每帧推进位置 / 重力 / 寿命，并把活跃粒子写回 BufferAttribute；
 *   activeCount 后的槽位刷 -100 让 GPU 不渲染。
 * - 各 `emit*` 辅助是按情景预设的粒子簇 + 配套 billboard（命中 / 死亡 / 拾取 /
 *   升级补偿 / 火环 / 奥术 / 余烬）；这些方法需要 {@link BillboardPool} 注入。
 *
 * 与 GameScene 解耦：不持有 session / state / hud 引用；emit 通过参数传所需字段。
 */

import * as THREE from 'three';
import { curvedWorldUniforms } from '../materials/curvedWorld.ts';
import { BillboardPool } from './BillboardPool.ts';
import { WEAPON_VFX_COLORS, PICKUP_VFX_COLORS } from './weaponColors.ts';

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  size: number;
  life: number;
  maxLife: number;
  r: number; g: number; b: number;
  active: boolean;
}

export const DEFAULT_MAX_PARTICLES = 500;

export class ParticlePool {
  readonly capacity: number;
  readonly particles: Particle[] = [];
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;
  readonly points: THREE.Points;
  readonly texture: THREE.Texture;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly billboards: BillboardPool,
    capacity: number = DEFAULT_MAX_PARTICLES,
    private readonly emissionScale: number = 1,
  ) {
    this.capacity = capacity;

    // Pre-allocate particle pool
    for (let i = 0; i < this.capacity; i++) {
      this.particles.push({
        x: 0, y: -100, z: 0,
        vx: 0, vy: 0, vz: 0,
        size: 1,
        life: 0,
        maxLife: 1,
        r: 1, g: 1, b: 1,
        active: false,
      });
    }

    // Particle texture（升级到 Kenney spark：比 circle 更有"火花感"）
    const textureLoader = new THREE.TextureLoader();
    this.texture = textureLoader.load('/textures/vfx/spark.png');

    // Buffer geometry with per-particle attributes
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.capacity * 3);
    const sizes = new Float32Array(this.capacity);
    const lifes = new Float32Array(this.capacity);
    const colors = new Float32Array(this.capacity * 3);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(lifes, 1));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    // Custom ShaderMaterial（含 curved-world 顶点变形）
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: this.texture },
        uWarpCenter: curvedWorldUniforms.uWarpCenter,
        uWarpStrength: curvedWorldUniforms.uWarpStrength,
      },
      vertexShader: `
        uniform vec3 uWarpCenter;
        uniform float uWarpStrength;

        attribute float aSize;
        attribute float aLife;
        attribute vec3 aColor;

        varying float vLife;
        varying vec3 vColor;

        void main() {
          vLife = aLife;
          vColor = aColor;

          vec3 worldPos = position;
          vec3 diff = worldPos - uWarpCenter;
          float d = length(diff.xz);
          if (d > 1e-5 && uWarpStrength > 0.0) {
              float theta = d * uWarpStrength;
              float sinTheta = sin(theta);
              float cosTheta = cos(theta);
              vec2 dir = diff.xz / d;

              vec3 normal = vec3(sinTheta * dir.x, cosTheta, sinTheta * dir.y);
              float r = (1.0 / uWarpStrength) + diff.y;
              vec3 warpedPos = r * normal;
              warpedPos.y -= (1.0 / uWarpStrength);

              worldPos = uWarpCenter + warpedPos;
          }

          vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
          gl_PointSize = aSize * (400.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        varying float vLife;
        varying vec3 vColor;

        void main() {
          vec4 texColor = texture2D(uTexture, gl_PointCoord);
          float alpha = texColor.a * vLife;
          // cel-shaded 硬剪裁：阈值 0.5（与 celShading.ts 中 alphaTest 对齐）。
          // 注意：阈值高会让粒子在寿命过半即 pop 消失。要让节奏不"急促"，
          // 不要降阈值（会破坏 cel 边缘风格），而应把对应 emit* 里的
          // life / maxLife 拉长，让"前半段满亮"的可见区间足够长。
          if (alpha < 0.5) discard;
          gl_FragColor = vec4(vColor * texColor.rgb, 1.0);
        }
      `,
      transparent: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'VFXParticles';
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  private scaledCount(count: number, min = 1): number {
    return Math.max(min, Math.floor(count * this.emissionScale));
  }

  /** 在 (x,y,z) 注入一颗粒子。池满时静默丢弃。 */
  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    size: number, life: number,
    r: number, g: number, b: number,
  ): void {
    for (let i = 0; i < this.capacity; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.x = x; p.y = y; p.z = z;
        p.vx = vx; p.vy = vy; p.vz = vz;
        p.size = size;
        p.life = life;
        p.maxLife = life;
        p.r = r; p.g = g; p.b = b;
        p.active = true;
        return;
      }
    }
  }

  /** 命中火花：按武器颜色染色的发散粒子（不再叠加 muzzle 爆闪 billboard）。 */
  emitHitSparks(x: number, y: number, z: number, weaponType: string): void {
    const color = WEAPON_VFX_COLORS[weaponType] ?? [1.0, 0.9, 0.5];
    const count = this.scaledCount(10 + Math.floor(Math.random() * 8), 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const elevation = Math.random() * Math.PI * 0.6;
      const speed = 4 + Math.random() * 6;
      const vx = Math.cos(angle) * Math.cos(elevation) * speed;
      const vy = Math.sin(elevation) * speed + 2;
      const vz = Math.sin(angle) * Math.cos(elevation) * speed;
      const size = 1.0 + Math.random() * 1.5;
      const life = 0.4 + Math.random() * 0.4;
      const cr = Math.min(1.0, color[0] + (Math.random() - 0.5) * 0.2);
      const cg = Math.min(1.0, color[1] + (Math.random() - 0.5) * 0.2);
      const cb = Math.min(1.0, color[2] + (Math.random() - 0.5) * 0.2);
      this.spawn(x, y, z, vx, vy, vz, size, life, cr, cg, cb);
    }
  }

  /** 极简死亡爆点：5–7 颗红橙粒 + 短命烟雾 + 地面烧痕。 */
  emitDeathBurst(x: number, y: number, z: number, _enemyType: string): void {
    const count = this.scaledCount(5 + Math.floor(Math.random() * 3), 2);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const elevation = (Math.random() - 0.3) * Math.PI;
      const speed = 2 + Math.random() * 1.5;
      const vx = Math.cos(angle) * Math.cos(elevation) * speed;
      const vy = Math.abs(Math.sin(elevation)) * speed + 1.5;
      const vz = Math.sin(angle) * Math.cos(elevation) * speed;
      const size = 2.2 + Math.random() * 1.3;
      const life = 0.28 + Math.random() * 0.18;
      const r = 0.8 + Math.random() * 0.2;
      const g = 0.2 + Math.random() * 0.4;
      const b = Math.random() * 0.15;
      this.spawn(x, y + 0.5, z, vx, vy, vz, size, life, r, g, b);
    }
    this.billboards.spawn({
      texture: 'smoke',
      x, y: y + 0.6, z,
      scale: 1.2,
      endScale: 2.4,
      lifetime: 0.5,
      opacityCurve: 'fadeOut',
      opacity: 0.7,
      color: 0x553322,
      rotation: Math.random() * Math.PI * 2,
      blending: 'normal',
    });
    this.billboards.spawn({
      texture: 'scorch',
      x, y: y + 0.05, z,
      scale: 1.4,
      endScale: 1.8,
      lifetime: 1.5,
      opacityCurve: 'fadeOut',
      opacity: 0.55,
      color: 0x000000,
      facing: 'up',
      rotation: Math.random() * Math.PI * 2,
      blending: 'normal',
    });
  }

  /** 拾取小星花 + 颜色按 pickup 类型查表。 */
  emitPickupSparkle(x: number, y: number, z: number, pickupType: string): void {
    const color = PICKUP_VFX_COLORS[pickupType] ?? [0.5, 1.0, 0.5];
    const count = this.scaledCount(3 + Math.floor(Math.random() * 3), 1);
    for (let i = 0; i < count; i++) {
      const vx = (Math.random() - 0.5) * 1.5;
      const vy = 2 + Math.random() * 2;
      const vz = (Math.random() - 0.5) * 1.5;
      const size = 0.2 + Math.random() * 0.3;
      const life = 0.3 + Math.random() * 0.3;
      this.spawn(x, y, z, vx, vy, vz, size, life, color[0], color[1], color[2]);
    }
    const colorHex = ((Math.round(color[0] * 255) << 16) | (Math.round(color[1] * 255) << 8) | Math.round(color[2] * 255)) >>> 0;
    this.billboards.spawn({
      texture: 'star',
      x, y: y + 0.3, z,
      scale: 0.5,
      endScale: 1.0,
      lifetime: 0.55,
      opacityCurve: 'flash',
      opacity: 0.85,
      color: colorHex,
      rotationSpeed: 6.0,
    });
  }

  /** 升级仪式爆发：粒子绕圈外扩 + 中心星光 + 光柱（gold/silver 双色）。 */
  emitCompensationBurst(x: number, y: number, z: number, kind: 'gold' | 'silver'): void {
    const count = this.scaledCount(kind === 'silver' ? 36 : 30, 10);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 3 + Math.random() * 2.5;
      const vx = Math.cos(angle) * speed;
      const vy = 1.8 + Math.random() * 2;
      const vz = Math.sin(angle) * speed;
      const size = 0.55 + Math.random() * 0.55;
      const life = 0.65 + Math.random() * 0.45;
      let r: number, g: number, b: number;
      if (kind === 'silver') {
        r = 0.75 + Math.random() * 0.2;
        g = 0.85 + Math.random() * 0.15;
        b = 1.0;
      } else {
        r = 1.0;
        g = 0.8 + Math.random() * 0.2;
        b = 0.1 + Math.random() * 0.2;
      }
      this.spawn(x, y + 0.5, z, vx, vy, vz, size, life, r, g, b);
    }
    const color = kind === 'silver' ? 0xaaccff : 0xffd866;
    this.billboards.spawn({
      texture: 'star',
      x, y: y + 1.4, z,
      scale: 1.2,
      endScale: 4.0,
      lifetime: 0.65,
      opacityCurve: 'flash',
      opacity: 1.0,
      color,
      rotationSpeed: 5.0,
    });
    // 历史上这里还会 spawn 一个 light.png 光晕盘（升级 / 开宝箱 / 补偿共用），
    // 按需求已移除：只保留环形粒子 + 顶部 star 闪光。
  }

  /** 升级金色爆发（emitCompensationBurst 'gold' 的语义包装）。 */
  emitLevelUpBurst(x: number, y: number, z: number): void {
    this.emitCompensationBurst(x, y, z, 'gold');
  }

  /** 火环外圈火苗（少量短命橙红粒子）。 */
  emitFlameRingParticles(x: number, y: number, z: number, radius: number): void {
    const count = this.scaledCount(2 + Math.floor(Math.random() * 2), 1);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const px = x + Math.cos(angle) * radius;
      const pz = z + Math.sin(angle) * radius;
      const vx = (Math.random() - 0.5) * 0.5;
      const vy = 1 + Math.random() * 1.5;
      const vz = (Math.random() - 0.5) * 0.5;
      const size = 0.2 + Math.random() * 0.2;
      const life = 0.34 + Math.random() * 0.32;
      const r = 1.0;
      const g = 0.3 + Math.random() * 0.3;
      const b = Math.random() * 0.1;
      this.spawn(px, y + 0.3, pz, vx, vy, vz, size, life, r, g, b);
    }
  }

  /** 拾取爆点（不带 billboard，仅粒子）：8 颗按 color RGB 染色。 */
  spawnPickupBurst(x: number, y: number, z: number, color: number): void {
    const c = new THREE.Color(color);
    const count = this.scaledCount(8, 3);
    for (let i = 0; i < count; i++) {
      const p = this.particles.find(pp => !pp.active);
      if (!p) break;
      p.active = true;
      p.x = x; p.y = y; p.z = z;
      p.vx = (Math.random() - 0.5) * 3;
      p.vy = 2 + Math.random() * 3;
      p.vz = (Math.random() - 0.5) * 3;
      p.r = c.r; p.g = c.g; p.b = c.b;
      p.size = 3 + Math.random() * 2;
      p.life = 0.8;
      p.maxLife = 0.8;
    }
  }

  /** 奥术奥秘爆发：蓝紫烟团 + 命中爆闪 + 地面光环 + 魔法阵。 */
  emitArcaneSmoke(x: number, y: number, z: number): void {
    const count = this.scaledCount(18, 6);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2.2 + Math.random() * 3.0;
      this.spawn(
        x, y, z,
        Math.cos(a) * sp, 0.6 + Math.random() * 2.2, Math.sin(a) * sp,
        2.6 + Math.random() * 1.8, 0.45 + Math.random() * 0.35,
        0.55 + Math.random() * 0.2, 0.4 + Math.random() * 0.2, 0.98,
      );
    }
    this.billboards.spawn({
      texture: 'muzzle', x, y, z, scale: 2.0, endScale: 3.6, lifetime: 0.22,
      opacityCurve: 'flash', opacity: 1.0, color: 0xc8a0ff,
      rotation: Math.random() * Math.PI * 2, blending: 'additive',
    });
    this.billboards.spawn({
      texture: 'smoke', x, y, z, scale: 2.0, endScale: 4.4, lifetime: 0.6,
      opacityCurve: 'fadeOut', opacity: 0.8, color: 0x8a5cff,
      rotation: Math.random() * Math.PI * 2, blending: 'additive',
    });
    this.billboards.spawn({
      texture: 'scorch', x, y: y - 1.0 + 0.06, z, scale: 1.6, endScale: 3.0, lifetime: 0.45,
      opacityCurve: 'fadeOut', opacity: 0.6, color: 0x6a4cff,
      facing: 'up', rotation: Math.random() * Math.PI * 2, blending: 'additive',
    });
    this.billboards.spawn({
      texture: 'magic_circle', x, y: y - 1.0 + 0.08, z, scale: 1.2, endScale: 3.4, lifetime: 0.5,
      opacityCurve: 'fadeOut', opacity: 0.5, color: 0xb16dff,
      facing: 'up', rotation: Math.random() * Math.PI * 2, blending: 'additive',
    });
  }

  /** 红色爆炸烟雾（余烬羁绊敌人爆炸）。 */
  emitEmberExplosion(x: number, y: number, z: number): void {
    const count = this.scaledCount(8, 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 2.5;
      this.spawn(
        x, y, z,
        Math.cos(a) * sp, 0.8 + Math.random() * 1.8, Math.sin(a) * sp,
        2.4 + Math.random() * 1.5, 0.3 + Math.random() * 0.25,
        0.95, 0.25 + Math.random() * 0.2, 0.12,
      );
    }
    this.billboards.spawn({
      texture: 'smoke', x, y, z, scale: 1.8, endScale: 3.6, lifetime: 0.55,
      opacityCurve: 'fadeOut', opacity: 0.8, color: 0xcc2a1a,
      rotation: Math.random() * Math.PI * 2, blending: 'normal',
    });
  }

  /**
   * 每帧推进粒子物理（位移 + 轻微重力 + 寿命衰减）并写回 BufferAttribute；
   * activeCount 后的槽位刷 (0,-100,0) 让 GPU 不渲染。
   */
  update(dt: number): void {
    const positions = this.geometry.attributes.position as THREE.BufferAttribute;
    const sizes = this.geometry.attributes.aSize as THREE.BufferAttribute;
    const lifes = this.geometry.attributes.aLife as THREE.BufferAttribute;
    const colors = this.geometry.attributes.aColor as THREE.BufferAttribute;

    let activeCount = 0;
    for (let i = 0; i < this.capacity; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 3.0 * dt; // slight gravity

      const lifeRatio = p.life / p.maxLife;
      positions.setXYZ(activeCount, p.x, p.y, p.z);
      sizes.setX(activeCount, p.size * lifeRatio);
      lifes.setX(activeCount, lifeRatio);
      colors.setXYZ(activeCount, p.r, p.g, p.b);
      activeCount++;
    }

    for (let i = activeCount; i < this.capacity; i++) {
      positions.setXYZ(i, 0, -100, 0);
      sizes.setX(i, 0);
      lifes.setX(i, 0);
      colors.setXYZ(i, 0, 0, 0);
    }

    positions.needsUpdate = true;
    sizes.needsUpdate = true;
    lifes.needsUpdate = true;
    colors.needsUpdate = true;
    this.geometry.setDrawRange(0, activeCount);
  }

  /** 释放 GPU 资源（geometry / material / texture）+ 从场景移除 points。 */
  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.particles.length = 0;
  }
}
