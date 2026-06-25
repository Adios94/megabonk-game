import * as THREE from 'three';
import { DEFAULT_BILLBOARD_CAPACITY } from './vfx/BillboardPool.ts';
import { DEFAULT_MAX_PARTICLES } from './vfx/ParticlePool.ts';

const MOBILE_BILLBOARD_CAPACITY = 18;
const MOBILE_PARTICLE_CAPACITY = Math.floor(DEFAULT_MAX_PARTICLES * 0.36);

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
  enemyImpostorDistance: number;
  enemyImpostorCullDistance: number;
  enemyImpostorUpdateStride: number;
  enemyHitReactEnabled: boolean;
  enemyHitFxDistance: number;
  enemyMarkerDistance: number;
  enemyStatusVfxDistance: number;
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
      hudSlowUpdateIntervalMs: 100,
      enemyImpostorEnabled: true,
      enemyImpostorDistance: 20,
      enemyImpostorCullDistance: 32,
      enemyImpostorUpdateStride: 2,
      enemyHitReactEnabled: false,
      enemyHitFxDistance: 9,
      enemyMarkerDistance: 12,
      enemyStatusVfxDistance: 14,
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
    enemyImpostorDistance: Number.POSITIVE_INFINITY,
    enemyImpostorCullDistance: Number.POSITIVE_INFINITY,
    enemyImpostorUpdateStride: 1,
    enemyHitReactEnabled: true,
    enemyHitFxDistance: Number.POSITIVE_INFINITY,
    enemyMarkerDistance: Number.POSITIVE_INFINITY,
    enemyStatusVfxDistance: Number.POSITIVE_INFINITY,
  };
}

let cachedProfile: PlatformRenderProfile | null = null;

/** 启动时读一次，全局复用同一 profile。 */
export function getPlatformRenderProfile(): PlatformRenderProfile {
  if (!cachedProfile) cachedProfile = buildProfile();
  return cachedProfile;
}
