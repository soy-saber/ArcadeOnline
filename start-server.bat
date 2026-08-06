@echo off
rem ArcadeOnline 服务器看门狗：崩溃后自动重启
title ArcadeOnline Server
cd /d "%~dp0"
:loop
echo [%date% %time%] starting server...
node server.js
echo [%date% %time%] server exited (code %errorlevel%), restarting in 2s...
timeout /t 2 /nobreak >nul
goto loop
