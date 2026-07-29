#Requires -Version 5.1
<#
  Marjon - dev-лаунчер (Windows).

  Запускает связки:
    1) Frontend (web+admin) + Backend
    2) Desktop (Electron)   + Backend
    3) Mobile  (Flutter)    + Backend
    4) Owner   (Flutter)    + Backend
    5) Всё вместе
    6) Только Backend

  Каждый сервис поднимается в отдельном окне PowerShell, чтобы логи не смешивались.
  Скрипт ничего не меняет в коде проекта: только запуск и (по запросу) установка
  зависимостей / миграции.

  Запуск: двойной клик по start.cmd  (или:  powershell -ExecutionPolicy Bypass -File .\start.ps1)
  Непереключаемый режим:  .\start.ps1 -Mode front | desktop | mobile | owner | all | backend
#>

[CmdletBinding()]
param(
    [ValidateSet('front', 'desktop', 'mobile', 'owner', 'all', 'backend', '')]
    [string]$Mode = ''
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$Root         = $PSScriptRoot
$BackendDir   = Join-Path $Root 'backend'
$FrontendDir  = Join-Path $Root 'frontend'
$DesktopDir   = Join-Path $Root 'desktop'
$MobileDir    = Join-Path $Root 'mobile'
$OwnerDir     = Join-Path $Root 'owner'

$BackendPort  = 8000
$FrontendPort = 5173

# ── Вывод ─────────────────────────────────────────────────────────────────────
function Write-Head { param([string]$Text) Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Text) Write-Host "  [OK]   $Text" -ForegroundColor Green }
function Write-Info { param([string]$Text) Write-Host "  ->     $Text" -ForegroundColor Gray }
function Write-Warn2{ param([string]$Text) Write-Host "  [!]    $Text" -ForegroundColor Yellow }
function Write-Err2 { param([string]$Text) Write-Host "  [ERR]  $Text" -ForegroundColor Red }

