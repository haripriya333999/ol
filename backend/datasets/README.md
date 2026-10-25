# EverydayEyes AI / OmniLens — Datasets Documentation

This directory details the benchmark datasets utilized for evaluation, baseline validation, and testing of our machine learning pipelines.

## 1. Documented Datasets

| Dataset | Primary Use | License | Status in Repo |
|---|---|---|---|
| **MS COCO 2017** | Object Detection & Localization | CC-BY 4.0 | Evaluation protocol ground-truth annotations |
| **TextOCR** | Incidental & Scene Text OCR | CC-BY 4.0 | Verification of multi-angle signage & badges |
| **ICDAR 2015** | Robust Reading Competition | Research | Tilted/distorted store sign benchmark |
| **COCO Captions** | Spatial Scene Description | CC-BY 4.0 | Truthful scene description evaluation |

## 2. Evaluation Strategy
For hackathon evaluation and lightweight local execution on Windows without requiring multi-gigabyte downloads:
- Pretrained weights (`yolo11n.pt` and EasyOCR PyTorch models) are loaded once and reused.
- A curated representative smoke-test suite of labeled test scenes is provided in `backend/evaluation/` to report:
  - Precision, Recall, and mAP@0.5 for everyday object detection
  - Word Error Rate (WER) and Character Error Rate (CER) for signage OCR
  - Spatial consistency (left / center / right alignment)
