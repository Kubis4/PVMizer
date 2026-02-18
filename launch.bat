@echo off
set "PATH=C:\Users\KubicaVl\workspace\node;%PATH%"
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0"
call npx electron .
