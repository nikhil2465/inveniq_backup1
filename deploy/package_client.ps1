#Requires -Version 5.1
<#
.SYNOPSIS
    InvenIQ - Client Package Builder
    Creates a ready-to-install ZIP for client delivery.

    PREREQUISITES (run once before this script):
        deploy\windows\build_exe.bat   <- compiles InvenIQ.exe

    OUTPUT:
        dist\InvenIQ-Client-v3-<date>.zip

    WHAT THE CLIENT RECEIVES:
        InvenIQ.exe         <- entire application, no Python source visible
        _internal\          <- runtime libraries (do not modify)
        frontend\build\     <- web interface (minified, no source code)
        data\               <- application data
        .env.SETUP          <- configuration template (client fills in API key + password)
        Start InvenIQ.bat   <- launch the application
        Stop InvenIQ.bat    <- stop the application
        Setup.bat           <- first-time configuration wizard

    NO cloud, NO server subscription, NO Python required on client machine.
#>

$ErrorActionPreference = "Stop"

$ROOT     = Resolve-Path "$PSScriptRoot\.."
$DATE     = Get-Date -Format "yyyy-MM-dd"
$PKG_NAME = "InvenIQ-Client-v3-$DATE"
$DIST_DIR = Join-Path $ROOT "dist"
$STAGE    = Join-Path $DIST_DIR $PKG_NAME
$OUT_ZIP  = Join-Path $DIST_DIR "$PKG_NAME.zip"
$EXE_DIR  = Join-Path $ROOT "dist\exe\InvenIQ"

Write-Host ""
Write-Host " ================================================================" -ForegroundColor Cyan
Write-Host "  InvenIQ — Client Package Builder" -ForegroundColor Cyan
Write-Host " ================================================================" -ForegroundColor Cyan
Write-Host ""

# ── [1] Verify compiled exe exists ───────────────────────────────────────────
Write-Host "[1/7] Checking compiled executable..."
if (-not (Test-Path (Join-Path $EXE_DIR "InvenIQ.exe"))) {
    Write-Host "" -ForegroundColor Red
    Write-Host "  ERROR: Compiled executable not found at:" -ForegroundColor Red
    Write-Host "         $EXE_DIR\InvenIQ.exe" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Run this first:" -ForegroundColor Yellow
    Write-Host "    deploy\windows\build_exe.bat" -ForegroundColor White
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "       InvenIQ.exe found. OK" -ForegroundColor Green

# ── [2] Verify React build exists ────────────────────────────────────────────
Write-Host "[2/7] Checking React production build..."
$buildIndex = Join-Path $ROOT "frontend\build\index.html"
if (-not (Test-Path $buildIndex)) {
    Write-Host "       Build missing — rebuilding..." -ForegroundColor Yellow
    $env:NODE_OPTIONS       = "--max-old-space-size=4096"
    $env:GENERATE_SOURCEMAP = "false"
    Push-Location (Join-Path $ROOT "frontend")
    npm run build
    Pop-Location
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: React build failed." -ForegroundColor Red
        Read-Host; exit 1
    }
    Write-Host "       Frontend built." -ForegroundColor Green
} else {
    Write-Host "       Frontend build exists. OK" -ForegroundColor Green
}

# ── [3] Create staging directory ─────────────────────────────────────────────
Write-Host "[3/7] Preparing package directory..."
if (Test-Path $STAGE) { Remove-Item $STAGE -Recurse -Force }
$null = New-Item -ItemType Directory -Path $STAGE

# ── [4] Copy compiled executable bundle ──────────────────────────────────────
Write-Host "[4/7] Copying compiled application..."
Copy-Item (Join-Path $EXE_DIR "InvenIQ.exe") $STAGE -Force

# Copy _internal/ (PyInstaller runtime) — or whatever PyInstaller names it
$runtimeFolders = Get-ChildItem $EXE_DIR -Directory | Where-Object { $_.Name -ne "frontend" -and $_.Name -ne "data" }
foreach ($folder in $runtimeFolders) {
    $dest = Join-Path $STAGE $folder.Name
    Copy-Item $folder.FullName $dest -Recurse -Force
}
Write-Host "       Executable bundle copied." -ForegroundColor Green

