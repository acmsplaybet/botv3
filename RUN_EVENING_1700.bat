@echo off
title BPA V4 - AKSAM GOREVI (17:00 - Yarinin Bulteni, Oranlar ve Tahminler)
cd /d "%~dp0"
echo ====================================================================
echo   BPA V4 - AKSAM GOREVI (Yarinin Maclari, Oranlar ^& APEX Senkronizasyonu)
echo ====================================================================

if not exist "%~dp0node_modules\puppeteer-extra" (
    echo [ILK KURULUM] node_modules eksik, npm install calistiriliyor...
    call npm install
)

echo Hedef: Yarinin tum bultenini cekip APEX'e aktarmak (VIP Kupon Uretimi).
echo Baslatiliyor...
echo.

node daily_pipeline.js --tomorrow --sync-apex --workers=4 --cron

echo.
echo ====================================================================
echo   Aksam Gorevi Tamamlandi. Cikmak icin bir tusa basin...
echo ====================================================================
ping -n 11 127.0.0.1 >nul
pause
