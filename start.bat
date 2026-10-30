@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 溪声轩斋

echo.
echo   溪声轩斋 · 正在启动
echo   目录: %CD%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [错误] 没有找到 Node.js
  echo.
  echo   请先安装 Node.js 22.5 或更高版本: https://nodejs.org/
  echo   安装后重新打开这个窗口即可。
  echo.
  pause
  exit /b 1
)

if not exist "src\server.js" (
  echo   [错误] 找不到 src\server.js
  echo.
  echo   请确认是在解压后的项目根目录里运行，
  echo   而不是在压缩包预览窗口里直接双击。
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do set NODEVER=%%v
echo   Node: %NODEVER%
echo.

rem 另起一个进程：等端口就绪后再打开浏览器（避免开太早看到"无法访问"）
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\open-when-ready.ps1"

node --disable-warning=ExperimentalWarning src\server.js

echo.
echo   服务已退出，上面是最后的输出。
echo   如果是报错，请把这一屏截图发给我。
echo.
pause
