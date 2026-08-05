$ports = @(8000, 5173)
$procIds = @()
foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) { $procIds += $c.OwningProcess }
}
$procIds = $procIds | Select-Object -Unique
foreach ($p in $procIds) {
    try {
        $proc = Get-Process -Id $p -ErrorAction Stop
        Stop-Process -Id $p -Force
        Write-Host ("killed PID {0} ({1})" -f $p, $proc.ProcessName)
    } catch {
        Write-Host ("could not kill PID {0}: {1}" -f $p, $_.Exception.Message)
    }
}
Get-Process electron -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    Write-Host ("killed electron PID {0}" -f $_.Id)
}
Write-Host "done"
