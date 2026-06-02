# MegaBonk Three.js — 玩法 / 战斗 / 成长 设计

> 本文档以当前代码（`game/core/source/`）为唯一口径，所有数值取自 `config.ts`、`GameInstance.ts`、`upgrades.ts`、`shop.ts`、`quests.ts`。

---

## 一、项目与节奏概览

### 1. 游戏类型

3D Roguelike Survivor — 第三人称固定视角、自动攻击、单局 9 分钟，移动端优先。

### 2. 核心循环

```
选择角色/难度 → 进入竞技场 → 击杀敌人获取经验
      ↑                              ↓
      │                      升级选择强化（武器 / 典籍）
      │                              ↓
      │                Mini-Boss 间歇 / Final Swarm（8–9 分钟）
      │                              ↓
      │              传送门激活（Tier 2/3）→ Boss 战
      │                              ↓
      └──── 结算（银币 / 任务进度） ←── 通关 / 死亡
```

### 3. 操作方式

| 平台 | 移动 | 跳跃 | 滑铲 | 武器 |
|---|---|---|---|---|
| 桌面 | WASD | Space | Shift | 自动 |
| 移动端 | 左侧虚拟摇杆（deadzone 0.15） | 右侧 ⬆️ | 右侧 ⬇️ | 自动 |

### 4. 移动机制

`config.ts:21-27`

| 动作 | 数值 |
|---|---|
| 跳跃力 (`JUMP_FORCE`) | 6.0 |
| 重力 (`GRAVITY`) | 18.0 |
| 滑铲速度倍率 (`SLIDE_SPEED_MULTIPLIER`) | 1.6× |
| 滑铲持续时间 (`SLIDE_DURATION`) | 0.5 秒 |
| 滑铲冷却 (`SLIDE_COOLDOWN`) | 0.3 秒 |
| 兔子跳判定窗口 (`BUNNY_HOP_WINDOW`) | 0.15 秒 |
| 兔子跳奖励 (`BUNNY_HOP_BONUS`) | 1.2× 跳跃高度 |
| 冲刺距离 / 持续 / 冷却 (`DASH_*`) | 6 单位 / 0.2 秒 / 5 秒 |

### 5. 单局节奏（9 分钟 = 540 秒）

| 时间段 | 事件 | 来源 |
|---|---|---|
| 0–60 s | 仅骷髅步兵，刷新间隔 2.0s，最多 30 同屏 | `WAVE_CONFIGS[0]` |
| 60–180 s | 加入僵尸，1.5s/2–4 群，最多 50 同屏，5% 精英 | `WAVE_CONFIGS[1]` |
| 180–300 s | 加入弓手，1.2s/3–5 群，最多 70 同屏，10% 精英；**Mini-Boss 启动**（每 120 秒一只） | `WAVE_CONFIGS[2]`、`spawnEnemies()` |
| 300–420 s | 1.0s/3–6 群，最多 85 同屏，15% 精英；**传送门出现**（Tier 2/3） | `WAVE_CONFIGS[3]`、`TELEPORTER_APPEAR_TIME` |
| 420–480 s | 0.8s/4–8 群，最多 100 同屏，20% 精英 | `WAVE_CONFIGS[4]` |
| 480–540 s | **Final Swarm**：刷新加倍、上限 150、敌速 +20% | `systems/spawning.ts tickSpawning` |
| 540 s | **Boss 出现**（Tier 1 自动；Tier 2/3 须激活完传送门） | `BOSS_SPAWN_TIME` |

### 6. 难度分层

`TIER_CONFIGS` (`config.ts:298`)

| Tier | 名称 | 敌人 HP | 敌人伤害 | 敌人速度 | XP | 银币 | 传送门 | Boss HP |
|---|---|---|---|---|---|---|---|---|
| 1 | Normal | 1.0× | 1.0× | 1.0× | 1.0× | 1.0× | 0 | 1.0× |
| 2 | Hard | 1.5× | 1.3× | 1.1× | 1.5× | 2.0× | 1 | 1.5× |
| 3 | Nightmare | 2.5× | 1.8× | 1.2× | 2.0× | 3.0× | 2（须全激活） | 2.5× |

---

## 二、角色

`CHARACTER_CONFIGS` (`config.ts:66`)

