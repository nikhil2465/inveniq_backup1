@echo off
title InvenIQ v3.0 - Production
color 0A
setlocal enabledelayedexpansion

echo.
echo  ================================================================
echo   InvenIQ v3.0 - Production Startup
echo  ================================================================
echo.

set PORT=8000

:: Module access restriction — overrides backend/.env for this session.
:: AUTH_USERNAME / AUTH_PASSWORD set the login credentials the client uses.
:: AUTH_ROLE=client enforces module-level access restrictions.
:: AUTH_ALLOWED_MODULES controls which modules are visible to the client.
:: Admin/owner accounts always retain full access regardless of these settings.
set AUTH_USERNAME=client
set AUTH_PASSWORD=inveniq@2024
set AUTH_DISPLAY_NAME=Client
set AUTH_ROLE=client
set AUTH_ALLOWED_MODULES=quotes,customers,catalog,chatbot,settings,about

:: Validate prerequisites
echo [1/5] Checking prerequisites...
if not exist "%~dp0backend\.env" (
  echo  ERROR: backend\.env not found.
  echo  Run: copy backend\.env.example backend\.env and fill in your keys.
  pause
  exit /b 1
)
if not exist "%~dp0frontend\build\index.html" (
  echo  React build not found - building now ^(takes ~60 seconds^)...
  cd /d "%~dp0frontend"
  call npm ci --prefer-offline --no-audit
  call npm run build
  if errorlevel 1 (
    echo  ERROR: React build failed.
    pause
    exit /b 1
  )
  echo  React build complete.
)

:: Free port
echo [2/5] Freeing port %PORT%...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING 2^>nul') do (
  taskkill /PID %%p /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: Detect LAN IP
set LAN_IP=
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
  if not defined LAN_IP (
    set _tmp=%%i
    set _tmp=!_tmp: =!
    echo !_tmp! | findstr /b "127." >nul
    if errorlevel 1 set LAN_IP=!_tmp!
  )
)

:: Start server
echo [3/5] Starting InvenIQ server (port %PORT%)...
cd /d "%~dp0backend"

if exist ".venv\Scripts\activate.bat" (
  call .venv\Scripts\activate.bat
)

start "InvenIQ Server" /min cmd /k "uvicorn app.main:app --host 0.0.0.0 --port %PORT% --workers 4 --proxy-headers"

:: Health check
echo [4/5] Waiting for server...
set COUNT=0
:WAIT_LOOP
timeout /t 2 /nobreak >nul
curl -s -o nul -w "%%{http_code}" http://127.0.0.1:%PORT%/api/health 2>nul | findstr "200" >nul
if not errorlevel 1 goto READY
set /a COUNT+=1
if %COUNT% lss 20 goto WAIT_LOOP
echo  WARNING: Server slow to start - check the server window for errors.
goto SHOW_URLS

:READY
echo  Server ready!

:SHOW_URLS
echo [5/5] InvenIQ is live!
echo.
echo  ================================================================
echo   This machine  : http://localhost:%PORT%
if defined LAN_IP (
echo   Local network : http://%LAN_IP%:%PORT%
echo   Share the LAN URL with other devices on your network.
)
echo.
echo   Login (client access)     : client / inveniq@2024
echo.
echo   Client modules: Quotation Builder, Customer Intelligence,
echo                   Product Catalog, AI Assistant, Settings, About
echo.
echo   NOTE: Change AUTH_PASSWORD at the top of this file before deploying.
echo.
echo   To stop: close the "InvenIQ Server" window or run:
echo     deploy\windows\stop.bat
echo  ================================================================
echo.
timeout /t 3 /nobreak >nul
start http://localhost:%PORT%
