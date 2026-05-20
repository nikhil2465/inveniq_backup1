@echo off
title InvenIQ v3.1 - Production
color 0A
setlocal enabledelayedexpansion

echo.
echo  ================================================================
echo   InvenIQ v3.1 - Production Startup
echo  ================================================================
echo.

set PORT=8000
set ROOT=%~dp0

:: ── Client access credentials ─────────────────────────────────────────────────
:: These override backend/.env for this session only.
:: IMPORTANT: Change AUTH_PASSWORD before sharing this file.
set AUTH_USERNAME=client
set AUTH_PASSWORD=Client@2026
set AUTH_DISPLAY_NAME=Client
set AUTH_ROLE=client
set AUTH_ALLOWED_MODULES=quotes,customers,catalog,chatbot,settings,about

:: ─────────────────────────────────────────────────────────────────────────────
:: [1/6]  Prerequisites
:: ─────────────────────────────────────────────────────────────────────────────
echo [1/6] Checking prerequisites...

if not exist "%ROOT%backend\.env" (
  echo.
  echo  ERROR: backend\.env not found.
  echo  Run deploy\windows\install.bat, or:
  echo    copy deploy\client.env.example backend\.env
  echo  Then fill in OPENAI_API_KEY and JWT_SECRET_KEY.
  echo.
  pause
  exit /b 1
)

python --version >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Python not found in PATH.
  echo  Download from: https://www.python.org/downloads/
  echo  Check "Add Python to PATH" during install.
  pause
  exit /b 1
)

python -m uvicorn --version >nul 2>&1
if errorlevel 1 (
  echo  ERROR: uvicorn not installed.
  echo  Run: pip install -r backend\requirements.txt
  pause
  exit /b 1
)

:: Warn if OPENAI_API_KEY looks unconfigured — AI chat silently fails without it
findstr /I "OPENAI_API_KEY=sk-" "%ROOT%backend\.env" >nul 2>&1
if errorlevel 1 (
  echo.
  echo  WARNING: OPENAI_API_KEY not set in backend\.env
  echo  AI Assistant / chatbot will not work until this is configured.
  echo  Get a key: https://platform.openai.com/api-keys
  echo.
)

echo        Prerequisites OK.

:: ─────────────────────────────────────────────────────────────────────────────
:: [2/6]  React frontend build
::
::  First run: automatically builds if frontend\build\index.html is missing.
::  Force a fresh build any time: start_prod.bat /rebuild
:: ─────────────────────────────────────────────────────────────────────────────
if /i "%~1"=="/rebuild" goto DO_BUILD
if not exist "%ROOT%frontend\build\index.html" (
  echo [2/6] React build not found - building now...
  goto DO_BUILD
)
echo [2/6] React build found.  To force a fresh build: start_prod.bat /rebuild
goto BUILD_DONE

:DO_BUILD
echo [2/6] Building React frontend (~90 seconds)...
cd /d "%ROOT%frontend"
set "NODE_OPTIONS=--max-old-space-size=4096"
set "GENERATE_SOURCEMAP=false"
call npm ci --prefer-offline --no-audit
if errorlevel 1 (
  echo  ERROR: npm ci failed. Check your internet connection or node_modules.
  pause
  exit /b 1
)
call npm run build
if errorlevel 1 (
  echo  ERROR: React build failed. See output above for details.
  pause
  exit /b 1
)
echo        React build complete.

:BUILD_DONE

:: ─────────────────────────────────────────────────────────────────────────────
:: [3/6]  Free port %PORT%
:: ─────────────────────────────────────────────────────────────────────────────
echo [3/6] Freeing port %PORT%...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING 2^>nul') do (
  taskkill /PID %%p /F /T >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ─────────────────────────────────────────────────────────────────────────────
:: [4/6]  Detect LAN IP for network sharing
:: ─────────────────────────────────────────────────────────────────────────────
set LAN_IP=
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
  if not defined LAN_IP (
    set _tmp=%%i
    set _tmp=!_tmp: =!
    echo !_tmp! | findstr /b "127." >nul
    if errorlevel 1 set LAN_IP=!_tmp!
  )
)

