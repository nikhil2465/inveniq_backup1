@echo off
title InvenIQ — Setup
color 0A
cd /d "%~dp0..\.."
echo.
echo  ================================================================
echo   InvenIQ — First-Time Setup
echo  ================================================================
echo.

if exist "backend\.env" (
  echo  Configuration already exists.
  echo.
  echo  To launch InvenIQ:  double-click  Start InvenIQ.bat
  echo.
  pause
  exit /b 0
)

if not exist ".env.SETUP" (
  if not exist "backend\.env.SETUP" (
    echo  ERROR: Configuration template not found.
    echo  Reinstall InvenIQ or contact your provider.
    pause
    exit /b 1
  )
  set "SETUP_FILE=backend\.env.SETUP"
  set "ENV_FILE=backend\.env"
) else (
  set "SETUP_FILE=.env.SETUP"
  set "ENV_FILE=.env"
)

copy "%SETUP_FILE%" "%ENV_FILE%" >nul
echo  [1/2] Configuration file created.
echo.
echo  [2/2] Open the configuration file to set your password and API key.
echo        Notepad will open now — fill in the values and save.
echo.
pause
notepad "%ENV_FILE%"
echo.
echo  ================================================================
echo   Setup complete!
echo.
echo   To launch InvenIQ:
echo     Double-click  Start InvenIQ.bat
echo.
echo   Access at:  http://localhost:8000
echo  ================================================================
echo.
pause
