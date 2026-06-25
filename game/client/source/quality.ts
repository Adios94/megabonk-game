import * as THREE from 'three';
import { DEFAULT_BILLBOARD_CAPACITY } from './vfx/BillboardPool.ts';
import { DEFAULT_MAX_PARTICLES } from './vfx/ParticlePool.ts';

const MOBILE_BILLBOARD_CAPACITY = 18;
const MOBILE_PARTICLE_CAPACITY = Math.floor(DEFAULT_MAX_PARTICLES * 0.36);

/**
 * 距离区间：根据"怪物密度"在 loose（少怪、宽松）和 tight（怪海、收紧）之间线性插值。
 * loose === tight 时等价于固定距离（桌面档默认这么用）。
 */
export type LodRange = { loose: number; tight: number };

/** 自动画质档：桌面 High / 移动 Mobile，无设置页、启动时一次性判定。 */
export type PlatformRenderProfile = {
  id: 'desktop' | 'mobile';
  minPixelRatio: number;
  maxPixelRatio: number;
  dynamicPixelRatioEnabled: boolean;
  dynamicPixelRatioStep: number;
  dynamicPixelRatioSampleSeconds: number;
  dynamicPixelRatioCooldownSeconds: number;
  dynamicPixelRatioLowFps: number;
  dynamicPixelRatioHighFps: number;
  sceneRtType: THREE.TextureDataType;
  outlineThickness: number;
  outlineTapScale: number;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  shadowMapType: THREE.ShadowMapType;
  curvedWorldStrength: number;
  groundTessellate: number;
  levelTessellate: number;
  darkComicEnabled: boolean;
  billboardCapacity: number;
  particleCapacity: number;
  particleEmissionScale: number;
  vfxEventBudgetPerTick: number;
  projectileTrailTickStride: number;
  continuousVfxFrameStride: number;
  swordSlashParticleCount: number;
  hudSlowUpdateIntervalMs: number;
  enemyImpostorEnabled: boolean;
  /** Impostor 切换距离：超过 → 用 impostor 贴片替代 mesh。 */
  enemyImpostorDistance: LodRange;
  /** 视距剔除距离：超过 → 直接 visible=false。 */
  enemyImpostorCullDistance: LodRange;
  /** Impostor 朝向更新帧步长：怪多时取大值降频。 */
  enemyImpostorUpdateStride: LodRange;
  enemyHitReactEnabled: boolean;
  enemyHitFxDistance: LodRange;
  enemyMarkerDistance: LodRange;
  enemyStatusVfxDistance: LodRange;
  /**
   * 密度自适应阈值：
   *   enemyCount <= enemyLodLowCount  → 全部用 loose 值
   *   enemyCount >= enemyLodHighCount → 全部用 tight 值
   *   中间区间 smoothstep 插值。
   */
  enemyLodLowCount: number;
  enemyLodHighCount: number;
};

/** 当前帧实际生效的 LOD 距离集合（由 computeEnemyLod 算出）。 */
export type ResolvedEnemyLod = {
  /** 0..1，0=最宽松，1=最收紧。dev 日志/perf overlay 可读。 */
  density: number;
  impostorDistance: number;
  impostorDistanceSq: number;
  cullDistance: number;
  cullDistanceSq: number;
  impostorUpdateStride: number;
  hitFxDistance: number;
  hitFxDistanceSq: number;
  markerDistance: number;
  statusVfxDistance: number;
};

/**
 * 移动设备启发式：UA + 触摸 + 无 hover 指针（与局内交互分支一致）。
 * 不设手动覆盖；后续若要设置页再扩展。
 */
export function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const touch = 'ontouchstart' in window;
  const coarsePointer = window.matchMedia('(hover: none)').matches;
  return mobileUa || (touch && coarsePointer);
}

function fixedRange(v: number): LodRange {
  return { loose: v, tight: v };
}

