@echo off
rem ArcadeOnline server watchdog: auto-restart on crash
title ArcadeOnline Server
cd /d "%~dp0"
:loop
echo [%date% %time%] starting server...
node server.js
echo [%date% %time%] server exited (code %errorlevel%), restarting in 2s...
timeout /t 2 /nobreak >nul
goto loop
