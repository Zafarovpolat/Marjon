@echo off
rem Marjon - one-click Docker launcher (Windows). Double-click this file.
rem Starts: Postgres + backend (with auto migrations and demo data) + web/admin.
rem Real logic lives in docker-start.ps1 (checks Docker engine, ports, waits for readiness).
chcp 65001 >nul
title Marjon - Docker
cd /d "%~dp0"

echo ==============================================
echo             MARJON - Docker
echo ==============================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0docker-start.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] Docker-запуск завершился с ошибкой. Смотрите сообщения выше.
)
echo.
pause
