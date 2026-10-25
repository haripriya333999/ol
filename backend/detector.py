import os
import time
from typing import List, Dict, Any, Tuple, Optional
from PIL import Image, ImageOps
import numpy as np

# Standard 80 COCO classes supported by pretrained YOLO
COCO_CLASSES = [
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
    'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
    'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
    'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
    'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
    'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
    'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake',
    'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop',
    'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
    'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier',
    'toothbrush'
]

SYNONYM_MAP = {
    # Phones & Handheld devices -> COCO 'cell phone'
    'cellphone': 'cell phone',
    'cell-phone': 'cell phone',
    'cell phone': 'cell phone',
    'mobile phone': 'cell phone',
    'mobilephone': 'cell phone',
    'mobile': 'cell phone',
    'phone': 'cell phone',
    'smartphone': 'cell phone',
    'smart phone': 'cell phone',
    'handphone': 'cell phone',
    'cellular phone': 'cell phone',
    'cellular': 'cell phone',
    'iphone': 'cell phone',
    'android': 'cell phone',
    'telephone': 'cell phone',
    'handset': 'cell phone',

    # Drinkware -> COCO 'cup' or 'bottle'
    'cup': 'cup',
    'mug': 'cup',
    'coffee cup': 'cup',
    'coffee mug': 'cup',
    'tea cup': 'cup',
    'teacup': 'cup',
    'tumbler': 'cup',
    'drinking glass': 'cup',
    'bottle': 'bottle',
    'water bottle': 'bottle',
    'waterbottle': 'bottle',
    'flask': 'bottle',
    'thermos': 'bottle',
    'sipper': 'bottle',

    # Computers & Displays -> COCO 'laptop' / 'tv'
    'screen': 'tv',
    'monitor': 'tv',
    'television': 'tv',
    'tv': 'tv',
    'display': 'tv',
    'computer': 'laptop',
    'notebook': 'laptop',
    'pc': 'laptop',
    'macbook': 'laptop',
    'chromebook': 'laptop',
    'desktop': 'tv',

    # Furniture -> COCO 'couch' / 'dining table' / 'chair' / 'bed'
    'sofa': 'couch',
    'couch': 'couch',
    'settee': 'couch',
    'loveseat': 'couch',
    'table': 'dining table',
    'desk': 'dining table',
    'study desk': 'dining table',
    'work table': 'dining table',
    'office desk': 'dining table',
    'dining table': 'dining table',
    'counter': 'dining table',
    'workbench': 'dining table',
    'chair': 'chair',
    'armchair': 'chair',
    'office chair': 'chair',
    'seat': 'chair',
    'stool': 'chair',
    'bed': 'bed',
    'cot': 'bed',
    'mattress': 'bed',

    # Bags -> COCO 'backpack' / 'handbag' / 'suitcase'
    'bag': 'backpack',
    'backpack': 'backpack',
    'school bag': 'backpack',
    'knapsack': 'backpack',
    'rucksack': 'backpack',
    'book bag': 'backpack',
    'purse': 'handbag',
    'handbag': 'handbag',
    'tote': 'handbag',
    'tote bag': 'handbag',
    'shoulder bag': 'handbag',
    'clutch': 'handbag',
    'wallet': 'handbag',
    'suitcase': 'suitcase',
    'luggage': 'suitcase',

    # Animals -> COCO
    'pet': 'dog',
    'puppy': 'dog',
    'pup': 'dog',
    'dog': 'dog',
    'doggy': 'dog',
    'canine': 'dog',
    'kitten': 'cat',
    'kitty': 'cat',
    'cat': 'cat',
    'feline': 'cat',

    # Vehicles -> COCO
    'car': 'car',
    'automobile': 'car',
    'auto': 'car',
    'sedan': 'car',
    'suv': 'car',
    'vehicle': 'car',
    'bike': 'bicycle',
    'bicycle': 'bicycle',
    'cycle': 'bicycle',
    'motorbike': 'motorcycle',
    'motorcycle': 'motorcycle',
    'scooter': 'motorcycle',

    # Plants -> COCO
    'plant': 'potted plant',
    'potted plant': 'potted plant',
    'houseplant': 'potted plant',
    'flower': 'potted plant',
    'flowerpot': 'potted plant',

    # People -> COCO 'person'
    'person': 'person',
    'human': 'person',
    'man': 'person',
    'woman': 'person',
    'girl': 'person',
    'boy': 'person',
    'guy': 'person',
    'lady': 'person',
    'child': 'person',
    'kid': 'person',
    'student': 'person',
    'individual': 'person',

    # Food -> COCO
    'snack': 'sandwich',
    'food': 'sandwich',
    'fruit': 'apple',

    # Controllers / Clocks / Books
    'remote': 'remote',
    'remote control': 'remote',
    'controller': 'remote',
    'tv remote': 'remote',
    'clock': 'clock',
    'watch': 'clock',
    'wristwatch': 'clock',
    'timepiece': 'clock',
    'book': 'book',
    'notebook': 'book',
    'textbook': 'book',
    'novel': 'book',
}