| 角色 | HP | 速度 | 伤害 | 护甲 | 暴击率 | 武器槽 | 起始武器 |
|---|---|---|---|---|---|---|---|
| megachad 超级猛男 | 100 | 4.0 | 1.2× | 0 | 8% | 2 | sword |
| roberto 罗伯托 | 150 | 3.2 | 1.0× | 3 | 5% | 2 | axe |
| skateboard_skeleton 滑板骷髅 | 70 | 5.0 | 0.9× | 0 | 10% | 2 | bone_bouncer |

> 武器槽通过升级解锁更多（见下节）。

---

## 三、经验、升级与武器槽

### 1. XP 公式

`upgrades.ts:21`

```
xpForLevel(L) = floor(10 × (1 + L × 0.35))
```

| L→L+1 | 1→2 | 2→3 | 5→6 | 10→11 | 20→21 | 30→31 | 39→40 |
|---|---|---|---|---|---|---|---|
| 所需 XP | 13 | 17 | 27 | 45 | 80 | 115 | 146 |

最高 40 级（`MAX_LEVEL`）。

### 2. XP 宝石值

`XP_VALUES` (`config.ts:58`)

| 颜色 | XP |
|---|---|
| 绿 (`xp_green`) | 1 |
| 蓝 (`xp_blue`) | 5 |
| 紫 (`xp_purple`) | 25 |
| 橙 (`xp_orange`) | 100 |

### 3. 升级选项流程

升级时**暂停游戏**，固定弹出 **3 个选项**（`systems/player.ts tickLevelUp` 内 `generateUpgradeOptions(player, 3)`，幸运典籍**不**会增加选项数量）。

选项池 (`upgrades.ts:51 buildAvailableOptions`)：

| 类型 (`kind`) | 进入条件 |
|---|---|
| `weapon_upgrade` | 已拥有该武器 且 `weapon.level < 8` |
| `new_weapon` | `player.weapons.length < player.maxWeaponSlots` |
| `tome` | 该典籍未达上限 |

抽取规则：**必保**至少 1 个武器相关选项（如池中存在）；剩下 2 个从全部可用选项里随机不重复抽取。

### 4. 选项稀有度

`RARITY_WEIGHTS` (`upgrades.ts:9`)：

| 稀有度 | 基础权重 |
|---|---|
| common | 55 |
| uncommon | 28 |
| rare | 13 |
| legendary | 4 |

`luck_tome` 每级把 common 权重 −10、rare/legendary 各 +5。**稀有度仅显示用，不改变数值**（保留扩展点）。

### 5. 武器槽解锁

起始 2 槽（`MAX_WEAPONS_DEFAULT`），按等级自动解锁 (`systems/player.ts tickLevelUp`)；任务 q30 还可奖励 +1 永久槽。

| 玩家等级 | 武器槽 |
|---|---|
| 1 | 2 |
| 5 | 3 |
| 10 | 4 |
| 20 | 5 |
| 30 | 6（`MAX_WEAPONS_CAP`，硬上限） |

### 6. 连击系统

`systems/pickups.ts processDeaths + collectPickup` (累加) + `systems/player.ts tickTimers` (归零)

- 击杀后 `comboCount += 1`，`comboTimer = 2.0` 秒
- XP 倍率 = `1 + min(comboCount × 0.05, 1.0)` → 最高 2×
- 2 秒内无击杀则归零

---

## 四、武器系统

### 1. 当前 7 把武器

`WeaponType` (`types.ts:29`) + `WEAPON_STATS` (`config.ts:154`)

| ID | 中文 | 攻击方式 | 关键字段 |
|---|---|---|---|
| `sword` | 大剑 | 弧形剑气，pierce=999 穿透所有 | range / aoeRadius / projectileCount |
| `bone_bouncer` | 弹射骨头 | 直线投射物，命中后弹射 | bounces / speed |
| `axe` | 旋转飞斧 | 绕玩家轨道 | range（轨道半径） / aoeRadius / speed（角速度） |
| `bow` | 左轮手枪（i18n 显示） | 前向高速子弹 | range / pierce / speed |
| `lightning_staff` | 闪电法杖 | 即时连锁打击，无投射物 | chains / range（搜敌） |
| `flame_ring` | 烈焰环 | 玩家身边持续 AoE | range = aoeRadius |
| `shotgun` | 霰弹枪 | 前向扇形多弹 | projectileCount / range / pierce / speed |

