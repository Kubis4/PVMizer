@echo off
title Solar Panel Simulation - Build Windows Executable
color 0B

echo.
echo  =====================================================
echo   Solar Panel Simulation - Build Windows Executable
echo  =====================================================
echo.
echo  This will create:
echo    - An NSIS installer (.exe)
echo    - A portable executable (.exe)
echo.
echo  Output folder: dist\
echo.

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo  [ERROR] Node.js is not installed!
    echo  Download from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  Node.js %NODE_VER% found.
echo.

:: Install all dependencies (including devDependencies for electron-builder)
echo  Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo  [ERROR] npm install failed!
    pause
    exit /b 1
)

echo.
echo  Building Windows executables...
echo  (This may take 5-10 minutes on first build)
echo.

call npm run build

if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo  [ERROR] Build failed!
    echo  Check the output above for error details.
    echo.
    pause
    exit /b 1
)

echo.
color 0A
echo  =====================================================
echo   BUILD SUCCESSFUL!
echo  =====================================================
echo.
echo  Your executables are in the 'dist\' folder:
echo.

:: List the dist folder contents
if exist "dist\" (
    dir /b "dist\*.exe" 2>nul
)

echo.
echo  - The Setup .exe installs the app with Start Menu shortcuts
echo  - The Portable .exe runs directly, no installation needed
echo.
pause
