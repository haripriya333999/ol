"""
OmniLens - OpenCV 5 High-Performance Vision Preprocessing Engine
Strictly utilizes OpenCV 5.0.0 (cv2) for:
1. Frame decoding & validation (cv2.imdecode)
2. Motion blur analysis via Laplacian variance (cv2.Laplacian)
3. HSV illumination & glare assessment (cv2.cvtColor)
4. Adaptive Low-Light Enhancement:
   - Dynamic Gamma Correction (cv2.LUT)
   - LAB-space CLAHE Adaptive Equalization (cv2.createCLAHE)
   - Edge-preserving Bilateral Denoising (cv2.bilateralFilter)
"""

import sys
import json
import base64
import time
import cv2
import numpy as np

def get_opencv_info():
    return {
        "version": cv2.__version__,
        "is_opencv_5": cv2.__version__.startswith("5."),
        "build_info": cv2.getBuildInformation()[:200] if hasattr(cv2, 'getBuildInformation') else ""
    }

def decode_image_base64(base64_str: str) -> np.ndarray:
    if "," in base64_str:
        base64_str = base64_str.split(",", 1)[1]
    img_bytes = base64.b64decode(base64_str)
    np_arr = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image with OpenCV 5 imdecode")
    return img

def apply_adaptive_low_light_enhancement(img_bgr: np.ndarray, mean_lum: float, std_contrast: float):
    """
    Applies adaptive gamma correction, CLAHE in LAB space, and edge-preserving
    bilateral filtering when ambient illumination is low or shadows obscure objects.
    """
    is_dim = mean_lum < 60.0
    is_low_contrast = std_contrast < 24.0
    
    if not (is_dim or is_low_contrast):
        return img_bgr, False, "none"

    enhanced = img_bgr
    enhancement_type = "clahe_lab"

    # Step 1: Gamma correction for underexposed dark scenes
    if is_dim:
        gamma = min(2.0, max(1.25, 1.0 + (60.0 - mean_lum) / 45.0))
        inv_gamma = 1.0 / gamma
        lut = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)]).astype("uint8")
        enhanced = cv2.LUT(enhanced, lut)
        enhancement_type = "gamma_and_clahe"

    # Step 2: Adaptive Histogram Equalization on Luminance channel
    lab = cv2.cvtColor(enhanced, cv2.COLOR_BGR2LAB)
    l_chan, a_chan, b_chan = cv2.split(lab)
    
    clip_limit = 2.4 if is_dim else 1.8
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    enhanced_l = clahe.apply(l_chan)
    lab_merged = cv2.merge((enhanced_l, a_chan, b_chan))
    enhanced = cv2.cvtColor(lab_merged, cv2.COLOR_LAB2BGR)

    # Step 3: Bilateral filter to smooth sensor shadow noise without blurring obstacle edges
    if is_dim:
        enhanced = cv2.bilateralFilter(enhanced, d=5, sigmaColor=40, sigmaSpace=40)

    return enhanced, True, enhancement_type

def process_frame(img_bgr: np.ndarray, apply_clahe: bool = True) -> dict:
    t0 = time.perf_counter()
    height, width = img_bgr.shape[:2]
    
    # 1. Grayscale conversion for Laplacian blur analysis
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    blur_score = float(laplacian.var())
    is_blurry = blur_score < 70.0
    
    # 2. HSV Illumination & Glare Analysis
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    v_channel = hsv[:, :, 2]
    mean_luminance = float(np.mean(v_channel))
    std_contrast = float(np.std(v_channel))
    
    glare_pixels = np.count_nonzero(v_channel >= 245)
    glare_ratio = float(glare_pixels / max(1, width * height))
    glare_detected = glare_ratio > 0.05
    
    is_too_dark = mean_luminance < 45.0
    is_overexposed = mean_luminance > 215.0
    is_low_contrast = std_contrast < 22.0
    
    # 3. Adaptive Low-Light & CLAHE Enhancement
    enhanced_bgr, low_light_applied, enhancement_type = apply_adaptive_low_light_enhancement(
        img_bgr, mean_luminance, std_contrast
    )
    
    clahe_performed = low_light_applied or apply_clahe

    # 4. Spoken guidance for low-vision users
    guidance = []
    if is_blurry:
        guidance.append("Camera motion blur detected. Hold the phone steady for dependable detection.")
    if is_too_dark:
        guidance.append("Lighting is very dim. Adaptive low-light enhancement enabled.")
    elif glare_detected:
        guidance.append("Strong glare detected. Tilt camera slightly downward.")
    elif is_overexposed:
        guidance.append("Scene is overexposed. Move away from direct bright light.")
    
    if not guidance:
        guidance.append("Frame quality is clear with balanced illumination.")

    # 5. Base64 encoding of enhanced frame if enhancement applied
    enhanced_b64 = None
    if clahe_performed:
        success, encoded_img = cv2.imencode('.jpg', enhanced_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        if success:
            enhanced_b64 = "data:image/jpeg;base64," + base64.b64encode(encoded_img).decode('utf-8')

    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    return {
        "opencv_version": cv2.__version__,
        "is_opencv_5": cv2.__version__.startswith("5."),
        "width": width,
        "height": height,
        "blur_score": round(blur_score, 2),
        "is_blurry": is_blurry,
        "mean_luminance": round(mean_luminance, 1),
        "contrast_std": round(std_contrast, 1),
        "glare_ratio": round(glare_ratio * 100, 2),
        "glare_detected": glare_detected,
        "is_too_dark": is_too_dark,
        "is_overexposed": is_overexposed,
        "clahe_applied": clahe_performed,
        "low_light_applied": low_light_applied,
        "enhancement_type": enhancement_type,
        "speech_guidance": " ".join(guidance),
        "processing_time_ms": round(elapsed_ms, 2),
        "enhanced_image": enhanced_b64
    }

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--version":
        print(json.dumps(get_opencv_info()))
        return
        
    input_data = sys.stdin.read().strip()
    if not input_data:
        print(json.dumps({"error": "No input provided"}))
        return

    try:
        if input_data.startswith("{"):
            payload = json.loads(input_data)
            b64 = payload.get("image", "")
            apply_clahe = payload.get("apply_clahe", True)
        else:
            b64 = input_data
            apply_clahe = True

        img = decode_image_base64(b64)
        result = process_frame(img, apply_clahe=apply_clahe)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "opencv_version": cv2.__version__
        }))

if __name__ == "__main__":
    main()
