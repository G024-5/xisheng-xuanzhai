@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Xisheng Xuanzhai

echo.
echo   Xisheng Xuanzhai - starting
echo   Folder: %CD%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [ERROR] Node.js not found.
  echo.
  echo   Install Node.js 22.5 or newer first: https://nodejs.org/
  echo   Then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "src\server.js" (
  echo   [ERROR] src\server.js not found.
  echo.
  echo   Run this from the extracted project folder,
  echo   not from inside the ZIP preview window.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do set NODEVER=%%v
echo   Node: %NODEVER%
echo.

rem Wait until the port is ready, then open the browser.
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\open-when-ready.ps1"

node --disable-warning=ExperimentalWarning src\server.js

echo.
echo   Server stopped. If the output above looks like an error,
echo   run doctor.bat and send the whole screen.
echo.
pause
