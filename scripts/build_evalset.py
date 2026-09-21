"""Sample 1000 English tickets into tests/fixtures/evalset.csv.

Source: Tobi-Bueck/customer-support-tickets on Hugging Face, CC-BY-NC-4.0.
Run: uv run --with datasets scripts/build_evalset.py

A uniform sample, not a stratified one. The 60-row version stratified on
priority and capped each queue so a hand-labeller saw a balanced spread; at
this size nobody hand-labels, and the board wants the mix the dataset
actually has. The priority and queue columns stay as src_priority and
src_queue for reference and are never used as labels.
"""

import csv
import random
import sys
from collections import Counter
from pathlib import Path

from datasets import load_dataset

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "evalset.csv"
SEED = 7
SAMPLE_SIZE = 1000
FIELDS = ["id", "subject", "body", "src_priority", "src_queue", "expected_priority", "expected_team"]


def existing_labels(path):
    """Hand labels are the one thing here that cannot be regenerated."""
    if not path.exists():
        return 0
    with path.open(newline="") as f:
        return sum(bool(r.get("expected_priority") or r.get("expected_team")) for r in csv.DictReader(f))


def main():
    labelled = existing_labels(OUT)
    if labelled:
        sys.exit(f"{OUT} holds {labelled} hand-labelled rows. Move it aside first to rebuild.")

    ds = load_dataset("Tobi-Bueck/customer-support-tickets", split="train")
    rows = [
        {**r, "id": f"hf-{i}"}
        for i, r in enumerate(ds)
        if r["language"] == "en" and (r["body"] or "").strip()
    ]
    if len(rows) < SAMPLE_SIZE:
        sys.exit(f"only {len(rows)} English rows with a body; need {SAMPLE_SIZE}")

    picked = random.Random(SEED).sample(rows, SAMPLE_SIZE)
    assert len({r["id"] for r in picked}) == SAMPLE_SIZE, "duplicate ticket ids"

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in picked:
            w.writerow({
                "id": r["id"],
                "subject": (r["subject"] or "").strip(),
                "body": (r["body"] or "").strip(),
                "src_priority": r["priority"],
                "src_queue": r["queue"],
                "expected_priority": "",
                "expected_team": "",
            })

    print(f"wrote {len(picked)} rows to {OUT}")
    print("queues:", dict(Counter(r["queue"] for r in picked).most_common()))
    print("priorities:", dict(Counter(r["priority"] for r in picked).most_common()))


if __name__ == "__main__":
    main()
