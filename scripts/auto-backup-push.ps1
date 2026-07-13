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

git add -A
git commit -m "chore: auto-backup $(Get-Date -Format s)" | Out-String | Add-Content -Path $logPath
$pushResult = git push origin main 2>&1 | Out-String
"$timestamp - push ejecutado:`n$pushResult" | Add-Content -Path $logPath
