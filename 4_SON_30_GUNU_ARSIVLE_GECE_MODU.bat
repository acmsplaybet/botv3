@echo off
chcp 65001 > nul
title BPA V3 - Tarih Araligi Arsivleme (25.07.2026 - 19.08.2026)
echo ===================================================================
echo   BPA V3 - GECMIS TARIH ARALIGI ARSIVLEME MOTORU (GECE MODU)
echo   Hedef: 25.07.2026 - 19.08.2026 (26 Gun)
echo   4 Sekmeli Havuz • Otomatik Resume • Yerel Logo/Bayrak Indirme
echo ===================================================================
echo.
echo Tarama baslatiliyor... Bu islem internet hiziniza bagli olarak
echo yaklasik 2 - 2.5 saat surecektir. Bilgisayarinizi acik birakiniz.
echo.
node date_range_crawler.js --start-date=2026-07-25 --end-date=2026-08-19 --concurrency=4 --save-db=false
echo.
echo ===================================================================
echo   TUM TARIH ARALIGI ARSIVLEMESI TAMAMLANDI!
echo ===================================================================
pause
