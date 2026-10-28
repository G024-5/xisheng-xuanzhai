@echo off
chcp 65001 >nul
cd /d "%~dp0"

start "" /b cmd /c "timeout /t 2 >nul & start "" http://127.0.0.1:5178"
node --disable-warning=ExperimentalWarning src\server.js

pause
