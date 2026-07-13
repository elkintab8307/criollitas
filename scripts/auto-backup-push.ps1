$repoPath = "C:\Criollitas"
$logPath = Join-Path $repoPath "logs\auto-backup.log"
New-Item -ItemType Directory -Force -Path (Split-Path $logPath) | Out-Null

$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
Set-Location $repoPath

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$tempOut = Join-Path $env:TEMP "criollitas-push-out.log"
$tempErr = Join-Path $env:TEMP "criollitas-push-err.log"

function Log-Command {
    param([string]$Label)
    "$timestamp - ${Label}:" | Add-Content -Path $logPath
    Get-Content $tempOut, $tempErr -ErrorAction SilentlyContinue | Add-Content -Path $logPath
}

$status = git status --porcelain
if (-not [string]::IsNullOrWhiteSpace($status)) {
    git add -A
    git commit -m "chore: auto-backup $(Get-Date -Format s)" 1> $tempOut 2> $tempErr
    Log-Command "commit"
}

git fetch origin 1> $tempOut 2> $tempErr
Log-Command "fetch"

git pull --rebase origin main 1> $tempOut 2> $tempErr
$rebaseExit = $LASTEXITCODE
Log-Command "pull --rebase"

if ($rebaseExit -ne 0) {
    git rebase --abort 2>$null
    "$timestamp - rebase fallo (posible conflicto), abortado. Requiere revision manual." | Add-Content -Path $logPath
    Remove-Item $tempOut, $tempErr -ErrorAction SilentlyContinue
    exit 1
}

$ahead = git rev-list --count origin/main..HEAD
if ($ahead -eq "0") {
    "$timestamp - sin commits locales pendientes de subir" | Add-Content -Path $logPath
    Remove-Item $tempOut, $tempErr -ErrorAction SilentlyContinue
    exit 0
}

git push origin main 1> $tempOut 2> $tempErr
Log-Command "push (exit $LASTEXITCODE)"
Remove-Item $tempOut, $tempErr -ErrorAction SilentlyContinue
