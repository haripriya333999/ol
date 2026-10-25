import io
import os
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps

from schemas import (
    DescribeResponse,
    FindResponse,
    OCRResponse,
    HealthResponse,
    ModelCapability,
)
from detector import (
    YoloDetector,
    COCO_CLASSES,
    normalize_object_query,
)
from ocr import EasyOcrEngine
from utils.image_preprocessing import (
    estimate_blur_and_lighting,
    enhance_for_ocr,
    get_opencv5_version,
)


app = FastAPI(
    title="OmniLens Vision Assistance API",
    description="Backend microservice for visual understanding and accessibility using YOLO and EasyOCR.",
    version="1.1.0"
)

# CORS configuration for local React / Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize models once at startup
yolo_detector = YoloDetector()
ocr_engine = EasyOcrEngine()

def load_image_from_upload(upload_file: UploadFile) -> Image.Image:
    if not upload_file.content_type or not upload_file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type '{upload_file.content_type}'. Please upload an image (JPEG, PNG, WEBP)."
        )
    try:
        content = upload_file.file.read()
        if len(content) > 25 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Image file exceeds 25MB size limit."
            )
        img = Image.open(io.BytesIO(content))
        # Handle EXIF orientation
        img = ImageOps.exif_transpose(img)
        return img.convert("RGB")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to decode image: {str(e)}"
        )

@app.get("/health", response_model=HealthResponse)
def get_health():
    is_detector_ready = yolo_detector.is_ready
    is_ocr_ready = ocr_engine.is_ready
    overall_status = "healthy" if (is_detector_ready or is_ocr_ready) else "degraded"
    
    return HealthResponse(
        status=overall_status,
        model_name=f"Ultralytics {yolo_detector.model_name} + EasyOCR + OpenCV 5",
        detector_ready=is_detector_ready,
        ocr_ready=is_ocr_ready,
        supported_classes_count=len(COCO_CLASSES),
        version="1.1.0",
        opencv_version=get_opencv5_version()
    )

@app.get("/models")
def get_models_info():
    return {
        "models": [
            {
                "name": f"Ultralytics {yolo_detector.model_name}",
                "task": "Object Detection & Spatial Localization",
                "weights": yolo_detector.model_name,
                "ready": yolo_detector.is_ready,
                "supported_categories": COCO_CLASSES,
                "description": "Pretrained convolutional neural network recognizing standard 80 COCO common object categories."
            },
            {
                "name": "EasyOCR",
                "task": "Optical Character Recognition (Text Reading)",
                "ready": ocr_engine.is_ready,
                "languages": ["en"],
                "description": "PyTorch-based deep neural optical character recognition engine."
            }
        ]
    }

@app.post("/detect")
async def detect_objects(
    file: UploadFile = File(...),
    confidence: float = Form(0.30)
):
    image = load_image_from_upload(file)
    detections, elapsed_ms = yolo_detector.detect(image, min_confidence=confidence)
    
    return {
        "success": True,
        "message": f"Successfully processed image. Detected {len(detections)} object(s).",
        "detections": detections,
        "total_count": len(detections),
        "processing_time_ms": elapsed_ms,
        "model_status": f"Ultralytics {yolo_detector.model_name}" if yolo_detector.is_ready else "YOLO (Not Ready)"
    }

@app.post("/describe", response_model=DescribeResponse)
async def describe_surroundings(
    file: UploadFile = File(...),
    confidence: float = Form(0.30)
):
    image = load_image_from_upload(file)
    opencv_quality = estimate_blur_and_lighting(image)
    detections, elapsed_ms = yolo_detector.detect(image, min_confidence=confidence)
    scene_description = yolo_detector.describe_scene(detections)
    
    return DescribeResponse(
        success=True,
        message=f"Detected {len(detections)} objects.",
        detections=detections,
        scene_description=scene_description,
        total_objects_count=len(detections),
        processing_time_ms=elapsed_ms,
        model_status=f"Ultralytics {yolo_detector.model_name}" if yolo_detector.is_ready else "Model Not Initialized",
        opencv_version=get_opencv5_version(),
        opencv_quality=opencv_quality
    )

