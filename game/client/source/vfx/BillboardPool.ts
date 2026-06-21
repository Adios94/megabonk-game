/**
 * Billboard VFX pool — 池化 Plane Mesh，配合贴图渐隐 / 缩放 / 旋转 做一次性贴图特效。
 *
 * - 与 `vfxPoints` 点云互补：点云负责"大量 sparkle"，billboard 负责"少量但漂亮"。
 * - 贴图集中预载并由 {@link BillboardPool.textures} 暴露，供其它 VFX 系统（slash sector、
 *   lightning bolt、flame ring、area effect mesh 等）直接复用。
 * - `spawn()` 池满时静默丢弃；`update()` 每帧 lerp scale / opacity / 自旋 / lookAt。
 */

import * as THREE from 'three';

/**
 * 已注册的 VFX 贴图 key（对应 public/textures/vfx/<key>.png）。
 * 增加新贴图时同步更新 `VFX_TEXTURE_FILES` 和此 union。
 */
export type VfxTextureKey =
  | 'spark' | 'star' | 'smoke' | 'light' | 'slash'
  | 'muzzle' | 'magic_circle' | 'portal_swirl' | 'scorch' | 'dirt' | 'flame'
  | 'twirl' | 'slash_fill' | 'flame_aura' | 'lightning' | 'flare' | 'void_ripple'
  | 'scorch_boots' | 'enemy_bullet';

export const VFX_TEXTURE_FILES: Record<VfxTextureKey, string> = {
  spark: '/textures/vfx/spark.png',
  star: '/textures/vfx/star.png',
  smoke: '/textures/vfx/smoke.png',
  light: '/textures/vfx/light.png',
  slash: '/textures/vfx/slash.png',
  muzzle: '/textures/vfx/muzzle.png',
  magic_circle: '/textures/vfx/magic_circle.png',
  portal_swirl: '/textures/vfx/portal_swirl.png',
  scorch: '/textures/vfx/scorch.png',
  dirt: '/textures/vfx/dirt.png',
  flame: '/textures/vfx/flame.png',
  twirl: '/textures/particle_twirl.png',
  flare: '/textures/particle_flare.png',
  void_ripple: '/textures/vfx/void_ripple.png',
  // ↓ 以下 5 个 key 的贴图当前与另一 key 字节完全相同（同一占位图被复制了两份）。
  // 去重：删掉重复文件，让这些 key 复用对应的「主」文件，省发布体积。
  // ⚠️ 若将来要给某个特效做专属贴图（让它与主文件分化），请：
  //    1) 在 public/textures/vfx/ 放回独立文件（如 lightning.png）；2) 把这里的路径改回去。
  slash_fill: '/textures/vfx/portal_swirl.png',
  flame_aura: '/textures/vfx/light.png',
  lightning: '/textures/vfx/spark.png',
  scorch_boots: '/textures/vfx/scorch.png',
  enemy_bullet: '/textures/vfx/muzzle.png',
};

/** Billboard 池中每个槽位的运行时状态。 */
export interface BillboardVfxItem {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  active: boolean;
  age: number;
  lifetime: number;
  startScale: number;
  endScale: number;
  startOpacity: number;
  /** 'fadeOut' = 起始 opacity → 0；'flash' = 0 → 起始 → 0；'constant' = 不变。 */
  opacityCurve: 'fadeOut' | 'flash' | 'constant';
  rotationSpeed: number;
  /** 'camera' = 始终面向相机；'up' = 平躺地面（不旋转）。 */
  facing: 'camera' | 'up';
}

/** spawnBillboard 选项。 */
export interface BillboardSpawnOpts {
  texture: VfxTextureKey;
  x: number;
  y: number;
  z: number;
  /** 起始大小（m）。 */
  scale: number;
  /** 终止大小，默认 = scale（不缩放）。 */
  endScale?: number;
  /** 持续时间（s）。 */
  lifetime: number;
  /** 起始透明度，默认 1。 */
  opacity?: number;
  /** 渐隐曲线，默认 'fadeOut'。 */
  opacityCurve?: 'fadeOut' | 'flash' | 'constant';
  /** 染色，默认 0xffffff。 */
  color?: number;
  /** 初始旋转（弧度）。 */
  rotation?: number;
  /** 旋转速度（弧度/秒），默认 0。 */
  rotationSpeed?: number;
  /** 朝向：'camera' 面向相机，'up' 平躺地面（地面贴花用）。默认 'camera'。 */
  facing?: 'camera' | 'up';
  /** Blending 模式，默认 'additive'（光效）；'normal' 适合烧痕等不发光贴花。 */
  blending?: 'additive' | 'normal';
}

const DEFAULT_BILLBOARD_CAPACITY = 64;

export class BillboardPool {
  /** 预载的 VFX 贴图集合 — 公开给其它 VFX 子系统复用（slash sector / lightning / etc.）。 */
  readonly textures: Record<VfxTextureKey, THREE.Texture>;

