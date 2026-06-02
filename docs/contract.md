# 框架契约（Framework Contract）

> ⚠️ **本文档是项目所有协作者（人 + AI）的强制规范。**
> 违反契约会导致构建失败、KUBEE 模板下游集成中断、或运行时崩溃。
> **修改本文档需 Maintainer 评审 + 全员同步。**

本契约源自参考开发包 `threejs-3d-singleplayer` 的真实约束。下列三类约束**非协商**：

- **🔒 锁定文件** — 不得修改（结构性 / 框架基础设施）
- **📐 锁定签名** — 文件可改，但指定的导出名称、类型形状、方法签名必须保留
- **♻️ 自由区** — 完全自由，重构尽情发挥

---

## 一、🔒 锁定文件清单（绝对不得修改）

通过 Claude Code harness `PreToolUse` hook 强制阻断。如需修改，必须先在团队层达成共识、临时禁用 `.claude/settings.json` 中的 `guard-contract` hook 后再操作，并在 PR 中说明原因。

### 1. 构建与模板基础设施

| 文件 | 原因 |
|---|---|
| `index.html` | 入口写死加载 `/game/client/main.ts` 与 `#game-container`、`#screen-flash`，HTML 结构与 vite 插件强耦合 |
| `vite.config.ts` | `external: ['three']` + `manualChunks` + i18n 插件配置，破坏即生产构建失败 |
| `tsconfig.json` | `include: ["game/**/*", "packages/**/*"]` 与 workspace 路径绑定 |
| `pnpm-workspace.yaml` | 五个 workspace 包路径定义 |
| `package.json`（根） | 启动脚本、workspace 依赖声明 |
| `template.yml` | KUBEE 模板元数据（`id: threejs-3d`） |
| `kubee.json` | KUBEE 发布配置 |

### 2. workspace 包定义

| 文件 | 原因 |
|---|---|
| `game/core/package.json` | 包名 `@minigame/core` 不得修改 |
| `game/client/package.json` | 包名 `@minigame/client` 不得修改 |
| `packages/i18n/package.json` | 包名 `@minigame/i18n` 不得修改 |
| `packages/platform/package.json` | 包名 `@minigame/platform` 不得修改 |
| `packages/render-adapter/package.json` | 包名 `@minigame/render-adapter` 不得修改 |

### 3. 共享基础设施目录

整个目录视为只读：

- `packages/i18n/source/**`
- `packages/platform/source/**`
- `packages/render-adapter/source/**`

这些是 KUBEE 模板提供的共享代码，由模板维护方升级。本项目级修改会在模板再下载时被覆盖。

### 4. 客户端入口

| 文件 | 原因 |
|---|---|
| `game/client/main.ts` | 必须保持 `import { bootGameClient } from '@minigame/client'; bootGameClient();` 两行不变 |

---

## 二、📐 锁定签名（文件可改，但导出契约不变）

这些文件**允许**修改内部实现（重构必然触碰），但**导出名称、签名、类型形状**必须保留。

通过 `.claude/skills/check-contract` skill 手动校验，CI 中也建议跑一次。

### 1. `@minigame/core` 公开 API（`game/core/source/index.ts`）

下列导出**必须始终存在**：

#### 类
```ts
export { GameInstance } from './GameInstance.ts'
```

#### 类型（client 渲染层依赖）
```ts
export type { GameState, GameConfig, GameResult, InputState } from './types.ts'
```

#### 常量
```ts
export {
  TICK_INTERVAL_MS,
  DEFAULT_GAME_CONFIG,
} from './config.ts'
```

> 其他导出（`WEAPON_STATS` / `ENEMY_CONFIGS` / `fireWeapon` 等）**属于内部协作 API**，重构期间可以删改，但需要同步更新 client 侧调用方。

### 2. `GameInstance` 类签名

> 本项目是 single-player 版本（KUBEE 模板的 `threejs-3d-singleplayer`），与多人版签名略有差异。

```ts
export class GameInstance {
  constructor(config: GameConfig)                  // ✅ 单参数
  start(): void                                     // ✅ 必须存在
  tick(): boolean                                   // ✅ 返回值：true=本局结束
  applyAction(input: InputState): void              // ✅ 单参数（无 playerId）
  getState(): GameState                             // ✅ 返回 GameState plain object
  getResult(): GameResult                           // ✅ 必须存在
}
```

