/**
 * Tier 推进系统：玩家进入传送门 → 重置场景，提高难度，保留进度。
 *
 * 设计文档：docs/boss-loop-redesign.md (§8)
 *
 * 触发：altars.ts 把祭坛 phase 推到 'portal_used' 时，本 system 检测并执行。
 *
 * 执行步骤：
 *   1. tier++（最高 3，已是 3 时只重置时间，让玩家继续 overtime 滚动）
 *   2. 清场：enemies / projectiles / pickups / boss / damageEvents / waveIndex / finalSwarm / overtimeSeconds
 *   3. gameTime = 0（视为新一关的"常规生存期"开始）
 *   4. altars 重新生成（旧的 portal_used 已被 consumePortalUsed 清空）
 *   5. 玩家保留：hp / 武器 / tome / 等级 / xp / silver
 *   6. 玩家位置：留在传送门附近（位置已随玩家移动，不强制改）
 *   7. phase 切回 'playing'
 *
 * 客户端 UI 监听 phase 变化做过渡动画。
 */
import type { Engine } from './types.ts';
import { consumePortalUsed, generateAltars } from './altars.ts';
import { generateChests, nextChestId, nextChestRespawnDelay } from './chests.ts';
import type { DifficultyTier } from '../types.ts';

export function tickTierTransition(engine: Engine): void {
  if (!consumePortalUsed(engine)) return;

  const state = engine.state;
  const config = engine.config;

  // tier++（capped at 3）
  const nextTier = Math.min(3, config.tier + 1) as DifficultyTier;
  config.tier = nextTier;

  // 清场
  state.enemies = [];
  state.projectiles = [];
  state.pickups = [];
  state.consumablePickups = [];
  state.goldMotes = [];
  state.damageEvents = [];
  state.levelUpCompensationEvents = [];
  state.chestOpenEvents = [];
  state.pendingChestReward = null;
  state.boss = null;
  state.upgradeOptions = null;
  state.waveIndex = 0;
  state.finalSwarm = false;
  state.overtimeSeconds = 0;
  state.gameTime = 0;

  // 重新生成祭坛和宝箱
  state.altars = generateAltars(config, state.player);
  state.chests = generateChests(config);
  engine.nextChestId = nextChestId(state.chests);
  engine.chestRespawnTimer = nextChestRespawnDelay();
  engine.chestLockedSpawnKeys = [];
  engine.chestPendingSpawnKeys = [];

  // engine 内部计时器复位
  engine.spawnTimer = 1.0;
  engine.miniBossTimer = 0;
  engine.aiGroup = 0;

  // phase 回到游玩态
  state.phase = 'playing';
}
