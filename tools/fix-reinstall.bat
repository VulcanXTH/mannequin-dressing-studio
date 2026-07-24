@echo off
setlocal enabledelayedexpansion
title Mannequin Dressing Studio - Repair and Reinstall (v0.1.6)

REM ============================================================
REM  IMPORTANT: keep this file 100%% plain ASCII.
REM  cmd.exe parses .bat files using the machine's OEM codepage,
REM  so Thai/UTF-8 text here gets mangled and breaks every line.
REM ============================================================

set "EXPECTED_SIZE=102860913"
set "VER=0.1.6"
set "DIR=%LOCALAPPDATA%\Programs\mannequin-dressing-studio"
set "DATA=%APPDATA%\mannequin-dressing-studio"
set "SETUP=%TEMP%\MannequinStudio-Setup-%VER%.exe"
set "URL=https://github.com/VulcanXTH/mannequin-dressing-studio/releases/download/v%VER%/Mannequin-Dressing-Studio-Setup-%VER%.exe"

echo ============================================================
echo   Mannequin Dressing Studio - Repair and Reinstall  v%VER%
echo ------------------------------------------------------------
echo   Why installing keeps failing:
echo   The OLD version's uninstaller file is damaged. Every new
echo   Setup calls it, so it gets stuck on "cannot be closed".
echo   This script removes the old version WITHOUT using that file.
echo ============================================================
echo.
echo   Your data (API key + past jobs) is stored in:
echo     %DATA%
echo.
echo     Press ENTER = keep your data   (recommended)
echo     Type Y      = erase everything and start fresh
echo.
set "WIPE=N"
set /p "WIPE=   Erase all data too?  "
echo.

echo [1/6] Closing the app and any stuck installer/uninstaller...
taskkill /F /IM "Mannequin Dressing Studio.exe" >nul 2>&1
taskkill /F /FI "IMAGENAME eq Mannequin*" >nul 2>&1
taskkill /F /FI "IMAGENAME eq Un_*.exe" >nul 2>&1
timeout /t 2 /nobreak >nul
echo       done
echo.

echo [2/6] Deleting the old program folder...
if exist "%DIR%" (
    rmdir /S /Q "%DIR%" >nul 2>&1
    if exist "%DIR%" (
        echo       FAILED - files are locked.
        echo       Turn McAfee off for a moment, or right-click this
        echo       file and choose "Run as administrator", then retry.
        echo.
        pause
        exit /b 1
    )
    echo       done
) else (
    echo       not found - skipped
)
echo.

echo [3/6] Removing registry entries that point to the old uninstaller...
echo       ^(this is the key step - without it Setup calls the broken file again^)
set "FOUND=0"
for %%R in (HKCU HKLM) do (
    for %%W in ("Software\Microsoft\Windows\CurrentVersion\Uninstall" "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall") do (
        for /f "delims=" %%K in ('reg query "%%R\%%~W" /s /f "Mannequin Dressing Studio" /d 2^>nul ^| findstr /i /r "^HKEY_"') do (
            echo       found: %%K
            reg delete "%%K" /f >nul 2>&1
            if errorlevel 1 (
                echo              -^> could not delete, needs admin
            ) else (
                echo              -^> deleted
                set "FOUND=1"
            )
        )
    )
)
reg delete "HKCU\Software\com.vulcanx.mannequin-dressing-studio" /f >nul 2>&1
reg delete "HKCU\Software\Mannequin Dressing Studio" /f >nul 2>&1
if "!FOUND!"=="0" echo       no leftover entries found
echo.

echo [4/6] Removing shortcuts...
del /F /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Mannequin Dressing Studio.lnk" >nul 2>&1
del /F /Q "%USERPROFILE%\Desktop\Mannequin Dressing Studio.lnk" >nul 2>&1
if /i "!WIPE!"=="Y" (
    if exist "%DATA%" rmdir /S /Q "%DATA%" >nul 2>&1
    echo       done - all data erased, you will re-enter the API key
) else (
    echo       done - your data and API key were kept
)
echo.
echo       ===== CHECK RESULT =====
if exist "%DIR%" (echo       [X]  old folder still there) else (echo       [OK] old folder is gone)
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall" /s /f "Mannequin Dressing Studio" /d >nul 2>&1
if errorlevel 1 (echo       [OK] no leftover registry entry) else (echo       [X]  registry entry remains - run as administrator)
echo.

echo [5/6] Downloading installer v%VER% (about 98 MB)...
if exist "%SETUP%" del /F /Q "%SETUP%" >nul 2>&1
curl -L --fail --retry 2 -o "%SETUP%" "%URL%"
if not exist "%SETUP%" goto :dlfail
for %%A in ("%SETUP%") do set "GOT=%%~zA"
echo       got !GOT! bytes  (expected %EXPECTED_SIZE%)
if not "!GOT!"=="%EXPECTED_SIZE%" goto :corrupt
echo       file is complete
echo.

echo [6/6] Starting the installer...
echo       If you see the blue "Windows protected your PC" screen,
echo       click "More info" then "Run anyway".
timeout /t 2 /nobreak >nul
start "" "%SETUP%"
echo.
echo ============================================================
echo   Done. The "cannot be closed" box should not appear again -
echo   there is no old version left for Setup to uninstall.
echo ============================================================
echo.
pause
exit /b 0

:corrupt
echo.
echo    *** The downloaded file is incomplete - antivirus likely cut it ***
echo    Turn McAfee off for a moment, then run this file again.
echo.
del /F /Q "%SETUP%" >nul 2>&1
pause
exit /b 1

:dlfail
echo.
echo    *** Download failed - no internet, or antivirus blocked it ***
echo    Opening the download page in your browser instead...
start "" "https://github.com/VulcanXTH/mannequin-dressing-studio/releases/latest"
echo.
pause
exit /b 1
