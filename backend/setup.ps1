#!/usr/bin/env pwsh
# Setup script for anonymous-chat backend

Write-Host "Creating virtual environment..." -ForegroundColor Cyan
python -m venv .venv

Write-Host "Activating virtual environment..." -ForegroundColor Cyan
& .\.venv\Scripts\Activate.ps1

Write-Host "Installing requirements..." -ForegroundColor Cyan
pip install -r requirements.txt --upgrade -q

Write-Host "Initializing database..." -ForegroundColor Cyan
python -m app.init_db

Write-Host ""
Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To start the server, run:" -ForegroundColor Yellow
Write-Host "  .\.venv\Scripts\Activate.ps1" -ForegroundColor White
Write-Host "  python -m app.main" -ForegroundColor White
