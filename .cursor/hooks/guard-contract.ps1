# .cursor/hooks/guard-contract.ps1
#
# Cursor preToolUse hook (PowerShell port for Windows native shells).
# Mirrors scripts/harness/guard-contract.sh — blocks Write/StrReplace on
# framework hard-contract files.
#
# Source of truth: docs/contract.md (section 一: 锁定文件清单).
# Keep $LockedRegex in sync with scripts/harness/guard-contract.sh.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    $payloadText = [Console]::In.ReadToEnd()
} catch {
    exit 0
}

if ([string]::IsNullOrWhiteSpace($payloadText)) { exit 0 }

try {
    $payload = $payloadText | ConvertFrom-Json -ErrorAction Stop
} catch {
    exit 0
}

function Get-First {
    param([object]$obj, [string[]]$keys)
    if ($null -eq $obj) { return $null }
    foreach ($k in $keys) {
        $v = $obj.PSObject.Properties[$k]
        if ($v -and $v.Value) { return $v.Value }
    }
    return $null
}

$toolName = Get-First $payload @('tool_name','toolName','tool')
$toolInput = Get-First $payload @('tool_input','toolInput','input')

$filePath = Get-First $toolInput @('file_path','filePath','path')
if (-not $filePath) {
    $filePath = Get-First $payload @('file_path','filePath','path')
}

switch ($toolName) {
    'Edit'       {}
    'Write'      {}
    'MultiEdit'  {}
    'StrReplace' {}
    default      { exit 0 }
}

if (-not $filePath) { exit 0 }

$projectDir = if ($env:CURSOR_PROJECT_DIR) { $env:CURSOR_PROJECT_DIR }
              elseif ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR }
              else { (Get-Location).Path }

$filePath = ($filePath -replace '\\','/').TrimEnd('/')
$projectDir = ($projectDir -replace '\\','/').TrimEnd('/')

$rel = $filePath
$prefix = "$projectDir/"
if ($filePath.Length -gt $prefix.Length -and
    $filePath.Substring(0, $prefix.Length).ToLowerInvariant() -eq $prefix.ToLowerInvariant()) {
    $rel = $filePath.Substring($prefix.Length)
}
$rel = $rel -replace '^\./',''

# Locked files — keep in sync with scripts/harness/guard-contract.sh LOCKED_REGEX.
$LockedRegex = '^(index\.html|vite\.config\.ts|tsconfig\.json|pnpm-workspace\.yaml|package\.json|template\.yml|kubee\.json|game/core/package\.json|game/client/package\.json|packages/[^/]+/package\.json|packages/i18n/source/.*|packages/platform/source/.*|packages/render-adapter/source/.*|game/client/main\.ts)$'

if ($rel -match $LockedRegex) {
    $msg = @"

[framework-contract] BLOCKED: $rel

This file is part of the framework HARD CONTRACT. Modifying it can break:
  - production build (vite / tsc)
  - KUBEE template deployment
  - workspace package resolution
  - game/client <-> game/core entry path

If you really need to change it:
  1. Read docs/contract.md  ->  section 1: locked files list
  2. Get maintainer approval (open an Issue with [CONTRACT] prefix)
  3. Temporarily disable guard-contract in .claude/settings.json or .cursor/hooks.json
  4. Make the change + update LOCKED_REGEX in
       scripts/harness/guard-contract.sh AND .cursor/hooks/guard-contract.ps1
     if the rules changed
  5. Re-enable the hook before committing

Enforced by Cursor preToolUse hook (PowerShell port) and Claude Code PreToolUse hook.

"@
    [Console]::Error.WriteLine($msg)
    exit 2
}

exit 0
