# OmniLens AI Backend - Windows PowerShell Runner
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  OmniLens AI Backend - Windows PowerShell Runner" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "Python is not installed or not in PATH! Please install Python 3.10+ from https://www.python.org"
    exit 1
}

if (-not (Test-Path "venv")) {
    Write-Host "[1/3] Creating virtual environment venv..." -ForegroundColor Yellow
    python -m venv venv
}

Write-Host "[2/3] Activating virtual environment & installing requirements..." -ForegroundColor Yellow
& .\venv\Scripts\Activate.ps1
pip install -r requirements.txt

Write-Host ""
Write-Host "[3/3] Starting OmniLens FastAPI service on http://localhost:8000" -ForegroundColor Green
Write-Host "Interactive API Docs: http://localhost:8000/docs" -ForegroundColor Green
Write-Host ""

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