**重构期间** `GameInstance` 应当退化为薄 facade，方法体内部委托给 `world` + `systems`，但**外部接口与签名不得改变**。

### 3. `GameState` 形状（client 渲染依赖）

```ts
export interface GameState {
  // —— 框架字段（必须存在）——
  tick: number
  running: boolean
  finished: boolean
  // —— 项目自有字段（可演进）——
  // player / enemies / projectiles / pickups / boss / phase ... 由你们自己定义
}
```

> 框架字段必保。项目字段可以加可以删，但要让 producer（GameInstance）和 consumer（client/source/index.ts）同步。

### 4. i18n 入口键

`i18n/en.json` 和 `i18n/zh.json` **必须同时存在**，且包含 client 当前用到的所有键。增删 i18n 键时两份文件同步更新。

---

## 三、♻️ 自由区（完全自由，鼓励大改）

下面这些区域，请放心重构、原子化、模块化：

- `game/core/source/` 下**除 `index.ts` 之外的所有文件**
- 新增任意子目录：`data/` `components/` `systems/` `behaviors/` `factories/` `stats/` `ai/` `world.ts` 等
- `GameInstance.ts` **内部实现**（保持类签名即可）
- `game/client/source/index.ts` 内部渲染逻辑（保持 `bootGameClient` 导出即可）
- `game/client/source/session/**` 整个 session 目录
- `i18n/*.json` 增减键
- 新增 npm 依赖（推荐：`miniplex` 用于 ECS）

---

## 四、新增内容时的标准流程

### 加一把武器

```
1. 在 game/core/source/data/weapons.ts 新增一行 WeaponDef
2. 如果该武器需要新行为，在 game/core/source/behaviors/ 加一个 .ts
3. 完成
```

**不再需要：** 改 `GameInstance.ts`、加 `fireXxx` 方法、改 switch。

### 加一个敌人

```
1. 在 game/core/source/data/enemies.ts 新增 EnemyDef
2. 如果需要新 AI 状态，在 game/core/source/ai/Brain.ts 的 tagged-union 加一种
3. 完成
```

### 加一个被动 / Tome / 升级

```
1. 在 game/core/source/data/upgrades.ts 新增 UpgradeDef，描述效果（增益类型 / 数值 / tag）
2. stats 管线会自动处理 base / added / increased / more 四层叠加
3. 完成
```

### 加 i18n 文本

```
1. i18n/en.json 加键
2. i18n/zh.json 加键
3. 代码里用 t('your.key')
```

---

## 五、违反契约的后果

| 违反 | 后果 |
|---|---|
| 改了锁定文件 | Claude Code hook 直接拒绝 Edit/Write 请求 |
| 改了锁定签名 | `pnpm build` 类型检查失败 / client 编译失败 |
| 改了 `i18n/` 必需键 | 运行时 `t()` 返回 key 字符串，UI 显示异常 |
| 改了 `template.yml` `kubee.json` | KUBEE 模板分发链路中断 |
| 引入了对 `packages/` 的修改 | 模板再下载时被覆盖，本地修改丢失 |

---

## 六、修改契约本身的流程

如果发现契约约束不合理：

1. 在仓库开 Issue，标题以 `[CONTRACT]` 开头
2. 团队 Maintainer 评审
3. 同步修改：
   - 本文档 `docs/contract.md`
   - `docs/index.html`（自动从 markdown 重生成）
   - `.claude/hooks/guard-contract.sh`（如锁定文件清单变化）
   - `.claude/skills/check-contract/`（如锁定签名变化）
4. PR 标题以 `chore(contract):` 开头，Maintainer 强制 review

---

## 七、相关文件索引

| 路径 | 作用 |
|---|---|
| `docs/contract.md` | 本文档（人读） |
| `docs/index.html` | 网页版文档站，已嵌入本文档 |
| `.claude/settings.json` | 项目级 harness 配置（hook 注册） |
| `.claude/hooks/guard-contract.sh` | PreToolUse hook 守卫脚本 |
| `.claude/skills/check-contract/SKILL.md` | 校验 skill |
| `CLAUDE.md` | AI agent 项目入口（指向本文档） |
| `AGENTS.md` | 同上，多 agent 兼容入口 |

---

最后更新：2026-06-01
契约版本：v1.0.0
