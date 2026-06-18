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
import { distanceSqBetween } from '../physics.ts';
import { AOE_MAX_Y_DELTA } from '../config.ts';
import { bossDamageEventY, enemyDamageEventY } from '../combatHeight.ts';
import { recordBondDamage } from './weaponDamageStats.ts';
import type { Engine } from './types.ts';
import type {
  PlayerState, EnemyState, BossState, WeaponType, BondId, BondTier, UpgradeOption, UpgradeRarity,
} from '../types.ts';

/** 弧光导体：场上同时存在的导体标记上限（避免连锁过载）。 */
const CONDUCTOR_MARK_CAP = 10;
const ARCANE_MYSTERY_HIT_FLASH_COLOR = 0xaa44ff;

/**
 * 羁绊命中 / 标记 / 持续伤害可作用的目标：普通敌人或 boss。
 * boss 缺少 id / isElite / 减速字段，靠 `targetIsEnemy` 收窄后区别处理。
 */
type BondTarget = EnemyState | BossState;

/** 类型守卫：EnemyState 带 `id`，BossState 不带 → 用来区分 boss 与普通敌人。 */
function targetIsEnemy(t: BondTarget): t is EnemyState {
  return (t as EnemyState).id !== undefined;
}

/** boss 在毒师/处决等机制里按精英对待（DoT 系数减半、免疫处决）。 */
function targetIsElite(t: BondTarget): boolean {
  return targetIsEnemy(t) ? (t.isElite || t.isMiniBoss) : true;
}

function targetDamageEventY(t: BondTarget): number {
  return targetIsEnemy(t) ? enemyDamageEventY(t) : bossDamageEventY(t);
}

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

/** 给一个目标（敌人或 boss）结算一次羁绊机制额外伤害（含飘字与统计）。 */
function dealBondDamage(
  engine: Engine,
  target: BondTarget,
  dmg: number,
  bondId: BondId,
  weaponType: WeaponType,
): void {
  target.hp -= dmg;
  target.hitFlashTimer = 0.12;
  recordBondDamage(engine, bondId, dmg, target, weaponType);
  engine.effects.addDamageEvent(target.x, targetDamageEventY(target), target.z, dmg, false, false, weaponType);
}

function sameCombatHeight(a: BondTarget, b: BondTarget): boolean {
  return Math.abs(a.y - b.y) <= AOE_MAX_Y_DELTA;
}

/**
 * 羁绊内武器命中目标（敌人或 boss）时调用（命中已结算伤害后）。
 * 同时检测击杀（target.hp ≤ 0）以触发余烬引爆。
 */
