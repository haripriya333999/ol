import pytest
from fastapi.testclient import TestClient
from PIL import Image
import io

from main import app
from detector import (
    calculate_horizontal_position,
    calculate_side_direction,
    calculate_vertical_level,
    normalize_object_query,
    YoloDetector,
    COCO_CLASSES,
)

client = TestClient(app)

def create_dummy_image_bytes(format="JPEG", size=(400, 300), color=(128, 128, 128)) -> bytes:
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "model_name" in data
    assert "supported_classes_count" in data
    assert data["supported_classes_count"] == 80

def test_models_endpoint():
    response = client.get("/models")
    assert response.status_code == 200
    data = response.json()
    assert "models" in data
    assert len(data["models"]) >= 2
    model_names = [m["name"] for m in data["models"]]
    assert any("YOLO" in name for name in model_names)
    assert any("OCR" in name for name in model_names)

def test_horizontal_position_calculation():
    width = 1000
    # Left: center_x = 100 < 380
    box_left = {"x": 50, "y": 100, "width": 100, "height": 100}
    assert calculate_horizontal_position(box_left, width) == "left"
    assert "left" in calculate_side_direction(box_left, width)

    # Center: center_x = 500
    box_center = {"x": 450, "y": 100, "width": 100, "height": 100}
    assert calculate_horizontal_position(box_center, width) == "center"
    assert calculate_side_direction(box_center, width) == "in the center"

    # Right: center_x = 850 > 620
    box_right = {"x": 800, "y": 100, "width": 100, "height": 100}
    assert calculate_horizontal_position(box_right, width) == "right"
    assert "right" in calculate_side_direction(box_right, width)

def test_vertical_position_calculation():
    height = 1000
    # Ceiling: center_y = 150 < 280
    box_top = {"x": 100, "y": 100, "width": 100, "height": 100}
    assert calculate_vertical_level(box_top, height) == "up near the ceiling"

    # Eye level: center_y = 500
    box_mid = {"x": 100, "y": 450, "width": 100, "height": 100}
    assert calculate_vertical_level(box_mid, height) == "at eye level"

    # Floor: center_y = 900
    box_bottom = {"x": 100, "y": 850, "width": 100, "height": 100}
    assert calculate_vertical_level(box_bottom, height) == "down near the floor"

def test_normalize_object_query():
    # Exact COCO
    cat, sup = normalize_object_query("bottle")
    assert cat == "bottle"
    assert sup is True

    # Synonym
    cat, sup = normalize_object_query("smartphone")
    assert cat == "cell phone"
    assert sup is True

    # Plural
    cat, sup = normalize_object_query("chairs")
    assert cat == "chair"
    assert sup is True

    # Unsupported
    cat, sup = normalize_object_query("space shuttle rocket")
    assert sup is False

def test_scene_description_synthesis():
    detector = YoloDetector()
    
    # Empty
    desc_empty = detector.describe_scene([])
    assert "No supported objects" in desc_empty

    # Single
    det_single = [{
        "id": "1",
        "label": "bottle",
        "confidence": 0.92,
        "box": {"x": 50, "y": 50, "width": 50, "height": 100},
        "position": "left",
        "side_direction": "on your left side"
    }]
    desc_single = detector.describe_scene(det_single)
    assert "bottle" in desc_single
    assert "left" in desc_single

def test_find_unsupported_category():
    img_bytes = create_dummy_image_bytes()
    files = {"file": ("test.jpg", img_bytes, "image/jpeg")}
    data = {"requested_object": "alien spaceship", "confidence": 0.30}
    response = client.post("/find", files=files, data=data)
    assert response.status_code == 200
    res = response.json()
    assert res["is_category_supported"] is False
    assert res["found"] is False
    assert "not supported" in res["spoken_summary"]

def test_invalid_file_rejection():
    # Send a plain text file pretending to be image
    files = {"file": ("document.txt", b"Hello world, not an image", "text/plain")}
    response = client.post("/detect", files=files, data={"confidence": 0.30})
    assert response.status_code == 400