def calculate_horizontal_position(box: Dict[str, float], img_width: float) -> str:
    if img_width <= 0:
        return 'center'
    center_x = box['x'] + (box['width'] / 2.0)
    ratio = center_x / img_width
    if ratio < 0.38:
        return 'left'
    elif ratio > 0.62:
        return 'right'
    return 'center'

def calculate_side_direction(box: Dict[str, float], img_width: float) -> str:
    if img_width <= 0:
        return 'in the center'
    center_x = box['x'] + (box['width'] / 2.0)
    ratio = center_x / img_width
    if ratio < 0.20:
        return 'to your far left'
    elif ratio < 0.38:
        return 'on your left side'
    elif ratio <= 0.62:
        return 'in the center'
    elif ratio <= 0.80:
        return 'on your right side'
    else:
        return 'to your far right'

def calculate_vertical_level(box: Dict[str, float], img_height: float) -> str:
    if img_height <= 0:
        return 'at eye level'
    center_y = box['y'] + (box['height'] / 2.0)
    ratio = center_y / img_height
    if ratio < 0.28:
        return 'up near the ceiling'
    elif ratio < 0.65:
        return 'at eye level'
    elif ratio < 0.85:
        return 'at waist level'
    else:
        return 'down near the floor'

def normalize_object_query(query: str) -> Tuple[Optional[str], bool]:
    if not query:
        return None, False

    clean = query.strip().lower()
    for prefix in ['find ', 'locate ', 'where is ', 'my ', 'the ', 'a ', 'an ', 'any ', 'please ']:
        if clean.startswith(prefix):
            clean = clean[len(prefix):].strip()
    clean = clean.replace('-', ' ').replace('_', ' ')
    clean = ' '.join(clean.split())

    if not clean:
        return None, False

    if clean in COCO_CLASSES:
        return clean, True

    if clean in SYNONYM_MAP:
        return SYNONYM_MAP[clean], True

    # Check condensed form without spaces (e.g. 'cellphone' -> 'cell phone')
    condensed = clean.replace(' ', '')
    if condensed in SYNONYM_MAP:
        return SYNONYM_MAP[condensed], True

    # Plural handling: "bottles" -> "bottle", "chairs" -> "chair", "cellphones" -> "cell phone"
    if clean.endswith('s') and not clean.endswith('ss'):
        singular = clean[:-1]
        if singular in COCO_CLASSES:
            return singular, True
        if singular in SYNONYM_MAP:
            return SYNONYM_MAP[singular], True
        if singular.replace(' ', '') in SYNONYM_MAP:
            return SYNONYM_MAP[singular.replace(' ', '')], True

    # Token overlap check (e.g., "my mobile phone" contains "cell phone" synonyms)
    for k, v in SYNONYM_MAP.items():
        if k in clean or clean in k:
            return v, True

    for c in COCO_CLASSES:
        if c in clean or clean in c:
            return c, True

    return clean, False

