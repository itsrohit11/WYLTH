@echo off
setlocal
echo =====================================
echo   WYLTH - Starting App
echo =====================================
echo.

cd /d "%~dp0"

REM --- Check that Node.js is installed ---
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not on your PATH.
  echo.
  echo Please install Node.js ^(LTS^) from https://nodejs.org
  echo Then close this window and run start.bat again.
  echo.
  pause
  exit /b 1
)

REM --- First run only: install dependencies ---
REM postinstall ^(scripts\setup-native.js^) automatically fetches the matching
REM better-sqlite3 binary for Electron, so no C++ build tools are needed.
if not exist "node_modules" (
  echo Installing dependencies ^(first run only, this can take a few minutes^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo ERROR: npm install failed. Scroll up to see the reason.
    pause
    exit /b 1
  )
)

echo.
echo Starting app...
call npm run dev
if errorlevel 1 (
  echo.
  echo The app exited with an error. See the messages above.
  pause
  exit /b 1
)

pause
