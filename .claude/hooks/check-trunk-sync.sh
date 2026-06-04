#!/usr/bin/env bash
# .claude/hooks/check-trunk-sync.sh
#
# SessionStart hook: 在 Claude Code 会话开始时,检查本地分支是否落后于
# 上游 (origin/默认分支). 落后时打印醒目警告,提示开发者先 git pull --rebase
# 再开始改代码,避免在过期内容上工作半天才发现冲突.
#
# 为什么需要:
#   本仓库存在多 agent 并行场景 (Claude Code + linter + 队友 PR + GitHub
#   远程推送同时进行). 之前出过 teleporters → altars 重命名半途中
#   各种系统文件引用不一致的高价冲突. 每次开 session 先扫一眼上游差异
#   能尽早发现 "是不是先 pull 一下" 的需要.
#
# 行为:
#   a. 不在 git 仓库里 → 静默退出 0
#   b. detached HEAD → 静默退出
#   c. 没有 upstream tracking → 兜底用 origin/master 或 origin/main
#   d. git fetch origin (5 秒 timeout, 失败也静默退出, 不阻断离线开发)
#   e. behind=0 → 静默退出
#   f. behind>0 → 在 stderr 打彩色警告 + 推荐命令
#   g. 始终 exit 0 (warning-only, 不阻塞会话启动)
#
# 失败兜底:
#   - python3 / git / timeout 任一不可用 → 静默退出 0
#   - 网络不通 / fetch 卡住 → 5 秒后 timeout, 静默退出 0
#   - settings.json 里 timeout 配 8 秒, 给 fetch 5s + 解析 3s 缓冲
#
# To disable: 注释掉 .claude/settings.json 里的 SessionStart 块.

set -uo pipefail

# 不在 git 仓库里直接退出 (exit 0 = 让会话正常启动)
project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
if ! git -C "$project_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

cd "$project_dir" || exit 0

# 当前分支名 (detached HEAD 时 symbolic-ref 失败 → 静默退出)
branch=$(git symbolic-ref --short -q HEAD 2>/dev/null || echo "")
if [ -z "$branch" ]; then
  exit 0
fi

# 当前分支的 upstream. 没设置 upstream → 兜底用 origin/<默认分支>
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>/dev/null || true)
if [ -z "${upstream:-}" ]; then
  default_branch=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' || echo "")
  if [ -z "$default_branch" ]; then
    # 兜底:猜 master / main
    if git show-ref --verify --quiet refs/remotes/origin/master; then
      default_branch="master"
    elif git show-ref --verify --quiet refs/remotes/origin/main; then
      default_branch="main"
    else
      exit 0
    fi
  fi
  upstream="origin/${default_branch}"
fi

# fetch 一下上游 (静默 + 5 秒超时,失败不影响会话启动).
# 用 timeout / gtimeout 避免离线 / VPN 卡住 session 启动.
if command -v timeout >/dev/null 2>&1; then
  timeout 5 git fetch --quiet origin 2>/dev/null || exit 0
elif command -v gtimeout >/dev/null 2>&1; then
  gtimeout 5 git fetch --quiet origin 2>/dev/null || exit 0
else
  # 没有 timeout 工具 (老 macOS 默认就没有). 退路:不带 timeout 直接 fetch.
  # 风险:网络极慢时会卡住 5-8 秒, 但 settings.json timeout=8 兜底.
  git fetch --quiet origin 2>/dev/null || exit 0
fi

# 算 ahead / behind
ahead_behind=$(git rev-list --left-right --count "HEAD...${upstream}" 2>/dev/null || echo "")
if [ -z "$ahead_behind" ]; then
  exit 0
fi
ahead=$(printf '%s' "$ahead_behind" | awk '{print $1}')
behind=$(printf '%s' "$ahead_behind" | awk '{print $2}')

# 本地领先 (ahead>0, behind=0):有未推送的 commit, 不警告 (用户自己控制何时 push)
# 本地落后 (ahead=0, behind>0):需要 pull
# 分叉 (ahead>0, behind>0):需要 rebase / merge
if [ "${behind:-0}" -eq 0 ]; then
  exit 0
fi

# 终端颜色 (只在 stderr 是 tty 时启用,被管道吃掉时输出纯文本)
if [ -t 2 ]; then
  YELLOW=$'\033[1;33m'
  CYAN=$'\033[1;36m'
  DIM=$'\033[2m'
  RESET=$'\033[0m'
else
  YELLOW=""; CYAN=""; DIM=""; RESET=""
fi

{
  echo ""
  if [ "${ahead:-0}" -gt 0 ]; then
    printf "%s⚠️  Branch %s 与 %s 已分叉 (本地领先 %s / 落后 %s 个 commit)%s\n" \
      "$YELLOW" "$branch" "$upstream" "$ahead" "$behind" "$RESET"
  else
    printf "%s⚠️  Branch %s 落后 %s %s 个 commit%s\n" \
      "$YELLOW" "$branch" "$upstream" "$behind" "$RESET"
  fi
  echo ""
  printf "   %s建议在开始写代码前同步上游改动:%s\n" "$CYAN" "$RESET"
  printf "     %sgit fetch origin%s\n" "$CYAN" "$RESET"
  if [ "${ahead:-0}" -gt 0 ]; then
    printf "     %sgit pull --rebase%s\n" "$CYAN" "$RESET"
  else
    printf "     %sgit pull --ff-only%s  %s# 或 git pull --rebase%s\n" "$CYAN" "$RESET" "$DIM" "$RESET"
  fi
  echo ""
  printf "   %s否则可能在过期内容上改半天才发现冲突 (类似 teleporters → altars 重命名半途的场景).%s\n" "$DIM" "$RESET"
  echo ""
} >&2

exit 0
