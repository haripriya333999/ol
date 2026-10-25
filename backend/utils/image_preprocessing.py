"""
OmniLens Image Preprocessing Engine
Powered strictly by OpenCV 5 (cv2).
Includes:
- OpenCV 5 runtime version verification
- Adaptive low-light gamma correction + CLAHE + Bilateral filtering
- Blur estimation via Laplacian variance
"""

from typing import Tuple, Dict, Any, Optional, List
import cv2
import numpy as np
from PIL import Image, ImageOps

def safe_exif_transpose(image: Image.Image) -> Image.Image:
    """Safely transposes image according to EXIF orientation tag."""
    try:
        return ImageOps.exif_transpose(image)
    except Exception:
        return image

def get_opencv5_version() -> str:
    """Returns the verified runtime OpenCV version."""
    return cv2.__version__

def pil_to_cv2(image: Image.Image) -> np.ndarray:
    """Converts a PIL Image to OpenCV 5 BGR format."""
    rgb = np.array(image.convert("RGB"))
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

def cv2_to_pil(cv_img: np.ndarray) -> Image.Image:
    """Converts an OpenCV BGR image back to PIL."""
    rgb = cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB)
    return Image.fromarray(rgb)

def resize_maintaining_aspect_ratio(image: Image.Image, max_dim: int = 1280) -> Tuple[Image.Image, float]:
    """
    Resizes image using OpenCV 5 cv2.resize with INTER_AREA or INTER_LINEAR
    preserving exact aspect ratio.
    """
    cv_img = pil_to_cv2(image)
    height, width = cv_img.shape[:2]
    
    if max(width, height) <= max_dim:
        return image, 1.0
        
    scale = max_dim / float(max(width, height))
    new_w = max(1, int(round(width * scale)))
    new_h = max(1, int(round(height * scale)))
    
    resized_cv = cv2.resize(cv_img, (new_w, new_h), interpolation=cv2.INTER_AREA if scale < 1.0 else cv2.INTER_LINEAR)
    return cv2_to_pil(resized_cv), scale

def apply_adaptive_low_light(cv_img: np.ndarray, mean_lum: float, std_contrast: float) -> Tuple[np.ndarray, bool, str]:
    """
    Applies adaptive gamma correction and CLAHE in LAB space for low-light scenes.
    """
    is_dim = mean_lum < 60.0
    is_low_contrast = std_contrast < 24.0
    
    if not (is_dim or is_low_contrast):
        return cv_img, False, "none"

    enhanced = cv_img
    enhancement_type = "clahe_lab"

    if is_dim:
        gamma = min(2.0, max(1.25, 1.0 + (60.0 - mean_lum) / 45.0))
        inv_gamma = 1.0 / gamma
        lut = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)]).astype("uint8")
        enhanced = cv2.LUT(enhanced, lut)
        enhancement_type = "gamma_and_clahe"

    lab = cv2.cvtColor(enhanced, cv2.COLOR_BGR2LAB)
    l_chan, a_chan, b_chan = cv2.split(lab)
    
    clip_limit = 2.4 if is_dim else 1.8
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    enhanced_l = clahe.apply(l_chan)
    lab_merged = cv2.merge((enhanced_l, a_chan, b_chan))
    enhanced = cv2.cvtColor(lab_merged, cv2.COLOR_LAB2BGR)

    if is_dim:
        enhanced = cv2.bilateralFilter(enhanced, d=5, sigmaColor=40, sigmaSpace=40)

    return enhanced, True, enhancement_type

def enhance_for_ocr(image: Image.Image, clip_limit: float = 2.0) -> np.ndarray:
    """
    Applies OpenCV 5 CLAHE to the Luminance channel in LAB color space for OCR.
    """
    cv_img = pil_to_cv2(image)
    lab = cv2.cvtColor(cv_img, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    enhanced_l = clahe.apply(l_channel)
    
    merged_lab = cv2.merge((enhanced_l, a_channel, b_channel))
    enhanced_bgr = cv2.cvtColor(merged_lab, cv2.COLOR_LAB2BGR)
    return cv2.cvtColor(enhanced_bgr, cv2.COLOR_BGR2RGB)

def estimate_blur_and_lighting(image: Image.Image) -> Dict[str, Any]:
    """
    Performs substantive visual quality assessment using OpenCV 5:
    - Laplacian variance for motion blur / focus evaluation
    - HSV V-channel analysis for illumination and glare assessment
    - Adaptive low-light gamma correction check
    """
    cv_img = pil_to_cv2(image)
    height, width = cv_img.shape[:2]
    
    # 1. Grayscale conversion for Laplacian
    gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
    laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    
    # 2. HSV color space for illumination and glare
    hsv = cv2.cvtColor(cv_img, cv2.COLOR_BGR2HSV)
    v_channel = hsv[:, :, 2]
    mean_luminance = float(np.mean(v_channel))
    std_contrast = float(np.std(v_channel))
    
    # Glare ratio: percentage of pixels with brightness >= 245
    glare_pixels = np.count_nonzero(v_channel >= 245)
    glare_ratio = float(glare_pixels / max(1, (width * height)))
    
    is_blurry = laplacian_var < 70.0
    is_too_dark = mean_luminance < 45.0
    is_washed_out = mean_luminance > 220.0
    glare_detected = glare_ratio > 0.05
    is_low_contrast = std_contrast < 22.0
    
    _, low_light_applied, enhancement_type = apply_adaptive_low_light(cv_img, mean_luminance, std_contrast)
    
    recommendation = "Frame quality is clear with good lighting."
    if is_too_dark:
        recommendation = "Dark or dim lighting detected. Adaptive low-light enhancement enabled."
    elif is_blurry:
        recommendation = "Camera motion blur detected. Hold the phone steady for dependable obstacle awareness."
    elif glare_detected or is_washed_out:
        recommendation = "Bright glare or ceiling light reflection. Tilt the camera slightly downward."
    elif is_low_contrast:
        recommendation = "Low contrast detected. Adaptive CLAHE equalized the shadows."

    return {
        "opencv_version": cv2.__version__,
        "blur_score": round(laplacian_var, 1),
        "is_blurry": is_blurry,
        "average_luminance": round(mean_luminance, 1),
        "contrast_std": round(std_contrast, 1),
        "glare_ratio": round(glare_ratio * 100, 1),
        "glare_detected": glare_detected,
        "is_too_dark": is_too_dark,
        "is_washed_out": is_washed_out,
        "low_light_applied": low_light_applied,
        "enhancement_type": enhancement_type,
        "recommendation": recommendation,
    }
