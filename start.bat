@echo off
title InvenIQ Startup
color 0A

echo ==========================================
echo   InvenIQ v3.1 - AI Inventory Platform
echo ==========================================
echo.

:: Kill any existing processes on 8000 and 3000
echo [1/4] Clearing ports 8000 and 3000...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8000 " ^| findstr LISTENING 2^>nul') do taskkill /PID %%p /F >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING 2^>nul') do taskkill /PID %%p /F >nul 2>&1
timeout /t 1 /nobreak >nul

:: Start Backend
echo [2/4] Starting backend (FastAPI on port 8000)...
cd /d "%~dp0backend"
start "InvenIQ Backend" cmd /k "uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

:: Poll until backend is ready (up to ~20 s)
echo [3/4] Waiting for backend health check...
set COUNT=0
:WAIT_LOOP
timeout /t 2 /nobreak >nul
curl -s -o nul -w "%%{http_code}" http://127.0.0.1:8000/api/health 2>nul | findstr "200" >nul
if not errorlevel 1 goto BACKEND_READY
set /a COUNT+=1
if %COUNT% lss 10 goto WAIT_LOOP
echo      Backend is slow to start — continuing anyway...
goto START_FRONTEND
:BACKEND_READY
echo      Backend ready on :8000

:: Start Frontend
:START_FRONTEND
echo [4/4] Starting frontend (React on port 3000)...
cd /d "%~dp0frontend"
start "InvenIQ Frontend" cmd /k "set BROWSER=none && npm start"

echo.
echo ==========================================
echo   Frontend : http://localhost:3000
echo   API Docs : http://localhost:8000/docs
echo ==========================================
echo.
timeout /t 12 /nobreak >nul
start http://localhost:3000
