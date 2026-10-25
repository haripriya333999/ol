from typing import List, Tuple

def compute_levenshtein_distance(s1: str, s2: str) -> int:
    """
    Standard dynamic programming algorithm for minimum edit distance.
    """
    if len(s1) < len(s2):
        return compute_levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]

def calculate_cer(reference: str, hypothesis: str) -> float:
    """
    Character Error Rate = edit_distance(ref, hyp) / len(ref)
    """
    ref_clean = reference.strip()
    if not ref_clean:
        return 0.0 if not hypothesis.strip() else 1.0
    dist = compute_levenshtein_distance(ref_clean, hypothesis.strip())
    return min(1.0, dist / float(len(ref_clean)))

def calculate_wer(reference: str, hypothesis: str) -> float:
    """
    Word Error Rate = word_edit_distance(ref_words, hyp_words) / len(ref_words)
    """
    r_words = reference.strip().split()
    h_words = hypothesis.strip().split()
    if not r_words:
        return 0.0 if not h_words else 1.0

    d = [[0] * (len(h_words) + 1) for _ in range(len(r_words) + 1)]
    for i in range(len(r_words) + 1):
        d[i][0] = i
    for j in range(len(h_words) + 1):
        d[0][j] = j

    for i in range(1, len(r_words) + 1):
        for j in range(1, len(h_words) + 1):
            if r_words[i - 1].lower() == h_words[j - 1].lower():
                d[i][j] = d[i - 1][j - 1]
            else:
                d[i][j] = min(
                    d[i - 1][j] + 1,      # deletion
                    d[i][j - 1] + 1,      # insertion
                    d[i - 1][j - 1] + 1   # substitution
                )
    return min(1.0, float(d[len(r_words)][len(h_words)]) / float(len(r_words)))

def evaluate_ocr_benchmark(samples: List[Tuple[str, str]]) -> dict:
    """
    Evaluates OCR performance across pairs of (ground_truth, extracted_text).
    """
    if not samples:
        return {"samples_count": 0, "avg_cer": 0.0, "avg_wer": 0.0, "word_accuracy": 1.0}

    total_cer = 0.0
    total_wer = 0.0
    for ref, hyp in samples:
        total_cer += calculate_cer(ref, hyp)
        total_wer += calculate_wer(ref, hyp)

    n = len(samples)
    avg_cer = round(total_cer / n, 4)
    avg_wer = round(total_wer / n, 4)
    return {
        "samples_count": n,
        "average_cer": avg_cer,
        "average_wer": avg_wer,
        "word_accuracy_pct": round((1.0 - avg_wer) * 100, 2),
        "char_accuracy_pct": round((1.0 - avg_cer) * 100, 2)
    }

if __name__ == "__main__":
    # Smoke test evaluation with representative samples
    test_suite = [
        ("aws ACADEMY Generative AI Foundations TRAINED", "aws ACADEMY Generative AI Foundations TRAINED"),
        ("ROOM 204 MEDICAL SUITE", "ROOM 204 MEDICAL SUITE"),
        ("EMERGENCY EXIT AHEAD", "EMERGENCY EXIT AHEAD")
    ]
    results = evaluate_ocr_benchmark(test_suite)
    print("EverydayEyes OCR Benchmark Results:")
    for k, v in results.items():
        print(f"  {k}: {v}")
