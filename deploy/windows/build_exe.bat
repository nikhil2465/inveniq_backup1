@echo off
title InvenIQ — Build Executable
color 0B
setlocal enabledelayedexpansion

echo.
echo  ================================================================
echo   InvenIQ — Compile to Windows Executable
echo   (Developer tool — run this once before packaging for clients)
echo  ================================================================
echo.

set "ROOT=%~dp0..\.."
pushd "%ROOT%"
set "ROOT=%CD%"
popd

:: ── Check Python ─────────────────────────────────────────────────────────────
echo [1/5] Checking environment...
python --version >nul 2>&1
if errorlevel 1 (
  echo   ERROR: Python not found in PATH.
  echo   Install Python 3.12 and add it to PATH, then retry.
  pause & exit /b 1
)

:: ── Activate venv ────────────────────────────────────────────────────────────
if not exist "%ROOT%\backend\.venv\Scripts\activate.bat" (
  echo   Creating virtual environment...
  python -m venv "%ROOT%\backend\.venv"
)
call "%ROOT%\backend\.venv\Scripts\activate.bat"
echo        Environment ready.

:: ── Install / upgrade PyInstaller ────────────────────────────────────────────
echo [2/5] Installing PyInstaller...
pip install pyinstaller --upgrade --quiet
if errorlevel 1 (
  echo   ERROR: Could not install PyInstaller. Check internet connection.
  pause & exit /b 1
)
pip install -r "%ROOT%\backend\requirements.txt" --quiet
echo        Done.

:: ── Build React frontend ─────────────────────────────────────────────────────
echo [3/5] Checking React production build...
if not exist "%ROOT%\frontend\build\index.html" (
  echo        Building frontend...
  set "NODE_OPTIONS=--max-old-space-size=4096"
  set "GENERATE_SOURCEMAP=false"
  cd /d "%ROOT%\frontend"
  call npm run build
  if errorlevel 1 (
    echo   ERROR: React build failed.
    pause & exit /b 1
  )
  echo        Frontend built.
) else (
  echo        Frontend build exists. OK
)

:: ── Run PyInstaller ──────────────────────────────────────────────────────────
echo [4/5] Compiling application (takes 3-6 minutes)...
echo        Please wait — do not close this window.
cd /d "%ROOT%\backend"
python -m PyInstaller inveniq.spec ^
  --distpath "..\dist\exe" ^
  --workpath "..\build\pyinstaller" ^
  --noconfirm ^
  --clean
if errorlevel 1 (
  echo.
  echo   ERROR: Compilation failed. See output above for details.
  pause & exit /b 1
)

:: ── Verify output ────────────────────────────────────────────────────────────
echo [5/5] Verifying...
if not exist "%ROOT%\dist\exe\InvenIQ\InvenIQ.exe" (
  echo   ERROR: InvenIQ.exe not found after build.
  pause & exit /b 1
)

for /f "tokens=3" %%s in ('dir "%ROOT%\dist\exe\InvenIQ" /s /-c ^| findstr "File(s)"') do set SIZE=%%s
echo        Executable verified.

echo.
echo  ================================================================
echo   COMPILATION COMPLETE
echo.
echo   Output : dist\exe\InvenIQ\InvenIQ.exe
echo.
echo   NEXT STEP:
echo   Run  deploy\package_client.bat  to create the client ZIP.
echo  ================================================================
echo.
pause
