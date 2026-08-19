@echo off
cd /d "%~dp0"
chcp 65001 > nul
title BPA V3 Forebet Bot Kontrol Merkezi
echo ========================================================
echo   BPA V3 BOT KONTROL PANELI BASLATILIYOR...
echo   Adres: http://localhost:3050
echo ========================================================
start "" http://localhost:3050
node server.js
pause
