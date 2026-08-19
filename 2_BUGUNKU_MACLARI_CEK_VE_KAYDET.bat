@echo off
chcp 65001 > nul
title BPA V3 - Bugunku Maclari Cek ve Veritabanina Yaz
echo ========================================================
echo   BPA V3 - BUGUNUN ORANLI MACLARI CEKILIYOR (4 SEKME)
echo   Veriler otomatik olarak MySQL veritabanina aktarilacak...
echo ========================================================
node daily_crawler.js --concurrency=4 --save-db=true
echo.
echo ========================================================
echo   ISLEM TAMAMLANDI!
echo ========================================================
pause
