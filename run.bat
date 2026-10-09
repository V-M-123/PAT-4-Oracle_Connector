@echo off
title Oracle Studio Web Manager
echo ========================================================
echo         Oracle Studio Web Manager - Starting
echo ========================================================

cd /d "%~dp0"

IF NOT EXIST ".venv\Scripts\python.exe" (
    echo [INFO] Creating Python virtual environment...
    python -m venv .venv
    echo [INFO] Installing required dependencies...
    .\.venv\Scripts\python -m pip install --upgrade pip
    .\.venv\Scripts\python -m pip install -r requirements.txt
)

echo [INFO] Opening default web browser to http://localhost:5000 ...
start "" "http://localhost:5000"

echo [INFO] Starting Flask application...
.\.venv\Scripts\python app.py
pause
