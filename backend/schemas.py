from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field

class BoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float

class Detection(BaseModel):
    id: str
    label: str
    confidence: float
    box: BoundingBox
    position: Literal['left', 'center', 'right']
    side_direction: Optional[str] = None
    vertical_position: Optional[str] = None

class DescribeResponse(BaseModel):
    success: bool
    message: str
    detections: List[Detection]
    scene_description: str
    total_objects_count: int
    processing_time_ms: int
    model_status: str
    opencv_version: Optional[str] = "5.0.0"
    opencv_quality: Optional[Dict[str, Any]] = None

class FindResponse(BaseModel):
    success: bool
    message: str
    requested_object: str
    is_category_supported: bool
    found: bool
    matches: List[Detection]
    position: Optional[Literal['left', 'center', 'right']] = None
    side_direction: Optional[str] = None
    confidence: Optional[float] = None
    spoken_summary: str
    processing_time_ms: int
    model_status: str
    opencv_version: Optional[str] = "5.0.0"
    opencv_quality: Optional[Dict[str, Any]] = None

class OCRLine(BaseModel):
    text: str
    confidence: float
    box: Optional[BoundingBox] = None

class OCRResponse(BaseModel):
    success: bool
    message: str
    extracted_text: str
    lines: List[OCRLine]
    word_count: int
    processing_time_ms: int
    engine_ready: bool
    model_status: str
    opencv_version: Optional[str] = "5.0.0"
    opencv_quality: Optional[Dict[str, Any]] = None

class HealthResponse(BaseModel):
    status: str
    model_name: str
    detector_ready: bool
    ocr_ready: bool
    supported_classes_count: int
    version: str
    opencv_version: str = "5.0.0"

class ModelCapability(BaseModel):
    name: str
    task: str
    weights: str
    ready: bool
    supported_categories: List[str]
    description: str
    opencv_version: Optional[str] = "5.0.0"
