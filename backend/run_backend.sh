#!/usr/bin/env bash
set -e

echo "==================================================="
echo "  EverydayEyes AI Backend - Local Runner"
echo "==================================================="

if ! command -v python3 &> /dev/null; then
    echo "[ERROR] python3 could not be found. Please install Python 3.10+."
    exit 1
fi

if [ ! -d "venv" ]; then
    echo "Creating virtual environment venv..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing requirements..."
pip install --upgrade pip
pip install -r requirements.txt

echo "Starting EverydayEyes FastAPI backend on http://localhost:8000..."
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
