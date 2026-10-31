@echo off
rem Запуск Telegram-бота
cd /d "%~dp0"
server\.venv\Scripts\python bot\main.py
pause
