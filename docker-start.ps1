#Requires -Version 5.1
<#
  Marjon - Docker-лаунчер (Windows). Один клик: БД + бэкенд + веб.

  Запуск: двойной клик по docker-start.cmd  (или: powershell -ExecutionPolicy Bypass -File .\docker-start.ps1)
  Режим без вопросов и пауз:  .\docker-start.ps1 -Quiet

  Зачем это вместо ручного запуска:
    - проверяет, что Docker установлен И движок запущен (docker info)
    - не даёт запуститься, если порты 8000/5173 заняты чужими процессами
    - при падении сборки/контейнеров показывает логи, а не молча выходит
    - ждёт реальной готовности бэкенда и веба (healthcheck, не просто порт)
#>

[CmdletBinding()]
param(
    [switch]$Quiet,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$Root = $PSScriptRoot
$BackendUrl = 'http://localhost:8000/docs'
$FrontendUrl = 'http://localhost:5173/'
$BackendPort = 8000
$FrontendPort = 5173

# ── Вывод ─────────────────────────────────────────────────────────────────────
function Write-Head { param([string]$Text) Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Text) Write-Host "  [OK]   $Text" -ForegroundColor Green }
function Write-Info { param([string]$Text) Write-Host "  ->     $Text" -ForegroundColor Gray }
function Write-Warn2{ param([string]$Text) Write-Host "  [!]    $Text" -ForegroundColor Yellow }
function Write-Err2 { param([string]$Text) Write-Host "  [ERR]  $Text" -ForegroundColor Red }

function Test-Cmd {
    param([string]$Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-Port {
    param([int]$Port, [int]$TimeoutMs = 700)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $ar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $ar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) { return $false }
        $client.EndConnect($ar)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Wait-Url {
    param([string]$Url, [string]$Label, [int]$TimeoutSec = 180)
    Write-Info "жду готовности: $Label ($Url)..."
    for ($i = 0; $i -lt $TimeoutSec; $i++) {
        if (Test-Port -Port ([System.Uri]$Url).Port -TimeoutMs 400) {
            try {
                $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
                if ($r.StatusCode -eq 200) { Write-Ok "$Label готов"; return $true }
            } catch { }
        }
        Start-Sleep -Seconds 1
    }
    Write-Warn2 "$Label так и не ответил за $TimeoutSec сек."
    return $false
}

function Get-LanIp {
    $ip = $null
    try {
        $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop |
                 Where-Object { $_.NextHop -ne '0.0.0.0' } |
                 Sort-Object -Property RouteMetric, ifMetric |
                 Select-Object -First 1
        if ($route) {
            $ip = (Get-NetIPAddress -InterfaceIndex $route.ifIndex -AddressFamily IPv4 -ErrorAction Stop |
                   Where-Object { $_.IPAddress -ne '127.0.0.1' } |
                   Select-Object -First 1).IPAddress
        }
    } catch { $ip = $null }
    if (-not $ip) { $ip = '127.0.0.1' }
    return $ip
}

function Show-Summary {
    $lanIp = Get-LanIp
    Write-Host ''
    Write-Host '──────────────────────────────────────────────' -ForegroundColor DarkGray
    Write-Host ' Адреса' -ForegroundColor Cyan
    Write-Host ("  Веб           : http://localhost:{0}/" -f $FrontendPort)
    Write-Host ("  Админка       : http://localhost:{0}/admin.html" -f $FrontendPort)
    Write-Host ("  API / Swagger : http://localhost:{0}/docs" -f $BackendPort)
    if ($lanIp -ne '127.0.0.1') {
        Write-Host ("  С телефона    : http://{0}:{1}/  (API: http://{0}:{1}/api/v1)" -f $lanIp, $FrontendPort)
    }
    Write-Host '──────────────────────────────────────────────' -ForegroundColor DarkGray
    Write-Host ' Вход: +998900078779 / 102938   (PIN сотрудника: 1111)'
    Write-Host ' Логи      : docker compose logs -f backend'
    Write-Host ' Остановить: docker compose down'
    Write-Host ' Сбросить БД: docker compose down -v'
    Write-Host ''
}

# ── Проверки окружения ────────────────────────────────────────────────────────
if (-not (Test-Cmd 'docker')) {
    Write-Err2 'Docker не найден в PATH.'
    Write-Warn2 'Установите Docker Desktop: https://www.docker.com/products/docker-desktop/'
    Write-Warn2 'И перезапустите терминал/компьютер после установки.'
    exit 1
}

$engineInfo = $null
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try { $engineInfo = docker info 2>&1 | Out-String } catch { }
$ErrorActionPreference = $prevEap
if (-not $engineInfo -or $engineInfo -notmatch 'Server Version|Server:' -or $LASTEXITCODE -ne 0) {
    Write-Err2 'Docker установлен, но движок не запущен.'
    Write-Warn2 'Откройте Docker Desktop и дождитесь статуса "Engine running", затем повторите.'
    exit 1
}
Write-Ok 'Docker: движок запущен'

$composeInfo = $null
$ErrorActionPreference = 'Continue'
try { $composeInfo = docker compose version 2>&1 | Out-String } catch { }
$ErrorActionPreference = $prevEap
if (-not $composeInfo -or $LASTEXITCODE -ne 0) {
    Write-Err2 'Плагин docker compose не найден.'
    Write-Warn2 'Включите его в настройках Docker Desktop (Settings -> General -> "Use Docker Compose v2").'
    exit 1
}
Write-Ok 'Docker Compose: доступен'

foreach ($p in @($BackendPort, $FrontendPort)) {
    if (Test-Port -Port $p) {
        Write-Warn2 "Порт $p уже занят. Возможно, работают старые контейнеры или ручной запуск (start.cmd)."
        Write-Warn2 'Сначала остановите их: docker compose down, и закройте окна ручного запуска.'
        if (-not $Quiet) {
            $answer = Read-Host '  Продолжить несмотря на это? [y/N]'
            if ($answer -notmatch '^(y|yes|д|да)$') { Write-Info 'Отменено.'; exit 0 }
        } else {
            exit 1
        }
    }
}

# ── Запуск ────────────────────────────────────────────────────────────────────
Write-Head 'Marjon: сборка и запуск контейнеров (первый раз ~5-10 минут)'
Push-Location $Root
try {
    & docker compose up -d --build
    if ($LASTEXITCODE -ne 0) {
        Write-Err2 'docker compose up не сработал. Последние логи:'
        & docker compose logs --tail 50 backend frontend 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        exit 1
    }
} finally {
    Pop-Location
}
Write-Ok 'Контейнеры запущены'

$backendOk = Wait-Url -Url $BackendUrl -Label 'Backend' -TimeoutSec 180
$frontendOk = Wait-Url -Url $FrontendUrl -Label 'Frontend' -TimeoutSec 120

if (-not $backendOk) {
    Write-Warn2 'Бэкенд не поднялся. Смотрите логи: docker compose logs backend'
    Write-Warn2 'Ключевые строки идут с префиксом [init] (ожидание БД / миграции / сид).'
}

Show-Summary

if ($frontendOk -and -not $NoBrowser) {
    try { Start-Process $FrontendUrl } catch { }
}

if (-not $Quiet) {
    Write-Host ''
    Read-Host 'Нажмите Enter, чтобы закрыть окно (контейнеры продолжат работать)'
}
