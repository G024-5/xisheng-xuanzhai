@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "data\app.db" (
  echo [首次运行] 正在从 Zotero 导入文献...
  node --disable-warning=ExperimentalWarning scripts\import-zotero.js
  echo.
)

start "" /b cmd /c "timeout /t 2 >nul & start "" http://127.0.0.1:5178"
node --disable-warning=ExperimentalWarning src\server.js

pause
