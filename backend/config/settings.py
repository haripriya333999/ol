import os
from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    APP_NAME: str = "EverydayEyes AI - Visual Assistant"
    VERSION: str = "2.0.0"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    
    # Server configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # Object detection configuration
    YOLO_MODEL_NAME: str = os.getenv("OMNILENS_YOLO_MODEL", "yolo11n.pt")
    DEFAULT_CONFIDENCE_THRESHOLD: float = 0.30
    DEFAULT_IOU_THRESHOLD: float = 0.45
    MAX_IMAGE_SIZE_BYTES: int = 25 * 1024 * 1024  # 25 MB
    
    # OCR configuration
    OCR_LANGUAGES: List[str] = ["en"]
    OCR_USE_GPU: bool = False  # Default to CPU for maximum portability on Windows laptops
    
    # Spatial positioning thresholds (fraction of image width/height)
    LEFT_BOUNDARY_RATIO: float = 0.38
    RIGHT_BOUNDARY_RATIO: float = 0.62
    FAR_LEFT_RATIO: float = 0.20
    FAR_RIGHT_RATIO: float = 0.80
    
    CEILING_RATIO: float = 0.28
    EYE_LEVEL_RATIO: float = 0.65
    WAIST_LEVEL_RATIO: float = 0.85

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
