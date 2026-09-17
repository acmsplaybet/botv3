@echo off
title BPA V4 - MASAUSTU KISAYOLU OLUSTURUCU
cd /d "%~dp0"

echo ===================================================
echo   BPA V4 - MASAUSTU KISAYOLU OLUSTURULUYOR...
echo ===================================================

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $desk = $ws.SpecialFolders('Desktop'); $s = $ws.CreateShortcut([System.IO.Path]::Combine($desk, 'BPA Control Center.lnk')); $s.TargetPath = [System.IO.Path]::Combine('%~dp0', 'BPA_Control_Center.exe'); $s.WorkingDirectory = '%~dp0'; $s.Description = 'BPA V4 Master Kontrol İstasyonu'; $s.Save();"

echo.
echo ===================================================
echo   🎉 [BASARILI] 'BPA Control Center' masaustune eklendi!
echo   Masaustunuzdeki BPA ikona cift tiklayarak tek adimda
echo   tum sistemi baslatabilirsiniz.
echo ===================================================
echo.
pause
