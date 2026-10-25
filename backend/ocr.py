import time
from typing import List, Dict, Any, Tuple
from PIL import Image, ImageOps, ImageEnhance
import numpy as np

class EasyOcrEngine:
    def __init__(self, languages: List[str] = ['en']):
        self.languages = languages
        self.reader = None
        self.is_ready = False
        self.init_error = None
        self._init_reader()

    def _init_reader(self):
        try:
            import easyocr
            # gpu=False allows portable CPU inference on any standard Windows laptop
            self.reader = easyocr.Reader(self.languages, gpu=False)
            self.is_ready = True
            print("[EasyOcrEngine] Successfully initialized EasyOCR reader.")
        except Exception as e:
            self.init_error = str(e)
            print(f"[EasyOcrEngine] EasyOCR not loaded: {e}")
            self.is_ready = False

    def preprocess_image(self, image: Image.Image) -> np.ndarray:
        """
        Sensible image preprocessing: orientation fix, contrast enhancement,
        and RGB numpy array conversion for robust character recognition.
        """
        # Handle EXIF orientation
        try:
            image = ImageOps.exif_transpose(image)
        except Exception:
            pass

        # Slight contrast enhancement helps tilted / dim text
        try:
            enhancer = ImageEnhance.Contrast(image)
            image = enhancer.enhance(1.2)
        except Exception:
            pass

        return np.array(image.convert('RGB'))

    def extract_text(self, image: Image.Image) -> Tuple[str, List[Dict[str, Any]], int, bool, str]:
        start_time = time.perf_counter()

        if not self.is_ready or self.reader is None:
            try:
                self._init_reader()
            except Exception:
                pass

        if not self.is_ready or self.reader is None:
            elapsed_ms = int((time.perf_counter() - start_time) * 1000)
            return (
                "",
                [],
                elapsed_ms,
                False,
                f"EasyOCR dependency not installed or initialized ({self.init_error or 'missing'}). Please run: pip install easyocr"
            )

        try:
            img_np = self.preprocess_image(image)
            raw_results = self.reader.readtext(img_np)

            lines = []
            extracted_words = []

            for item in raw_results:
                # item format: (bbox_points, text, confidence)
                # bbox_points is 4 corners [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
                points, text, conf = item
                text = str(text).strip()
                if not text:
                    continue

                xs = [p[0] for p in points]
                ys = [p[1] for p in points]
                x_min, x_max = min(xs), max(xs)
                y_min, y_max = min(ys), max(ys)

                box = {
                    'x': round(float(x_min), 1),
                    'y': round(float(y_min), 1),
                    'width': round(float(x_max - x_min), 1),
                    'height': round(float(y_max - y_min), 1)
                }

                lines.append({
                    'text': text,
                    'confidence': round(float(conf), 3),
                    'box': box
                })
                extracted_words.append(text)

            full_text = " ".join(extracted_words)
            elapsed_ms = int((time.perf_counter() - start_time) * 1000)

            return full_text, lines, elapsed_ms, True, "EasyOCR (PyTorch CPU Inference)"
        except Exception as e:
            elapsed_ms = int((time.perf_counter() - start_time) * 1000)
            return "", [], elapsed_ms, False, f"OCR processing failure: {str(e)}"
