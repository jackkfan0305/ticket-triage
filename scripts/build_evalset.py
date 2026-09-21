"""Sample 60 English tickets into tests/fixtures/evalset.csv for hand labelling.

Source: Tobi-Bueck/customer-support-tickets on Hugging Face, CC-BY-NC-4.0.
Run once: uv run --with datasets scripts/build_evalset.py

The dataset's priority and queue columns are sampling strata only. They are
copied as src_priority and src_queue for reference, never used as labels.
Stratified on high/medium/low: critical and very_low occur only in German rows.
"""

import csv
import random
import sys
from collections import Counter
from pathlib import Path

from datasets import load_dataset

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "evalset.csv"
SEED = 7
PRIORITIES = ["high", "medium", "low"]
PER_PRIORITY = {"high": 19, "medium": 18, "low": 18}  # 55 = 60 minus HR; the extra row goes to high, the stratum nearest urgent
MAX_PER_QUEUE = 3  # within one priority, so a big queue cannot crowd out the rest
HR_QUEUE = "Human Resources"
HR_COUNT = 5  # outside any SaaS roster: the only way to exercise the no-match branch
FIELDS = ["id", "subject", "body", "src_priority", "src_queue", "expected_priority", "expected_team"]


def pick_for_priority(rows, priority, rng):
    pool = [r for r in rows if r["priority"] == priority]
    rng.shuffle(pool)
    per_queue = Counter()
    chosen = []
    for r in pool:
        if per_queue[r["queue"]] < MAX_PER_QUEUE:
            per_queue[r["queue"]] += 1
            chosen.append(r)
        if len(chosen) == PER_PRIORITY[priority]:
            return chosen
    sys.exit(f"only {len(chosen)} usable rows for priority {priority}")


def sample(rows, rng):
    hr = rng.sample([r for r in rows if r["queue"] == HR_QUEUE], HR_COUNT)
    rest = [r for r in rows if r["queue"] != HR_QUEUE]
    return hr + [r for p in PRIORITIES for r in pick_for_priority(rest, p, rng)]


def main():
    if OUT.exists():
        sys.exit(f"{OUT} exists and may hold hand labels. Delete it first to rebuild.")

    ds = load_dataset("Tobi-Bueck/customer-support-tickets", split="train")
    rows = [
        {**r, "id": f"hf-{i}"}
        for i, r in enumerate(ds)
        if r["language"] == "en"
    ]
    picked = sample(rows, random.Random(SEED))

    assert len(picked) == HR_COUNT + sum(PER_PRIORITY.values()) == 60
    assert len({r["id"] for r in picked}) == 60, "duplicate ticket ids"
    assert sum(r["queue"] == HR_QUEUE for r in picked) == HR_COUNT

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


if __name__ == "__main__":
    main()
