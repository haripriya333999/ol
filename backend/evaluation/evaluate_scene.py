from typing import List, Dict, Any

def evaluate_scene_spatial_consistency(detections: List[Dict[str, Any]], scene_text: str) -> dict:
    """
    Evaluates whether the directional words (left, center, right) in the generated
    scene text faithfully match the actual bounding box positions without hallucinating.
    """
    if not detections:
        is_empty_reported = "no supported objects" in scene_text.lower() or "no objects" in scene_text.lower()
        return {
            "consistency_score": 1.0 if is_empty_reported else 0.5,
            "hallucinated_directions": 0,
            "verified_objects": 0,
            "total_detections": 0
        }

    verified_count = 0
    hallucinated_count = 0
    lower_text = scene_text.lower()

    for det in detections:
        lbl = det.get('label', '').lower()
        pos = det.get('position', '').lower()

        # Check if the label is cited in the text
        if lbl in lower_text:
            verified_count += 1
            # Check if direction contradicts
            if pos == 'left' and 'right' in lower_text and 'left' not in lower_text:
                hallucinated_count += 1
            elif pos == 'right' and 'left' in lower_text and 'right' not in lower_text:
                hallucinated_count += 1

    score = 1.0 - (hallucinated_count / max(1, len(detections)))
    return {
        "consistency_score": round(max(0.0, score), 3),
        "verified_objects": verified_count,
        "hallucinated_directions": hallucinated_count,
        "total_detections": len(detections)
    }

if __name__ == "__main__":
    sample_dets = [
        {"label": "door", "position": "left", "confidence": 0.9},
        {"label": "window", "position": "right", "confidence": 0.85}
    ]
    sample_text = "Visible in the image: a door on the left side, and a window on the right side."
    res = evaluate_scene_spatial_consistency(sample_dets, sample_text)
    print("Spatial Consistency Results:", res)
