@echo off
rem Запуск API магазина: http://127.0.0.1:8000
cd /d "%~dp0"
server\.venv\Scripts\python server\main.py
pause
