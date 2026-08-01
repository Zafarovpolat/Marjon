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
    # Берём адрес интерфейса, через который идёт маршрут ПО УМОЛЧАНИЮ — это реальная
    # сеть (Wi-Fi/Ethernet). Иначе выбирался виртуальный адаптер VirtualBox/Hyper-V/WSL
    # (192.168.56.x, 172.17.x и подобные), и с телефона адрес был недоступен.
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

    # Фолбэк: любой приватный адрес, кроме известных виртуальных диапазонов и адаптеров
    if (-not $ip) {
        try {
            $virtualNames = '*VirtualBox*', '*Hyper-V*', '*VMware*', '*WSL*', '*Loopback*', '*vEthernet*'
            $cands = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
                     Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '192.168.56.*' -and $_.IPAddress -notlike '169.254.*' }
            foreach ($c in $cands) {
                $alias = $c.InterfaceAlias
                $isVirtual = $false
                foreach ($n in $virtualNames) { if ($alias -like $n) { $isVirtual = $true } }
                if (-not $isVirtual) { $ip = $c.IPAddress; break }
            }
            if (-not $ip -and $cands) { $ip = ($cands | Select-Object -First 1).IPAddress }
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
    Repair-EnvAscii -EnvFile $envFile
    return $envFile
}

function Repair-EnvAscii {
    param([string]$EnvFile)
    # slowapi/starlette читают .env СИСТЕМНОЙ кодировкой (cp1252/cp1251), поэтому любой
    # не-ASCII символ (русский комментарий, рамки ──) валит старт бэкенда:
    # UnicodeDecodeError: 'charmap' codec can't decode byte ...
    if (-not (Test-Path -LiteralPath $EnvFile)) { return }
    try {
        $bytes = [System.IO.File]::ReadAllBytes($EnvFile)
        $hasNonAscii = $false
        foreach ($b in $bytes) { if ($b -gt 127) { $hasNonAscii = $true; break } }
        if (-not $hasNonAscii) { return }

        Write-Warn2 'В backend\.env есть не-ASCII символы — бэкенд упадёт с UnicodeDecodeError.'
        if (-not (Confirm-Yes 'Убрать их (комментарии с кириллицей/рамками)?' -DefaultYes)) { return }

        Copy-Item -LiteralPath $EnvFile -Destination ($EnvFile + '.backup') -Force
        $lines = [System.IO.File]::ReadAllLines($EnvFile, [System.Text.Encoding]::UTF8)
        $clean = @()
        $dropped = 0
        foreach ($line in $lines) {
            if ($line -match '[^\x00-\x7F]') {
                if ($line.TrimStart().StartsWith('#') -or $line.Trim() -eq '') { $dropped++; continue }
                # строка с настройкой — оставляем, но предупреждаем
                Write-Warn2 ("не-ASCII в значении настройки, проверьте вручную: " + $line.Split('=')[0])
            }
            $clean += $line
        }
        [System.IO.File]::WriteAllLines($EnvFile, $clean, (New-Object System.Text.UTF8Encoding($false)))
        Write-Ok ("backend\.env приведён к ASCII (удалено строк-комментариев: $dropped), копия в .env.backup")
    } catch {
        Write-Err2 ("не удалось проверить .env: {0}" -f $_.Exception.Message)
    }
}

function Test-DbConnection {
    param([string]$Python)
    # Открытый порт != рабочие креды. Пробуем реально подключиться настройками приложения,
    # иначе неверный пароль вылезал 400-строчным трейсбеком уже при логине.
    if (-not $Python) { return }
    $probe = @(
        'import asyncio, sys',
        'from app.config import settings',
        'from sqlalchemy import text',
        'from sqlalchemy.ext.asyncio import create_async_engine',
        '',
        'async def main():',
        '    engine = create_async_engine(settings.database_url)',
        '    try:',
        '        async with engine.connect() as conn:',
        '            await conn.execute(text("SELECT 1"))',
        '        print("DB_OK")',
        '    except Exception as exc:',
        '        print("DB_FAIL|" + type(exc).__name__ + "|" + str(exc).replace(chr(10), " ")[:300])',
        '        sys.exit(1)',
        '    finally:',
        '        await engine.dispose()',
        '',
        'asyncio.run(main())'
    ) -join "`r`n"

    $tmp = Join-Path $env:TEMP 'marjon_db_probe.py'
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Push-Location $BackendDir
    try {
        Set-Content -LiteralPath $tmp -Value $probe -Encoding UTF8
        $out = & $Python $tmp 2>&1
        $text = ($out | Out-String)
        if ($text -match 'DB_OK') {
            Write-Ok 'БД: подключение проверено'
            return
        }
        Write-Err2 'БД: подключиться НЕ удалось — бэкенд будет отдавать 500 на любой запрос.'
        if ($text -match 'InvalidPasswordError') {
            Write-Warn2 'Неверный пароль пользователя БД. Либо на порту 5432 стоит другой Postgres.'
            Write-Warn2 'Быстрое решение для теста — перейти на SQLite: в backend\.env указать'
            Write-Host  '         DATABASE_URL=sqlite+aiosqlite:///./app.db' -ForegroundColor DarkGray
            Write-Warn2 'затем: python create_tables.py, python migrate_add_permissions.py, python seed.py'
        }
        elseif ($text -match 'InvalidCatalogName|does not exist') {
            Write-Warn2 'Базы с таким именем нет — создайте её или используйте docker compose up -d db.'
        }
        else {
            $line = ($out | Where-Object { $_ -match 'DB_FAIL' } | Select-Object -First 1)
            if ($line) { Write-Warn2 ([string]$line) }
        }
    } catch {
        Write-Warn2 ("проверку подключения выполнить не удалось: {0}" -f $_.Exception.Message)
    } finally {
        Pop-Location
        Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue
        $ErrorActionPreference = $prevEap
    }
}

