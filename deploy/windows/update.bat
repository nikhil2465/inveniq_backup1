@echo off
title InvenIQ — Update
color 0E
setlocal

echo.
echo  ================================================================
echo   InvenIQ — Update to Latest Version
echo  ================================================================
echo.

set ROOT=%~dp0..\..

:: ── Stop running server first ────────────────────────────────────────────────
echo [1/5] Stopping current server...
call "%~dp0stop.bat"
timeout /t 2 /nobreak >nul

:: ── Update Python packages ───────────────────────────────────────────────────
echo [2/5] Updating Python packages...
cd /d "%ROOT%\backend"
call .venv\Scripts\activate.bat
pip install -r requirements.txt --upgrade --quiet
echo        Python packages updated.

:: ── Rebuild React frontend ───────────────────────────────────────────────────
echo [3/5] Rebuilding frontend...
cd /d "%ROOT%\frontend"
set "NODE_OPTIONS=--max-old-space-size=4096"
set "GENERATE_SOURCEMAP=false"
call npm ci --prefer-offline --no-audit
call npm run build
if errorlevel 1 (
  echo  ERROR: React build failed.
  pause
  exit /b 1
)
echo        Frontend rebuilt.

:: ── Clear old browser cache hint ────────────────────────────────────────────
echo [4/5] Update complete — content hashes refreshed.

:: ── Restart server ───────────────────────────────────────────────────────────
echo [5/5] Restarting server...
call "%~dp0start.bat"