# ── Утилиты ───────────────────────────────────────────────────────────────────
function Test-Cmd {
    param([string]$Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-Port {
    param([string]$HostName = '127.0.0.1', [int]$Port, [int]$TimeoutMs = 700)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $ar = $client.BeginConnect($HostName, $Port, $null, $null)
        if (-not $ar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) { return $false }
        $client.EndConnect($ar)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Get-LanIp {
    $ip = $null
    try {
        $cands = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
                 Where-Object { $_.IPAddress -ne '127.0.0.1' }
        $pref = $cands | Where-Object {
            $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' -or $_.IPAddress -like '172.*'
        } | Select-Object -First 1
        if ($pref) { $ip = $pref.IPAddress }
        elseif ($cands) { $ip = ($cands | Select-Object -First 1).IPAddress }
    } catch {
        try {
            $ip = ([System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
                   Where-Object { $_.AddressFamily -eq 'InterNetwork' } |
                   Select-Object -First 1).IPAddressToString
        } catch { $ip = $null }
    }
    if (-not $ip) { $ip = '127.0.0.1' }
    return $ip
}

function Start-Win {
    param([string]$Title, [string]$WorkDir, [string]$Command)
    $inner = '$Host.UI.RawUI.WindowTitle = ''' + $Title + '''; ' +
             'Set-Location -LiteralPath ''' + $WorkDir + '''; ' +
             $Command
    Start-Process -FilePath 'powershell.exe' `
                  -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $inner) | Out-Null
    Write-Ok "окно запущено: $Title"
}

function Confirm-Yes {
    param([string]$Question, [switch]$DefaultYes)
    if ($DefaultYes) { $suffix = '[Y/n]' } else { $suffix = '[y/N]' }
    $answer = Read-Host "  $Question $suffix"
    if ([string]::IsNullOrWhiteSpace($answer)) { return [bool]$DefaultYes }
    return ($answer -match '^(y|yes|д|да)$')
}

# ── Backend ───────────────────────────────────────────────────────────────────
function Resolve-Python {
    $venvPy = Join-Path $BackendDir '.venv\Scripts\python.exe'
    if (Test-Path -LiteralPath $venvPy) { return $venvPy }

    Write-Warn2 'venv не найден (backend\.venv).'
    if (Confirm-Yes 'Создать venv и установить requirements.txt?' -DefaultYes) {
        $base = $null
        if (Test-Cmd 'py') { $base = 'py' } elseif (Test-Cmd 'python') { $base = 'python' }
        if (-not $base) { Write-Err2 'Python не найден в PATH. Установите Python 3.12+.'; return $null }

        Write-Info 'создаю venv...'
        Push-Location $BackendDir
        try {
            if ($base -eq 'py') { & py -3 -m venv .venv } else { & python -m venv .venv }
            if (-not (Test-Path -LiteralPath $venvPy)) { Write-Err2 'не удалось создать venv'; return $null }
            Write-Info 'ставлю зависимости (это займёт пару минут)...'
            & $venvPy -m pip install --upgrade pip
            & $venvPy -m pip install -r requirements.txt
            Write-Ok 'зависимости установлены'
        } finally {
            Pop-Location
        }
        return $venvPy
    }

    # без venv — пробуем системный python
    if (Test-Cmd 'python') { Write-Warn2 'использую системный python (без venv)'; return 'python' }
    Write-Err2 'Python не найден.'
    return $null
}

function Initialize-BackendEnv {
    $envFile    = Join-Path $BackendDir '.env'
    $envExample = Join-Path $BackendDir '.env.example'
    if (-not (Test-Path -LiteralPath $envFile)) {
        if (Test-Path -LiteralPath $envExample) {
            Copy-Item -LiteralPath $envExample -Destination $envFile
            Write-Warn2 'создан backend\.env из .env.example — проверьте DATABASE_URL и SECRET_KEY'
        } else {
            Write-Warn2 'backend\.env отсутствует и шаблона нет'
        }
    } else {
        Write-Ok 'backend\.env на месте'
    }
    return $envFile
}

function Test-Database {
    param([string]$EnvFile)
    if (-not (Test-Path -LiteralPath $EnvFile)) { return }

    $line = Select-String -LiteralPath $EnvFile -Pattern '^\s*DATABASE_URL\s*=' |
            Select-Object -First 1
    if (-not $line) { return }
    $url = $line.Line

    if ($url -match 'sqlite') { Write-Ok 'БД: SQLite (локальный файл)'; return }
    if ($url -notmatch 'postgres') { return }

    $isLocal = ($url -match 'localhost' -or $url -match '127\.0\.0\.1')
    if (-not $isLocal) { Write-Info 'БД: внешний Postgres (проверка пропущена)'; return }

    if (Test-Port -Port 5432) {
        Write-Ok 'БД: Postgres на localhost:5432 доступен'
        return
    }

    Write-Warn2 'Postgres на localhost:5432 не отвечает — бэкенд не поднимется.'
    $hasDocker = (Test-Cmd 'docker')
    if ($hasDocker) {
        if (Confirm-Yes 'Поднять БД через docker compose (db + minio)?' -DefaultYes) {
            Push-Location $Root
            try {
                & docker compose up -d db minio minio-init
                Write-Info 'ждём готовности Postgres...'
                for ($i = 0; $i -lt 30; $i++) {
                    if (Test-Port -Port 5432) { break }
                    Start-Sleep -Seconds 1
                }
                if (Test-Port -Port 5432) { Write-Ok 'Postgres поднят' } else { Write-Warn2 'Postgres так и не ответил' }
            } catch {
                Write-Err2 "docker compose не сработал: $($_.Exception.Message)"
            } finally {
                Pop-Location
            }
        }
    } else {
        Write-Warn2 'Docker не найден. Варианты: поднять Postgres вручную, либо в backend\.env указать'
        Write-Warn2 'DATABASE_URL=sqlite+aiosqlite:///./app.db (только для локальной разработки).'
    }
}

function Invoke-Migrations {
    param([string]$Python)
    if (-not (Confirm-Yes 'Выполнить миграции (alembic upgrade head + migrate_add_permissions.py)?')) { return }
    Push-Location $BackendDir
    try {
        Write-Info 'alembic upgrade head...'
        & $Python -m alembic upgrade head
        Write-Info 'migrate_add_permissions.py...'
        & $Python migrate_add_permissions.py
        Write-Ok 'миграции выполнены'
    } catch {
        Write-Err2 "миграции упали: $($_.Exception.Message)"
    } finally {
        Pop-Location
    }
}

function Start-Backend {
    Write-Head 'Backend (FastAPI)'

    if (Test-Port -Port $BackendPort) {
        Write-Ok "порт $BackendPort уже занят — считаю, что бэкенд запущен, второй раз не поднимаю"
        return $true
    }

    $py = Resolve-Python
    if (-not $py) { return $false }

    $envFile = Initialize-BackendEnv
    Test-Database -EnvFile $envFile
    Invoke-Migrations -Python $py

    # host 0.0.0.0 — чтобы телефон/планшет в той же сети могли достучаться
    $cmd = '& ''' + $py + ''' -m uvicorn app.main:app --reload --host 0.0.0.0 --port ' + $BackendPort
    Start-Win -Title 'Marjon Backend :8000' -WorkDir $BackendDir -Command $cmd

    Write-Info 'ждём порт 8000...'
    for ($i = 0; $i -lt 40; $i++) {
        if (Test-Port -Port $BackendPort) { break }
        Start-Sleep -Milliseconds 500
    }
    if (Test-Port -Port $BackendPort) {
        Write-Ok "бэкенд отвечает: http://localhost:$BackendPort/docs"
        return $true
    }
    Write-Warn2 'бэкенд пока не ответил — смотрите его окно (ошибки БД/зависимостей)'
    return $false
}

# ── Клиенты ───────────────────────────────────────────────────────────────────
function Start-Frontend {
    Write-Head 'Frontend (React + Vite)'
    if (-not (Test-Cmd 'npm')) { Write-Err2 'npm не найден в PATH (нужен Node.js)'; return }
    if (Test-Port -Port $FrontendPort) { Write-Warn2 "порт $FrontendPort занят — возможно, dev-сервер уже запущен" }

    $cmd = 'if (-not (Test-Path node_modules)) { Write-Host ''npm install...'' -ForegroundColor Yellow; npm install }; npm run dev'
    Start-Win -Title 'Marjon Frontend :5173' -WorkDir $FrontendDir -Command $cmd
    Write-Info "веб:    http://localhost:$FrontendPort/"
    Write-Info "админка: http://localhost:$FrontendPort/admin.html"
}

function Start-Desktop {
    Write-Head 'Desktop (Electron)'
    if (-not (Test-Cmd 'npm')) { Write-Err2 'npm не найден в PATH (нужен Node.js)'; return }

    $cmd = 'if (-not (Test-Path node_modules)) { Write-Host ''npm install...'' -ForegroundColor Yellow; npm install }; npm run dev'
    Start-Win -Title 'Marjon Desktop' -WorkDir $DesktopDir -Command $cmd
    Write-Info 'адрес сервера в десктопе: http://127.0.0.1:8000/api/v1'
}

function Start-FlutterApp {
    param([string]$Title, [string]$Dir, [string]$LanIp)
    Write-Head $Title
    if (-not (Test-Cmd 'flutter')) { Write-Err2 'flutter не найден в PATH — установите Flutter SDK'; return }
    if (-not (Test-Path -LiteralPath $Dir)) { Write-Err2 "нет папки: $Dir"; return }

    $cmd = 'flutter pub get; flutter run'
    Start-Win -Title $Title -WorkDir $Dir -Command $cmd
    Write-Info 'если устройств несколько — flutter спросит, какое выбрать, в своём окне'
    Write-Info ('адрес сервера в приложении: http://' + $LanIp + ':' + $BackendPort + '/api/v1')
}

# ── Итоговая сводка ───────────────────────────────────────────────────────────
function Show-Summary {
    param([string]$LanIp)
    Write-Host ''
    Write-Host '──────────────────────────────────────────────' -ForegroundColor DarkGray
    Write-Host ' Адреса' -ForegroundColor Cyan
    Write-Host ("  API / Swagger : http://localhost:{0}/docs" -f $BackendPort)
    Write-Host ("  Веб           : http://localhost:{0}/" -f $FrontendPort)
    Write-Host ("  Админка       : http://localhost:{0}/admin.html" -f $FrontendPort)
    Write-Host ("  Для телефона  : http://{0}:{1}/api/v1" -f $LanIp, $BackendPort)
    Write-Host '──────────────────────────────────────────────' -ForegroundColor DarkGray
    Write-Host ' Закрыть сервис = закрыть его окно. Телефон должен быть в той же Wi-Fi сети.' -ForegroundColor DarkGray
    Write-Host ''
}

# ── Режимы ────────────────────────────────────────────────────────────────────
function Invoke-Mode {
    param([string]$Selected)
    $lanIp = Get-LanIp

    switch ($Selected) {
        'backend' { Start-Backend | Out-Null }
        'front'   { Start-Backend | Out-Null; Start-Frontend }
        'desktop' { Start-Backend | Out-Null; Start-Desktop }
        'mobile'  { Start-Backend | Out-Null; Start-FlutterApp -Title 'Marjon Mobile (Flutter)' -Dir $MobileDir -LanIp $lanIp }
        'owner'   { Start-Backend | Out-Null; Start-FlutterApp -Title 'Marjon Owner (Flutter)'  -Dir $OwnerDir  -LanIp $lanIp }
        'all'     {
            Start-Backend | Out-Null
            Start-Frontend
            Start-Desktop
            Start-FlutterApp -Title 'Marjon Mobile (Flutter)' -Dir $MobileDir -LanIp $lanIp
            Start-FlutterApp -Title 'Marjon Owner (Flutter)'  -Dir $OwnerDir  -LanIp $lanIp
        }
        default   { return }
    }

    Show-Summary -LanIp $lanIp
}

function Show-Menu {
    Write-Host ''
    Write-Host '=============================================' -ForegroundColor Cyan
    Write-Host '            MARJON - запуск проекта          ' -ForegroundColor Cyan
    Write-Host '=============================================' -ForegroundColor Cyan
    Write-Host '  1) Frontend (веб + админка)  + Backend'
    Write-Host '  2) Desktop (касса/кухня)     + Backend'
    Write-Host '  3) Mobile (Flutter)          + Backend'
    Write-Host '  4) Owner (Flutter)           + Backend'
    Write-Host '  5) Всё вместе'
    Write-Host '  6) Только Backend'
    Write-Host '  0) Выход'
    Write-Host ''
}

# ── Точка входа ───────────────────────────────────────────────────────────────
if ($Mode -ne '') {
    Invoke-Mode -Selected $Mode
    exit 0
}

while ($true) {
    Show-Menu
    $choice = Read-Host 'Выберите пункт'
    switch ($choice) {
        '1' { Invoke-Mode -Selected 'front';   break }
        '2' { Invoke-Mode -Selected 'desktop'; break }
        '3' { Invoke-Mode -Selected 'mobile';  break }
        '4' { Invoke-Mode -Selected 'owner';   break }
        '5' { Invoke-Mode -Selected 'all';     break }
        '6' { Invoke-Mode -Selected 'backend'; break }
        '0' { Write-Host 'Выход.'; exit 0 }
        default { Write-Warn2 'Нет такого пункта. Введите 0-6.'; continue }
    }
    Write-Host ''
    if (-not (Confirm-Yes 'Запустить ещё связку?')) { break }
}

Write-Host 'Готово. Сервисы работают в своих окнах.' -ForegroundColor Green