function Test-Database {
    param([string]$EnvFile, [string]$Python)
    if (-not (Test-Path -LiteralPath $EnvFile)) { return }

    $line = Select-String -LiteralPath $EnvFile -Pattern '^\s*DATABASE_URL\s*=' |
            Select-Object -First 1
    if (-not $line) { return }
    $url = $line.Line

    if ($url -match 'sqlite') { Write-Ok 'БД: SQLite (локальный файл)'; Test-DbConnection -Python $Python; return }
    if ($url -notmatch 'postgres') { return }

    $isLocal = ($url -match 'localhost' -or $url -match '127\.0\.0\.1')
    if (-not $isLocal) { Write-Info 'БД: внешний Postgres (проверка пропущена)'; return }

    if (Test-Port -Port 5432) {
        Write-Ok 'БД: Postgres на localhost:5432 отвечает'
        Test-DbConnection -Python $Python
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

function Test-BackendDeps {
    param([string]$Python)
    $probe = 'import fastapi, uvicorn, sqlalchemy, alembic, slowapi, pydantic_settings, aiosqlite'
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Python -c $probe 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Ok 'зависимости бэкенда на месте'; return $true }

        Write-Warn2 'в venv не хватает зависимостей (например slowapi) — бэкенд не запустится'
        if (-not (Confirm-Yes 'Установить/обновить requirements.txt в venv?' -DefaultYes)) { return $false }

        Push-Location $BackendDir
        try {
            Write-Info 'pip install -r requirements.txt (несколько минут)...'
            & $Python -m pip install -r requirements.txt
            if ($LASTEXITCODE -ne 0) {
                Write-Err2 "pip install завершился с ошибкой (код $LASTEXITCODE) — см. вывод выше"
                return $false
            }
        } finally {
            Pop-Location
        }

        & $Python -c $probe 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Ok 'зависимости установлены'; return $true }
        Write-Err2 'зависимости всё ещё неполные — проверьте вывод pip'
        return $false
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

function Show-PythonInfo {
    param([string]$Python)
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $ver = & $Python -c "import sys; print('{}.{}'.format(sys.version_info[0], sys.version_info[1]))" 2>$null
        if ($LASTEXITCODE -eq 0 -and $ver) {
            $ver = ($ver | Select-Object -First 1).ToString().Trim()
            Write-Info "Python: $ver"
            $parts = $ver.Split('.')
            if ($parts.Count -ge 2 -and [int]$parts[0] -eq 3 -and [int]$parts[1] -ge 13) {
                Write-Warn2 "Python $ver очень свежий — часть пакетов может не иметь готовых wheel'ов."
                Write-Warn2 'Если pip падает на сборке пакета — используйте Python 3.12 для venv.'
            }
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

function Invoke-Migrations {
    param([string]$Python)
    if (-not (Confirm-Yes 'Выполнить миграции (alembic upgrade head + migrate_add_permissions.py)?')) { return }

    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Push-Location $BackendDir
    try {
        Write-Info 'alembic upgrade head...'
        $out  = & $Python -m alembic upgrade head 2>&1
        $code = $LASTEXITCODE
        $text = ($out | Out-String)

        if ($code -eq 0) {
            Write-Ok 'alembic upgrade head выполнен'
        }
        elseif ($text -match 'already exists') {
            # Типичная ситуация: таблицы созданы через create_tables.py, а alembic не проинициализирован.
            Write-Warn2 'таблицы в БД уже есть, но alembic об этом не знает (нет отметки версии).'
            if (Confirm-Yes 'Отметить БД как актуальную (alembic stamp head)?' -DefaultYes) {
                & $Python -m alembic stamp head
                if ($LASTEXITCODE -eq 0) {
                    Write-Ok 'alembic stamp head выполнен — дальше миграции будут применяться нормально'
                } else {
                    Write-Err2 "alembic stamp head не удался (код $LASTEXITCODE)"
                }
            }
        }
        else {
            Write-Err2 "alembic upgrade head упал (код $code):"
            $out | Select-Object -Last 15 | ForEach-Object { Write-Host "         $_" -ForegroundColor DarkGray }
        }

        Write-Info 'migrate_add_permissions.py...'
        & $Python migrate_add_permissions.py
        if ($LASTEXITCODE -eq 0) {
            Write-Ok 'migrate_add_permissions.py выполнен'
        } else {
            Write-Err2 "migrate_add_permissions.py упал (код $LASTEXITCODE)"
        }
    } finally {
        Pop-Location
        $ErrorActionPreference = $prevEap
    }
}

function Start-Backend {
    param([string]$LanIp = '127.0.0.1')
    Write-Head 'Backend (FastAPI)'

    if (Test-Port -Port $BackendPort) {
        Write-Ok "порт $BackendPort уже занят — считаю, что бэкенд запущен, второй раз не поднимаю"
        return $true
    }

    $py = Resolve-Python
    if (-not $py) { return $false }

    Show-PythonInfo -Python $py
    if (-not (Test-BackendDeps -Python $py)) {
        Write-Err2 'бэкенд не запускаю: зависимости не готовы'
        return $false
    }

    $envFile = Initialize-BackendEnv
    Test-Database -EnvFile $envFile -Python $py
    Invoke-Migrations -Python $py

    # Разрешённые origin: по умолчанию в config.py только localhost/127.0.0.1, поэтому
    # веб, открытый с планшета по http://<LAN-IP>:5173, получал бы CORS-ошибку на каждый
    # запрос. Передаём список через переменную окружения — она приоритетнее .env,
    # сам .env не трогаем.
    $origins = "http://localhost:$FrontendPort,http://127.0.0.1:$FrontendPort,http://$($LanIp):$FrontendPort"
    Write-Info "CORS разрешён для: $origins"

    # host 0.0.0.0 — чтобы телефон/планшет в той же сети могли достучаться
    $cmd = '$env:ALLOWED_ORIGINS = ''' + $origins + '''; ' +
           '& ''' + $py + ''' -m uvicorn app.main:app --reload --host 0.0.0.0 --port ' + $BackendPort
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

# ── Доступ по локальной сети (тест с планшетов/телефонов) ─────────────────────
function Test-IsAdmin {
    try {
        $id = [Security.Principal.WindowsIdentity]::GetCurrent()
        return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole(
            [Security.Principal.WindowsBuiltInRole]::Administrator)
    } catch { return $false }
}

function Initialize-Firewall {
    # Windows по умолчанию блокирует входящие подключения к 8000/5173,
    # поэтому телефон/планшет не увидит ни API, ни веб-интерфейс.
    $rules = @(
        @{ Name = 'Marjon Backend 8000';  Port = $BackendPort },
        @{ Name = 'Marjon Frontend 5173'; Port = $FrontendPort }
    )
    $missing = @()
    foreach ($r in $rules) {
        $exists = $null
        try { $exists = Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue } catch { }
        if ($exists) { Write-Ok ("фаервол: правило есть — {0}" -f $r.Name) } else { $missing += $r }
    }
    if ($missing.Count -eq 0) { return }

    if (Test-IsAdmin) {
        if (Confirm-Yes 'Открыть порты 8000/5173 в фаерволе для локальной сети?' -DefaultYes) {
            foreach ($r in $missing) {
                try {
                    New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -Action Allow `
                        -Protocol TCP -LocalPort $r.Port -Profile Private | Out-Null
                    Write-Ok ("фаервол: правило добавлено — {0} (порт {1}, профиль Private)" -f $r.Name, $r.Port)
                } catch {
                    Write-Err2 ("не удалось добавить правило {0}: {1}" -f $r.Name, $_.Exception.Message)
                }
            }
        }
    } else {
        Write-Warn2 'Портов в фаерволе нет, а прав администратора нет — с других устройств не подключиться.'
        Write-Warn2 'Запустите PowerShell от имени администратора и выполните:'
        foreach ($r in $missing) {
            Write-Host ("         New-NetFirewallRule -DisplayName '{0}' -Direction Inbound -Action Allow -Protocol TCP -LocalPort {1} -Profile Private" -f $r.Name, $r.Port) -ForegroundColor DarkGray
        }
    }
}

function Set-FrontendLanEnv {
    param([string]$LanIp)
    # Веб и админка по умолчанию обращаются к http://127.0.0.1:8000 — с планшета это
    # будет сам планшет. Поэтому фиксируем реальный IP этого компьютера в .env.local
    # (файл в .gitignore, на репозиторий не влияет).
    $file = Join-Path $FrontendDir '.env.local'
    $api  = "http://$($LanIp):$BackendPort/api/v1"
    $body = @(
        '# Сгенерировано лаунчером start.ps1 для теста в локальной сети.',
        '# Адрес API должен быть виден с других устройств, поэтому не 127.0.0.1.',
        "VITE_API_URL=$api",
        "VITE_ADMIN_API_URL=$api"
    ) -join "`r`n"

    $old = ''
    if (Test-Path -LiteralPath $file) { $old = (Get-Content -LiteralPath $file -Raw -ErrorAction SilentlyContinue) }
    if ($old.Trim() -eq $body.Trim()) {
        Write-Ok "адрес API для веба уже настроен: $api"
        return
    }
    try {
        Set-Content -LiteralPath $file -Value $body -Encoding UTF8
        Write-Ok "адрес API для веба записан в frontend\.env.local: $api"
    } catch {
        Write-Err2 ("не удалось записать .env.local: {0}" -f $_.Exception.Message)
    }
}

# ── Клиенты ───────────────────────────────────────────────────────────────────
function Get-NpmBootstrap {
    # Одной строкой (без переводов строк — команда уходит в Start-Process как один аргумент):
    #  - нет node_modules            -> npm install
    #  - есть, но состав неполный    -> npm install  (случай отсутствующего 'ws' после обновления package.json)
    return '$need = -not (Test-Path node_modules); ' +
           'if (-not $need) { npm ls --depth=0 --silent 2>$null | Out-Null; $need = ($LASTEXITCODE -ne 0) }; ' +
           'if ($need) { Write-Host "Ставлю зависимости (npm install)..." -ForegroundColor Yellow; npm install }; '
}

function Start-Frontend {
    param([string]$LanIp = '127.0.0.1')
    Write-Head 'Frontend (React + Vite)'
    if (-not (Test-Cmd 'npm')) { Write-Err2 'npm не найден в PATH (нужен Node.js)'; return }
    if (Test-Port -Port $FrontendPort) { Write-Warn2 "порт $FrontendPort занят — возможно, dev-сервер уже запущен" }
    Set-FrontendLanEnv -LanIp $LanIp

    $cmd = (Get-NpmBootstrap) + 'npm run dev'
    Start-Win -Title 'Marjon Frontend :5173' -WorkDir $FrontendDir -Command $cmd
    Write-Info "веб:    http://localhost:$FrontendPort/"
    Write-Info "админка: http://localhost:$FrontendPort/admin.html"
    Write-Info ("с других устройств: http://{0}:{1}/" -f $LanIp, $FrontendPort)
}

function Start-Desktop {
    Write-Head 'Desktop (Electron)'
    if (-not (Test-Cmd 'npm')) { Write-Err2 'npm не найден в PATH (нужен Node.js)'; return }

    $cmd = (Get-NpmBootstrap) + 'npm run dev'
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

    Write-Head 'Локальная сеть'
    Write-Info "IP этого компьютера: $lanIp"
    if ($lanIp -like '192.168.56.*' -or $lanIp -like '169.254.*' -or $lanIp -eq '127.0.0.1') {
        Write-Warn2 'Похоже, это виртуальный адаптер (VirtualBox/Hyper-V), а не Wi-Fi.'
        Write-Warn2 'С телефона такой адрес недоступен. Реальный адрес смотрите так:'
        Write-Host  '         ipconfig | Select-String -Pattern "IPv4"' -ForegroundColor DarkGray
    }
    Initialize-Firewall

    switch ($Selected) {
        'backend' { Start-Backend -LanIp $lanIp | Out-Null }
        'front'   { Start-Backend -LanIp $lanIp | Out-Null; Start-Frontend -LanIp $lanIp }
        'desktop' { Start-Backend -LanIp $lanIp | Out-Null; Start-Desktop }
        'mobile'  { Start-Backend -LanIp $lanIp | Out-Null; Start-FlutterApp -Title 'Marjon Mobile (Flutter)' -Dir $MobileDir -LanIp $lanIp }
        'owner'   { Start-Backend -LanIp $lanIp | Out-Null; Start-FlutterApp -Title 'Marjon Owner (Flutter)'  -Dir $OwnerDir  -LanIp $lanIp }
        'all'     {
            Start-Backend -LanIp $lanIp | Out-Null
            Start-Frontend -LanIp $lanIp
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