# ── [5] Copy React build (compiled SPA — no JSX source) ──────────────────────
Write-Host "[5/7] Copying web interface..."
$null = New-Item -ItemType Directory -Path "$STAGE\frontend\build" -Force
Copy-Item (Join-Path $ROOT "frontend\build\*") "$STAGE\frontend\build" -Recurse -Force
Write-Host "       Web interface copied." -ForegroundColor Green

# ── [6] Copy data folder ──────────────────────────────────────────────────────
Write-Host "[6/7] Copying application data..."
$null = New-Item -ItemType Directory -Path "$STAGE\data" -Force
$dataSource = Join-Path $ROOT "backend\data"
if (Test-Path $dataSource) {
    Copy-Item "$dataSource\*" "$STAGE\data\" -Recurse -Force
}
Write-Host "       Data files copied." -ForegroundColor Green

# ── [7] Generate configuration template + launcher scripts ───────────────────
Write-Host "[7/7] Generating configuration and launcher scripts..."

# Fresh random 32-byte JWT secret for this deployment
$jwtBytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($jwtBytes)
$JWT_KEY = -join ($jwtBytes | ForEach-Object { $_.ToString("x2") })

# .env.SETUP — configuration template for the client
@"
# =============================================================
# InvenIQ — Configuration File
#
# SETUP STEPS:
#   1. Rename this file to:   .env
#   2. Fill in OPENAI_API_KEY (get it from your InvenIQ provider)
#   3. Set AUTH_PASSWORD to a strong private password
#   4. Leave MYSQL_HOST blank — the app works in Demo Mode
#      without any database. Contact your provider to enable
#      live database mode.
#   5. Save and close, then run  Start InvenIQ.bat
# =============================================================

# AI Features key — required for AI assistant and analysis
OPENAI_API_KEY=

# Login credentials for this installation
AUTH_USERNAME=client
AUTH_PASSWORD=CHANGE-TO-YOUR-SECURE-PASSWORD
AUTH_DISPLAY_NAME=
AUTH_EMAIL=
AUTH_ROLE=client
AUTH_ALLOWED_MODULES=quotes,customers,catalog,chatbot,settings,about

# Owner access (for your InvenIQ administrator)
OWNER_USERNAME=admin
OWNER_PASSWORD=CHANGE-TO-YOUR-PRIVATE-ADMIN-PASSWORD
OWNER_DISPLAY_NAME=Admin

# Database — leave blank to run in Demo Mode (no database needed)
MYSQL_HOST=
MYSQL_PORT=3306
MYSQL_USER=
MYSQL_PASSWORD=
MYSQL_DB=stocksense_inventory

# Security (pre-generated — do not change)
JWT_SECRET_KEY=$JWT_KEY
ACCESS_TOKEN_EXPIRE_HOURS=8
"@ | Out-File -FilePath "$STAGE\.env.SETUP" -Encoding utf8 -Force

# Start InvenIQ.bat — clean launcher, no tech stack visible
@'
@echo off
title InvenIQ
cd /d "%~dp0"

:: Check if already running
tasklist /FI "IMAGENAME eq InvenIQ.exe" 2>nul | find /I "InvenIQ.exe" >nul
if not errorlevel 1 (
  echo InvenIQ is already running.
  start http://localhost:8000
  timeout /t 2 /nobreak >nul
  exit /b 0
)

:: Check configuration
if not exist ".env" (
  if exist ".env.SETUP" (
    echo.
    echo  InvenIQ needs to be configured before first use.
    echo  Running setup...
    echo.
    call "Setup.bat"
    exit /b
  )
)

