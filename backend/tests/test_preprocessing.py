import io
from PIL import Image
import numpy as np
import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from utils.image_preprocessing import (
    safe_exif_transpose,
    resize_maintaining_aspect_ratio,
    enhance_for_ocr,
    estimate_blur_and_lighting
)

def test_resize_maintaining_aspect_ratio():
    img = Image.new("RGB", (2000, 1000), (255, 255, 255))
    resized, scale = resize_maintaining_aspect_ratio(img, max_dim=1000)
    assert max(resized.size) == 1000
    assert resized.size == (1000, 500)
    assert scale == 0.5

def test_lighting_estimation_dark():
    # Very dark image
    dark_img = Image.new("RGB", (100, 100), (10, 10, 10))
    stat = estimate_blur_and_lighting(dark_img)
    assert stat["is_too_dark"] is True
    assert "dark" in stat["recommendation"].lower()

def test_lighting_estimation_balanced():
    # Balanced indoor scene
    normal_img = Image.new("RGB", (100, 100), (140, 140, 140))
    stat = estimate_blur_and_lighting(normal_img)
    assert stat["is_too_dark"] is False
    assert stat["is_washed_out"] is False

def test_ocr_enhancement_shape():
    img = Image.new("RGB", (300, 200), (180, 180, 180))
    arr = enhance_for_ocr(img)
    assert isinstance(arr, np.ndarray)
    assert arr.shape == (200, 300, 3)

if __name__ == "__main__":
    test_resize_maintaining_aspect_ratio()
    test_lighting_estimation_dark()
    test_lighting_estimation_balanced()
    test_ocr_enhancement_shape()
    print("ALL PREPROCESSING TESTS PASSED!")
