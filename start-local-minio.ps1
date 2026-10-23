[CmdletBinding()]
param(
    [string]$StorageRoot = 'D:\MarjonData\minio',
    [string]$EnvFile = (Join-Path $PSScriptRoot '.marjon-dev\backend.env'),
    [int]$ApiPort = 9000,
    [int]$ConsolePort = 9001,
    [switch]$InitializeNew
)

$ErrorActionPreference = 'Stop'
$storagePath = [IO.Path]::GetFullPath($StorageRoot)
$temporaryPath = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
if ($storagePath.StartsWith($temporaryPath + '\', [StringComparison]::OrdinalIgnoreCase) -or $storagePath -eq $temporaryPath) {
    throw 'MinIO data must not be stored in the temporary directory.'
}
$binaryPath = Join-Path $storagePath 'bin\minio.exe'
$dataPath = Join-Path $storagePath 'data'
$logsPath = Join-Path $storagePath 'logs'
if (-not (Test-Path -LiteralPath $binaryPath -PathType Leaf)) { throw "MinIO executable not found: $binaryPath" }
if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) { throw "Backend environment file not found: $EnvFile" }

$credentials = @{}
Get-Content -LiteralPath $EnvFile | ForEach-Object {
    if ($_ -match '^\s*(MINIO_ACCESS_KEY|MINIO_SECRET_KEY)\s*=(.*)$') {
        $credentials[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
    }
}
if (-not $credentials.MINIO_ACCESS_KEY -or -not $credentials.MINIO_SECRET_KEY) {
    throw 'MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required; no default passwords are used.'
}

$hasFormat = (Test-Path -LiteralPath (Join-Path $dataPath '.minio.sys\format.json')) -or (Test-Path -LiteralPath (Join-Path $dataPath '.minio.sys\format.bin'))
if (-not $hasFormat) {
    $entries = @(Get-ChildItem -LiteralPath $dataPath -Force -ErrorAction SilentlyContinue)
    if ($entries.Count -gt 0 -or -not $InitializeNew) {
        throw 'Storage format is missing. Refusing to initialise over existing data. Restore a verified backup first.'
    }
}

$listener = Get-NetTCPConnection -LocalPort $ApiPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if ($existing.ExecutablePath -ne $binaryPath -or $existing.CommandLine -notmatch [regex]::Escape($dataPath)) {
        throw "Port $ApiPort is occupied by another process; it was not stopped."
    }
    $health = Invoke-WebRequest -Uri "http://localhost:$ApiPort/minio/health/cluster" -UseBasicParsing -TimeoutSec 5
    if ($health.StatusCode -ne 200) { throw 'Existing MinIO is not write-ready.' }
    Write-Output "MinIO is already write-ready at localhost:$ApiPort; data: $dataPath"
    return
}

New-Item -ItemType Directory -Path $dataPath,$logsPath -Force | Out-Null
$oldRootUser = $env:MINIO_ROOT_USER
$oldRootPassword = $env:MINIO_ROOT_PASSWORD
try {
    $env:MINIO_ROOT_USER = $credentials.MINIO_ACCESS_KEY
    $env:MINIO_ROOT_PASSWORD = $credentials.MINIO_SECRET_KEY
    $logStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    # API remains reachable by the local Docker backend. The admin console
    # binds only to loopback; no visible command window or default credentials.
    $process = Start-Process -FilePath $binaryPath -ArgumentList @('server', ('"' + $dataPath + '"'), '--address', ":$ApiPort", '--console-address', "127.0.0.1:$ConsolePort") -WorkingDirectory $storagePath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logsPath "$logStamp.out.log") -RedirectStandardError (Join-Path $logsPath "$logStamp.err.log") -PassThru
} finally {
    $env:MINIO_ROOT_USER = $oldRootUser
    $env:MINIO_ROOT_PASSWORD = $oldRootPassword
}

for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($process.HasExited) { throw "MinIO exited; inspect $logsPath" }
    try {
        $health = Invoke-WebRequest -Uri "http://localhost:$ApiPort/minio/health/cluster" -UseBasicParsing -TimeoutSec 2
        if ($health.StatusCode -eq 200) {
            Write-Output "MinIO write-ready at localhost:$ApiPort; PID $($process.Id); data: $dataPath"
            return
        }
    } catch { }
    Start-Sleep -Milliseconds 500
}
throw "MinIO did not become write-ready; inspect $logsPath. Data was not deleted."
