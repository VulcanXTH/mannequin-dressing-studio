@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Mannequin Dressing Studio - ตัวช่วยแก้ปัญหาติดตั้ง (v0.1.6)

set "EXPECTED_SIZE=102860913"
set "VER=0.1.6"
set "DIR=%LOCALAPPDATA%\Programs\mannequin-dressing-studio"
set "SETUP=%TEMP%\MannequinStudio-Setup-%VER%.exe"
set "URL=https://github.com/VulcanXTH/mannequin-dressing-studio/releases/download/v%VER%/Mannequin-Dressing-Studio-Setup-%VER%.exe"

echo ============================================================
echo    ตัวช่วยแก้ปัญหาติดตั้ง Mannequin Dressing Studio v%VER%
echo    - ใช้ได้แม้ตัวถอนการติดตั้งเดิมจะเสีย (NSIS Error)
echo    - ข้อมูล API Key และรูปที่เจนไว้ ไม่ถูกลบ
echo ============================================================
echo.

echo [1/5] ปิดโปรแกรม + ตัวติดตั้ง/ถอนที่ค้างอยู่...
taskkill /F /T /IM "Mannequin Dressing Studio.exe" >nul 2>&1
rem ปิดทุก process ที่ชื่อขึ้นต้นด้วย Mannequin (รวม Setup/Uninstall เก่าที่ค้าง)
taskkill /F /FI "IMAGENAME eq Mannequin*" >nul 2>&1
taskkill /F /FI "IMAGENAME eq Un_*.exe" >nul 2>&1
timeout /t 2 /nobreak >nul
echo       OK
echo.

echo [2/5] ลบโปรแกรมเวอร์ชันเดิมออก (ไม่ใช้ตัว uninstaller ที่อาจเสีย)...
if exist "%DIR%" (
    rmdir /S /Q "%DIR%" >nul 2>&1
    if exist "%DIR%" (
        echo       *** ลบไม่สำเร็จ - อาจมีไฟล์ถูกล็อกอยู่ ***
        echo       ให้ลองปิด McAfee ชั่วคราว แล้วรันไฟล์นี้ใหม่
        echo       หรือคลิกขวาที่ไฟล์นี้ ^> Run as administrator
        echo.
        pause
        exit /b 1
    )
    echo       OK - ลบโฟลเดอร์โปรแกรมเดิมแล้ว
) else (
    echo       ไม่พบโฟลเดอร์เดิม ข้ามได้
)
echo.

echo [3/5] เก็บกวาด shortcut และรายการใน Settings ^> Apps...
del /F /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Mannequin Dressing Studio.lnk" >nul 2>&1
del /F /Q "%USERPROFILE%\Desktop\Mannequin Dressing Studio.lnk" >nul 2>&1
rem ลบรายการถอนการติดตั้งในทะเบียน เพื่อไม่ให้ค้างใน Settings ^> Apps
for /f "delims=" %%K in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall" /s /f "Mannequin Dressing Studio" /d 2^>nul ^| findstr /i "HKEY_CURRENT_USER"') do (
    reg delete "%%K" /f >nul 2>&1
)
echo       OK
echo.

echo [4/5] ดาวน์โหลดตัวติดตั้ง v%VER% (ประมาณ 98 MB)...
if exist "%SETUP%" del /F /Q "%SETUP%" >nul 2>&1
curl -L --fail --retry 2 -o "%SETUP%" "%URL%"
if not exist "%SETUP%" goto :dlfail
for %%A in ("%SETUP%") do set "GOT=%%~zA"
echo       ได้ไฟล์ขนาด !GOT! bytes (ต้องได้ %EXPECTED_SIZE%)
if not "!GOT!"=="%EXPECTED_SIZE%" goto :corrupt
echo       OK - ไฟล์ครบสมบูรณ์
echo.

echo [5/5] เปิดตัวติดตั้ง...
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
exit /b 0

:corrupt
echo.
echo ============================================================
echo    *** ไฟล์ที่โหลดมาไม่ครบ (น่าจะโดนโปรแกรมแอนตี้ไวรัสตัด) ***
echo ============================================================
echo    วิธีแก้:
echo      1. ปิด McAfee / Windows Defender real-time scan ชั่วคราว
echo      2. รันไฟล์นี้ใหม่อีกครั้ง
echo      3. เปิดแอนตี้ไวรัสกลับหลังติดตั้งเสร็จ
echo.
del /F /Q "%SETUP%" >nul 2>&1
pause
exit /b 1

:dlfail
echo.
echo    *** ดาวน์โหลดไม่สำเร็จ (เน็ต หรือ แอนตี้ไวรัสบล็อก) ***
echo    เปิดหน้าดาวน์โหลดในเบราว์เซอร์ให้แทน...
start "" "https://github.com/VulcanXTH/mannequin-dressing-studio/releases/latest"
echo.
pause
exit /b 1
