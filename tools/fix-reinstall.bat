@echo off
chcp 65001 >nul
setlocal
title Mannequin Dressing Studio - ตัวช่วยแก้ปัญหาติดตั้ง (v0.1.5)

echo ============================================================
echo    ตัวช่วยแก้ปัญหา "cannot be closed" + ติดตั้ง v0.1.5
echo    Mannequin Dressing Studio
echo    (ข้อมูล API Key และรูปที่เจนไว้ ไม่ถูกลบ)
echo ============================================================
echo.

echo [1/4] ปิดโปรแกรมที่ค้างอยู่ทั้งหมด (Closing app)...
taskkill /F /T /IM "Mannequin Dressing Studio.exe" >nul 2>&1
timeout /t 2 /nobreak >nul
echo       OK
echo.

echo [2/4] ถอนการติดตั้งเวอร์ชันเดิม (Uninstalling old version)...
set "DIR=%LOCALAPPDATA%\Programs\mannequin-dressing-studio"
set "UNINST=%DIR%\Uninstall Mannequin Dressing Studio.exe"
if exist "%UNINST%" (
    "%UNINST%" /S
    timeout /t 6 /nobreak >nul
    echo       OK - ถอนเรียบร้อย
) else (
    echo       ไม่พบเวอร์ชันเดิม ข้ามได้ ^(already removed^)
)
echo.

echo [3/4] ดาวน์โหลดตัวติดตั้ง v0.1.5 ล่าสุด (Downloading)...
set "SETUP=%TEMP%\MannequinStudio-Setup-0.1.5.exe"
if exist "%SETUP%" del /f /q "%SETUP%" >nul 2>&1
curl -L --fail -o "%SETUP%" "https://github.com/VulcanXTH/mannequin-dressing-studio/releases/download/v0.1.5/Mannequin-Dressing-Studio-Setup-0.1.5.exe"
if not exist "%SETUP%" (
    echo.
    echo       *** ดาวน์โหลดไม่สำเร็จ ^(check internet^) ***
    echo       เปิดหน้าดาวน์โหลดในเบราว์เซอร์ให้แทน...
    start "" "https://github.com/VulcanXTH/mannequin-dressing-studio/releases/latest"
    echo.
    pause
    exit /b 0
)
echo       OK - ดาวน์โหลดเสร็จ
echo.

echo [4/4] เปิดตัวติดตั้ง (Launching installer)...
echo       * ถ้าขึ้นจอฟ้า "Windows protected your PC"
echo         ให้กด  More info  แล้ว  Run anyway
timeout /t 2 /nobreak >nul
start "" "%SETUP%"
echo.
echo ============================================================
echo    เสร็จแล้ว! ตัวติดตั้งกำลังทำงาน
echo    โปรแกรมจะเปิดขึ้นมาเองเมื่อติดตั้งเสร็จ
echo ============================================================
echo.
pause
