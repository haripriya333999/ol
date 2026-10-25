@echo off
echo ===================================================
echo   OmniLens AI Backend - Windows Local Runner
echo ===================================================
echo.

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.10+ from https://www.python.org
    pause
    exit /b 1
)

echo [1/3] Checking virtual environment...
if not exist "venv" (
    echo Creating virtual environment venv...
    python -m venv venv
)

echo [2/3] Activating virtual environment and installing dependencies...
call venv\Scripts\activate
pip install -r requirements.txt

echo.
echo [3/3] Starting OmniLens FastAPI service on http://localhost:8000
echo Docs available at: http://localhost:8000/docs
echo.
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
