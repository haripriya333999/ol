# OmniLens Python FastAPI Microservice

High-accuracy assistive computer vision backend for **OmniLens — AI Everyday Visual Assistant**.

## Features & Improvements
- **Ultralytics YOLO (Configurable)**: Defaults to `yolo11n.pt` with configurable model selection via `OMNILENS_YOLO_MODEL` environment variable (e.g. `yolo11s.pt`, `yolov8m.pt`).
- **Aspect-Ratio Preserving Preprocessing & EXIF Transpose**: Corrects camera orientation and avoids aspect ratio distortion.
- **Natural Spatial Directions**: Calculates accurate human directions (`on your left side`, `in the center`, `on your right side`, `to your far left/right`) and vertical levels (`up near the ceiling`, `at eye level`, `down near the floor`).
- **Truthful Descriptions**: Never invents unsupported categories; explains model boundaries when outside the 80 COCO classes.
- **EasyOCR Integration**: PyTorch CPU/GPU inference with image contrast enhancement, line-by-line bounding boxes, and confidence.
- **FastAPI Endpoints**: Validates uploads, enforces file size guards (up to 25MB), and separates initialization from runtime inference.

## Quick Start (Windows)
### Option A: 1-Click Batch Script
Double-click `run_backend.bat` in File Explorer, or run in Command Prompt:
```cmd
cd backend
run_backend.bat
```

### Option B: PowerShell
```powershell
cd backend
.\run_backend.ps1
```

### Option C: Manual Setup
```cmd
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Interactive Swagger API documentation will be available at: `http://localhost:8000/docs`

## Automated Test Suite
Run the test suite to verify endpoints and spatial logic:
```cmd
pytest test_backend.py -v
```
Tests verify:
- Health and model readiness
- Horizontal & vertical spatial position calculations
- Query normalization and plural/synonym handling
- Non-hallucinatory scene description synthesis
- Rejection of invalid non-image uploads
- Unsupported category detection response
