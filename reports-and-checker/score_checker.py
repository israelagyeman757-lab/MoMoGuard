"""Score checker: run the brain on a small made-up labelled payment file.

Sanity check only — the data is invented, NOT the organisers' dataset, and
these results are NOT evidence of real-world accuracy. Re-run on the real
dataset after the sandbox arrives (split by sender account; tune on one
half, freeze, report once on the other).

Run from the repo root:
    python reports-and-checker/score_checker.py reports-and-checker/sample_payments.json
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from controller.brain.scoring import assess_payment, needs_confirm  # noqa: E402

DECISION = {"low": "allow", "caution": "caution", "high": "hold", "very_high": "block"}


def check_case(case: dict) -> dict:
    result = assess_payment(case.get("context", {}), answers=case.get("answers"))
    decision = DECISION[result["band"]]
    if needs_confirm(case.get("amount", 0), case.get("pair_max_safe", 0)):
        decision = "confirm"
    return {**case, "band": result["band"], "decision": decision,
            "score": round(result["score"], 3), "groups": result["groups"]}


def main(path: str) -> None:
    cases = json.loads(Path(path).read_text(encoding="utf-8"))
    rows = [check_case(c) for c in cases]

    print(f"{'ID':<5} {'label':<7} {'band':<10} {'decision':<9} {'score':<6} groups")
    for r in rows:
        print(f"{r['id']:<5} {r['label']:<7} {r['band']:<10} {r['decision']:<9} "
              f"{r['score']:<6} {','.join(r['groups']) or '-'}")

    scams = [r for r in rows if r["label"] == "scam"]
    honest = [r for r in rows if r["label"] == "honest"]
    stopped = [r for r in scams if r["decision"] in ("hold", "block")]
    honest_paused = [r for r in honest if r["decision"] in ("hold", "block")]
    honest_warned = [r for r in honest if r["decision"] in ("caution", "confirm")]

    print("\nSummary (made-up data, simulated - not real accuracy):")
    print(f"  scams paused/blocked: {len(stopped)}/{len(scams)}")
    print(f"  scams missed:         {len(scams) - len(stopped)}/{len(scams)}"
          f"  ({', '.join(r['id'] for r in scams if r not in stopped) or 'none'})")
    print(f"  honest paused:        {len(honest_paused)}/{len(honest)}"
          f"  ({', '.join(r['id'] for r in honest_paused) or 'none'})")
    print(f"  honest warned/confirm:{len(honest_warned)}/{len(honest)}"
          f"  ({', '.join(r['id'] for r in honest_warned) or 'none'})")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1
         else str(Path(__file__).parent / "sample_payments.json"))