### 2. 数值结构

`WeaponLevelStats` (`config.ts:142`)：

```ts
{
  damage,          // 单次伤害
  cooldown,        // 再次开火间隔（秒）
  projectileCount, // 同时发射的投射物 / 弧段数
  bounces,         // 命中后弹射次数
  chains,          // 连锁目标数
  range,           // 搜敌半径 / 火环半径 / 子弹寿命距离
  aoeRadius,       // AoE 命中半径
  pierce,          // 穿透敌人数（999 = 不限）
  speed,           // 投射物速度 / 角速度
}
```

每把武器 8 个等级（数组下标 0–7），第 9 级 = 进化态。

### 3. 取数与开火 — `getWeaponStats(weapon)` (`systems/weapons.ts`)

```ts
const idx = weapon.evolved ? 7 : weapon.level - 1;
const baseStats = WEAPON_STATS[weapon.type][idx];
if (weapon.evolved) {
  return {
    ...baseStats,
    damage: round(baseStats.damage * evolution.damageMultiplier),
    projectileCount: baseStats.projectileCount + 1,
  };
}
return baseStats;
```

每帧 `fireWeapons(dt)`：

```ts
weapon.cooldownTimer -= dt × player.attackSpeedMultiplier;
if (weapon.cooldownTimer <= 0) {
  const stats = getWeaponStats(weapon);
  weapon.cooldownTimer = stats.cooldown;
  fireWeapon(weapon, stats);
}
```

### 4. 各武器每级数值表

#### 🗡️ Sword 大剑

| Lv | 伤害 | CD | 弹数 | 范围 | AoE |
|---|---|---|---|---|---|
| 1 | 12 | 0.80 | 1 | 2.5 | 2.5 |
| 2 | 15 | 0.80 | 1 | 2.8 | 2.8 |
| 3 | 18 | 0.70 | 1 | 3.0 | 3.0 |
| 4 | 22 | 0.70 | 1 | 3.2 | 3.2 |
| 5 | 26 | 0.60 | 1 | 3.5 | 3.5 |
| 6 | 30 | 0.60 | **2** | 3.8 | 3.8 |
| 7 | 35 | 0.50 | 2 | 4.0 | 4.0 |
| 8 | 42 | 0.50 | **3** | 4.5 | 4.5 |

#### 🦴 Bone Bouncer 弹射骨头

| Lv | 伤害 | CD | 弹数 | 弹射 | 速度 |
|---|---|---|---|---|---|
| 1 | 8 | 1.20 | 1 | 2 | 12 |
| 2 | 10 | 1.20 | 1 | 2 | 12 |
| 3 | 10 | 1.20 | 1 | **3** | 12 |
| 4 | 12 | 1.00 | 1 | 3 | 13 |
| 5 | 12 | 1.00 | **2** | **4** | 13 |
| 6 | 16 | 1.00 | 2 | 4 | 14 |
| 7 | 16 | 0.80 | 2 | **5** | 14 |
| 8 | 20 | 0.80 | **3** | **6** | 15 |

#### 🪓 Axe 旋转飞斧

| Lv | 伤害 | CD | 数量 | 半径 | AoE | 角速度 |
|---|---|---|---|---|---|---|
| 1 | 10 | 1.50 | 1 | 3.0 | 1.0 | 4.0 |
| 2 | 12 | 1.50 | 1 | 3.0 | 1.0 | 4.0 |
| 3 | 14 | 1.40 | **2** | 3.5 | 1.0 | 4.5 |
| 4 | 16 | 1.30 | 2 | 3.5 | 1.2 | 4.5 |
| 5 | 18 | 1.20 | **3** | 4.0 | 1.2 | 5.0 |
| 6 | 22 | 1.10 | 3 | 4.0 | 1.4 | 5.0 |
| 7 | 26 | 1.00 | **4** | 4.5 | 1.4 | 5.5 |
| 8 | 32 | 0.90 | 4 | 5.0 | 1.6 | 6.0 |

#### 🔫 Bow 左轮手枪

