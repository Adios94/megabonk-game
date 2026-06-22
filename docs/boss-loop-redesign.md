# Boss Loop Redesign（飞碟 → Boss → 传送门 → 下一关）

> 状态：Draft v1
> 最后更新：2026-06-02
> 关联代码：`game/core/source/systems/altars.ts`（新）/ `systems/spawning.ts` / `types.ts` / `config.ts` / `game/client/source/**`

## 1. 设计目标

- 把 *"找到飞碟 → 召唤 Boss → 通关 → 解锁更高难度"* 升级为玩家的主线动词；生存计时器降为节奏背景。
- 三档难度统一玩法结构，差异只体现在数值与 overtime 系数，不再有 "Normal 纯靠时间触发 Boss" 的特例。
- 给敢留下来的玩家一个 overtime 刺激：放弃传送门 = 用风险换更多收益。

## 2. 玩家视角的核心循环

```
出生 → 探索 / 清怪 / 升级 → 找到飞碟
  → 走到飞碟旁 → [E] 或 手机"激活 Boss" 按钮
  → Boss intro → Boss 战
  → 击败 Boss → 飞碟变传送门
       ├─ A：走进传送门 + [E] → tier++（暂留当前场景，但数值升级）
       └─ B：留在场上：
              · 原 540s 计时已用完 → 切换为 overtime 正向计时
              · 怪物难度按 overtime 时长持续上升
              · 可随时回到传送门进入下一关
              · 死亡 → defeat
```

## 3. 飞碟 / 传送门状态机

把现有 `TeleporterPhase` 重构为 `AltarPhase`（同一个对象在 Boss 前是飞碟，Boss 后是传送门）：

```
ready          (玩家在交互半径内 → UI 提示 "[E] 召唤 Boss")
  ↓ 玩家按 E
summoning      (短读条 1.0s 防误触；玩家走出半径 → 回 ready)
  ↓ 读条满
boss_active    (Boss 已生成；飞碟锁住、不可再交互)
  ↓ Boss 死亡（boss.hp ≤ 0）
portal_ready   (飞碟变传送门，UI 提示 "[E] 进入下一关")
  ↓ 玩家按 E + 在半径内
portal_used    (终态；触发 next-tier 流程后被清掉)
```

> **关键差异 vs 现状**：
> 1. 触发从"踩点 3s 读条"变"按 E + 1s 防误触"。
> 2. 同一对象贯穿 Boss 前/后两个角色，避免拆两套实体。
> 3. 不再依赖 `gameTime ≥ X` 解锁，玩家随时找到随时召唤。

### 状态机数据形状

```ts
export type AltarPhase = 'ready' | 'summoning' | 'boss_active' | 'portal_ready' | 'portal_used';

export interface AltarState {
  x: number;
  z: number;
  phase: AltarPhase;
  summonTimer: number;       // 0 → SUMMON_DURATION
  summonDuration: number;    // = SUMMON_DURATION (1.0s)
}
```

> **类型迁移策略**：保留 `TeleporterPhase` / `TeleporterState` 类型导出做向后兼容（type alias 指向 Altar 等价），同时新增 `AltarPhase` / `AltarState`。`GameState.teleporters` 字段同步保留，但语义改为新飞碟状态机。这样旧的 client 渲染代码不会一次性全断。

## 4. 三档难度的飞碟配置

| Tier | 飞碟数 | 必须全部激活才出 Boss？ |
|---|---|---|
| 1 Normal | 1 | — |
| 2 Hard | 1 | — |
| 3 Nightmare | 1 | — |

> 原本 tier 3 的"2 个飞碟全激活"取消。差异化交给数值（`enemyHpMultiplier` / `bossHpMultiplier` / overtime 系数）承担。`TIER_CONFIGS[*].teleporterCount` 三档统一 `1`。

## 5. 飞碟位置 & 可发现性

- **生成时机**：开局立即生成（不再等 `TELEPORTER_APPEAR_TIME = 300s`）。
- **位置算法**：随机角度 + 距出生点 25–`halfMap*0.6` 的距离，clamp 在地图内。
- **可视提示**：
  - 飞碟本身：底座 + 持续向上的光柱 / 烟雾，远距离可见。
  - HUD：右上指南针 / 屏幕边缘箭头指向飞碟。
- **交互半径**：`ALTAR_INTERACT_RADIUS = 2.0` (沿用)。
- **UI prompt**：进入半径时弹出 `[E] altar.prompt.summon` / 移动端弹圆形按钮。

## 6. 时间机制（regular vs overtime）

| 阶段 | 时间字段 | 难度走向 |
|---|---|---|
| regular | `gameTime: 0 → 540s` | 维持现有刷怪曲线，保留 `finalSwarm` 480-540s |
| overtime（仅当 `gameTime ≥ 540` 且 `phase != 'boss_active'`，且尚未 `portal_used`） | `overtimeSeconds: 0 → ∞` | 每过 30s 给敌人加一档系数 |

**overtime 难度公式（首版）**：

```ts
const overtimeStep = Math.floor(state.overtimeSeconds / 30);
const factor = 1 + 0.10 * overtimeStep;
// enemy.hp     *= factor
// enemy.damage *= factor
// enemy.speed  *= 1 + 0.04 * overtimeStep   // 速度增长更温和，避免完全无法风筝
```

> overtime 不是新 `phase`；用 `state.overtimeSeconds > 0` 判断即可，`phase` 仍可为 `'playing'`。

## 7. `GamePhase` 调整

```
menu → playing → (level_up | boss_intro | boss_fight) → portal_open
                                                          ├─ overtime（playing + overtimeSeconds>0）
                                                          └─ defeat
```

