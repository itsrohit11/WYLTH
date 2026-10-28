@echo off
setlocal
echo =====================================
echo   WYLTH - Build .exe
echo =====================================
echo.

cd /d "%~dp0"

REM --- Check that Node.js is installed ---
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not on your PATH.
  echo Please install Node.js ^(LTS^) from https://nodejs.org and try again.
  pause
  exit /b 1
)

REM --- First run only: install dependencies ---
REM postinstall ^(scripts\setup-native.js^) fetches the matching better-sqlite3
REM binary for Electron, so no C++ build tools are needed.
if not exist "node_modules" (
  echo Installing dependencies ^(this can take a few minutes^)...
  call npm install
  if errorlevel 1 ( echo. & echo ERROR: npm install failed. Scroll up for details. & pause & exit /b 1 )
)

echo.
echo Building React app...
call npm run build
if errorlevel 1 ( echo. & echo ERROR: React build failed. & pause & exit /b 1 )

echo.
echo Packaging Electron app...
call npx electron-builder --win
if errorlevel 1 ( echo. & echo ERROR: Packaging failed. & pause & exit /b 1 )

echo.
echo ======================================
echo BUILD COMPLETE!
echo Your app is in the "release" folder:
echo   Installer: release\WYLTH Setup ^<version^>.exe
echo   Portable:  release\WYLTH ^<version^>.exe
echo ======================================
echo.
echo Opening the release folder...
if exist "release" start "" "release"
pause