:: ─────────────────────────────────────────────────────────────────────────────
:: [5/6]  Start InvenIQ server
:: ─────────────────────────────────────────────────────────────────────────────
echo [5/6] Starting InvenIQ server (port %PORT%)...
cd /d "%ROOT%backend"

if exist ".venv\Scripts\activate.bat" (
  call .venv\Scripts\activate.bat
)

:: uvicorn production flags:
::
::   --timeout-keep-alive 75    CRITICAL for AI chat.  The AI Assistant uses
::                              Server-Sent Events (SSE).  GPT-4o has a 60 s API
::                              timeout; the default 5 s keep-alive would cut the
::                              stream before the first token arrives on slow queries.
::                              75 s gives a 15 s buffer beyond the OpenAI timeout.
::
::   --timeout-graceful-shutdown 30
::                              On stop, wait up to 30 s for in-flight requests
::                              (including active AI streams) to finish cleanly.
::
::   --log-level warning        Suppresses per-request access log noise.
::                              Errors, warnings, and startup messages still shown.
::
::   --workers 4                4 independent worker processes.  Each handles its
::                              own requests and OpenAI calls concurrently.
::
::   --proxy-headers            Respect X-Forwarded-* headers from a reverse proxy.

start "InvenIQ Server" /min cmd /k "uvicorn app.main:app --host 0.0.0.0 --port %PORT% --workers 4 --proxy-headers --timeout-keep-alive 75 --timeout-graceful-shutdown 30 --log-level warning"

:: ─────────────────────────────────────────────────────────────────────────────
:: [6/6]  Health check — polls /api/health every 2 s, up to 40 s
:: ─────────────────────────────────────────────────────────────────────────────
echo [6/6] Waiting for server...
set COUNT=0
:WAIT_LOOP
timeout /t 2 /nobreak >nul
curl -s -o nul -w "%%{http_code}" http://127.0.0.1:%PORT%/api/health 2>nul | findstr "200" >nul
if not errorlevel 1 goto READY
set /a COUNT+=1
if %COUNT% lss 20 goto WAIT_LOOP
echo  WARNING: Server slow to start. Open the minimized "InvenIQ Server" window
echo  and check for errors (missing packages, port conflict, etc).
goto SHOW_URLS

:READY
echo        Server ready!

:: ─────────────────────────────────────────────────────────────────────────────
::  InvenIQ is live!
:: ─────────────────────────────────────────────────────────────────────────────
:SHOW_URLS
echo.
echo  ================================================================
echo   InvenIQ v3.1 is live!
echo  ================================================================
echo.
echo   ACCESS
echo     This machine  :  http://localhost:%PORT%
if defined LAN_IP (
echo     Local network :  http://%LAN_IP%:%PORT%
echo     (Share the LAN URL with other devices on the same Wi-Fi / network)
)
echo.
echo   LOGINS
echo     Client        :  %AUTH_USERNAME% / %AUTH_PASSWORD%
echo     Admin / Owner :  see backend\.env  (OWNER_USERNAME / OWNER_PASSWORD)
echo.
echo   CLIENT MODULES  (%AUTH_ALLOWED_MODULES%)
echo     Quotation Builder   - create, manage, email PDF quotations
echo     Customer Intel      - customer list, import, analytics
echo     Product Catalog     - full product library with specs
echo     AI Assistant        - GPT-4o chat, demand insights, RCA
echo     Settings / About    - preferences and version info
echo.
echo   AI ASSISTANT STATUS
findstr /I "OPENAI_API_KEY=sk-" "%ROOT%backend\.env" >nul 2>&1
if errorlevel 1 (
echo     NOT ACTIVE  --  set OPENAI_API_KEY=sk-... in backend\.env
) else (
echo     ACTIVE  --  GPT-4o powered (chat, insights, demand forecast, RCA)
)
echo.
echo   COMMANDS
echo     Stop server   :  deploy\windows\stop.bat
echo     Update app    :  deploy\windows\update.bat
echo     Force rebuild :  start_prod.bat /rebuild
echo     Backup        :  (backup ZIP saved to C:\InvenIQ_Backups\ last run)
echo.
echo   NOTE: Change AUTH_PASSWORD before sharing this file with clients.
echo  ================================================================
echo.
timeout /t 3 /nobreak >nul
start http://localhost:%PORT%