- 删除终态 `'victory'` 的语义（保留 enum 但仅作为"已击败本轮 Boss"标志，结算不再依赖它）。
- 新增 `'portal_open'`：Boss 死亡后、玩家未进传送门、未死亡的中间态。`overtimeSeconds` 在此阶段开始累加（前提 `gameTime ≥ 540`）。

## 8. 进入传送门后的 tier 推进

由于"暂留当前场景"，按 E 进传送门时执行：

1. `engine.config.tier = min(3, tier + 1)`；最高已是 3 时只重置 overtime 系数曲线（仍重置时间，让玩家继续累积）。
2. **重置**：`enemies = []`、`projectiles` 清空、`pickups` 清空、`gameTime = 0`、`overtimeSeconds = 0`、`waveIndex = 0`、`finalSwarm = false`、`boss = null`、`altars` 重新生成 1 个。
3. **保留**：`player`（位置移到出生点附近 / 旧传送门位置）、`hp`、`weapons` / `tomes` / `level` / `xp` / `silver`。
4. UI：客户端做一个 0.5s 的黑屏过渡 + 提示 "Tier ${n}"，不弹中途结算。
5. 数据：`runStats.tiersCleared` 累加（用于本局最终结算 / quest）。

## 9. 结算条件

| 结束时机 | 触发条件 | 结算 |
|---|---|---|
| Boss 战死亡 | `player.alive=false` 且 `phase='boss_fight'` | defeat，无 victory bonus |
| Overtime 死亡 | 死时 `state.overtimeSeconds > 0` | defeat，silver 加成可考虑 overtime 时长 |
| Tier 3 通关后再进传送门（待将来真正多关再细化） | `tier=3` 且 `phase='portal_open'` 时按 E | victory，最高加成 |

## 10. 输入 / UI / i18n 改动清单

- **输入（PC）**：在 `InputState` 加 `interact: boolean`。绑定 `KeyE`。
- **输入（Mobile）**：交互半径内时显示屏幕中下方圆形按钮，文案随阶段切换：
  - `ready` / `summoning` → `altar.prompt.summon`
  - `portal_ready` → `altar.prompt.enterPortal`
- **HUD**：飞碟指南针（屏幕边缘箭头 + 距离数字）；overtime 横幅。
- **i18n keys**（en / zh 同步）：
  - `altar.prompt.summon`
  - `altar.prompt.enterPortal`
  - `altar.summoning` ("Summoning... %s")
  - `hud.compass.altar`
  - `overtime.banner` ("Overtime — %s")
  - `tier.transition` ("Tier %d")

## 11. 与契约的影响

- `@minigame/core` 公开导出：
  - `InputState` 新增 `interact: boolean` 字段（不破坏现有消费者，因为是新增）。
  - `GameState` 新增 `overtimeSeconds: number`、新增 `altars: AltarState[]`（`teleporters` 字段保留作为 alias 一段时间，逐步迁移）。
  - 新增类型 `AltarPhase` / `AltarState` 导出；保留 `TeleporterPhase` / `TeleporterState` 导出（指向 Altar 等价）。
- `GameInstance` 5 个方法签名不变。
- 触发 `check-contract` 必跑：本设计涉及 `index.ts` 公开导出与 i18n 键。

## 12. 不在本次范围

- 真正的"下一关"地图 / 主题切换（仍留同场景）。
- 多种 Boss / 多套 Boss 攻击模板（沿用 SkeletonKing）。
- 飞碟探索奖励（找飞碟途中给宝箱等）。
- 联机 / 跨局存档解锁。

## 13. 验收标准

- [ ] 三档难度都需要找飞碟 + 按 E 才能召唤 Boss；不再有"时间到自动出 Boss"。
- [ ] 飞碟激活 1s 内可被走出半径打断。
- [ ] Boss 死亡后飞碟变成传送门，玩家按 E 可进入下一关；玩家进度（武器/等级/silver/HP）保留。
- [ ] 玩家拒绝传送门 + 时间过 540s → overtime 开始计时；敌人难度按 30s 一档递增。
- [ ] Overtime 中死亡 → defeat 结算。
- [ ] PC 用 KeyE 交互；Mobile 弹按钮交互。
- [ ] `i18n/en.json` 与 `i18n/zh.json` 键集合一致。
- [ ] `npx tsc --noEmit` / `pnpm build` / `bash .claude/skills/check-contract/check.sh` 全过。

## 14. 实施顺序

1. 写本文档（你正在看的这份）。
2. 改类型与公开导出（`types.ts` / `index.ts`），跑 check-contract。
3. 重写 `systems/teleporters.ts` → `systems/altars.ts`，加 `tickAltars` + `triggerAltarSummon` + `triggerPortalEnter`。
4. 改 `systems/spawning.ts` 的 `checkBossSpawn`，移除 `BOSS_SPAWN_TIME` 强触发，改为响应飞碟 `summoning` 完成事件。
5. 加 overtime 系统（`systems/overtime.ts` 或塞进 spawning 一起），改 `factories/spawnEnemy.ts` / 敌人系数应用处，让 overtime factor 叠到 enemy stat。
6. 实现 portal 进下一关的 tier 推进（`GameInstance.applyAction` 或专门 `systems/tierTransition.ts`）。
7. 客户端：input 加 `interact`，HUD 加指南针 + overtime banner，3D 表现切换飞碟↔传送门。
8. i18n en + zh 同步。
9. 单测：`altars.test.ts`、overtime 系数测试、tier 推进测试；改旧 `spawning.test.ts` 中跟 `BOSS_SPAWN_TIME` 强触发相关的断言。
10. 跑 `tsc --noEmit` / `pnpm build` / `check-contract`。
