@echo off
chcp 65001 > nul
title BPA V3 - Yarinki Maclari Cek ve Veritabanina Yaz
for /f %%a in ('powershell -Command "(Get-Date).AddDays(1).ToString('yyyy-MM-dd')"') do set TOMORROW=%%a
echo ========================================================
echo   BPA V3 - YARININ ORANLI MACLARI CEKILIYOR (%TOMORROW%)
echo   4 Sekme ile paralel kazinip MySQL'e aktarilacak...
echo ========================================================
node daily_crawler.js --date=%TOMORROW% --concurrency=4 --save-db=true
echo.
echo ========================================================
echo   ISLEM TAMAMLANDI!
echo ========================================================
pause