| Lv | 伤害 | CD | 弹数 | 距离 | 穿透 | 速度 |
|---|---|---|---|---|---|---|
| 1 | 18 | 1.00 | 1 | 30 | 0 | 25 |
| 2 | 22 | 1.00 | 1 | 32 | 0 | 26 |
| 3 | 26 | 0.90 | 1 | 34 | **1** | 27 |
| 4 | 30 | 0.85 | **2** | 36 | 1 | 28 |
| 5 | 35 | 0.80 | 2 | 38 | **2** | 29 |
| 6 | 40 | 0.75 | 2 | 40 | 2 | 30 |
| 7 | 48 | 0.70 | **3** | 42 | **3** | 32 |
| 8 | 58 | 0.60 | 3 | 45 | **4** | 35 |

#### ⚡ Lightning Staff 闪电法杖

| Lv | 伤害 | CD | 链数 | 搜敌范围 |
|---|---|---|---|---|
| 1 | 15 | 2.00 | 3 | 8 |
| 2 | 18 | 2.00 | 3 | 8 |
| 3 | 18 | 2.00 | **4** | **10** |
| 4 | 22 | 1.70 | 4 | 10 |
| 5 | 22 | 1.70 | **5** | **12** |
| 6 | 28 | 1.50 | 5 | 12 |
| 7 | 28 | 1.50 | **6** | **14** |
| 8 | 35 | 1.20 | **8** | **40** |

> ⚠️ Lv 8 搜敌距离从 14 跳到 40，接近全屏。

#### 🔥 Flame Ring 烈焰环

| Lv | 伤害（每 tick） | CD | 半径 |
|---|---|---|---|
| 1 | 4 | 0.50 | 3.5 |
| 2 | 5 | 0.50 | 3.5 |
| 3 | 5 | 0.50 | **4.5** |
| 4 | 7 | **0.40** | 4.5 |
| 5 | 7 | 0.40 | **5.5** |
| 6 | 9 | 0.40 | 5.5 |
| 7 | 9 | **0.30** | **6.5** |
| 8 | 12 | 0.30 | **8.0** |

#### 💥 Shotgun 霰弹枪

| Lv | 伤害（每弹） | CD | 弹数 | 距离 | 穿透 | 速度 |
|---|---|---|---|---|---|---|
| 1 | 8 | 1.40 | 5 | 12 | 0 | 16 |
| 2 | 9 | 1.30 | 5 | 13 | 0 | 17 |
| 3 | 10 | 1.20 | 6 | 14 | 0 | 18 |
| 4 | 12 | 1.10 | 6 | 15 | 0 | 18 |
| 5 | 14 | 1.00 | 7 | 16 | **1** | 19 |
| 6 | 16 | 0.90 | 7 | 17 | 1 | 20 |
| 7 | 18 | 0.80 | 8 | 18 | 1 | 21 |
| 8 | 22 | 0.70 | 9 | 20 | **2** | 22 |

### 5. 武器进化（5 条路径）

`WEAPON_EVOLUTIONS` (`config.ts:278`)

触发条件 (`checkWeaponEvolutions()` `systems/weapons.ts`)：
1. `weapon.level >= 8`（满级）
2. 有进化条目
3. 对应典籍 `tome.level >= requiredTomeLevel`

数值规则：
```
最终 = WEAPON_STATS[type][7]                 // Lv 8 数值
       damage  → round(Lv8.damage × multiplier)
       projectileCount → +1
其他字段（CD/范围/穿透/速度/AoE）保持 Lv 8
```

| 基础武器 | 所需典籍 | 典籍 Lv | 进化名 (zh) | 倍率 | Lv 9 速算 |
|---|---|---|---|---|---|
| sword | attack_speed_tome | 5 | 死刑执行者 | ×2.5 | dmg 105、CD 0.5、4 弧、范围/AoE 4.5 |
| axe | knockback_tome | 3 | 狂战士之斧 | ×2.0 | dmg 64、CD 0.9、5 把、半径 5.0 |
| bone_bouncer | luck_tome | 3 | 骨暴风 | ×2.0 | dmg 40、CD 0.8、4 弹、6 弹射 |
| bow | precision_tome | 3 | 沙漠之鹰 | ×3.0 | dmg 174、CD 0.6、4 弹、4 穿透 |
| lightning_staff | curse_tome | 3 | 雷神 | ×2.5 | dmg 88、CD 1.2、9 链、范围 40 |

