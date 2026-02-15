@echo off
title Solar Panel Simulation - Setup
color 0A

echo.
echo  =====================================================
echo   Solar Panel Simulation - Setup ^& Launch
echo  =====================================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo  [ERROR] Node.js is not installed!
    echo.
    echo  Please download and install Node.js from:
    echo  https://nodejs.org  (LTS version recommended)
    echo.
    echo  After installing, run this script again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  Node.js %NODE_VER% found.
echo.

:: Install dependencies (skip if node_modules already present and up-to-date)
if not exist "node_modules\electron" (
    echo  Installing dependencies (first run only - may take a few minutes)...
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        color 0C
        echo.
        echo  [ERROR] npm install failed!
        echo  Check your internet connection and try again.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo  Dependencies installed successfully.
) else (
    echo  Dependencies already installed.
)

echo.
echo  Launching Solar Panel Simulation...
echo.

call npm start

if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo  [ERROR] App failed to launch.
    echo  Try deleting the 'node_modules' folder and running this script again.
    echo.
    pause
)
