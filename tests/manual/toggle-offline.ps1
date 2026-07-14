# Simula la caída de internet hacia Supabase, para probar el modo offline
# de Criollitas OS manualmente. Requiere PowerShell como administrador
# (edita C:\Windows\System32\drivers\etc\hosts).
#
# Uso:
#   .\toggle-offline.ps1 -Accion bloquear
#   .\toggle-offline.ps1 -Accion restaurar
#
# Alternativa más realista (produce timeout en vez de rechazo instantáneo,
# útil para probar la histéresis del healthcheck):
#   New-NetFirewallRule -DisplayName "Criollitas-test-offline" -Direction Outbound `
#     -RemoteAddress <IP-de-tu-proyecto-supabase> -Protocol TCP -RemotePort 443 -Action Block
#   Remove-NetFirewallRule -DisplayName "Criollitas-test-offline"

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("bloquear", "restaurar")]
    [string]$Accion,

    [string]$Dominio = $env:NEXT_PUBLIC_SUPABASE_URL -replace "^https://", "" -replace "/$", ""
)

if ([string]::IsNullOrWhiteSpace($Dominio)) {
    throw "No se pudo determinar el dominio. Pasa -Dominio <ref>.supabase.co explícitamente."
}

$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$marcador = "# criollitas-test-offline"

if ($Accion -eq "bloquear") {
    Add-Content -Path $hostsPath -Value "127.0.0.1 $Dominio $marcador"
    Write-Host "Bloqueado: $Dominio -> 127.0.0.1"
} else {
    $contenido = Get-Content $hostsPath | Where-Object { $_ -notmatch [regex]::Escape($marcador) }
    Set-Content -Path $hostsPath -Value $contenido -Encoding ASCII
    Write-Host "Restaurado: $Dominio"
}
