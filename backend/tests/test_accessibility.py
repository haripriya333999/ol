import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from detector import calculate_side_direction, calculate_vertical_level
from evaluation.evaluate_scene import evaluate_scene_spatial_consistency

def test_no_clock_positions():
    """
    Accessibility standard requirement:
    Never use clock positions (12 o'clock, 3 o'clock) for blind navigation.
    Must always use natural human sides: on your left side, in the center, on your right side.
    """
    box_left = {"x": 50, "y": 100, "width": 100, "height": 100}
    side_left = calculate_side_direction(box_left, 1000)
    assert "o'clock" not in side_left.lower()
    assert "left" in side_left.lower()

    box_right = {"x": 800, "y": 100, "width": 100, "height": 100}
    side_right = calculate_side_direction(box_right, 1000)
    assert "o'clock" not in side_right.lower()
    assert "right" in side_right.lower()

def test_vertical_cues():
    box_top = {"x": 100, "y": 50, "width": 100, "height": 100}
    vert = calculate_vertical_level(box_top, 1000)
    assert "ceiling" in vert.lower()

def test_scene_truthfulness_consistency():
    dets = [{"label": "door", "position": "center", "confidence": 0.95}]
    consistent_text = "Visible in the image: a door in the center."
    res = evaluate_scene_spatial_consistency(dets, consistent_text)
    assert res["consistency_score"] == 1.0
