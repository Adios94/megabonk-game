#!/usr/bin/env bash
# .claude/hooks/guard-contract.sh
#
# PreToolUse hook: blocks Edit / Write / MultiEdit on files that are part
# of the framework hard contract.
#
# Source of truth for the rules: docs/contract.md (section 一: 锁定文件清单)
#
# To unlock: read docs/contract.md, get maintainer approval, then comment out
# this hook in .claude/settings.json before making the change.

set -uo pipefail

input=$(cat)

# Parse tool_name + tool_input.file_path with python3 (preinstalled on macOS/Linux)
# Use -c (not heredoc) so stdin is free for the JSON pipe.
parsed=$(printf '%s' "$input" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("\t")
    sys.exit(0)
tn = d.get("tool_name", "") or ""
fp = ((d.get("tool_input") or {}).get("file_path", "")) or ""
print(tn + "\t" + fp)
' 2>/dev/null)

# If parsing failed, allow (fail-open to not break unrelated hooks)
[ -z "${parsed:-}" ] && exit 0

IFS=$'\t' read -r tool_name file_path <<< "$parsed"

# Only inspect file-mutating tools
case "$tool_name" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

# No file_path -> nothing to check
[ -z "$file_path" ] && exit 0

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Strip project_dir prefix to get path relative to project root
rel="${file_path#"$project_dir"/}"

# === LOCKED FILES ===
# Anchored to project root. Update this list ONLY together with docs/contract.md.
LOCKED_REGEX='^(index\.html|vite\.config\.ts|tsconfig\.json|pnpm-workspace\.yaml|package\.json|template\.yml|kubee\.json|game/core/package\.json|game/client/package\.json|packages/[^/]+/package\.json|packages/i18n/source/.*|packages/platform/source/.*|packages/render-adapter/source/.*|game/client/main\.ts)$'

if printf '%s' "$rel" | grep -Eq "$LOCKED_REGEX"; then
  cat >&2 <<EOF
🔒 [framework-contract] BLOCKED: $rel

This file is part of the framework HARD CONTRACT. Modifying it can break:
  • production build (vite / tsc)
  • KUBEE template deployment
  • workspace package resolution
  • game/client ↔ game/core entry path

If you really need to change it:
  1. Read docs/contract.md  →  section 一: 锁定文件清单
  2. Get maintainer approval (open an Issue with [CONTRACT] prefix)
  3. Temporarily comment out the guard-contract hook in .claude/settings.json
  4. Make the change + update the LOCKED_REGEX in this script if the rule itself changed
  5. Re-enable the hook before committing

This guard is enforced by Claude Code's PreToolUse hook for all collaborators.
EOF
  exit 2
fi

exit 0