> `flame_ring` / `shotgun` 暂无进化路径。如需扩展，在 `config.ts WEAPON_EVOLUTIONS` 加一条即可。

---

## 五、Buff 全览（4 类，共 23 项玩家 + 3 项敌方）

### 1. 关卡内典籍 Tome（10 种）

单局生效，最大等级见下表。**实际数值以代码为准**（i18n 文案有时简化）：

| ID | 中文 | 实际效果（每级） | 上限 | 源代码 |
|---|---|---|---|---|
| `attack_speed_tome` | 攻速典籍 | `attackSpeedMultiplier += 0.10`（影响所有武器 CD 速率） | 5 | `data/tomes.ts` + `stats/recomputePlayerStats.ts` |
| `speed_tome` | 速度典籍 | `speedMult += 0.08` | 5 | `:2421` |
| `attraction_tome` | 吸引典籍 | `pickupRadius += 1.2` | 5 | `:2424` |
| `shield_tome` | 护盾典籍 | `armor += 2` **且** 受伤后再 ×(1−0.05·level) | 5 | `:2427`、`:867`、`:1531`、`:1554`、`:1579` |
| `precision_tome` | 精准典籍 | `critChance += 0.05`，`critDamage += 0.10` | 5 | `:2430-2431` |
| `thorns_tome` | 荆棘典籍 | 每秒对周围敌人造成 `level × 3` 反伤 | 5 | `:2342-2345` |
| `knockback_tome` | 击退典籍 | 击退力 `× (1 + 0.30·level)` | 3 | `:2358-2361` |
| `luck_tome` | 幸运典籍 | 升级稀有度滚点：common −10、rare/legendary 各 +5 | 3 | `upgrades.ts:30-37` |
| `xp_gain_tome` | 经验典籍 | 拾取 XP `× (1 + 0.15·level)` | 5 | `systems/pickups.ts collectPickup` |
| `curse_tome` | 诅咒典籍 | 敌速 `× (1 + 0.10·level)`、击杀 XP `× (1 + 0.20·level)`、刷新间隔 `× max(0.5, 1 − 0.10·level)` | 3 | `:1011-1013`、`:1684`、`:1902-1904` |

> **shield_tome Lv 5** 实际是 +10 护甲 **再** ×0.75 残余 = 双重减伤，比 i18n 描述更强。
>
> **curse_tome** 是「风险 / 收益」型 buff：堆满后敌人变快、生成更频繁，但击杀 XP 和经验拾取整体明显提升。

### 2. 永久商店升级 Shop（8 种）

跨局保留，用银币购买。`SHOP_UPGRADES` (`shop.ts:16`)

| ID | 中文 | 每级效果 | 上限 | 各级费用 | 总费用 |
|---|---|---|---|---|---|
| `max_hp` | 最大生命 | +10 HP | 10 | 50→1000 | 4150 |
| `damage` | 伤害 | +5% 伤害倍率 | 10 | 80→1200 | 5350 |
| `speed` | 速度 | +0.3 移动速度 | 5 | 100→700 | 1850 |
| `crit` | 暴击 | +2% 暴击率 | 5 | 120→900 | 2270 |
| `pickup_radius` | 拾取范围 | +0.5 拾取半径 | 5 | 60→450 | 1130 |
| `armor` | 护甲 | +1 护甲 | 5 | 100→750 | 1900 |
| `xp_gain` | 经验获取 | +10% XP | 5 | 80→650 | 1640 |
| `starting_level` | 初始等级 | +1 起始等级 | 3 | 500→2000 | 3500 |

应用方式：`getShopBonuses()` 累加，`recalculateTomeStats()` 在角色基础值之上叠加。

### 3. 武器进化 (5 种)

见第四节第 5 小节。

### 4. 精英敌人 buff（3 种 — 给敌人）

`factories/spawnEnemy.ts` (mode='wave')，精英怪 50% 概率随机滚一种：

| 类型 | 加成 |
|---|---|
| fast | 速度 ×1.4 |
| tanky | 血量 ×1.5 |
| damage | 伤害 ×1.5 |

---

## 六、最终伤害与生存（乘法栈）

### 1. 玩家造成伤害

