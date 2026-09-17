@echo off
title BPA V4 - 1 TIKLA OTOMATIK PAKET KURULUMU
cd /d %~dp0
echo ====================================================================
echo   BPA V4 - OTOMATIK PAKET KURULUM SIHIRBAZI (npm install)
echo ====================================================================
echo.
echo Gerekli Puppeteer ve guvenlik paketleri yukleniyor...
echo Lutfen internet baglantiniza bagli olarak 30-60 saniye bekleyin...
echo.

call npm install

if errorlevel 1 (
    echo.
    echo ❌ [HATA] Paketler yuklenemedi! 
    echo    Lutfen bilgisayarda Node.js kurulu oldugundan emin olun.
    echo.
) else (
    echo.
    echo ====================================================================
    echo   🎉 TEBRIKLER! Tum paketler basariyla kuruldu.
    echo   Artik 'BPA_Agent_Launcher_GUI.bat' veya 'setup_windows_tasks.bat'
    echo   dosyalarini dogrudan calistirabilirsiniz!
    echo ====================================================================
)
pause
