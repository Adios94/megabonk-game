/**
 * 羁绊运行时系统 —— 升级池选项、激活/升级、T2/T3 机制与每帧 tick。
 *
 * 设计：
 *   - T1 数值：走 stat 管线（data/bonds.bondGlobalModifiers + bondWeaponDamageMods，
 *     由 recomputePlayerStats 应用），本文件不处理。
 *   - T2/T3 机制：通过事件钩子 + 每帧 tick 实现：
 *       · onBondWeaponHit  —— 命中（含击杀检测）触发：奥秘计数 / 导体标记+连锁 /
 *         易伤 / 烙印+处决 / 神经毒素 / 击退冲击 / 余烬引爆
 *       · onPlayerHitBonds —— 受击触发铁血反击（刷新剑 CD + 下次斩击叠层 + T3 暴怒）
 *       · tickBonds        —— 衰减各计时器 + 奥秘满阈值爆发 + 神经毒素周期触发
 */
import {
  BONDS, ALL_BOND_IDS, BONDS_BY_WEAPON,
  evalBondCounts, getBondTier, bondThresholds, bondUpgradeTargets,
} from '../data/bonds.ts';
import { loadSave, saveSave } from '../save.ts';
import { distanceBetween } from '../physics.ts';
import type { Engine } from './types.ts';
import type {
  PlayerState, EnemyState, WeaponType, BondId, BondTier, UpgradeOption, UpgradeRarity,
} from '../types.ts';

/** 弧光导体：场上同时存在的导体标记上限（避免连锁过载）。 */
const CONDUCTOR_MARK_CAP = 10;

// ─────────────────────────────────────────────────────────────────────────
// 升级池：羁绊激活 / 升级选项
// ─────────────────────────────────────────────────────────────────────────

/** 生成当前可出现的 bond_activate / bond_upgrade 选项（供 upgrades.ts 合并进池）。 */
export function getBondUpgradeOptions(player: PlayerState): UpgradeOption[] {
  return bondUpgradeTargets(player).map((t): UpgradeOption => {
    const rarity: UpgradeRarity = t.isActivate ? 'legendary' : 'rare';
    return {
      id: `bond_${t.bondId}_${t.toTier}`,
      kind: t.isActivate ? 'bond_activate' : 'bond_upgrade',
      rarity,
      bondId: t.bondId,
      currentLevel: t.fromTier,
      newLevel: t.toTier,
    };
  });
}

/**
 * 激活或升级一条羁绊到指定档位。返回是否产生变化。
 * 0→1 激活时累计 save.stats.bondsActivated（用于羁绊任务）。
 * 不负责 recompute —— 调用方（GameInstance）随后调 recomputePlayerStats。
 */
