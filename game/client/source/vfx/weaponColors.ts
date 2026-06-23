/**
 * VFX 颜色查表（线性空间 0..1 RGB）。
 *
 * - {@link WEAPON_VFX_COLORS}：武器命中 / 击杀粒子的染色，亦被 {@link HitFlashSystem} 用作受击 tint。
 * - {@link PICKUP_VFX_COLORS}：拾取物 sparkle 染色。
 *
 * 共用同一表 → 改一个值整盘视觉同步变。
 */

export type VfxColor = [number, number, number];

export const WEAPON_VFX_COLORS: Record<string, VfxColor> = {
  sword: [0.56, 0.85, 1.0],
  bone_bouncer: [0.95, 0.9, 0.8],
  axe: [1.0, 0.6, 0.1],
  pistol: [0.8, 1.0, 0.3],
  lightning_staff: [0.3, 0.8, 1.0],
  flame_ring: [1.0, 0.5, 0.0],
  shotgun: [1.0, 0.8, 0.2],
  ray_gun: [1.0, 0.25, 0.45],
  poison_bomb: [0.35, 0.8, 0.25],
  paralysis_gun: [1.0, 0.88, 0.15],
  void_ripple: [0.0, 1.0, 1.0],
  scorch_boots: [1.0, 0.5, 0.12],
};

export const PICKUP_VFX_COLORS: Record<string, VfxColor> = {
  xp_green: [0.2, 1.0, 0.4],
  xp_blue: [0.2, 0.7, 1.0],
  xp_purple: [0.8, 0.3, 1.0],
  xp_orange: [1.0, 0.7, 0.0],
  gold: [1.0, 0.8, 0.15],
  silver: [0.9, 0.9, 0.9],
};