  private readonly slots: BillboardVfxItem[] = [];
  private readonly planeGeo: THREE.PlaneGeometry;
  private readonly camPos = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene, capacity: number = DEFAULT_BILLBOARD_CAPACITY) {
    const loader = new THREE.TextureLoader();
    const textures = {} as Record<VfxTextureKey, THREE.Texture>;
    for (const key of Object.keys(VFX_TEXTURE_FILES) as VfxTextureKey[]) {
      const tex = loader.load(VFX_TEXTURE_FILES[key]);
      tex.colorSpace = THREE.SRGBColorSpace;
      textures[key] = tex;
    }
    this.textures = textures;

    this.planeGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < capacity; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.planeGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;  // 在 outline 之上、HUD 之下
      this.scene.add(mesh);
      this.slots.push({
        mesh,
        active: false,
        age: 0,
        lifetime: 1,
        startScale: 1,
        endScale: 1,
        startOpacity: 1,
        opacityCurve: 'fadeOut',
        rotationSpeed: 0,
        facing: 'camera',
      });
    }
  }

  /**
   * 触发一个一次性贴图特效。从池里取一个 plane，配置好材质 / 位置 / 朝向 / 缩放 /
   * 透明度曲线，由 {@link update} 每帧推进。池满时静默丢弃。
   */
  spawn(opts: BillboardSpawnOpts): void {
    const slot = this.slots.find(b => !b.active);
    if (!slot) return;

    slot.active = true;
    slot.age = 0;
    slot.lifetime = Math.max(0.05, opts.lifetime);
    slot.startScale = opts.scale;
    slot.endScale = opts.endScale ?? opts.scale;
    slot.startOpacity = opts.opacity ?? 1;
    slot.opacityCurve = opts.opacityCurve ?? 'fadeOut';
    slot.rotationSpeed = opts.rotationSpeed ?? 0;
    slot.facing = opts.facing ?? 'camera';

    const mat = slot.mesh.material;
    mat.map = this.textures[opts.texture];
    mat.color.setHex(opts.color ?? 0xffffff);
    mat.opacity = slot.startOpacity;
    mat.blending = opts.blending === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending;
    mat.needsUpdate = true;

    slot.mesh.position.set(opts.x, opts.y, opts.z);
    slot.mesh.scale.set(slot.startScale, slot.startScale, slot.startScale);
    slot.mesh.visible = true;

    if (slot.facing === 'up') {
      // 平躺地面：plane 默认面向 +Z，绕 X 轴 -90° 让法线朝 +Y
      slot.mesh.rotation.set(-Math.PI / 2, 0, opts.rotation ?? 0);
    } else {
      // 朝向相机：每帧在 update 里 lookAt(camera)；初始 rotation 仅决定贴图自旋
      slot.mesh.rotation.set(0, 0, opts.rotation ?? 0);
    }
  }

  /**
   * 每帧推进所有 active billboard：
   *   - lerp scale (start → end)
   *   - lerp opacity 按曲线
   *   - 自旋
   *   - facing='camera' 时 lookAt(相机)
   *   - lifetime 到了归还槽位
   */
  update(camera: THREE.Camera, dt: number): void {
    camera.getWorldPosition(this.camPos);

    for (const b of this.slots) {
      if (!b.active) continue;
      b.age += dt;
      if (b.age >= b.lifetime) {
        b.active = false;
        b.mesh.visible = false;
        continue;
      }

      const t = b.age / b.lifetime;  // 0..1
      const scale = b.startScale + (b.endScale - b.startScale) * t;
      b.mesh.scale.set(scale, scale, scale);

      let alpha: number;
      switch (b.opacityCurve) {
        case 'flash':
          // 0 → start → 0 (sin 曲线)
          alpha = b.startOpacity * Math.sin(t * Math.PI);
          break;
        case 'constant':
          alpha = b.startOpacity;
          break;
        case 'fadeOut':
        default:
          alpha = b.startOpacity * (1 - t);
          break;
      }
      b.mesh.material.opacity = Math.max(0, alpha);

      if (b.rotationSpeed !== 0) {
        // facing='up' 与 'camera' 均把自旋走 Z：lookAt 之后再叠 Z rotation 保留
        b.mesh.rotation.z += b.rotationSpeed * dt;
      }

      if (b.facing === 'camera') {
        // 让 plane 法线指向相机（保留 z 自旋）
        const zRot = b.mesh.rotation.z;
        b.mesh.lookAt(this.camPos);
        b.mesh.rotation.z = zRot;
      }
    }
  }

  /** 池销毁：移除 mesh + dispose materials。贴图为共享资源，由调用方自行决定是否 dispose。 */
  dispose(): void {
    for (const slot of this.slots) {
      this.scene.remove(slot.mesh);
      slot.mesh.material.dispose();
    }
    this.slots.length = 0;
    this.planeGeo.dispose();
  }
}
