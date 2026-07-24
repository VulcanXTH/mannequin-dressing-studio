@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Mannequin Dressing Studio - ตัวช่วยแก้ปัญหาติดตั้ง (v0.1.6)

set "EXPECTED_SIZE=102860913"
set "VER=0.1.6"
set "DIR=%LOCALAPPDATA%\Programs\mannequin-dressing-studio"
set "DATA=%APPDATA%\mannequin-dressing-studio"
set "SETUP=%TEMP%\MannequinStudio-Setup-%VER%.exe"
set "URL=https://github.com/VulcanXTH/mannequin-dressing-studio/releases/download/v%VER%/Mannequin-Dressing-Studio-Setup-%VER%.exe"

echo ============================================================
echo    ตัวช่วยแก้ปัญหาติดตั้ง Mannequin Dressing Studio v%VER%
echo ------------------------------------------------------------
echo    สาเหตุ: ตัวถอนการติดตั้งของเวอร์ชันเก่า (0.1.1) เสียหาย
echo    ตัวติดตั้งใหม่จะไปเรียกมันเสมอ จึงค้างที่ cannot be closed
echo    สคริปต์นี้ลบเวอร์ชันเก่าเองโดยไม่พึ่งไฟล์ที่เสียนั้น
echo ============================================================
echo.
echo    ข้อมูลของคุณ (API Key + ประวัติงานเดิม) อยู่ที่:
echo    %DATA%
echo.
echo      กด Enter = เก็บข้อมูลไว้ (แนะนำ - ไม่เกี่ยวกับปัญหานี้)
echo      พิมพ์ Y  = ลบข้อมูลทิ้งทั้งหมด เริ่มใหม่หมดจด
echo.
set "WIPE=N"
set /p "WIPE=   ลบข้อมูลทั้งหมดด้วยไหม? : "
echo.

echo [1/6] ปิดโปรแกรม + ตัวติดตั้ง/ถอนที่ค้างอยู่...
taskkill /F /IM "Mannequin Dressing Studio.exe" >nul 2>&1
taskkill /F /FI "IMAGENAME eq Mannequin*" >nul 2>&1
taskkill /F /FI "IMAGENAME eq Un_*.exe" >nul 2>&1
timeout /t 2 /nobreak >nul
echo       OK
echo.

echo [2/6] ลบโฟลเดอร์โปรแกรมเวอร์ชันเก่า...
if exist "%DIR%" (
    rmdir /S /Q "%DIR%" >nul 2>&1
    if exist "%DIR%" (
        echo       *** ลบไม่สำเร็จ - มีไฟล์ถูกล็อกอยู่ ***
        echo       ให้ปิด McAfee ชั่วคราว หรือคลิกขวาไฟล์นี้ ^> Run as administrator
        echo.
        pause
        exit /b 1
    )
    echo       OK - ลบแล้ว
) else (
    echo       ไม่พบ ข้ามได้
)
echo.

echo [3/6] ลบรายการใน Registry ที่ชี้ไปหา uninstaller ตัวเก่า...
echo       ^(ขั้นนี้สำคัญที่สุด - ถ้าไม่ลบ ตัวติดตั้งใหม่จะไปเรียกไฟล์เสียอีก^)
set "FOUND=0"
for %%R in (HKCU HKLM) do (
    for %%W in ("Software\Microsoft\Windows\CurrentVersion\Uninstall" "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall") do (
        for /f "delims=" %%K in ('reg query "%%R\%%~W" /s /f "Mannequin Dressing Studio" /d 2^>nul ^| findstr /i /r "^HKEY_"') do (
            echo       พบ: %%K
            reg delete "%%K" /f >nul 2>&1
            if errorlevel 1 (
                echo             -^> ลบไม่ได้ ต้องใช้สิทธิ์ admin
            ) else (
                echo             -^> ลบแล้ว
                set "FOUND=1"
            )
        )
    )
)
reg delete "HKCU\Software\com.vulcanx.mannequin-dressing-studio" /f >nul 2>&1
reg delete "HKCU\Software\Mannequin Dressing Studio" /f >nul 2>&1
if "!FOUND!"=="0" echo       ไม่พบรายการค้าง
echo.

echo [4/6] ลบ shortcut + จัดการข้อมูลตามที่เลือก...
del /F /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Mannequin Dressing Studio.lnk" >nul 2>&1
del /F /Q "%USERPROFILE%\Desktop\Mannequin Dressing Studio.lnk" >nul 2>&1
if /i "!WIPE!"=="Y" (
    if exist "%DATA%" rmdir /S /Q "%DATA%" >nul 2>&1
    echo       OK - ลบข้อมูลทั้งหมดแล้ว ^(ต้องใส่ API Key ใหม่^)
) else (
    echo       OK - ข้อมูลและ API Key เก็บไว้ครบ
)
echo.
echo       ===== ตรวจสอบผล =====
if exist "%DIR%" (echo       [X] โฟลเดอร์เก่ายังอยู่) else (echo       [OK] ไม่มีโฟลเดอร์เก่าแล้ว)
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall" /s /f "Mannequin Dressing Studio" /d >nul 2>&1
if errorlevel 1 (echo       [OK] ไม่มีรายการค้างใน Registry) else (echo       [X] ยังมีรายการค้าง - ลอง Run as administrator)
echo.

echo [5/6] ดาวน์โหลดตัวติดตั้ง v%VER% ^(ประมาณ 98 MB^)...
if exist "%SETUP%" del /F /Q "%SETUP%" >nul 2>&1
curl -L --fail --retry 2 -o "%SETUP%" "%URL%"
if not exist "%SETUP%" goto :dlfail
for %%A in ("%SETUP%") do set "GOT=%%~zA"
echo       ได้ไฟล์ !GOT! bytes ^(ต้องได้ %EXPECTED_SIZE%^)
if not "!GOT!"=="%EXPECTED_SIZE%" goto :corrupt
echo       OK - ไฟล์ครบสมบูรณ์
echo.

echo [6/6] เปิดตัวติดตั้ง...
echo       * ถ้าขึ้นจอฟ้า "Windows protected your PC" -^> More info -^> Run anyway
timeout /t 2 /nobreak >nul
start "" "%SETUP%"
echo.
echo ============================================================
echo    เสร็จแล้ว! ไม่ควรมีกล่อง cannot be closed อีก
echo    เพราะไม่มีเวอร์ชันเก่าให้ตัวติดตั้งต้องไปถอนแล้ว
echo ============================================================
echo.
pause
exit /b 0

:corrupt
echo.
echo    *** ไฟล์ที่โหลดมาไม่ครบ ^(น่าจะโดนแอนตี้ไวรัสตัด^) ***
echo    วิธีแก้: ปิด McAfee ชั่วคราว แล้วรันไฟล์นี้ใหม่
echo.
del /F /Q "%SETUP%" >nul 2>&1
pause
exit /b 1

:dlfail
echo.
echo    *** ดาวน์โหลดไม่สำเร็จ ^(เน็ต หรือ แอนตี้ไวรัสบล็อก^) ***
echo    เปิดหน้าดาวน์โหลดในเบราว์เซอร์ให้แทน...
start "" "https://github.com/VulcanXTH/mannequin-dressing-studio/releases/latest"
echo.
pause
exit /b 1
