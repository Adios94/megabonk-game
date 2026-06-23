# MegaBonk · Three.js 3D Roguelike Survivor

一款基于 **Three.js + TypeScript** 的 3D 网页肉鸽生存游戏，灵感来自 Vampire Survivors / megabonk。固定视角、自动攻击、单局 9 分钟、移动端优先。

> 📘 **完整设计文档**：本地打开 [`docs/index.html`](./docs/index.html) 或阅读 [`docs/design.md`](./docs/design.md)
> 🤝 **协作者必读**：[`docs/contract.md`](./docs/contract.md) — 框架契约（harness 强制）
> 📐 **v0.5 策划草案**：见 `docs/index.html` 的「⚙️ 扩展设计总览」/「羁绊」/「遗物」/「消耗品」section（标 `new` 紫色徽章），实现进度跟踪见 [issue #11](https://github.com/Adios94/megabonk-game/issues/11)
> 📐 **v0.5 策划草案**：见 `docs/index.html` 的「⚙️ 扩展设计总览」/「羁绊」/「遗物」/「消耗品」section（标 `new` 紫色徽章），实现进度跟踪见 [issue #11](https://github.com/Adios94/megabonk-game/issues/11)

## 快速开始

```bash
pnpm install            # 安装依赖
pnpm dev                # 启动开发服务器 (http://localhost:15173)
pnpm build              # 生产构建
npx tsc --noEmit        # 类型检查（提交前必跑）
bash scripts/harness/check-contract.sh        # 框架契约校验
```

## 技术栈

| 技术 | 版本 | 用途 |
|---|---|---|
| Three.js | 0.170 | 3D 渲染 |
| TypeScript | 5.7 | 类型安全 |
| Vite | 7.3 | 开发 / 构建 |
| pnpm workspace | — | 5 个内部包管理 |
| miniplex | — | ECS（实体组件系统） |

## 游戏功能

- **3 个可选角色** — Megachad（均衡）/ Roberto（坦克）/ Skateboard Skeleton（速度）
- **7 种武器 + 5 条进化路径** — 大剑、弹射骨头、旋转飞斧、左轮、闪电法杖、烈焰环、霰弹枪
- **10 种典籍（被动）** — 攻速 / 幸运 / 荆棘 / 护盾 / XP / 吸引 / 诅咒 / 精准 / 击退 / 速度
- **6 种敌人 + 4 种 AI 行为** — chase / ranged / charge / dive，含精英 / Mini-Boss / Boss
- **3 阶段 Boss 战** — 7 种攻击模式 + 狂暴态
- **8 种永久商店升级** — 银币购买，跨局保留
- **29 个任务** — 击杀 / 存活 / 进化 / 银币目标，永久解锁奖励
- **3 个难度** — Normal / Hard / Nightmare（敌人数值 + 银币倍率 + 传送门）
- **充能神殿（Charge Shrine）** — 站立读条 → 4 选 1 永久增益（16 种奖励 × 3 稀有度池）
- **MegaBonk 移动机制** — 跳跃 / 滑铲 / 兔子跳 / Dash 短无敌
- **连击系统** — 击杀串联，XP 倍率最高 2×
- **9 分钟单局节奏** — 5 波 → Mini-Boss → Final Swarm → Boss

## 项目结构（Phase 1-7 重构后）

```
megabonk-game/
├── game/
│   ├── core/source/                  ← 纯逻辑层（不依赖 Three.js）
│   │   ├── GameInstance.ts           ← 薄 facade（~350 行，方法委托给 systems）
│   │   ├── types.ts                  ← TypeScript 类型定义
│   │   ├── config.ts                 ← 所有数值常量（武器表 / 角色 / 难度 ...）
│   │   ├── world.ts                  ← miniplex world
│   │   ├── data/                     ← 数据驱动配置
│   │   │   ├── weapons.ts            ← WeaponDef + WEAPONS table
│   │   │   ├── enemies.ts            ← EnemyDef + ENEMIES table
│   │   │   ├── tomes.ts              ← TomeDef + TOMES table
│   │   │   └── shrineRewards.ts      ← Charge Shrine 奖励池
│   │   ├── systems/                  ← 每帧 dispatch 的纯函数
│   │   │   ├── player.ts / dash / 跳跃 / 升级
│   │   │   ├── weapons.ts / projectiles.ts / collisions.ts
│   │   │   ├── pickups.ts / spawning.ts / aiSystem.ts / bossAi.ts
│   │   │   ├── shrines.ts            ← 充能神殿状态机
│   │   │   └── teleporters.ts / chests.ts / ...
│   │   ├── stats/                    ← 4 层 stat 管线（PoE 风格 base/added/increased/more）
│   │   ├── behaviors/                ← 武器行为注册表
│   │   ├── ai/                       ← 敌人 brain + boss phase script
│   │   └── factories/spawnEnemy.ts   ← 敌人工厂
│   └── client/source/                ← 渲染层
│       ├── main.ts                   ← 🔒 入口（不可改）
│       └── index.ts                  ← Three.js 场景 / HUD / VFX / 输入
├── packages/                         ← 🔒 KUBEE 模板共享包（i18n / platform / render-adapter）
├── i18n/{en,zh}.json                 ← 多语言文本（必须同步）
├── docs/
│   ├── index.html                    ← 📘 完整设计文档（推荐入口）
│   ├── contract.md                   ← ⚠️ 框架契约
│   ├── design.md                     ← 玩法 / 战斗 / 成长设计
│   └── tech.md                       ← 技术架构
├── level-editor/                     ← 关卡编辑工具
└── public/models/                    ← 3D 模型资源（GLTF / GLB）
```

## 参与开发

### 改数值（最常见）

| 想做什么 | 改哪里 |
|---|---|
| 调武器某级数值 | `config.ts WEAPON_STATS[type][level-1]` |
| 加新武器 | `data/weapons.ts` 加 `WeaponDef` + 必要时 `behaviors/<id>.ts` 注册行为 |
| 加新敌人 | `data/enemies.ts` 加 `EnemyDef`（behavior: chase/ranged/charge/dive） |
| 加新典籍 | `data/tomes.ts` 加 `TomeDef`（modifier 列表） + `TOME_MAX_LEVELS` |
| 加 Shrine 奖励 | `data/shrineRewards.ts` 加一行 + 必要时 `systems/shrines.ts` 加 case |
| 调难度 | `config.ts TIER_CONFIGS` |
| 调 Boss | `config.ts BOSS_*` + `ai/bosses/skeletonKing.ts` |

### 改画面 / UI

修改 `game/client/source/index.ts` —— Three.js 场景、相机、HUD、粒子、动画。

### 加 i18n 文本

```typescript
import { t } from '@minigame/i18n'
t('hud.level', { level: '5' })
```

`i18n/en.json` 与 `i18n/zh.json` **必须同步**（contract 强制校验）。

### 做关卡

阅读 [`level-editor/WORKFLOW.md`](./level-editor/WORKFLOW.md) 完整流程：

1. 用 `public/models/` 里的模型在 Blender 拼接场景
2. 用 `col_` 前缀 Empty 标记碰撞
3. 用 `spawn_player` / `spawn_boss` 标记生成点
4. 导出 `.glb` → 放到 `public/models/levels/`

> ⚠️ 不能自行添加新模型文件，必须使用已有资源。

## 框架契约（重要）

本项目对一组结构性文件设有**硬契约**，违反会被 Claude Code harness 直接阻断（PreToolUse hook）。完整规则见 [`docs/contract.md`](./docs/contract.md)，简版速查：

| 类别 | 边界 |
|---|---|
| 🔒 锁定文件 | `index.html` / `vite.config.ts` / `tsconfig.json` / `pnpm-workspace.yaml` / `package.json`（根） / `template.yml` / `kubee.json` / `packages/*/package.json` / `packages/*/source/**` / `game/*/package.json` / `game/client/main.ts` |
| 📐 锁定签名 | `@minigame/core` 公开导出 + `GameInstance` 类 5 个方法签名 |
| ♻️ 自由区 | `game/core/source/` 内部除 `index.ts` / `game/client/source/index.ts` 渲染逻辑 / 新增 npm 依赖 / 新增子目录 |

## 相关文档

| 文档 | 内容 |
|---|---|
| [`docs/index.html`](./docs/index.html) | 📘 **完整设计文档站**（推荐入口，分页可读） |
| [`docs/contract.md`](./docs/contract.md) | ⚠️ 框架契约（harness 强制） |
| [`docs/design.md`](./docs/design.md) | 玩法 / 战斗 / 成长 / 充能神殿设计 |
| [`docs/tech.md`](./docs/tech.md) | 技术架构与性能 |
| [`docs/assets.md`](./docs/assets.md) | 美术资源清单 |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | 贡献指南（Fork → PR） |
| [`level-editor/WORKFLOW.md`](./level-editor/WORKFLOW.md) | 关卡制作工作流 |
| [`docs/kubee-template.md`](./docs/kubee-template.md) | KUBEE 模板原始说明 |
| [`CLAUDE.md`](./CLAUDE.md) | AI Agent 入口（指向契约） |

## 参与贡献

欢迎 PR！请先阅读 [`CONTRIBUTING.md`](./CONTRIBUTING.md) 与 [`docs/contract.md`](./docs/contract.md)。提交前确保：

```bash
npx tsc --noEmit                              # 类型检查
pnpm build                                    # 生产构建
bash scripts/harness/check-contract.sh        # 框架契约校验
```

## License

MIT
