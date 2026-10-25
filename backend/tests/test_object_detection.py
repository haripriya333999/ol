import sys
import os
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from detector import (
    calculate_horizontal_position,
    calculate_side_direction,
    calculate_vertical_level,
    normalize_object_query,
    YoloDetector,
    COCO_CLASSES
)
from utils.spatial_position import calculate_prominence

def test_coco_classes_presence():
    assert len(COCO_CLASSES) >= 80
    assert "person" in COCO_CLASSES
    assert "chair" in COCO_CLASSES
    assert "bottle" in COCO_CLASSES
    assert "laptop" in COCO_CLASSES

def test_query_normalization_synonyms():
    # Door query
    cat, sup = normalize_object_query("smartphone")
    assert cat == "cell phone"
    assert sup is True

    # Plural
    cat, sup = normalize_object_query("bottles")
    assert cat == "bottle"
    assert sup is True

    # Unsupported category
    cat, sup = normalize_object_query("quantum submarine")
    assert sup is False

def test_spatial_prominence():
    img_w, img_h = 1000, 1000
    # Foreground box: > 22% of image
    fg_box = {'x': 100, 'y': 100, 'width': 600, 'height': 500}
    assert calculate_prominence(fg_box, img_w, img_h) == "foreground"

    # Background box: < 5% of image
    bg_box = {'x': 100, 'y': 100, 'width': 100, 'height': 100}
    assert calculate_prominence(bg_box, img_w, img_h) == "background"
