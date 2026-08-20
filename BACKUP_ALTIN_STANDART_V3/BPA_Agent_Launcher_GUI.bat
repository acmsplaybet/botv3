@echo off
title BPA V3 / APEX-BOT Control Panel
cd /d %~dp0
echo ===================================================
echo   BPA V3 / APEX-BOT DESKTOP CONTROL CENTER
echo ===================================================
echo Port 3000 kontrol ediliyor ve eski surecler kapatiliyor...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %%a >nul 2>&1
timeout /t 1 /nobreak >nul
echo Starting Agent on port 3000...
start http://localhost:3000
node bpa_desktop_agent.js
pause
