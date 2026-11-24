# Run Anishka Inventory Management System in PowerShell
Set-Location -Path $PSScriptRoot
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "Starting Anishka Inventory Management System..." -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Cyan
Start-Process "http://127.0.0.1:8000"
python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
