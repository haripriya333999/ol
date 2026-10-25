from typing import List, Dict, Any

def compute_iou(box1: Dict[str, float], box2: Dict[str, float]) -> float:
    """
    Computes Intersection over Union (IoU) between two bounding boxes.
    Box format: {'x': left, 'y': top, 'width': w, 'height': h}
    """
    x1_min = box1['x']
    y1_min = box1['y']
    x1_max = box1['x'] + box1['width']
    y1_max = box1['y'] + box1['height']

    x2_min = box2['x']
    y2_min = box2['y']
    x2_max = box2['x'] + box2['width']
    y2_max = box2['y'] + box2['height']

    # Intersection rectangle
    inter_xmin = max(x1_min, x2_min)
    inter_ymin = max(y1_min, y2_min)
    inter_xmax = min(x1_max, x2_max)
    inter_ymax = min(y1_max, y2_max)

    inter_w = max(0.0, inter_xmax - inter_xmin)
    inter_h = max(0.0, inter_ymax - inter_ymin)
    inter_area = inter_w * inter_h

    box1_area = box1['width'] * box1['height']
    box2_area = box2['width'] * box2['height']
    union_area = box1_area + box2_area - inter_area

    if union_area <= 0:
        return 0.0
    return inter_area / union_area

def evaluate_detection_metrics(
    ground_truth: List[Dict[str, Any]],
    predictions: List[Dict[str, Any]],
    iou_threshold: float = 0.50
) -> Dict[str, float]:
    """
    Calculates precision, recall, and F1 score at given IoU threshold.
    """
    if not ground_truth and not predictions:
        return {"precision": 1.0, "recall": 1.0, "f1_score": 1.0, "matched": 0}

    if not ground_truth:
        return {"precision": 0.0, "recall": 1.0, "f1_score": 0.0, "matched": 0}

    if not predictions:
        return {"precision": 1.0, "recall": 0.0, "f1_score": 0.0, "matched": 0}

    matched_gt = set()
    true_positives = 0
    false_positives = 0

    for pred in predictions:
        best_iou = 0.0
        best_gt_idx = -1

        for idx, gt in enumerate(ground_truth):
            if idx in matched_gt:
                continue
            if pred.get('label', '').lower() == gt.get('label', '').lower():
                iou = compute_iou(pred['box'], gt['box'])
                if iou > best_iou:
                    best_iou = iou
                    best_gt_idx = idx

        if best_iou >= iou_threshold and best_gt_idx >= 0:
            true_positives += 1
            matched_gt.add(best_gt_idx)
        else:
            false_positives += 1

    false_negatives = len(ground_truth) - len(matched_gt)

    precision = true_positives / float(true_positives + false_positives) if (true_positives + false_positives) > 0 else 0.0
    recall = true_positives / float(true_positives + false_negatives) if (true_positives + false_negatives) > 0 else 0.0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

    return {
        "precision": round(precision, 3),
        "recall": round(recall, 3),
        "f1_score": round(f1, 3),
        "true_positives": true_positives,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "total_ground_truth": len(ground_truth),
        "total_predictions": len(predictions)
    }

if __name__ == "__main__":
    gt = [
        {"label": "door", "box": {"x": 220, "y": 110, "width": 170, "height": 370}},
        {"label": "window", "box": {"x": 460, "y": 140, "width": 180, "height": 220}},
        {"label": "person", "box": {"x": 580, "y": 270, "width": 80, "height": 130}}
    ]
    preds = [
        {"label": "door", "box": {"x": 225, "y": 112, "width": 165, "height": 365}, "confidence": 0.94},
        {"label": "window", "box": {"x": 462, "y": 142, "width": 175, "height": 215}, "confidence": 0.91},
        {"label": "person", "box": {"x": 582, "y": 272, "width": 78, "height": 128}, "confidence": 0.89}
    ]
    res = evaluate_detection_metrics(gt, preds)
    print("Detection Evaluation Results:", res)
