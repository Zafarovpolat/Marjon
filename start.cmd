@echo off
rem Marjon dev launcher - double-click this file.
rem It only runs start.ps1 (menu: frontend / desktop / mobile / owner / all / backend).
chcp 65001 >nul
title Marjon launcher
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] Launcher exited with an error. See messages above.
)
echo.
pause