function smoothstep01(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 根据当前怪物数量算"密度"，再在每个 LodRange 的 loose / tight 之间插值。
 * loose === tight 的 profile 上结果恒等于固定值（桌面档零开销）。
 */
export function computeEnemyLod(profile: PlatformRenderProfile, enemyCount: number): ResolvedEnemyLod {
  const span = Math.max(1, profile.enemyLodHighCount - profile.enemyLodLowCount);
  const raw = (enemyCount - profile.enemyLodLowCount) / span;
  const density = smoothstep01(raw);

  const impostorDistance = lerp(profile.enemyImpostorDistance.loose, profile.enemyImpostorDistance.tight, density);
  const cullDistance = lerp(profile.enemyImpostorCullDistance.loose, profile.enemyImpostorCullDistance.tight, density);
  // stride 必须是整数且 ≥1，多怪→步长大→朝向更新更稀。
  const strideRaw = lerp(profile.enemyImpostorUpdateStride.loose, profile.enemyImpostorUpdateStride.tight, density);
  const impostorUpdateStride = Math.max(1, Math.round(strideRaw));
  const hitFxDistance = lerp(profile.enemyHitFxDistance.loose, profile.enemyHitFxDistance.tight, density);
  const markerDistance = lerp(profile.enemyMarkerDistance.loose, profile.enemyMarkerDistance.tight, density);
  const statusVfxDistance = lerp(profile.enemyStatusVfxDistance.loose, profile.enemyStatusVfxDistance.tight, density);

  return {
    density,
    impostorDistance,
    impostorDistanceSq: impostorDistance * impostorDistance,
    cullDistance,
    cullDistanceSq: cullDistance * cullDistance,
    impostorUpdateStride,
    hitFxDistance,
    hitFxDistanceSq: hitFxDistance * hitFxDistance,
    markerDistance,
    statusVfxDistance,
  };
}

function buildProfile(): PlatformRenderProfile {
  if (isMobile()) {
    return {
      id: 'mobile',
      minPixelRatio: 1,
      maxPixelRatio: 1.5,
      dynamicPixelRatioEnabled: true,
      dynamicPixelRatioStep: 0.25,
      dynamicPixelRatioSampleSeconds: 2.5,
      dynamicPixelRatioCooldownSeconds: 4,
      dynamicPixelRatioLowFps: 48,
      dynamicPixelRatioHighFps: 57,
      sceneRtType: THREE.UnsignedByteType,
      outlineThickness: 0.75,
      outlineTapScale: 1.0,
      shadowsEnabled: false,
      shadowMapSize: 1024,
      shadowMapType: THREE.BasicShadowMap,
      curvedWorldStrength: 0,
      groundTessellate: 4,
      levelTessellate: 4,
      darkComicEnabled: false,
      billboardCapacity: MOBILE_BILLBOARD_CAPACITY,
      particleCapacity: MOBILE_PARTICLE_CAPACITY,
      particleEmissionScale: 0.55,
      vfxEventBudgetPerTick: 8,
      projectileTrailTickStride: 4,
      continuousVfxFrameStride: 3,
      swordSlashParticleCount: 5,
      hudSlowUpdateIntervalMs: 200,
      enemyImpostorEnabled: true,
      // 怪海时 mesh 圈收到 10m，cull 圈收到 18m；少怪时分别放到 22m / 34m。
      enemyImpostorDistance: { loose: 22, tight: 10 },
      enemyImpostorCullDistance: { loose: 34, tight: 18 },
      enemyImpostorUpdateStride: { loose: 2, tight: 4 },
      enemyHitReactEnabled: false,
      enemyHitFxDistance: { loose: 12, tight: 6 },
      enemyMarkerDistance: { loose: 15, tight: 8 },
      enemyStatusVfxDistance: { loose: 16, tight: 8 },
      enemyLodLowCount: 15,
      enemyLodHighCount: 60,
    };
  }
  return {
    id: 'desktop',
    minPixelRatio: 1,
    maxPixelRatio: 2,
    dynamicPixelRatioEnabled: false,
    dynamicPixelRatioStep: 0,
    dynamicPixelRatioSampleSeconds: 0,
    dynamicPixelRatioCooldownSeconds: 0,
    dynamicPixelRatioLowFps: 0,
    dynamicPixelRatioHighFps: 0,
    sceneRtType: THREE.HalfFloatType,
    outlineThickness: 1.5,
    outlineTapScale: 1.0,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    shadowMapType: THREE.PCFSoftShadowMap,
    curvedWorldStrength: 0.015,
    groundTessellate: 1.8,
    levelTessellate: 1.8,
    darkComicEnabled: true,
    billboardCapacity: DEFAULT_BILLBOARD_CAPACITY,
    particleCapacity: DEFAULT_MAX_PARTICLES,
    particleEmissionScale: 1,
    vfxEventBudgetPerTick: Number.MAX_SAFE_INTEGER,
    projectileTrailTickStride: 2,
    continuousVfxFrameStride: 1,
    swordSlashParticleCount: 12,
    hudSlowUpdateIntervalMs: 0,
    enemyImpostorEnabled: false,
    // 桌面：loose=tight，密度插值结果恒等于固定值（POSITIVE_INFINITY × 0 在 NaN 风险下用大常数替代不必要）。
    enemyImpostorDistance: fixedRange(Number.POSITIVE_INFINITY),
    enemyImpostorCullDistance: fixedRange(Number.POSITIVE_INFINITY),
    enemyImpostorUpdateStride: fixedRange(1),
    enemyHitReactEnabled: true,
    enemyHitFxDistance: fixedRange(Number.POSITIVE_INFINITY),
    enemyMarkerDistance: fixedRange(Number.POSITIVE_INFINITY),
    enemyStatusVfxDistance: fixedRange(Number.POSITIVE_INFINITY),
    enemyLodLowCount: 0,
    enemyLodHighCount: 1,
  };
}

let cachedProfile: PlatformRenderProfile | null = null;

/** 启动时读一次，全局复用同一 profile。 */
export function getPlatformRenderProfile(): PlatformRenderProfile {
  if (!cachedProfile) cachedProfile = buildProfile();
  return cachedProfile;
}
