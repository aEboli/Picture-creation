@echo off
setlocal EnableExtensions EnableDelayedExpansion
for %%I in ("%~dp0.") do set "SCRIPT_DIR=%%~fI"
if not defined SCRIPT_DIR for %%I in ("%CD%") do set "SCRIPT_DIR=%%~fI"
cd /d "%SCRIPT_DIR%"

if not exist ".runtime" mkdir ".runtime" >nul 2>nul
if not exist ".\data" mkdir ".\data" >nul 2>nul

set "PICTURE_CREATION_DATA_DIR=%SCRIPT_DIR%\data"
set "COMMERCE_STUDIO_DATA_DIR=%PICTURE_CREATION_DATA_DIR%"

set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
if not exist "%NPM_CMD%" (
  echo npm.cmd not found: %NPM_CMD%
  echo Please install Node.js or adjust this script.
  pause
  exit /b 1
)

set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE_EXE%" (
  echo node.exe not found: %NODE_EXE%
  echo Please install Node.js or adjust this script.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call "%NPM_CMD%" install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Releasing stale standalone build locks...
echo Script directory: %SCRIPT_DIR%
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%\scripts\stop-project-standalone.ps1" -ProjectRoot "%SCRIPT_DIR%"
if errorlevel 1 (
  echo Failed to release old standalone server process.
  pause
  exit /b 1
)

echo Building app for production...
call "%NPM_CMD%" run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

set "PORT="
for %%P in (3888 3001 3002 3003 3004 3005) do (
  call :TRY_PORT %%P
  if defined PORT goto :PORT_FOUND
)

echo No free port found in 3000-3005.
echo Run: netstat -ano ^| findstr LISTENING
pause
exit /b 1

:TRY_PORT
netstat -ano | findstr /R /C:":%1 .*LISTENING" >nul
if errorlevel 1 set "PORT=%1"
goto :eof

:PORT_FOUND
if not exist ".next\standalone\server.js" (
  echo Missing standalone server entry: .next\standalone\server.js
  pause
  exit /b 1
)

set "LOGFILE=%SCRIPT_DIR%\.runtime\prod-%PORT%.log"
set "ERRLOGFILE=%SCRIPT_DIR%\.runtime\prod-%PORT%.err.log"
if exist "%LOGFILE%" del "%LOGFILE%" >nul 2>nul
if exist "%ERRLOGFILE%" del "%ERRLOGFILE%" >nul 2>nul

echo Starting production server on port %PORT% ...
set "HOSTNAME=127.0.0.1"
start "Picture-creation Production" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%\scripts\start-project-standalone.ps1" -ProjectRoot "%SCRIPT_DIR%" -Port %PORT% -HostName %HOSTNAME% -DataDir "%PICTURE_CREATION_DATA_DIR%" -NodeExe "%NODE_EXE%" -OutLog "%LOGFILE%" -ErrLog "%ERRLOGFILE%"

set "READY="
for /l %%I in (1,1,25) do (
  netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
  if not errorlevel 1 (
    set "READY=1"
    goto :READY
  )
  timeout /t 1 >nul
)

if not defined READY (
  echo Production server did not start successfully.
  echo Script directory: %SCRIPT_DIR%
  echo Output log: %LOGFILE%
  echo Error log: %ERRLOGFILE%
  if exist "%LOGFILE%" (
    echo ------------- OUTPUT LOG START -------------
    type "%LOGFILE%"
    echo -------------- OUTPUT LOG END --------------
  )
  if exist "%ERRLOGFILE%" (
    echo ------------- ERROR LOG START --------------
    type "%ERRLOGFILE%"
    echo -------------- ERROR LOG END ---------------
  )
  pause
  exit /b 1
)

:READY
echo Server is ready.
echo URL: http://127.0.0.1:%PORT%
start "" http://127.0.0.1:%PORT%
echo Output log: %LOGFILE%
echo Error log: %ERRLOGFILE%
echo You can close this helper window now.
pause
exit /b 0
