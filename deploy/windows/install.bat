@echo off
title InvenIQ — First-Time Setup
color 0A
setlocal enabledelayedexpansion

echo.
echo  ================================================================
echo   InvenIQ v3.0 — Windows Installation
echo   This runs once to set up the application on this machine.
echo  ================================================================
echo.

:: ── Check Python ────────────────────────────────────────────────────────────
echo [1/7] Checking Python 3.10+...
python --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo  ERROR: Python not found.
  echo  Download from: https://www.python.org/downloads/
  echo  IMPORTANT: Check "Add Python to PATH" during install.
  pause
  exit /b 1
)
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo        Python %PY_VER% found. OK

:: ── Check Node.js ───────────────────────────────────────────────────────────
echo [2/7] Checking Node.js 18+...
node --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo  ERROR: Node.js not found.
  echo  Download LTS from: https://nodejs.org/
  pause
  exit /b 1
)
for /f %%v in ('node --version 2^>^&1') do set NODE_VER=%%v
echo        Node.js %NODE_VER% found. OK

:: ── Project root ────────────────────────────────────────────────────────────
set ROOT=%~dp0..\..

:: ── Python virtual environment ──────────────────────────────────────────────
echo [3/7] Creating Python virtual environment...
cd /d "%ROOT%\backend"
if exist ".venv" (
  echo        .venv already exists — skipping creation.
) else (
  python -m venv .venv
  echo        Virtual environment created.
)

:: ── Install Python dependencies ─────────────────────────────────────────────
echo [4/7] Installing Python dependencies...
call .venv\Scripts\activate.bat
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
echo        Python packages installed.

:: ── Create .env if missing ──────────────────────────────────────────────────
echo [5/7] Setting up environment file...
if not exist "%ROOT%\backend\.env" (
  copy "%ROOT%\backend\.env.example" "%ROOT%\backend\.env" >nul
  echo        .env created from template.
  echo.
  echo  ACTION REQUIRED: Open backend\.env and fill in:
  echo    OPENAI_API_KEY  — get from https://platform.openai.com/api-keys
  echo    MYSQL_HOST      — optional, leave blank for demo mode
  echo    JWT_SECRET_KEY  — change to a random 32+ char string
  echo.
  pause
) else (
  echo        .env already exists — skipping.
)

:: ── Build React frontend ─────────────────────────────────────────────────────
echo [6/7] Building React frontend (this takes ~60 seconds)...
cd /d "%ROOT%\frontend"
call npm ci --prefer-offline --no-audit
call npm run build
if errorlevel 1 (
  echo  ERROR: React build failed. See output above.
  pause
  exit /b 1
)
echo        React build complete.

:: ── Done ────────────────────────────────────────────────────────────────────
echo [7/7] Installation complete!
echo.
echo  ================================================================
echo   Setup done. Next steps:
echo     1. Edit backend\.env with your API keys (if not done above)
echo     2. Run deploy\windows\start.bat to launch the application
echo     3. Access at http://localhost:8000
echo  ================================================================
echo.
pause