export function onBondWeaponHit(
  engine: Engine,
  weaponType: WeaponType,
  target: BondTarget,
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
        player.bondMystery = (player.bondMystery ?? 0) + 1;
        player.bondMysterySecGain = (player.bondMysterySecGain ?? 0) + 1;
        break;
      }
      case 'arc_conductor': {
        const dur = tier >= 3 ? p.markDurationT3 : p.markDuration;
        if (weaponType === 'void_ripple') {
          // 导体标记。普通敌人受场上数量上限约束；boss 总是可标记（单一目标，不挤占名额）。
          if (targetIsEnemy(target)) {
            const { lSum } = evalBondCounts(player, def);
            const cap = Math.min(lSum, CONDUCTOR_MARK_CAP);
            const markedCount = engine.state.enemies.filter(e => (e.conductorMarkTimer ?? 0) > 0).length;
            if ((target.conductorMarkTimer ?? 0) > 0 || markedCount < cap) {
              target.conductorMarkTimer = dur;
            }
          } else {
            target.conductorMarkTimer = dur;
          }
        } else {
          // 其它羁绊武器命中 → 连锁伤害给所有带标记目标（敌人 + boss，排除当前命中目标）
          const pct = tier >= 3 ? p.chainPctT3 : p.chainPct;
          const chainDmg = Math.max(1, Math.round(damage * pct));
          for (const e of engine.state.enemies) {
            if (e === target || e.hp <= 0) continue;
            if ((e.conductorMarkTimer ?? 0) > 0 && sameCombatHeight(target, e)) {
              dealBondDamage(engine, e, chainDmg, 'arc_conductor', weaponType);
            }
          }
          const boss = engine.state.boss;
          if (
            boss && boss !== target && boss.hp > 0
            && (boss.conductorMarkTimer ?? 0) > 0
            && sameCombatHeight(target, boss)
          ) {
            dealBondDamage(engine, boss, chainDmg, 'arc_conductor', weaponType);
          }
        }
        break;
      }
      case 'bone_crush': {
        target.bondVulnTimer = p.vulnDuration;
        target.bondVulnPct = p.vulnPct;
        break;
      }
      case 'hunter_mark': {
        if (weaponType === 'paralysis_gun') target.hunterBranded = true;
        // T3 绞杀：烙印 + 低血量 + 非精英/小头目（boss / 精英 / 小头目免疫处决）
        if (tier >= 3 && targetIsEnemy(target) && target.hunterBranded && target.maxHp > 0 &&
            target.hp > 0 && target.hp / target.maxHp < p.executeHpPct &&
            !target.isElite && !target.isMiniBoss) {
          target.hp = 0;
        }
        break;
      }
      case 'poison_master': {
        const maxStacks = tier >= 3 ? p.maxStacksT3 : p.maxStacks;
        const dur = tier >= 3 ? p.durationT3 : p.duration;
        target.neuroStacks = Math.min(maxStacks, (target.neuroStacks ?? 0) + 1);
        target.neuroTimer = dur;
        target.neuroPulseTimer ??= 0; // 首次施加立即触发一次（pulse=0 → tickBonds 处理）
        target.neuroSourceWeaponType = weaponType;
        if (targetIsEnemy(target)) applyNeuroSlow(target, def, tier); // boss 不被减速
        break;
      }
      case 'zero_range': {
        // 击退冲击：附加少量击退（boss 不被击退）+ 按位移结算额外伤
        const mult = tier >= 3 ? p.t3KnockbackMult : 1;
        if (targetIsEnemy(target)) engine.effects.applyKnockback(target, player.x, player.z);
        const bonus = Math.max(1, Math.round(p.knockbackDmgScale * mult));
        dealBondDamage(engine, target, bonus, 'zero_range', weaponType);
        break;
      }
      default:
        break;
    }
  }

  // —— 击杀检测：余烬引爆（在伤害结算之后）——
  if (target.hp <= 0) onBondKill(engine, weaponType, target);
}

