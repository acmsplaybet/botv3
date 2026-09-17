@echo off
title BPA V3 / APEX-BOT Control Panel
cd /d "%~dp0"

echo ===================================================
echo   BPA V3 / APEX-BOT DESKTOP CONTROL CENTER
echo ===================================================

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo ===================================================
    echo   [HATA] Node.js bu bilgisayarda bulunamadi!
    echo   Lutfen once Node.js kurun veya terminali yeniden baslatin.
    echo ===================================================
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0node_modules\puppeteer-extra" (
    echo.
    echo ===================================================
    echo   [ILK KURULUM] node_modules paketleri yukleniyor...
    echo   Lutfen bekleyin, npm install calisiyor...
    echo ===================================================
    call npm install
    if errorlevel 1 (
        echo.
        echo [HATA] npm install basarisiz oldu.
        echo.
        pause
        exit /b 1
    )
    echo [BASARILI] Paketler kuruldu. Bot baslatiliyor...
    echo.
)

:loop
echo Port 3000 kontrol ediliyor ve eski surecler temizleniyor...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    if not "%%a"=="0" taskkill /f /pid %%a >nul 2>&1
)
ping -n 2 127.0.0.1 >nul
echo Starting Agent on port 3000...
node bpa_desktop_agent.js
if errorlevel 1 (
    echo.
    echo ===================================================
    echo   [HATA] BPA Agent beklenmedik bir hata ile kapandi!
    echo   Hata mesajini yukarida gorebilirsiniz.
    echo ===================================================
    echo.
    pause
)
echo.
echo [BPA] Sunucu kapandi. 3 saniye icinde otomatik yeniden baslatiliyor. Cikmak icin Ctrl+C...
ping -n 4 127.0.0.1 >nul
goto loop
