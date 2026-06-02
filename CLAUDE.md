# MegaBonk · Three.js 3D Roguelike Survivor

> **AI / 协作者必读：开始任何代码修改之前，先阅读 [`docs/contract.md`](./docs/contract.md)。**
> 项目对一组结构性文件设有硬契约，违反会被 Claude Code harness 直接阻断（PreToolUse hook）。

## 项目定位

- 引擎：Three.js 0.170 + TypeScript 5.7 + Vite 7.3
- 包管理：pnpm workspace（5 个内部包 `@minigame/{core,client,i18n,platform,render-adapter}`）
- 游戏类型：3D 类幸存者 / 类 Vampire Survivors
- 模板来源：KUBEE `threejs-3d` 模板

## 框架契约（必读）

完整规则：[`docs/contract.md`](./docs/contract.md) 或文档站 `docs/index.html` 的"⚠️ 框架契约"页。

简版速查：

| 类别 | 边界 |
|---|---|
| 🔒 锁定文件 | `index.html` / `vite.config.ts` / `tsconfig.json` / `pnpm-workspace.yaml` / `package.json`（根） / `template.yml` / `kubee.json` / `packages/*/package.json` / `packages/*/source/**` / `game/*/package.json` / `game/client/main.ts` —— **harness 硬阻断 Edit/Write/MultiEdit** |
| 📐 锁定签名 | `@minigame/core` 公开导出（`GameInstance` / `GameState` / `GameConfig` / `GameResult` / `InputState` / `TICK_INTERVAL_MS` / `DEFAULT_GAME_CONFIG`）+ `GameInstance` 类的 5 个方法签名 |
| ♻️ 自由区 | `game/core/source/` 内部除 `index.ts` 外的一切；`game/client/source/index.ts` 渲染逻辑；新增 npm 依赖；新增子目录 |

## 改动前的检查清单

1. 我要改的文件在锁定列表里吗？→ 在 → **停手**，开 Issue 走流程
2. 我要改 `@minigame/core` 公开导出吗？→ 是 → 改完跑 `bash .claude/skills/check-contract/check.sh`
3. 我要改 `i18n/*.json` 吗？→ 是 → en.json + zh.json 必须同步
4. 我要新增依赖吗？→ 可以，但用 `pnpm add` 加在对应 workspace 包

## 校验工具

```bash
# 启动开发服务器
pnpm dev

# 类型检查（提交前必跑）
npx tsc --noEmit

# 生产构建（提交前必跑）
pnpm build

# 框架契约校验
bash .claude/skills/check-contract/check.sh
```

或在 Claude Code 里调用 skill：`/check-contract`

## 当前重构状态

项目正在按"方案 A"重构（数据驱动 + ECS 组件化）。目录架构会演进为：

```
game/core/source/
├── index.ts          ← 公开 API（不变）
├── GameInstance.ts   ← 薄 facade
├── world.ts          ← miniplex world
├── data/             ← 数据表（武器 / 敌人 / 升级 / 波次）
├── components/       ← ECS 数据组件
├── systems/          ← 每帧 tick 的纯函数
├── behaviors/        ← 行为 ID 注册表
├── factories/        ← spawnEnemy / spawnWeapon
├── stats/            ← 四层 stat 管线（base/added/increased/more + tag）
└── ai/               ← Brain 组件 + boss phase script
```

详见 `docs/index.html` 的"架构"页。

## 相关文件索引

| 路径 | 作用 |
|---|---|
| `docs/contract.md` | 框架契约（markdown 源） |
| `docs/index.html` | 文档站，含契约可视化版 |
| `.claude/settings.json` | 项目级 harness 配置（hook 注册） |
| `.claude/hooks/guard-contract.sh` | PreToolUse 守卫脚本 |
| `.claude/skills/check-contract/` | 契约校验 skill |
| `KUBEE.md` | 模板原始说明（保留作为参考） |
| `CONTRIBUTING.md` | 协作流程 |