:: Launch
echo Starting InvenIQ...
start "" /min "InvenIQ.exe"
timeout /t 4 /nobreak >nul
start http://localhost:8000
echo InvenIQ is running.  Access at: http://localhost:8000
echo.
echo This window will close in 5 seconds.
timeout /t 5 /nobreak >nul
'@ | Out-File -FilePath "$STAGE\Start InvenIQ.bat" -Encoding ascii -Force

# Stop InvenIQ.bat
@'
@echo off
title InvenIQ — Stop
cd /d "%~dp0"
echo Stopping InvenIQ...
taskkill /F /IM InvenIQ.exe >nul 2>&1
if errorlevel 1 (
  echo InvenIQ was not running.
) else (
  echo InvenIQ stopped successfully.
)
timeout /t 2 /nobreak >nul
'@ | Out-File -FilePath "$STAGE\Stop InvenIQ.bat" -Encoding ascii -Force

# Setup.bat — first-time configuration wizard
@'
@echo off
title InvenIQ — First-Time Setup
color 0A
cd /d "%~dp0"
echo.
echo  ================================================================
echo   InvenIQ — First-Time Setup
echo  ================================================================
echo.

if exist ".env" (
  echo  Configuration already exists.
  echo  To reconfigure, delete the .env file and run this again.
  echo.
  pause
  exit /b 0
)

if not exist ".env.SETUP" (
  echo  ERROR: Configuration template not found.
  echo  Contact your InvenIQ provider.
  pause
  exit /b 1
)

copy ".env.SETUP" ".env" >nul
echo  [1/2] Configuration file created.
echo.
echo  [2/2] Please fill in your credentials.
echo        Notepad will open — set your password and API key, then save.
echo.
pause
notepad ".env"
echo.
echo  ================================================================
echo   Setup complete!
echo   Run  "Start InvenIQ.bat"  to launch the application.
echo  ================================================================
echo.
pause
'@ | Out-File -FilePath "$STAGE\Setup.bat" -Encoding ascii -Force

Write-Host "       Launcher scripts created." -ForegroundColor Green

# ── Create ZIP ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Creating ZIP archive..."
if (Test-Path $OUT_ZIP) { Remove-Item $OUT_ZIP -Force }
Compress-Archive -Path $STAGE -DestinationPath $OUT_ZIP -Force
Remove-Item $STAGE -Recurse -Force

$sizeMB = [math]::Round((Get-Item $OUT_ZIP).Length / 1MB, 1)

Write-Host ""
Write-Host " ================================================================" -ForegroundColor Green
Write-Host "  PACKAGE READY FOR DELIVERY" -ForegroundColor Green
Write-Host " ================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  File : $OUT_ZIP" -ForegroundColor White
Write-Host "  Size : $sizeMB MB" -ForegroundColor White
Write-Host ""
Write-Host "  ── WHAT TO SEND TO YOUR CLIENT ─────────────────────────────" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Send:  $PKG_NAME.zip" -ForegroundColor White
Write-Host ""
Write-Host "  ── CLIENT SETUP (3 steps) ──────────────────────────────────" -ForegroundColor Cyan
Write-Host ""
Write-Host "    1. Unzip anywhere, e.g.  C:\InvenIQ\" -ForegroundColor White
Write-Host "    2. Double-click  Setup.bat  (fills in password + API key)" -ForegroundColor White
Write-Host "    3. Double-click  Start InvenIQ.bat  — browser opens automatically" -ForegroundColor White
Write-Host ""
Write-Host "  ── WHAT YOUR CLIENT CANNOT SEE ─────────────────────────────" -ForegroundColor Cyan
Write-Host ""
Write-Host "    Source code (.py)  - compiled into InvenIQ.exe" -ForegroundColor Gray
Write-Host "    Tech stack         - no Python, pip, or library names visible" -ForegroundColor Gray
Write-Host "    Database config    - only what client sets in .env" -ForegroundColor Gray
Write-Host "    Your API keys      - .env template has blank values" -ForegroundColor Gray
Write-Host ""
Write-Host " ================================================================" -ForegroundColor Green
Write-Host ""
