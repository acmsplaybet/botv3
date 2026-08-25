@echo off
chcp 65001 > nul
title BPA BOT V4 — FOREBET CLOUDFLARE ONAYLAYICI
cls
echo ================================================================
echo   🔐 BPA BOT V4 — FOREBET CLOUDFLARE PROFIL VE CEREZ ONAYLAYICI
echo ================================================================
echo.
echo   Tarayici aciliyor... Lutfen bekleyin.
echo   Ekranda Cloudflare onay kutucugu cikarsa tiklayiniz.
echo   Sayfa acildiginda bot cerezleri otomatik kaydedip kapatacaktir.
echo.
cd /d "%~dp0"
node tools/auth_interactive.js
echo.
pause
