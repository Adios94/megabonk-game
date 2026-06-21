import type { BossState, EnemyState, PlayerState } from '../types.ts';

export const PLAYER_PROJECTILE_OFFSET_Y = 1.0;
export const ENEMY_DAMAGE_EVENT_OFFSET_Y = 1.0;
export const BOSS_DAMAGE_EVENT_OFFSET_Y = 2.0;
export const TARGET_HIT_CENTER_OFFSET_Y = 0.8;
export const BONE_BOUNCER_MAX_Y_DELTA = 3.0;

export function playerProjectileY(player: Pick<PlayerState, 'y'>): number {
  return player.y + PLAYER_PROJECTILE_OFFSET_Y;
}

export function enemyDamageEventY(enemy: Pick<EnemyState, 'y'>): number {
  return enemy.y + ENEMY_DAMAGE_EVENT_OFFSET_Y;
}

export function bossDamageEventY(boss: Pick<BossState, 'y'>): number {
  return boss.y + BOSS_DAMAGE_EVENT_OFFSET_Y;
}

export function targetHitCenterY(target: Pick<EnemyState | BossState, 'y'>): number {
  return target.y + TARGET_HIT_CENTER_OFFSET_Y;
}
