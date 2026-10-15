@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0"

:: Kill old Metro on port 8081
echo.
echo  Cleaning up old server...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8081.*LISTENING"') do (
    echo  Killing process %%a
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul

:: Start Expo
echo.
echo  Starting Expo...
echo.

npx expo start --lan --clear --port 8081