```
最终 = round(stats.damage
             × player.damageMultiplier        // 角色基础 + 商店 damage（每级 +5%）
             × (isCrit ? player.critDamage : 1))
isCrit  = Math.random() < player.critChance   // critChance/critDamage 来自角色 + 商店 + precision_tome
```

`damageMultiplier` / `critChance` / `critDamage` 都在 `recalculateTomeStats()` 重算。

### 2. 玩家受到伤害

```
rawDamage   = max(1, enemy.damage − player.armor)        // armor = 角色基础 + shield_tome×2 + 商店 armor
finalDamage = max(1, round(rawDamage × (1 − shield_tome.level × 0.05)))
```

### 3. 攻速

```
weapon.cooldownTimer -= dt × player.attackSpeedMultiplier
attackSpeedMultiplier = 1.0 + attack_speed_tome.level × 0.1
```

### 4. XP 收益（多层叠乘）

```
基础 = pickup.value 或 enemy.xpReward
× (1 + xp_gain_tome.level × 0.15)        // 拾取阶段
× (1 + curse_tome.level × 0.20)          // 击杀阶段
× shop.xpGain (+10% / 级)                 // 商店
× (1 + min(combo × 0.05, 1.0))           // 连击系统
```

---

## 七、敌人系统

### 1. 当前 6 种敌人

`EnemyType` (`types.ts:111`) + `ENEMY_CONFIGS` (`config.ts:113`)

| ID | 中文 | HP | 伤害 | 速度 | 行为 | XP | 攻 CD | 精英 | 首次出现 (s) | 权重 |
|---|---|---|---|---|---|---|---|---|---|---|
| `skeleton_soldier` | 骷髅步兵 | 15 | 5 | 3.0 | chase | 1 | 1.5 | × | 0 | 40 |
| `zombie` | 僵尸 | 30 | 10 | 1.5 | chase | 3 | 2.5 | × | 60 | 25 |
| `skeleton_archer` | 骷髅弓手 | 12 | 7 | 2.5 | ranged（保持 8 距离） | 3 | 3.0 | × | 120 | 15 |
| `skeleton_knight` | 骷髅骑士 | 120 | 20 | 3.5 | charge | 25 | 2.0 | ✓ | 180 | 5 |
| `necromancer` | 死灵法师 | 80 | 15 | 2.0 | ranged（10 距离） | 30 | 4.0 | ✓ | 240 | 3 |
| `gargoyle` | 石像鬼 | 200 | 25 | 4.0 | dive（飞行） | 40 | 3.0 | ✓ | 360 | 2 |

### 2. AI 行为类型

`EnemyBehavior` (`types.ts:119`)：`chase` / `ranged` / `charge` / `dive`

- **chase**：直线追击玩家
- **ranged**：保持 `preferredRange` 距离，远程射击
- **charge**：周期性蓄力 → 高速冲刺
- **dive**：在空中盘旋，俯冲攻击玩家

### 3. Mini-Boss

`spawnMiniBoss()` (`systems/spawning.ts` 内)，从 180 秒开始每 120 秒一只：

- HP = 普通 ×3
- 伤害 = 普通 ×2
- 体型 ×1.5

### 4. Final Swarm（最终狂潮）

触发：`gameTime ∈ [480, 540)`（即第 8–9 分钟）

- 刷新间隔保持，但**最大同屏 = 150**
- 敌人速度 ×1.2（`ai/behaviors/_move.ts` 的 finalSwarm boost）

### 5. Boss 战

`BOSS_SPAWN_TIME = 540 s`，`BOSS_HP = 2000`（再 × `tier.bossHpMultiplier`）

3 阶段（`systems/bossAi.ts tickBossAi` + `ai/bosses/skeletonKing.ts` 的 SKELETON_KING_PHASES + 7 attacks）：

| 阶段 | HP 比例 | 速度 | 攻击池（`chooseBossAttack` `:2189`） |
|---|---|---|---|
| P1 | >60% | 3.0 | melee_sweep / ground_slam / dark_bolt |
| P2 | 30–60% | 4.0 | melee_sweep / ground_slam / summon_wave / charge / dark_bolt |
| P3 | <30% | 5.0（enraged，攻击间隔 1.5s） | aoe_explosion / dark_rain / charge / summon_wave / melee_sweep |

