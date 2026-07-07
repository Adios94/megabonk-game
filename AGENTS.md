# AGENTS.md

> AI agent 入口。先读 [`CLAUDE.md`](./CLAUDE.md)。

## 分支状态

当前分支 `godot`：从 Three.js/TypeScript 完整迁移到 Godot 4.x + GDScript。
旧代码在 `main` / `stable`，作为需求参考存在，**不要**改回去。

## 旧契约已作废

原项目的锁定文件契约（`docs/contract.md`、`scripts/harness/check-contract.sh`）针对 TS monorepo，Godot 版本不再适用。`.claude/hooks/` 和 `.cursor/hooks.json` 里的 harness 脚本可能失效或无害误报 —— 遇到直接忽略，别去满足它们。

## 优先级

1. `CLAUDE.md` —— Godot 版本的目录约定与规范
2. `docs/` 里的设计文档 —— 需求规格（数值、机制、内容清单）
3. `CONTRIBUTING.md` —— 协作流程（部分条款针对旧栈，酌情跟随）

## 沿用规则

- `i18n/en.json` 与 `zh.json` 必须键同步。
- 提交前编辑器无红字，主场景 F5 能跑。