function onBondKill(engine: Engine, weaponType: WeaponType, killed: BondTarget): void {
  const player = engine.state.player;
  const tier = activeTierFor(player, weaponType, 'ember_trail');
  if (tier < 2) return;
  const def = BONDS.ember_trail;
  const p = def.params;
  const radius = (tier >= 3 ? p.explodeRadius * p.t3RadiusMult : p.explodeRadius);
  const dmg = Math.max(1, Math.round(killed.maxHp * p.explodeDamagePct * (tier >= 3 ? p.t3DamageMult : 1)));
  const ky = (killed as { y?: number }).y ?? 0.6;

  // 红色爆炸烟雾 VFX（替代普通死亡烟雾的观感）
  engine.state.bondVfxEvents.push({ kind: 'ember_explode', x: killed.x, y: ky + 0.6, z: killed.z });

  const radiusSq = radius * radius;
  for (const e of engine.state.enemies) {
    if (e === killed || e.hp <= 0) continue;
    if (distanceSqBetween(killed.x, killed.z, e.x, e.z) <= radiusSq && sameCombatHeight(killed, e)) {
      dealBondDamage(engine, e, dmg, 'ember_trail', weaponType);
    }
  }
  // 爆炸也波及 boss（若被击杀的不是 boss 本身）
  const boss = engine.state.boss;
  if (
    boss && boss !== killed && boss.hp > 0
    && distanceSqBetween(killed.x, killed.z, boss.x, boss.z) <= radiusSq
    && sameCombatHeight(killed, boss)
  ) {
    dealBondDamage(engine, boss, dmg, 'ember_trail', weaponType);
  }

  // T3：爆炸点留 3s 灼烧痕迹（复用 scorch_trail 区域特效）
  if (tier >= 3) {
    engine.effects.spawnAreaEffect({
      kind: 'scorch_trail',
      weaponType: 'scorch_boots',
      x: killed.x, y: killed.y, z: killed.z,
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
    tickBondMarks(engine, e, dt);
  }
  // boss 同样衰减标记 + 吃神经毒素 DoT
  const boss = engine.state.boss;
  if (boss && boss.hp > 0) tickBondMarks(engine, boss, dt);
}

/** 衰减单个目标（敌人或 boss）的羁绊标记计时器，并推进神经毒素。 */
function tickBondMarks(engine: Engine, target: BondTarget, dt: number): void {
  if ((target.conductorMarkTimer ?? 0) > 0) target.conductorMarkTimer = Math.max(0, (target.conductorMarkTimer ?? 0) - dt);
  if ((target.bondVulnTimer ?? 0) > 0) target.bondVulnTimer = Math.max(0, (target.bondVulnTimer ?? 0) - dt);
  if ((target.neuroStacks ?? 0) > 0) tickNeuro(engine, target, dt);
}

function tickArcaneBurst(engine: Engine): void {
  const player = engine.state.player;
  const def = BONDS.arcane;
  const p = def.params;
  const tier = getBondTier(player, 'arcane');
  const threshold = tier >= 3 ? p.thresholdT3 : p.threshold;
  if ((player.bondMystery ?? 0) < threshold) return;

  player.bondMystery = (player.bondMystery ?? 0) - threshold;

  // 近身威胁优先：6m 内先打最近目标；没有近身目标时，再打索敌范围内当前生命值最高的目标。
  const RANGE = p.targetRange ?? 14;
  const RANGE_SQ = RANGE * RANGE;
  const CLOSE_THREAT_RANGE = p.closeThreatRange ?? 6;
  const CLOSE_THREAT_RANGE_SQ = CLOSE_THREAT_RANGE * CLOSE_THREAT_RANGE;
  let closestThreat: BondTarget | null = null;
  let closestThreatDistSq = CLOSE_THREAT_RANGE_SQ;
  let highestHpTarget: BondTarget | null = null;
  for (const e of engine.state.enemies) {
    if (e.hp <= 0) continue;
    const distSq = distanceSqBetween(player.x, player.z, e.x, e.z);
    if (distSq > RANGE_SQ) continue;
    if (Math.abs(e.y - player.y) > AOE_MAX_Y_DELTA) continue;
    if (distSq <= closestThreatDistSq) {
      closestThreat = e;
      closestThreatDistSq = distSq;
    }
    if (!highestHpTarget || e.hp > highestHpTarget.hp) highestHpTarget = e;
  }
  const boss = engine.state.boss;
  if (
    boss && boss.hp > 0
    && Math.abs(boss.y - player.y) <= AOE_MAX_Y_DELTA
  ) {
    const bossDistSq = distanceSqBetween(player.x, player.z, boss.x, boss.z);
    if (bossDistSq <= RANGE_SQ) {
      if (bossDistSq <= closestThreatDistSq) {
        closestThreat = boss;
        closestThreatDistSq = bossDistSq;
      }
      if (!highestHpTarget || boss.hp > highestHpTarget.hp) highestHpTarget = boss;
    }
  }
  const target = closestThreat ?? highestHpTarget;
  if (!target) return;

  const { owned, k } = evalBondCounts(player, def);
  const avgLevel = k > 0 ? owned.reduce((s, w) => s + w.level, 0) / k : 1;
  const burst = Math.max(1, Math.round(avgLevel * p.burstPerLevel * (tier >= 3 ? p.burstT3Mult : 1)));
  const splash = Math.max(1, Math.round(burst * p.splash));
  const RADIUS = p.splashRadius ?? 3.0;
  const RADIUS_SQ = RADIUS * RADIUS;

  // 蓝紫光球 VFX：从玩家头顶飞向目标，命中处生成蓝紫烟雾
  engine.state.bondVfxEvents.push({ kind: 'arcane_burst', x: target.x, y: targetDamageEventY(target), z: target.z });

  // 主目标吃满额爆发，周围（含 boss）吃溅射
  target.hp -= burst;
  target.hitFlashTimer = 0.2;
  recordBondDamage(engine, 'arcane', burst, target, 'void_ripple');
  target.hitFlashColor = ARCANE_MYSTERY_HIT_FLASH_COLOR;
  engine.effects.addDamageEvent(target.x, targetDamageEventY(target), target.z, burst, true, false, 'void_ripple', false, ARCANE_MYSTERY_HIT_FLASH_COLOR);

  for (const e of engine.state.enemies) {
    if (e.hp <= 0 || e === target) continue;
    if (distanceSqBetween(target.x, target.z, e.x, e.z) <= RADIUS_SQ && Math.abs(e.y - target.y) <= AOE_MAX_Y_DELTA) {
      e.hp -= splash;
      e.hitFlashTimer = 0.15;
      recordBondDamage(engine, 'arcane', splash, e, 'void_ripple');
      e.hitFlashColor = ARCANE_MYSTERY_HIT_FLASH_COLOR;
      engine.effects.addDamageEvent(e.x, enemyDamageEventY(e), e.z, splash, false, false, 'void_ripple', false, ARCANE_MYSTERY_HIT_FLASH_COLOR);
    }
  }
  if (
    boss && boss.hp > 0 && boss !== target
    && distanceSqBetween(target.x, target.z, boss.x, boss.z) <= RADIUS_SQ
    && Math.abs(boss.y - target.y) <= AOE_MAX_Y_DELTA
  ) {
    boss.hp -= splash;
    boss.hitFlashTimer = 0.15;
    recordBondDamage(engine, 'arcane', splash, boss, 'void_ripple');
    boss.hitFlashColor = ARCANE_MYSTERY_HIT_FLASH_COLOR;
    engine.effects.addDamageEvent(boss.x, bossDamageEventY(boss), boss.z, splash, false, false, 'void_ripple', false, ARCANE_MYSTERY_HIT_FLASH_COLOR);
  }
}

function applyNeuroSlow(enemy: EnemyState, def: typeof BONDS.poison_master, tier: BondTier): void {
  const p = def.params;
  const factor = tier >= 3 ? p.slowFactorT3 : p.slowFactor;
  enemy.slowTimer = Math.max(enemy.slowTimer ?? 0, p.slowDuration);
  enemy.slowFactor = Math.min(enemy.slowFactor ?? 1, factor);
}

function tickNeuro(engine: Engine, target: BondTarget, dt: number): void {
  const def = BONDS.poison_master;
  const p = def.params;
  const tier = getBondTier(engine.state.player, 'poison_master');

  target.neuroTimer = Math.max(0, (target.neuroTimer ?? 0) - dt);
  if ((target.neuroTimer ?? 0) <= 0) {
    target.neuroStacks = 0;
    target.neuroPulseTimer = 0;
    return;
  }

  // 每层每秒损失 1% maxHP（精英 / boss ×0.5）
  const stacks = target.neuroStacks ?? 0;
  const eliteCoef = targetIsElite(target) ? p.eliteCoef : 1;
  const dotPerSec = target.maxHp * p.hpPctPerStack * stacks * eliteCoef;
  if (dotPerSec > 0) {
    const dmg = dotPerSec * dt;
    target.hp -= dmg;
    recordBondDamage(engine, 'poison_master', dmg, target, target.neuroSourceWeaponType ?? 'poison_bomb');
  }

  // 周期触发强减速 + 攻击减慢（仅普通敌人；boss 不被减速）
  target.neuroPulseTimer = (target.neuroPulseTimer ?? 0) - dt;
  if ((target.neuroPulseTimer ?? 0) <= 0) {
    target.neuroPulseTimer = p.pulseInterval;
    if (targetIsEnemy(target)) applyNeuroSlow(target, def, tier);
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
