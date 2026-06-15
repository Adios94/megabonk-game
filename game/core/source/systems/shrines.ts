/**
 * 充能圣殿 (Charge Shrine) 系统。
 *
 * 状态机:
 *   inactive   -- 仅占位，目前不会出现 (生成时直接 charging)
 *   charging   -- 玩家在 SHRINE_RADIUS 内累计 chargeTimer
 *                 玩家离开 → chargeTimer 立刻归零 (megabonk 设计：必须连续站满)
 *                 chargeTimer >= chargeDuration → ready
 *   ready      -- 4 个 reward option roll 出, GameState.phase = 'shrine_reward',
 *                 activeShrineId 锁定本 shrine
 *   consumed   -- 玩家选完奖励，永久消耗
 *
 * 同一时间只允许有一个 ready/active 的 shrine（避免 phase 冲突）。
 * 当 phase = 'shrine_reward' 时，主循环跳过其它 system（与 level_up 同处理）。
 */
import { distanceBetween } from '../physics.ts';
import {
  SHRINE_COUNT,
  SHRINE_RADIUS,
  SHRINE_CHARGE_DURATION,
  SHRINE_REWARD_COUNT,
} from '../config.ts';
import { rollShrineOptions } from '../data/shrineRewards.ts';
import { selectShrineMarkerPoints } from '../levelMarkerSelection.ts';
import type { ShrineState, GameConfig, PlayerState } from '../types.ts';
import type { Engine } from './types.ts';

export function generateShrines(config: GameConfig): ShrineState[] {
  const shrines: ShrineState[] = [];
  if (config.level) {
    return selectShrineMarkerPoints(config.level.chestSpawns ?? [], SHRINE_COUNT).map((point, i) => ({
      id: i + 1,
      x: point.x,
      y: point.y ?? 0,
      z: point.z,
      phase: 'charging',
      chargeTimer: 0,
      chargeDuration: SHRINE_CHARGE_DURATION,
      options: null,
    }));
  }

  const halfMap = config.mapSize * 0.4;
  // 散布在地图四周 —— 不挤在一起 + 离玩家出生点 (0,0) 至少 12m
  for (let i = 0; i < SHRINE_COUNT; i++) {
    const baseAngle = (i / SHRINE_COUNT) * Math.PI * 2;
    const angle = baseAngle + (Math.random() - 0.5) * 0.6;
    const dist = 18 + Math.random() * (halfMap * 0.45);
    shrines.push({
      id: i + 1,
      x: Math.cos(angle) * dist,
      y: 0,
      z: Math.sin(angle) * dist,
      phase: 'charging',
      chargeTimer: 0,
      chargeDuration: SHRINE_CHARGE_DURATION,
      options: null,
    });
  }
  return shrines;
}

/**
 * 每帧 tick:
 *   - 玩家在范围内: chargeTimer += dt
 *   - 离开范围: chargeTimer 立即归零（必须连续充能）
 *   - 充满: phase=ready, roll 4 options, 进入 shrine_reward phase（占用主循环）
 *
 * 注意：
 *   - 已有 active shrine（phase != 'playing' 等）时不接受新的解锁请求 — 排队下一帧
 *   - boss_intro / boss_fight 阶段也允许充能（让玩家能在 boss 期间触发 shrine 增益）
 */
export function tickShrines(engine: Engine, dt: number): void {
  const state = engine.state;
  const player = state.player;
  if (!player.alive) return;
  if (state.shrines.length === 0) return;

  for (const shrine of state.shrines) {
    if (shrine.phase === 'consumed' || shrine.phase === 'ready' || shrine.phase === 'inactive') continue;
    // shrine.phase === 'charging'
    const dist = distanceBetween(player.x, player.z, shrine.x, shrine.z);
    const yDelta = Math.abs((player.y ?? 0) - (shrine.y ?? 0));
    if (dist <= SHRINE_RADIUS && yDelta <= SHRINE_RADIUS) {
      shrine.chargeTimer = Math.min(shrine.chargeDuration, shrine.chargeTimer + dt);
      if (shrine.chargeTimer >= shrine.chargeDuration) {
        // 检查是否已有 active shrine —— 同时只能有一个进入 reward phase
        if (state.activeShrineId == null && state.phase !== 'shrine_reward' && state.phase !== 'level_up') {
          shrine.phase = 'ready';
          shrine.options = rollShrineOptions(player, SHRINE_REWARD_COUNT);
          state.activeShrineId = shrine.id;
          state.phase = 'shrine_reward';
        }
        // 否则保留在 chargeTimer = chargeDuration，下一帧再检查（队列等待）
      }
    } else {
      // 玩家离开 → 立即归零 (megabonk 设计)
      if (shrine.chargeTimer > 0) shrine.chargeTimer = 0;
    }
  }
}

