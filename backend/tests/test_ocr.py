import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from evaluation.evaluate_ocr import (
    compute_levenshtein_distance,
    calculate_cer,
    calculate_wer,
    evaluate_ocr_benchmark
)

def test_levenshtein_distance():
    assert compute_levenshtein_distance("kitten", "sitting") == 3
    assert compute_levenshtein_distance("AWS", "AWS") == 0
    assert compute_levenshtein_distance("Academy", "AcapEMY") == 4

def test_cer_calculation():
    # Exact match: 0% CER
    assert calculate_cer("TRAINED", "TRAINED") == 0.0
    # Complete mismatch
    cer = calculate_cer("ABC", "XYZ")
    assert cer == 1.0

def test_wer_calculation():
    ref = "aws ACADEMY Generative AI Foundations TRAINED"
    hyp = "aws ACADEMY Generative AI Foundations TRAINED"
    assert calculate_wer(ref, hyp) == 0.0

    # 1 word different out of 6
    hyp_err = "aws AcapEMY Generative AI Foundations TRAINED"
    wer = calculate_wer(ref, hyp_err)
    assert 0.15 < wer < 0.20

def test_benchmark_summary():
    data = [
        ("ROOM 204 MEDICAL SUITE", "ROOM 204 MEDICAL SUITE"),
        ("EXIT", "EXIT")
    ]
    res = evaluate_ocr_benchmark(data)
    assert res["average_wer"] == 0.0
    assert res["word_accuracy_pct"] == 100.0
