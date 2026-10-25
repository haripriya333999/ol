# OmniLens — AI Everyday Visual Assistant
> **Understand your world. Through sound.**

OmniLens is an assistive computer vision, spatial accessibility, and pedestrian navigation application designed for blind and low-vision individuals. It transforms real visual scenes into precise, task-focused spoken audio descriptions.

Developed for the **OpenCV AI Competition 2026, powered by AWS**.

---

## 1. Verified Architecture & Dual Engines

OmniLens operates using a hybrid edge-and-cloud architecture:

1. **Full-Stack Accessibility Server (Node.js 22 + Express + Vite)**:
   - High-precision open-vocabulary object detection with normalized spatial bounding boxes.
   - Deep human activity, posture, and gesture reasoning (Gemini Flash Multimodal Vision).
   - Neural character recognition (OCR) for labels, badges, signs, and prescription text.
   - Continuous real-time spatial object detection with accurate bounding boxes.
   - In-process image quality analysis (Laplacian blur score, HSV glare/illumination, CLAHE contrast equalization).
2. **Local / AWS Python Microservice (Ultralytics YOLO + EasyOCR + OpenCV 5)**:
   - Python FastAPI microservice located under `backend/`.
   - Ultralytics YOLO model (`yolo11n.pt`, `yolov8s.pt`) with 80 COCO classes and synonym mapping.
   - EasyOCR PyTorch reader with image contrast enhancement.
   - Headless OpenCV image preprocessing.

---

## 2. Core Visual Tasks

### 1. Describe Surroundings & Human Activity
- **Door & Architectural Localization**: Accurately detects closed doors, open doors, door frames, door handles, latches, window frames, window grills/bars, curtains, and ceiling fans.
- **Human Action & Gesture Understanding**: Explicitly describes what each person in the photo is doing (e.g. *giving a thumbs-down gesture*, *holding a snack/cookie packet*, *wearing eyeglasses*, *seated at a study desk*, or *standing*).
- **Natural Spatial Positioning**: Strictly uses human-friendly side directions (*on your left side*, *in the center*, *on your right side*, *to your far left/right*) and elevation levels (*up near the ceiling*, *at eye level*, *at waist level*, *down near the floor*).

### 2. Find an Object
- **Target Search**: Search for everyday room items and fixtures (*door*, *door handle*, *window*, *ceiling fan*, *cookie packet*, *glasses*, *water bottle*, *chair*, *phone*, *laptop*).
- **Spatial Confirmation**: Highlights matching items on canvas, reports exact counts, and speaks their relative side and vertical elevation.
- **Truthful Results**: Explains clearly if an item was not detected at the given sensitivity. Never fabricates a false match.

### 3. Read Text & Signage (Neural OCR)
- **High Character Accuracy**: Neural OCR recognizes certification badges, door plaques, medication labels, and posters without spelling errors or character drops.
- **Copy & Spoken Playback**: Copy extracted text with one click and hear it read aloud with controllable speech speeds (0.8x to 1.5x), pause, replay, and stop.

### 4. Continuous Live Spatial Detection
- **Ultra-Fast Local Detection**: Recognizes visible objects in the live camera feed with minimal latency.
- **Accurate Bounding Boxes**: Perfectly aligned with the camera preview and responsive layout.
- **Natural Audio Guidance**: Announces object positions (left, center, right) with duplicate suppression.

---

## 3. Camera Lifecycle & Safety Hardening

OmniLens enforces an explicit single-owner camera lifecycle across all camera views (`LiveDetectionView`, `LiveCameraFeed`, `ImageInputZone`):

`IDLE → STARTING → ACTIVE → STOPPING → IDLE`

- **Complete Track Disposal**: Stopping any feature stops all `MediaStreamTrack` objects (`track.stop()`), detaches `video.srcObject = null`, and pauses the video element.
- **Asynchronous Race Protection**: Uses generation request identifiers (`cameraRequestIdRef`) to guarantee that late-resolving `getUserMedia()` promises never revive camera hardware after the user has stopped the feature or unmounted the view.
- **Pause vs. Stop Distinction**:
  - **Pause**: Temporarily pauses scanning and speech while leaving camera in standby for fast resumption.
  - **Stop Camera**: Shuts down all camera tracks, releases hardware locks, and turns off the browser hardware indicator.
- **Fail-Safe Alerting**: If camera frames fail or inference times out, OmniLens explicitly announces that analysis is unavailable.

---

## 4. Quick Start & Setup

### Requirements
- Node.js 20+ or 22
- Python 3.10+ (for optional local Python backend)

### 1. Full-Stack Web App (Node.js & Express)
```bash
# 1. Install dependencies
npm install

# 2. Start server in development mode (port 3000)
npm run dev

# 3. Or build for production
npm run build
npm start
```
Open `http://localhost:3000` in your browser.

### 2. Running Automated Tests
```bash
# Run automated camera lifecycle & race condition test suite (17 checks)
npm test

# Run end-to-end backend endpoint validation suite
npx tsx test_endpoints.ts
```

### 3. Local Python FastAPI Microservice (Optional)
```bash
cd backend

# On Windows PowerShell:
.\run_backend.ps1

# On Linux/macOS:
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Interactive API documentation will be available at `http://localhost:8000/docs`.

---

## 5. AWS & OpenCV AI Competition 2026 Deployment

To deploy the Python ML microservice onto AWS for the competition:

### Option A: AWS Elastic Container Service (ECS Fargate) or App Runner
1. **Container Image**: Build the Docker container using `backend/Dockerfile` with Python 3.10-slim.
2. **Environment Variables**:
   - `PORT=8000`
   - `OMNILENS_YOLO_MODEL=yolo11n.pt`
3. **Health Check**:
   - HTTP GET `/health` on port 8000.
4. **Memory Allocation**: Minimum 2 vCPU and 2 GB RAM recommended for PyTorch CPU + Ultralytics YOLO inference.

### Option B: AWS EC2 (t3.medium or g4dn.xlarge for GPU acceleration)
```bash
sudo apt update && sudo apt install -y python3-pip python3-venv git
git clone https://github.com/haripriya333999/OmniLens-opcv.git
cd OmniLens-opcv/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## 6. Accessibility & Responsible Use

- **Screen Reader Support**: All spoken feedback sections utilize ARIA live regions (`aria-live="polite"` and `role="region"`) so screen readers (TalkBack, NVDA, VoiceOver) announce updates.
- **Safety Disclaimer**: OmniLens visual recognition is an assistive visual exploration aid based on monocular camera frames. It does **NOT** replace a white cane, guide dog, or trained orientation and mobility techniques. Never step into an unknown street, stairwell, or intersection based solely on camera output.