/**
 * 玩家选择 shrine 奖励 → 永久应用到 PlayerState。
 *
 * 大多数 reward 直接修改对应字段：
 *   - damage / attack_speed / movement_speed / pickup_range / crit_damage /
 *     duration / jump_height / powerup_multiplier / difficulty / elite_damage
 *     → 视作 increased 类倍率，乘到现有字段
 *   - knockback / lifesteal / luck → additive
 *   - shield                → maxShield += value (并补满 shield)
 *   - hp_regen              → hpRegenRate += value (字段单位：HP/秒)
 *   - projectile_count      → projectileBonus += value
 *
 * damageMultiplier / attackSpeedMultiplier / speed / pickupRadius / critDamage 这 5 个字段
 * 会被 recomputePlayerStats（tome 升级 / 开宝箱拿遗物时触发）从 base 重算覆盖。为避免 shrine
 * 加成被吞掉，这 5 项累计到独立的 player.shrineBonuses，由 recomputePlayerStats 末尾二次合并；
 * 调用方（selectShrineReward）在本函数后立刻 recompute 让加成即时生效。
 * 其余 reward（shield / hp_regen / knockback / elite_damage / ... ）写的字段不在 recompute
 * 管辖内，直接 mutate 即可、不会被清。
 */
export function applyShrineReward(
  player: PlayerState,
  reward: import('../types.ts').ShrineRewardType,
  value: number,
): void {
  // recompute 管辖的 5 项 → 累计到 shrineBonuses（recompute 末尾合并），不直接写字段
  const sb = (player.shrineBonuses ??= {
    damageMult: 1, attackSpeedMult: 1, speedMult: 1, pickupRadiusMult: 1, critDamageAdd: 0,
  });
  switch (reward) {
    case 'damage':
      sb.damageMult *= 1 + value;
      break;
    case 'attack_speed':
      sb.attackSpeedMult *= 1 + value;
      break;
    case 'movement_speed':
      sb.speedMult *= 1 + value;
      break;
    case 'pickup_range':
      sb.pickupRadiusMult *= 1 + value;
      break;
    case 'crit_damage':
      sb.critDamageAdd += value;
      break;
    case 'shield': {
      const cur = player.maxShield ?? 0;
      player.maxShield = cur + value;
      const curShield = player.shield ?? 0;
      player.shield = Math.min(player.maxShield, curShield + value);
      break;
    }
    case 'hp_regen':
      // megabonk 文案 "+20 HP regen" 对应每秒 HP 回复速率
      player.hpRegenRate = (player.hpRegenRate ?? 0) + value;
      break;
    case 'projectile_count':
      player.projectileBonus = (player.projectileBonus ?? 0) + value;
      break;
    case 'knockback':
      player.knockbackMult = (player.knockbackMult ?? 1) * (1 + value);
      break;
    case 'elite_damage':
      player.eliteDamageMult = (player.eliteDamageMult ?? 1) * (1 + value);
      break;
    case 'lifesteal':
      player.lifestealPct = Math.min(1, (player.lifestealPct ?? 0) + value);
      break;
    case 'jump_height':
      player.jumpHeightMult = (player.jumpHeightMult ?? 1) * (1 + value);
      break;
    case 'duration':
      player.durationMult = (player.durationMult ?? 1) * (1 + value);
      break;
    case 'powerup_multiplier':
      player.powerupMult = (player.powerupMult ?? 1) * (1 + value);
      break;
    case 'difficulty':
      player.difficultyMult = (player.difficultyMult ?? 1) * (1 + value);
      break;
    case 'luck':
      player.luckBonus = (player.luckBonus ?? 0) + value;
      break;
  }
}
