import * as THREE from 'three';
import { DEFAULT_BILLBOARD_CAPACITY } from './vfx/BillboardPool.ts';
import { DEFAULT_MAX_PARTICLES } from './vfx/ParticlePool.ts';

const MOBILE_BILLBOARD_CAPACITY = 24;
const MOBILE_PARTICLE_CAPACITY = Math.floor(DEFAULT_MAX_PARTICLES / 2);

/** 自动画质档：桌面 High / 移动 Mobile，无设置页、启动时一次性判定。 */
export type PlatformRenderProfile = {
  id: 'desktop' | 'mobile';
  maxPixelRatio: number;
  sceneRtType: THREE.TextureDataType;
  outlineTapScale: number;
  shadowMapSize: number;
  shadowMapType: THREE.ShadowMapType;
  curvedWorldStrength: number;
  groundTessellate: number;
  levelTessellate: number;
  darkComicEnabled: boolean;
  billboardCapacity: number;
  particleCapacity: number;
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
      maxPixelRatio: 1,
      sceneRtType: THREE.UnsignedByteType,
      outlineTapScale: 1.0,
      shadowMapSize: 1024,
      shadowMapType: THREE.BasicShadowMap,
      curvedWorldStrength: 0,
      groundTessellate: 4,
      levelTessellate: 4,
      darkComicEnabled: false,
      billboardCapacity: MOBILE_BILLBOARD_CAPACITY,
      particleCapacity: MOBILE_PARTICLE_CAPACITY,
    };
  }
  return {
    id: 'desktop',
    maxPixelRatio: 2,
    sceneRtType: THREE.HalfFloatType,
    outlineTapScale: 1.0,
    shadowMapSize: 2048,
    shadowMapType: THREE.PCFSoftShadowMap,
    curvedWorldStrength: 0.015,
    groundTessellate: 1.8,
    levelTessellate: 1.8,
    darkComicEnabled: true,
    billboardCapacity: DEFAULT_BILLBOARD_CAPACITY,
    particleCapacity: DEFAULT_MAX_PARTICLES,
  };
}

let cachedProfile: PlatformRenderProfile | null = null;

/** 启动时读一次，全局复用同一 profile。 */
export function getPlatformRenderProfile(): PlatformRenderProfile {
  if (!cachedProfile) cachedProfile = buildProfile();
  return cachedProfile;
}
