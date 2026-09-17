@echo off
title BPA V4 - SABAH GOREVI (06:00 - Dunun Maclari ve Biten Skorlar)
cd /d "%~dp0"
echo ====================================================================
echo   BPA V4 - SABAH GOREVI (Dunun Sonuclanan Maclari ^& APEX Senkronizasyonu)
echo ====================================================================

if not exist "%~dp0node_modules\puppeteer-extra" (
    echo [ILK KURULUM] node_modules eksik, npm install calistiriliyor...
    call npm install
)

echo Hedef: Dunun tamamlanan tum maclarini cekip APEX'e aktarmak.
echo Baslatiliyor...
echo.

node daily_pipeline.js --yesterday --sync-apex --workers=4 --cron

echo.
echo ====================================================================
echo   Sabah Gorevi Tamamlandi. Cikmak icin bir tusa basin...
echo ====================================================================
ping -n 11 127.0.0.1 >nul
pause
