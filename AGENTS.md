# AGENTS.md

> AI agent 入口。请先阅读 [`CLAUDE.md`](./CLAUDE.md)，再读 [`docs/contract.md`](./docs/contract.md) 框架契约。

本项目对一组结构性文件设有硬契约，由 agent harness `preToolUse` hook 强制阻断违规修改：

- **Claude Code**：`.claude/settings.json` → `PreToolUse`（Edit / Write / MultiEdit）
- **Cursor**：`.cursor/hooks.json` → `preToolUse`（Write / StrReplace）

命中锁定文件会被 `exit 2` 直接拒绝。共享逻辑在 `scripts/harness/`。

## 优先级

1. 框架契约（`docs/contract.md`）—— 最高，违反必被阻断
2. `CLAUDE.md` —— 项目结构与改动检查清单
3. `docs/kubee-template.md` —— 模板背景（参考）
4. `CONTRIBUTING.md` —— 协作流程

## 自检命令

改动 `@minigame/core` 公开 API 后，必须跑：

```bash
bash scripts/harness/check-contract.sh
```

或在 Claude Code 里：`/check-contract`；在 Cursor 里调用 skill `check-contract`。

## Cursor 用户

- Hook 配置：`.cursor/hooks.json`（重启 Cursor 或保存后自动加载）
- 项目规则：`.cursor/rules/`（`framework-contract.mdc` 始终生效）
- Windows 本地跑 shell 脚本需 Git Bash 或 WSL；CI（Ubuntu）无此限制
