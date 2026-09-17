@echo off
title BPA V4 - GOREV ZAMANLAYICILARI KALDIRMA
cd /d "%~dp0"
echo ====================================================================
echo   BPA V4 - WINDOWS GOREVLERINI KALDIRMA SIHIRBAZI
echo ====================================================================
echo.
schtasks /delete /tn "BPA_Bot_Morning" /f >nul 2>&1
schtasks /delete /tn "BPA_Bot_Evening" /f >nul 2>&1
node tools\remove_tasks_cli.js
echo.
echo ====================================================================
echo Gorevler Windows Gorev Zamanlayicisindan basariyla kaldirildi.
echo ====================================================================
pause
