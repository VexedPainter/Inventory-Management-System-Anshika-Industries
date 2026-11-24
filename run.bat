@echo off
cd /d "%~dp0"
echo ===================================================
echo Starting Anishka Inventory Management System...
echo ===================================================
start http://127.0.0.1:8000
python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
