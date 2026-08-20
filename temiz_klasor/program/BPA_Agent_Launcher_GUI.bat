@echo off
title BPA Desktop Agent
cd /d %~dp0
echo ===================================================
echo   BPA V3 DESKTOP AGENT & AUTOMATION SERVER
echo ===================================================
echo Port 3000 kontrol ediliyor ve eski surecler kapatiliyor...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %%a >nul 2>&1
timeout /t 1 /nobreak >nul
echo Starting Agent on port 3000...
node bpa_desktop_agent.js
pause