> 攻击间隔：未狂暴 `2.5 + rand(0,1)`，狂暴 `1.5 + rand(0,1)`。

---

## 八、任务系统（29 个）

`QUESTS` (`quests.ts`) — 跨局累积进度，奖励永久解锁。

奖励类型 (`QuestReward.type`)：
- `silver`：直接给银币
- `weapon_unlock`：解锁武器
- `character_unlock`：解锁角色
- `weapon_slot`：永久 +1 武器槽
- `tome_unlock`：解锁典籍

任务大类：
- 击杀数 (kill)：q1–q4
- 存活时间 (survive)
- 累计等级 (level)
- 武器进化 (evolve)
- Boss 击杀 (boss)
- 无伤存活 (no_damage)
- 银币收集 (collect)：q26–q30，包含 q30 = `weapon_slot`

---

## 九、银币与结算

`getResult()` (`GameInstance.ts`)

```
baseSilver  = floor(killCount × 0.5 + level × 5)
victoryBonus = phase === 'victory' ? 100 : 0
runSilver   = silverEarned （局内拾取/宝箱/任务）
totalSilver = round((baseSilver + victoryBonus + runSilver) × tier.silverMultiplier)
```

### 关卡内银币来源

| 来源 | 数额 |
|---|---|
| 银币拾取 (`silver` 类型 pickup) | `pickup.value` |
| 幸运典籍每级附赠 | `+luckTome.level / 拾取` |
| 宝箱 (`CHEST_COUNT=4` 个) | 50–200 随机 |
| 任务 q26/q27/q29 | 100 / 250 / 1000 |

---

## 十、传送门

`TELEPORTER_*` (`config.ts:53`)

- 出现时间：`TELEPORTER_APPEAR_TIME = 300 s`（5 分钟）
- 激活半径：`TELEPORTER_RADIUS = 2.0`
- 激活时长：`TELEPORTER_ACTIVATION_DURATION = 3.0` 秒
- 数量：Tier 1 = 0（Boss 自动），Tier 2 = 1，Tier 3 = 2（须全激活）

---

## 十一、存档结构

`SaveData` (`save.ts`) — `localStorage` 持久化：

```ts
interface SaveData {
  version: number;
  silver: number;                          // 银币余额
  shopLevels: Record<string, number>;      // 商店升级等级
  questsCompleted: string[];               // 已完成任务
  weaponsUnlocked: string[];               // 已解锁武器
  charactersUnlocked: string[];            // 已解锁角色
  extraWeaponSlots: number;                // 任务奖励的额外武器槽
  stats: {
    totalKills: number;
    totalRuns: number;
    bestSurvivalTime: number;
    highestLevel: number;
    bossesDefeated: number;
    totalEvolutions: number;
  };
}
```

---

## 十二、调整指引（改数值快速索引）

| 想做的事 | 改哪里 |
|---|---|
| 调整某武器某级数值 | `config.ts WEAPON_STATS[type][level-1]` |
| 增加新武器等级（>8） | 在数组末尾加项；同时改 `getWeaponStats` 上限 |
| 添加新进化路径 | `config.ts WEAPON_EVOLUTIONS` 加一条；i18n `evolution.<weapon>` 加进化名 |
| 新增典籍效果 | `types.ts TomeType` 加类型；`config.ts TOME_MAX_LEVELS` 加上限；`recalculateTomeStats` 或对应业务路径加结算；i18n `weapon.tome.<id>` 加文案 |
| 调升级选项数量 | `systems/player.ts tickLevelUp` 内 `generateUpgradeOptions(player, 3)` |
| 修改稀有度权重 / luck 加成 | `upgrades.ts RARITY_WEIGHTS` / `rollRarity()` |
| 添加新商店升级 | `shop.ts SHOP_UPGRADES`；`recalculateTomeStats` 读 `shopBonuses['<stat>']`；i18n `shop.<id>` |
| 调难度倍率 | `config.ts TIER_CONFIGS` |
| 调敌人波次 / Final Swarm | `config.ts WAVE_CONFIGS`；`systems/spawning.ts tickSpawning` |
| 调 Boss 时间 / HP | `config.ts BOSS_SPAWN_TIME`、`BOSS_HP` |
