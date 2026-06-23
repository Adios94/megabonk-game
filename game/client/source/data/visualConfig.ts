/**
 * 客户端视觉配置常量集中表。
 *
 * 这些都是渲染层的静态查表（颜色 / 阈值 / LOD），与 `@minigame/core` 的 game logic
 * 完全无关，但是会被 `index.ts` 多处引用（粒子颜色 / pickup 颜色 / 敌人 LOD 等）。
 *
 * 抽到独立文件后：
 *  - 改一个颜色不再需要扫整个 `index.ts`。
 *  - `materials/` 与 `render/` 子模块可以直接 import，无需通过 GameScene 透传。
 */

/** 敌人 token → 16-bit hex 颜色（fallback / silhouette mat 用）。 */
export const ENEMY_COLORS: Record<string, number> = {
  skeleton_soldier: 0xd4a574,
  zombie: 0x44cc55,
  skeleton_archer: 0xc87533,
  skeleton_knight: 0xdd4444,
  necromancer: 0x9944cc,
  gargoyle: 0x667788,
};

/**
 * 视觉离地高度（米）—— 纯渲染偏移，不影响 core 逻辑（碰撞 / preferredRange 走水平 x/z）。
 * 用飞行/飘浮模型的地面单位（dragon / ghost）抬离地面更自然。gargoyle 的飞行高度由
 * core 的 dive 行为（y=1.8）控制，不在此叠加。
 */
export const ENEMY_HOVER_OFFSET: Record<string, number> = {
  // skeleton_archer 现用 KayKit 法师（落地人形），不再悬浮；仅 necromancer(ghost) 飘浮
  necromancer: 1.0,
};

// ── 敌人动画 LOD（同屏大量怪：按到相机距离 + 视锥分档降频 mixer.update）─────────
// 蒙皮动画的骨骼矩阵重算是同屏 100 怪时的主 CPU 开销，且与是否在屏幕内无关。
// 近处满帧、中/远降频、视锥外冻结；降频时累积 dt 一次性补上，保证动画速率不变。
export const ENEMY_ANIM_LOD_NEAR = 16;
export const ENEMY_ANIM_LOD_FAR = 34;
export const ENEMY_ANIM_LOD_NEAR_SQ = ENEMY_ANIM_LOD_NEAR * ENEMY_ANIM_LOD_NEAR;
export const ENEMY_ANIM_LOD_FAR_SQ = ENEMY_ANIM_LOD_FAR * ENEMY_ANIM_LOD_FAR;
export const ENEMY_ANIM_LOD_MID_STRIDE = 2;
export const ENEMY_ANIM_LOD_FAR_STRIDE = 4;

// ── 敌人视距剔除（visible=false 直接跳过渲染 + skeleton.update + boneTexture 上传）─────
export const ENEMY_VISIBLE_CULL_DIST = 20;
export const ENEMY_VISIBLE_CULL_SQ = ENEMY_VISIBLE_CULL_DIST * ENEMY_VISIBLE_CULL_DIST;

// ── charge 冲撞收招窗口（与 game/core/source/ai/behaviors/charge.ts 同步）────────────
// core 在 chargeState='cooldown' 入口设 chargeTimer=3.0，前 0.7s 站定（applyMovement 跳过）
// 让攻击/收招动画 Punch 完整可见。客户端用 chargeTimer > 3.0-0.7 = 2.3 判定收招窗口。
export const CHARGE_COOLDOWN_STRIKE_THRESHOLD = 3.0 - 0.7;

export const WEAPON_PROJECTILE_COLORS: Record<string, number> = {
  sword: 0xcccccc,
  bone_bouncer: 0xf5f5dc,
  axe: 0x888888,
  pistol: 0xffcc44,
  lightning_staff: 0x44aaff,
  flame_ring: 0xff6600,
  shotgun: 0xffee44,
  ray_gun: 0xff3366,
  poison_bomb: 0x4caf3a,
  paralysis_gun: 0xffdd22,
  void_ripple: 0x00ffff,
  scorch_boots: 0xff7a1a,
};

export const PICKUP_COLORS: Record<string, number> = {
  xp_green: 0x00ff66,
  xp_blue: 0x22aaff,
  xp_purple: 0xcc44ff,
  xp_orange: 0xffaa00,
  gold: 0xffcc33,
  silver: 0xeeeeee,
  health: 0xff2222,
  health_small: 0xff6666,
};

export const MAX_CONSUMABLE_PICKUPS = 50;

export const CONSUMABLE_COLORS: Record<string, number> = {
  wild_berry: 0xcc44aa,
  hot_soup: 0xff8844,
  mint_candy: 0x66ddff,
  hard_bread: 0xddbb88,
  energy_bar: 0xffcc33,
  magnet: 0x4488ff,
  iron_meal: 0x8899aa,
  rage_potion: 0xff3344,
  prophecy_book: 0xaa66ff,
  craftsman_hammer: 0xffaa44,
};

export const CONSUMABLE_EMOJI: Record<string, string> = {
  wild_berry: '🫐',
  hot_soup: '🍲',
  mint_candy: '🍬',
  hard_bread: '🥖',
  energy_bar: '🍫',
  magnet: '🧲',
  iron_meal: '🍱',
  rage_potion: '💢',
  prophecy_book: '📖',
  craftsman_hammer: '🔨',
};

export const DAMAGE_NUMBER_FONT_FAMILY = "'Lilita One', 'Press Start 2P', monospace";

export const consumableIconSrc = (id: string): string => `/ui/icon/consumable_items/${id}.png`;
