@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000/weather-app/'"
npm run dev -- --host localhost
