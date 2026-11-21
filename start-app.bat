@echo off
cd /d "%~dp0"
echo Starting Preply-Style AI English Tutor...
echo Open http://localhost:5173/ in your browser once ready.
echo Press Ctrl+C to stop both servers.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev.ps1"
if errorlevel 1 (
    echo.
    echo [ERROR] Server exited with an error.
    pause
)