@app.post("/find", response_model=FindResponse)
async def find_object(
    file: UploadFile = File(...),
    requested_object: str = Form(...),
    confidence: float = Form(0.30)
):
    matched_cat, is_supported = normalize_object_query(requested_object)
    
    if not is_supported or not matched_cat:
        speech = f"The category '{requested_object}' is not supported by the local 80-class model. Use Gemini Vision for open-vocabulary detection of doors, windows, and custom objects."
        return FindResponse(
            success=True,
            message=f"Category '{requested_object}' is not among supported COCO classes.",
            requested_object=requested_object,
            is_category_supported=False,
            found=False,
            matches=[],
            spoken_summary=speech,
            processing_time_ms=1,
            model_status="Query Filter",
            opencv_version=get_opencv5_version()
        )

    image = load_image_from_upload(file)
    opencv_quality = estimate_blur_and_lighting(image)
    # Detect using an adaptive floor so candidates near the boundary are not silently dropped by YOLO NMS
    effective_floor = max(0.08, min(confidence, 0.15))
    detections, elapsed_ms = yolo_detector.detect(image, min_confidence=effective_floor)

    all_cat_candidates = [d for d in detections if d['label'] == matched_cat]
    matches = [d for d in all_cat_candidates if d['confidence'] >= confidence]
    sub_threshold = [d for d in all_cat_candidates if d['confidence'] < confidence]
    found = len(matches) > 0

    if not found:
        if sub_threshold:
            best_sub = sub_threshold[0]
            speech = f"No {matched_cat} was found at the {int(confidence*100)}% threshold, but {len(sub_threshold)} candidate was detected with {int(best_sub['confidence']*100)}% confidence. Lower the sensitivity slider to inspect."
        else:
            speech = f"No {matched_cat} was detected in this view at the selected threshold."
        pos = None
        side = None
        conf = None
    elif len(matches) == 1:
        match = matches[0]
        pos = match['position']
        side = match.get('side_direction') or ("in the center" if pos == "center" else f"on your {pos} side")
        conf = match['confidence']
        speech = f"{matched_cat.capitalize()} detected {side} with {int(conf*100)}% certainty."
    else:
        pos = matches[0]['position']
        side = matches[0].get('side_direction')
        conf = matches[0]['confidence']
        sides = [m.get('side_direction') or f"on the {m['position']} side" for m in matches]
        speech = f"Found {len(matches)} {matched_cat}s: located {', and '.join(sides)}."

    return FindResponse(
        success=True,
        message=f"Search completed for '{matched_cat}'. Found: {found} (Qualified: {len(matches)}, Sub-threshold candidates: {len(sub_threshold)}).",
        requested_object=matched_cat,
        is_category_supported=True,
        found=found,
        matches=matches,
        position=pos,
        side_direction=side,
        confidence=conf,
        spoken_summary=speech,
        processing_time_ms=elapsed_ms,
        model_status=f"Ultralytics {yolo_detector.model_name}" if yolo_detector.is_ready else "Model Not Initialized",
        opencv_version=get_opencv5_version(),
        opencv_quality=opencv_quality
    )

@app.post("/ocr", response_model=OCRResponse)
async def read_text(
    file: UploadFile = File(...)
):
    image = load_image_from_upload(file)
    opencv_quality = estimate_blur_and_lighting(image)
    text, lines, elapsed_ms, ready, status_msg = ocr_engine.extract_text(image)
    
    word_count = len(text.split()) if text else 0
    msg = f"Extracted {word_count} words." if word_count > 0 else "No readable text found."
    if not ready:
        msg = status_msg
        
    return OCRResponse(
        success=ready,
        message=msg,
        extracted_text=text,
        lines=lines,
        word_count=word_count,
        processing_time_ms=elapsed_ms,
        engine_ready=ready,
        model_status=status_msg,
        opencv_version=get_opencv5_version(),
        opencv_quality=opencv_quality
    )



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
