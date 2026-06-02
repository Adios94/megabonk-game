# AGENTS.md

> AI agent 入口。请先阅读 [`CLAUDE.md`](./CLAUDE.md)，再读 [`docs/contract.md`](./docs/contract.md) 框架契约。

本项目对一组结构性文件设有硬契约，由 Claude Code harness `PreToolUse` hook 强制阻断违规修改。任何 Edit / Write / MultiEdit 命中锁定文件会被 `exit 2` 直接拒绝。

## 优先级

1. 框架契约（`docs/contract.md`）—— 最高，违反必被阻断
2. `CLAUDE.md` —— 项目结构与改动检查清单
3. `KUBEE.md` —— 模板背景（参考）
4. `CONTRIBUTING.md` —— 协作流程

## 自检命令

改动 `@minigame/core` 公开 API 后，必须跑：

```bash
bash .claude/skills/check-contract/check.sh
```

或在 Claude Code 里：`/check-contract`