export function applyBondUpgrade(player: PlayerState, bondId: BondId, toTier: BondTier): boolean {
  if (!BONDS[bondId]) return false;
  player.bonds ??= [];
  const existing = player.bonds.find(b => b.bondId === bondId);
  if (existing) {
    if (toTier <= existing.tier) return false;
    existing.tier = toTier;
  } else {
    if (toTier < 1) return false;
    player.bonds.push({ bondId, tier: toTier });
  }

  if (toTier === 1) {
    try {
      const save = loadSave();
      save.stats.bondsActivated = (save.stats.bondsActivated ?? 0) + 1;
      saveSave(save);
    } catch {
      // localStorage 不可用时静默跳过（与 checkWeaponEvolutions 旧行为一致）
    }
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────
// 事件钩子
// ─────────────────────────────────────────────────────────────────────────

/** 工具：weaponType 是否属于某条已激活到 ≥minTier 的羁绊。 */
function activeTierFor(player: PlayerState, weaponType: WeaponType, bondId: BondId): BondTier {
  if (!BONDS[bondId].weapons.includes(weaponType)) return 0;
  return getBondTier(player, bondId);
}

/**
 * 羁绊内武器命中敌人时调用（命中已结算伤害后）。
 * 同时检测击杀（enemy.hp ≤ 0）以触发余烬引爆。
 */
export function onBondWeaponHit(
  engine: Engine,
  weaponType: WeaponType,
  enemy: EnemyState,
  damage: number,
  _isCrit: boolean,
): void {
  const player = engine.state.player;
  const bondIds = BONDS_BY_WEAPON[weaponType];
  if (!bondIds || bondIds.length === 0) return;

  for (const id of bondIds) {
    const tier = getBondTier(player, id);
    if (tier < 2) continue;
    const def = BONDS[id];
    const p = def.params;

    switch (id) {
      case 'arcane': {
        // 奥秘计数：每秒上限 rateCap
        const secGain = player.bondMysterySecGain ?? 0;
        if (secGain < p.rateCap) {
          player.bondMystery = (player.bondMystery ?? 0) + 1;
          player.bondMysterySecGain = secGain + 1;
        }
        break;
      }
      case 'arc_conductor': {
        const dur = tier >= 3 ? p.markDurationT3 : p.markDuration;
        if (weaponType === 'void_ripple') {
          // 导体标记（数量上限 = min(组内武器等级总和, 10)，避免超模）
          const { lSum } = evalBondCounts(player, def);
          const cap = Math.min(lSum, CONDUCTOR_MARK_CAP);
          const markedCount = engine.state.enemies.filter(e => (e.conductorMarkTimer ?? 0) > 0).length;
          if ((enemy.conductorMarkTimer ?? 0) > 0 || markedCount < cap) {
            enemy.conductorMarkTimer = dur;
          }
        } else {
          // 其它羁绊武器命中 → 连锁伤害给所有带标记敌人
          const pct = tier >= 3 ? p.chainPctT3 : p.chainPct;
          const chainDmg = Math.max(1, Math.round(damage * pct));
          for (const e of engine.state.enemies) {
            if (e.id === enemy.id || e.hp <= 0) continue;
            if ((e.conductorMarkTimer ?? 0) > 0) {
              e.hp -= chainDmg;
              e.hitFlashTimer = 0.12;
              engine.effects.addDamageDealt(chainDmg);
              engine.effects.addDamageEvent(e.x, 1.0, e.z, chainDmg, false, false, weaponType);
            }
          }
        }
        break;
      }
      case 'bone_crush': {
        enemy.bondVulnTimer = p.vulnDuration;
        enemy.bondVulnPct = p.vulnPct;
        break;
      }
      case 'hunter_mark': {
        if (weaponType === 'paralysis_gun') enemy.hunterBranded = true;
        // T3 绞杀：烙印 + 低血量 + 非精英/小头目
        if (tier >= 3 && enemy.hunterBranded && enemy.maxHp > 0 &&
            enemy.hp > 0 && enemy.hp / enemy.maxHp < p.executeHpPct &&
            !enemy.isElite && !enemy.isMiniBoss) {
          enemy.hp = 0;
        }
        break;
      }
      case 'poison_master': {
        const maxStacks = tier >= 3 ? p.maxStacksT3 : p.maxStacks;
        const dur = tier >= 3 ? p.durationT3 : p.duration;
        enemy.neuroStacks = Math.min(maxStacks, (enemy.neuroStacks ?? 0) + 1);
        enemy.neuroTimer = dur;
        enemy.neuroPulseTimer ??= 0; // 首次施加立即触发一次（pulse=0 → tickBonds 处理）
        applyNeuroSlow(enemy, def, tier);
        break;
      }
      case 'zero_range': {
        // 击退冲击：附加少量击退 + 按位移结算额外伤
        const mult = tier >= 3 ? p.t3KnockbackMult : 1;
        engine.effects.applyKnockback(enemy, player.x, player.z);
        const bonus = Math.max(1, Math.round(p.knockbackDmgScale * mult));
        enemy.hp -= bonus;
        engine.effects.addDamageDealt(bonus);
        engine.effects.addDamageEvent(enemy.x, 1.0, enemy.z, bonus, false, false, weaponType);
        break;
      }
      default:
        break;
    }
  }

  // —— 击杀检测：余烬引爆（在伤害结算之后）——
  if (enemy.hp <= 0) onBondKill(engine, weaponType, enemy);
}

function onBondKill(engine: Engine, weaponType: WeaponType, enemy: EnemyState): void {
  const player = engine.state.player;
  const tier = activeTierFor(player, weaponType, 'ember_trail');
  if (tier < 2) return;
  const def = BONDS.ember_trail;
  const p = def.params;
  const radius = (tier >= 3 ? p.explodeRadius * p.t3RadiusMult : p.explodeRadius);
  const dmg = Math.max(1, Math.round(enemy.maxHp * p.explodeDamagePct * (tier >= 3 ? p.t3DamageMult : 1)));

  // 红色爆炸烟雾 VFX（替代普通死亡烟雾的观感）
  engine.state.bondVfxEvents.push({ kind: 'ember_explode', x: enemy.x, y: enemy.y + 0.6, z: enemy.z });

  for (const e of engine.state.enemies) {
    if (e.id === enemy.id || e.hp <= 0) continue;
    if (distanceBetween(enemy.x, enemy.z, e.x, e.z) <= radius) {
      e.hp -= dmg;
      e.hitFlashTimer = 0.12;
      engine.effects.addDamageDealt(dmg);
      engine.effects.addDamageEvent(e.x, 1.0, e.z, dmg, false, false, weaponType);
    }
  }

  // T3：爆炸点留 3s 灼烧痕迹（复用 scorch_trail 区域特效）
  if (tier >= 3) {
    engine.effects.spawnAreaEffect({
      kind: 'scorch_trail',
      weaponType: 'scorch_boots',
      x: enemy.x, z: enemy.z,
      radius,
      lifetime: p.t3ScorchDuration,
      maxLifetime: p.t3ScorchDuration,
      damage: Math.max(1, Math.round(dmg * 0.3)),
      tickTimer: 0,
      tickInterval: 0.5,
    });
  }
}

/** 玩家受击时调用 —— 铁血反击（T2 刷新剑 CD + 下次斩击叠层；T3 触发暴怒）。 */
export function onPlayerHitBonds(engine: Engine): void {
  const player = engine.state.player;
  const tier = getBondTier(player, 'iron_blood');
  if (tier < 2) return;
  const p = BONDS.iron_blood.params;

  const sword = player.weapons.find(w => w.type === 'sword');
  if (sword) sword.cooldownTimer = 0;
  player.bondIronStacks = (player.bondIronStacks ?? 0) + 1;
  if (tier >= 3) player.bondIronRageTimer = p.rageDuration;
}

// ─────────────────────────────────────────────────────────────────────────
// 每帧 tick
// ─────────────────────────────────────────────────────────────────────────

export function tickBonds(engine: Engine, dt: number): void {
  const player = engine.state.player;
  if (!player.bonds || player.bonds.length === 0) return;

  // 铁血暴怒计时
  if ((player.bondIronRageTimer ?? 0) > 0) {
    player.bondIronRageTimer = Math.max(0, (player.bondIronRageTimer ?? 0) - dt);
  }

  // 奥秘：每秒重置获取量；满阈值爆发
  if (getBondTier(player, 'arcane') >= 2) {
    player.bondMysterySecTimer = (player.bondMysterySecTimer ?? 0) + dt;
    if (player.bondMysterySecTimer >= 1) {
      player.bondMysterySecTimer -= 1;
      player.bondMysterySecGain = 0;
    }
    tickArcaneBurst(engine);
  }

  // 敌人侧计时器：导体标记 / 易伤 / 神经毒素
  for (const e of engine.state.enemies) {
    if (e.hp <= 0) continue;
    if ((e.conductorMarkTimer ?? 0) > 0) e.conductorMarkTimer = Math.max(0, (e.conductorMarkTimer ?? 0) - dt);
    if ((e.bondVulnTimer ?? 0) > 0) e.bondVulnTimer = Math.max(0, (e.bondVulnTimer ?? 0) - dt);
    if ((e.neuroStacks ?? 0) > 0) tickNeuro(engine, e, dt);
  }
}

function tickArcaneBurst(engine: Engine): void {
  const player = engine.state.player;
  const def = BONDS.arcane;
  const p = def.params;
  const tier = getBondTier(player, 'arcane');
  const threshold = tier >= 3 ? p.thresholdT3 : p.threshold;
  if ((player.bondMystery ?? 0) < threshold) return;

  player.bondMystery = (player.bondMystery ?? 0) - threshold;

  // 选索敌范围内当前生命值最高的敌人
  const RANGE = 14;
  let target: EnemyState | null = null;
  for (const e of engine.state.enemies) {
    if (e.hp <= 0) continue;
    if (distanceBetween(player.x, player.z, e.x, e.z) > RANGE) continue;
    if (!target || e.hp > target.hp) target = e;
  }
  if (!target) return;

  const { owned, k } = evalBondCounts(player, def);
  const avgLevel = k > 0 ? owned.reduce((s, w) => s + w.level, 0) / k : 1;
  const burst = Math.max(1, Math.round(avgLevel * p.burstPerLevel * (tier >= 3 ? p.burstT3Mult : 1)));
  const splash = Math.max(1, Math.round(burst * p.splash));
  const RADIUS = 3.0;

  // 蓝紫光球 VFX：从玩家头顶飞向目标，命中处生成蓝紫烟雾
  engine.state.bondVfxEvents.push({ kind: 'arcane_burst', x: target.x, y: 1.4, z: target.z });

  for (const e of engine.state.enemies) {
    if (e.hp <= 0) continue;
    const d = distanceBetween(target.x, target.z, e.x, e.z);
    if (e.id === target.id) {
      e.hp -= burst;
      e.hitFlashTimer = 0.2;
      engine.effects.addDamageDealt(burst);
      engine.effects.addDamageEvent(e.x, 1.4, e.z, burst, true, false, 'void_ripple');
    } else if (d <= RADIUS) {
      e.hp -= splash;
      e.hitFlashTimer = 0.15;
      engine.effects.addDamageDealt(splash);
      engine.effects.addDamageEvent(e.x, 1.0, e.z, splash, false, false, 'void_ripple');
    }
  }
}

function applyNeuroSlow(enemy: EnemyState, def: typeof BONDS.poison_master, tier: BondTier): void {
  const p = def.params;
  const factor = tier >= 3 ? p.slowFactorT3 : p.slowFactor;
  enemy.slowTimer = Math.max(enemy.slowTimer ?? 0, p.slowDuration);
  enemy.slowFactor = Math.min(enemy.slowFactor ?? 1, factor);
}

function tickNeuro(engine: Engine, enemy: EnemyState, dt: number): void {
  const def = BONDS.poison_master;
  const p = def.params;
  const tier = getBondTier(engine.state.player, 'poison_master');

  enemy.neuroTimer = Math.max(0, (enemy.neuroTimer ?? 0) - dt);
  if ((enemy.neuroTimer ?? 0) <= 0) {
    enemy.neuroStacks = 0;
    enemy.neuroPulseTimer = 0;
    return;
  }

  // 每层每秒损失 1% maxHP（精英 ×0.5）
  const stacks = enemy.neuroStacks ?? 0;
  const eliteCoef = (enemy.isElite || enemy.isMiniBoss) ? p.eliteCoef : 1;
  const dotPerSec = enemy.maxHp * p.hpPctPerStack * stacks * eliteCoef;
  if (dotPerSec > 0) {
    const dmg = dotPerSec * dt;
    enemy.hp -= dmg;
    engine.effects.addDamageDealt(dmg);
  }

  // 周期触发强减速 + 攻击减慢
  enemy.neuroPulseTimer = (enemy.neuroPulseTimer ?? 0) - dt;
  if ((enemy.neuroPulseTimer ?? 0) <= 0) {
    enemy.neuroPulseTimer = p.pulseInterval;
    applyNeuroSlow(enemy, def, tier);
  }
}

/** 铁血暴怒期间的攻速倍率（供 tickWeapons 叠乘；非暴怒返回 1）。 */
export function bondAttackSpeedMult(player: PlayerState): number {
  if (getBondTier(player, 'iron_blood') >= 3 && (player.bondIronRageTimer ?? 0) > 0) {
    return 1 + BONDS.iron_blood.params.rageAttackSpeed;
  }
  return 1;
}

// 重新导出常用查询，便于 client / 其它系统使用
export { BONDS, ALL_BOND_IDS, getBondTier, evalBondCounts, bondThresholds, highestEligibleTier } from '../data/bonds.ts';
export type { BondDef } from '../data/bonds.ts';
