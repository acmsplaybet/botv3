@echo off
title BPA V4 - WINDOWS GOREV ZAMANLAYICISI KURULUMU
cd /d "%~dp0"
echo ====================================================================
echo   BPA V4 - WINDOWS GOREV ZAMANLAYICI (TASK SCHEDULER) KURULUM SIHIRBAZI
echo ====================================================================
echo.

if not exist "%~dp0node_modules\puppeteer-extra" (
    echo [ILK KURULUM] node_modules paketleri yukleniyor, lutfen bekleyin...
    call npm install
    if errorlevel 1 (
        echo [HATA] npm install basarisiz oldu!
        pause
        exit /b 1
    )
)

echo Bu betik Windows Gorev Zamanlayicisina 2 adet otomatik gorev ekler:
echo   1. BPA_Bot_Morning: Sabah 06:00 (Dunun Sonuclari ^& APEX Kupon Kapatma)
echo   2. BPA_Bot_Evening: Aksam 17:00 (Yarinin Bulteni ^& APEX VIP Kupon Uretimi)
echo.
echo NOT: Bu islemin basarili olmasi icin "Yonetici Olarak Calistir" gerekir.
echo.

node tools\setup_tasks_cli.js

echo.
echo ====================================================================
echo Kurulum Tamamlandi! Gorevleri denetlemek icin:
echo   schtasks /query /tn "BPA_Bot_Morning"
echo   schtasks /query /tn "BPA_Bot_Evening"
echo ====================================================================
pause
