@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0"

echo.
echo  Installing dependencies...
call npm install 2>nul
if exist node_modules\expo\package.json (
    echo  Dependencies ready.
) else (
    echo  npm install failed. Check error above.
    pause
    exit /b 1
)

echo.
echo  Starting Expo tunnel...
echo.

npx expo start --tunnel 2>&1
