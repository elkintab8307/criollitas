$repoPath = "C:\Criollitas"
$logPath = Join-Path $repoPath "logs\auto-backup.log"
New-Item -ItemType Directory -Force -Path (Split-Path $logPath) | Out-Null

$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
Set-Location $repoPath

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$status = git status --porcelain

if ([string]::IsNullOrWhiteSpace($status)) {
    "$timestamp - sin cambios, no se hace commit" | Add-Content -Path $logPath
    exit 0
}

$tempOut = Join-Path $env:TEMP "criollitas-push-out.log"
$tempErr = Join-Path $env:TEMP "criollitas-push-err.log"

git add -A
git commit -m "chore: auto-backup $(Get-Date -Format s)" 1> $tempOut 2> $tempErr
Get-Content $tempOut, $tempErr -ErrorAction SilentlyContinue | Add-Content -Path $logPath

git push origin main 1> $tempOut 2> $tempErr
$exitCode = $LASTEXITCODE
"$timestamp - push exit code: $exitCode" | Add-Content -Path $logPath
Get-Content $tempOut, $tempErr -ErrorAction SilentlyContinue | Add-Content -Path $logPath
Remove-Item $tempOut, $tempErr -ErrorAction SilentlyContinue