class YoloDetector:
    def __init__(self, model_name: Optional[str] = None):
        # Allow configuration via environment variable OMNILENS_YOLO_MODEL or parameter
        self.model_name = model_name or os.getenv("OMNILENS_YOLO_MODEL", "yolo11n.pt")
        self.model = None
        self.is_ready = False
        self._load_model()

    def _load_model(self):
        try:
            from ultralytics import YOLO
            self.model = YOLO(self.model_name)
            self.is_ready = True
            print(f"[YoloDetector] Successfully initialized {self.model_name}")
        except Exception as e:
            print(f"[YoloDetector] Notice: Could not load Ultralytics YOLO ({e}).")
            self.is_ready = False

    def detect(self, image: Image.Image, min_confidence: float = 0.30, iou_threshold: float = 0.45) -> Tuple[List[Dict[str, Any]], int]:
        start_time = time.perf_counter()

        # Handle EXIF orientation
        try:
            image = ImageOps.exif_transpose(image)
        except Exception:
            pass

        if not self.is_ready or self.model is None:
            try:
                self._load_model()
            except Exception:
                pass

        if not self.is_ready or self.model is None:
            elapsed_ms = int((time.perf_counter() - start_time) * 1000)
            return [], elapsed_ms

        img_width, img_height = image.size

        # Safe prediction with aspect ratio preservation
        try:
            results = self.model.predict(
                source=image,
                conf=min_confidence,
                iou=iou_threshold,
                verbose=False
            )
        except Exception as e:
            print(f"[YoloDetector] Inference error: {e}")
            elapsed_ms = int((time.perf_counter() - start_time) * 1000)
            return [], elapsed_ms

        detections = []
        if results and len(results) > 0:
            boxes = results[0].boxes
            for idx, box in enumerate(boxes):
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                label = self.model.names.get(cls_id, f"object_{cls_id}").lower()

                # xyxy coordinates
                xyxy = box.xyxy[0].tolist()
                x1, y1, x2, y2 = xyxy
                w = max(0.0, x2 - x1)
                h = max(0.0, y2 - y1)

                bbox = {
                    'x': round(max(0.0, x1), 1),
                    'y': round(max(0.0, y1), 1),
                    'width': round(min(float(img_width), w), 1),
                    'height': round(min(float(img_height), h), 1)
                }

                pos = calculate_horizontal_position(bbox, img_width)
                side = calculate_side_direction(bbox, img_width)
                vert = calculate_vertical_level(bbox, img_height)

                detections.append({
                    'id': f"det-{idx}-{label}",
                    'label': label,
                    'confidence': round(conf, 3),
                    'box': bbox,
                    'position': pos,
                    'side_direction': side,
                    'vertical_position': vert
                })

        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        return detections, elapsed_ms

    def describe_scene(self, detections: List[Dict[str, Any]]) -> str:
        if not detections:
            return "No supported objects were detected in the image at the selected confidence threshold."

        parts = []
        for d in detections[:6]:
            lbl = d['label']
            article = "an" if lbl[0] in "aeiou" else "a"
            side = d.get('side_direction') or ("in the center" if d['position'] == 'center' else f"on the {d['position']} side")
            vert = d.get('vertical_position')
            vert_str = f" ({vert})" if vert else ""
            parts.append(f"{article} {lbl} {side}{vert_str}")

        if len(parts) == 1:
            return f"Visible in the image: {parts[0]}."
        elif len(parts) == 2:
            return f"Visible in the image: {parts[0]}, and {parts[1]}."
        else:
            last = parts.pop()
            return f"Visible in the image: {'; '.join(parts)}, and {last}."
