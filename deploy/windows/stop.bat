@echo off
title InvenIQ — Stop Server
color 0C

echo.
echo  Stopping InvenIQ server...

:: Kill uvicorn workers on port 8000
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8000 " ^| findstr LISTENING 2^>nul') do (
  taskkill /PID %%p /F >nul 2>&1
  echo    Stopped process PID %%p
)

:: Also kill any window titled "InvenIQ Server"
taskkill /FI "WINDOWTITLE eq InvenIQ Server*" /F >nul 2>&1

echo.
echo  InvenIQ stopped.
echo.
timeout /t 2 /nobreak >nul
