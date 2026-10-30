@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Xisheng Xuanzhai - doctor

where node >nul 2>nul
if errorlevel 1 (
  echo   [ERROR] Node.js not found.
  echo   Install it from https://nodejs.org/ and run again.
  echo.
  pause
  exit /b 1
)

node --disable-warning=ExperimentalWarning scripts\doctor.js
pause
