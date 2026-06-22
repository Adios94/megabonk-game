# .cursor/hooks/check-trunk-sync.ps1
#
# Cursor sessionStart hook (PowerShell port for Windows native shells).
# Mirrors scripts/harness/check-trunk-sync.sh — warn when the local branch
# is behind upstream. Always exits 0 (warning-only).

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$projectDir = if ($env:CURSOR_PROJECT_DIR) { $env:CURSOR_PROJECT_DIR }
              elseif ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR }
              else { (Get-Location).Path }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { exit 0 }

$null = git -C $projectDir rev-parse --is-inside-work-tree 2>$null
if ($LASTEXITCODE -ne 0) { exit 0 }

Push-Location $projectDir
try {
    $branch = (git symbolic-ref --short -q HEAD 2>$null).Trim()
    if (-not $branch) { exit 0 }

    $upstream = (git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null).Trim()
    if (-not $upstream) {
        $defaultBranch = ((git symbolic-ref --short refs/remotes/origin/HEAD 2>$null) -replace '^origin/','').Trim()
        if (-not $defaultBranch) {
            $null = git show-ref --verify --quiet refs/remotes/origin/master 2>$null
            if ($LASTEXITCODE -eq 0) {
                $defaultBranch = 'master'
            } else {
                $null = git show-ref --verify --quiet refs/remotes/origin/main 2>$null
                if ($LASTEXITCODE -eq 0) {
                    $defaultBranch = 'main'
                } else {
                    exit 0
                }
            }
        }
        $upstream = "origin/$defaultBranch"
    }

    # Fetch with 5s timeout via background job (no `timeout` command on Windows).
    $fetchJob = Start-Job -ScriptBlock {
        param($d) git -C $d fetch --quiet origin 2>$null
    } -ArgumentList $projectDir
    $done = Wait-Job -Job $fetchJob -Timeout 5
    if (-not $done) {
        Stop-Job  -Job $fetchJob -ErrorAction SilentlyContinue
        Remove-Job -Job $fetchJob -Force -ErrorAction SilentlyContinue
        exit 0
    }
    Remove-Job -Job $fetchJob -Force -ErrorAction SilentlyContinue

    $aheadBehind = (git rev-list --left-right --count "HEAD...$upstream" 2>$null).Trim()
    if (-not $aheadBehind) { exit 0 }

    $parts = $aheadBehind -split '\s+'
    if ($parts.Count -lt 2) { exit 0 }

    [int]$ahead  = $parts[0]
    [int]$behind = $parts[1]

    if ($behind -le 0) { exit 0 }

    $w = [Console]::Error
    $w.WriteLine("")
    if ($ahead -gt 0) {
        $w.WriteLine("[!] Branch $branch 与 $upstream 已分叉 (本地领先 $ahead / 落后 $behind 个 commit)")
    } else {
        $w.WriteLine("[!] Branch $branch 落后 $upstream $behind 个 commit")
    }
    $w.WriteLine("")
    $w.WriteLine("   建议在开始写代码前同步上游改动:")
    $w.WriteLine("     git fetch origin")
    if ($ahead -gt 0) {
        $w.WriteLine("     git pull --rebase")
    } else {
        $w.WriteLine("     git pull --ff-only      # 或 git pull --rebase")
    }
    $w.WriteLine("")
    $w.WriteLine("   否则可能在过期内容上改半天才发现冲突。")
    $w.WriteLine("")
} finally {
    Pop-Location
}

exit 0
