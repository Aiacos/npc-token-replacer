@echo off
REM
REM Build script for NPC Token Replacer Foundry VTT module
REM Creates a distributable ZIP package in the releases/ folder
REM

setlocal EnableDelayedExpansion

REM Change to script directory
cd /d "%~dp0"

echo ========================================
echo   NPC Token Replacer - Build Script
echo ========================================
echo.

REM Module configuration
set "MODULE_ID=npc-token-replacer"

REM Check for required files
echo [1/6] Checking required files...

if not exist "module.json" (
    echo ERROR: module.json not found!
    exit /b 1
)

REM Extract version from module.json using PowerShell
for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(Get-Content 'module.json' | ConvertFrom-Json).version"`) do set "VERSION=%%v"

if "%VERSION%"=="" (
    echo ERROR: Could not extract version from module.json
    exit /b 1
)

echo   Found version: %VERSION%

REM Output file name
set "OUTPUT_FILE=%MODULE_ID%-v%VERSION%.zip"

REM Check required files
if not exist "README.md" (
    echo ERROR: Required file 'README.md' not found!
    exit /b 1
)

REM Check required directories
if not exist "scripts\" (
    echo ERROR: Required directory 'scripts' not found!
    exit /b 1
)

if not exist "templates\" (
    echo ERROR: Required directory 'templates' not found!
    exit /b 1
)

if not exist "lang\" (
    echo ERROR: Required directory 'lang' not found!
    exit /b 1
)

echo   All required files present OK

REM Create releases directory if it doesn't exist
echo [2/6] Creating releases directory...
if not exist "releases\" mkdir releases
echo   OK

REM Create temp directory
echo [3/6] Creating temporary staging directory...
set "TEMP_DIR=%TEMP%\npc-token-replacer-build-%RANDOM%"
mkdir "%TEMP_DIR%"
if errorlevel 1 (
    echo ERROR: Failed to create temp directory
    exit /b 1
)
echo   OK

REM Copy files to temp directory
echo [4/6] Staging files for packaging...

REM Copy required files
copy /y "module.json" "%TEMP_DIR%\" >nul
echo   Copied: module.json
copy /y "README.md" "%TEMP_DIR%\" >nul
echo   Copied: README.md

REM Copy required directories
xcopy /e /i /q /y "scripts" "%TEMP_DIR%\scripts" >nul
echo   Copied: scripts/
xcopy /e /i /q /y "templates" "%TEMP_DIR%\templates" >nul
echo   Copied: templates/
xcopy /e /i /q /y "lang" "%TEMP_DIR%\lang" >nul
echo   Copied: lang/

REM Copy optional files if they exist
if exist "LICENSE" (
    copy /y "LICENSE" "%TEMP_DIR%\" >nul
    echo   Copied: LICENSE
) else (
    echo   Warning: Optional file 'LICENSE' not found ^(skipping^)
)

REM Update download URL in the staged module.json
echo [5/6] Updating module.json download URL...

set "NEW_DOWNLOAD_URL=https://github.com/Aiacos/%MODULE_ID%/releases/download/v%VERSION%/%OUTPUT_FILE%"

REM Use PowerShell to update the download URL in module.json
powershell -NoProfile -Command "$json = Get-Content '%TEMP_DIR%\module.json' -Raw | ConvertFrom-Json; $json.download = '%NEW_DOWNLOAD_URL%'; $json | ConvertTo-Json -Depth 10 | Set-Content '%TEMP_DIR%\module.json' -Encoding UTF8"

echo   Download URL set to: %NEW_DOWNLOAD_URL%

REM Create the ZIP file
echo [6/6] Creating ZIP archive...

REM Remove existing release file if it exists
if exist "releases\%OUTPUT_FILE%" (
    del /f "releases\%OUTPUT_FILE%"
    echo   Removed existing: releases\%OUTPUT_FILE%
)

REM Get the absolute path for output
set "OUTPUT_PATH=%~dp0releases\%OUTPUT_FILE%"

REM Create ZIP using PowerShell Compress-Archive
powershell -NoProfile -Command "Compress-Archive -Path '%TEMP_DIR%\*' -DestinationPath '%OUTPUT_PATH%' -Force"

if errorlevel 1 (
    echo ERROR: Failed to create ZIP file
    rd /s /q "%TEMP_DIR%" 2>nul
    exit /b 1
)

echo   OK

REM Clean up temp directory
rd /s /q "%TEMP_DIR%" 2>nul

REM Verify the ZIP was created
if exist "releases\%OUTPUT_FILE%" (
    REM Get file size using PowerShell
    for /f "usebackq delims=" %%s in (`powershell -NoProfile -Command "(Get-Item 'releases\%OUTPUT_FILE%').Length / 1KB | ForEach-Object { '{0:N1} KB' -f $_ }"`) do set "ZIP_SIZE=%%s"

    echo.
    echo ========================================
    echo   Build Successful!
    echo ========================================
    echo.
    echo   Output: releases\%OUTPUT_FILE%
    echo   Size:   !ZIP_SIZE!
    echo.
    echo   ZIP Contents:
    powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::OpenRead('releases\%OUTPUT_FILE%').Entries | ForEach-Object { '    ' + $_.FullName + ' (' + $_.Length + ' bytes)' }"
    echo.
) else (
    echo ERROR: Failed to create ZIP file
    exit /b 1
)

endlocal
