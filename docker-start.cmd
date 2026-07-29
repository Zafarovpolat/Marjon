@echo off
rem Marjon - one-click Docker launcher (Windows). Double-click this file.
rem Starts: Postgres + backend (with auto migrations and demo data) + web/admin.
chcp 65001 >nul
title Marjon - Docker
cd /d "%~dp0"

echo ==============================================
echo             MARJON - Docker
echo ==============================================
echo.

docker version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker не найден или не запущен.
  echo         Установите Docker Desktop и дождитесь статуса "Engine running".
  echo         https://www.docker.com/products/docker-desktop/
  echo.
  pause
  exit /b 1
)

echo [1/3] Собираю образы и запускаю контейнеры...
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo [ERROR] Не удалось запустить. Логи: docker compose logs
  echo.
  pause
  exit /b 1
)

echo.
echo [2/3] Жду готовности бэкенда (миграции и демо-данные, до ~2 минут)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ok=$false; for($i=0;$i -lt 90;$i++){ try{ $r=Invoke-WebRequest -Uri 'http://localhost:8000/docs' -UseBasicParsing -TimeoutSec 3; if($r.StatusCode -eq 200){$ok=$true; break} }catch{}; Start-Sleep -Seconds 2 }; if($ok){ Write-Host '      backend готов' -ForegroundColor Green } else { Write-Host '      backend не ответил - смотрите: docker compose logs backend' -ForegroundColor Yellow }"

echo.
echo [3/3] Локальный IP для телефона/планшета:
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$r=Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Where-Object { $_.NextHop -ne '0.0.0.0' } | Sort-Object RouteMetric | Select-Object -First 1; $ip=if($r){ (Get-NetIPAddress -InterfaceIndex $r.ifIndex -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne '127.0.0.1' } | Select-Object -First 1).IPAddress } else { '127.0.0.1' }; Write-Host ('      Веб с других устройств : http://' + $ip + ':5173/') -ForegroundColor Cyan; Write-Host ('      Адрес сервера в десктопе/мобилке : http://' + $ip + ':8000/api/v1') -ForegroundColor Cyan"

echo.
echo ==============================================
echo  Веб            : http://localhost:5173/
echo  Админка        : http://localhost:5173/admin.html
echo  API / Swagger  : http://localhost:8000/docs
echo.
echo  Вход: +998900078779 / 102938   (PIN сотрудника: 1111)
echo ==============================================
echo.
echo  Логи      : docker compose logs -f backend
echo  Остановить: docker compose down
echo  Сбросить БД: docker compose down -v
echo.

start "" http://localhost:5173/
pause
