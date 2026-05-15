@echo off
title InvenIQ v3.0 — Production Server
color 0A
setlocal enabledelayedexpansion

echo.
echo  ================================================================
echo   InvenIQ v3.0 — Starting Production Server
echo  ================================================================
echo.

set ROOT=%~dp0..\..
set PORT=8000

:: ── Validate setup ──────────────────────────────────────────────────────────
if not exist "%ROOT%\backend\.env" (
  echo  ERROR: backend\.env not found.
  echo  Run deploy\windows\install.bat first.
  pause
  exit /b 1
)

if not exist "%ROOT%\backend\.venv\Scripts\activate.bat" (
  echo  ERROR: Python virtual environment not found.
  echo  Run deploy\windows\install.bat first.
  pause
  exit /b 1
)

if not exist "%ROOT%\frontend\build\index.html" (
  echo  ERROR: React build not found.
  echo  Run deploy\windows\install.bat first, or:
  echo    cd frontend ^&^& npm run build
  pause
  exit /b 1
)

:: ── Kill anything on target port ────────────────────────────────────────────
echo [1/3] Freeing port %PORT%...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING 2^>nul') do (
  taskkill /PID %%p /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ── Detect LAN IP ───────────────────────────────────────────────────────────
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
  set LAN_IP=%%i
  set LAN_IP=!LAN_IP: =!
  goto :GOT_IP
)
:GOT_IP

:: ── Start FastAPI (serves React build + API on single port) ─────────────────
echo [2/3] Starting InvenIQ server...
cd /d "%ROOT%\backend"
call .venv\Scripts\activate.bat

:: 4 workers, bind to all interfaces so LAN clients can connect
start "InvenIQ Server" /min cmd /k "uvicorn app.main:app --host 0.0.0.0 --port %PORT% --workers 4 --proxy-headers"

:: ── Wait for health check ───────────────────────────────────────────────────
echo [3/3] Waiting for server to be ready...
set COUNT=0
:WAIT_LOOP
timeout /t 2 /nobreak >nul
curl -s -o nul -w "%%{http_code}" http://127.0.0.1:%PORT%/api/health 2>nul | findstr "200" >nul
if not errorlevel 1 goto READY
set /a COUNT+=1
if %COUNT% lss 20 goto WAIT_LOOP
echo  WARNING: Server slow to start — check the server window.
goto SHOW_URLS

:READY
echo        Server ready!

:SHOW_URLS
echo.
echo  ================================================================
echo   InvenIQ is running!
echo.
echo   This machine  : http://localhost:%PORT%
if defined LAN_IP (
echo   Local network : http://%LAN_IP%:%PORT%
echo   Share the LAN address with other devices on this network.
)
echo.
echo   Login: admin / inveniq@2024  (change in backend\.env)
echo.
echo   To stop: run deploy\windows\stop.bat
echo  ================================================================
echo.

:: Open browser on this machine
timeout /t 3 /nobreak >nul
start http://localhost:%PORT%
