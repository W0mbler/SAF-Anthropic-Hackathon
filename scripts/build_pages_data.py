"""Publish real, independently generated MILP results for the static Pages demo."""

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/api"))
from app.data import load_candidates, load_locations
from app.explanations import explain
from app.schemas import ScenarioInput
from app.solver import solve


def main():
    created = datetime.now(UTC).isoformat()
    runs, explanations = [], {}
    for key, name, demand in [
        (
            "baseline",
            "Illustrative baseline",
            {"PNK": 60, "PKN": 30, "BPN": 90, "TRK": 30},
        ),
        (
            "lower",
            "Illustrative lower demand",
            {"PNK": 45, "PKN": 25, "BPN": 65, "TRK": 25},
        ),
        (
            "higher",
            "Illustrative higher demand",
            {"PNK": 70, "PKN": 40, "BPN": 110, "TRK": 40},
        ),
    ]:
        inputs = ScenarioInput(name=name, demand=demand).model_dump()
        result = solve(inputs, time_limit=60)
        if not result["feasible"]:
            raise RuntimeError(f"Cannot publish {key}: no feasible solver result")
        for airport, expected in demand.items():
            delivered = sum(
                f["quantity_kt"]
                for f in result["flows"]
                if f["stage"] == "refinery_airport" and f["to_node_id"] == airport
            )
            if abs(delivered - expected) > 1e-5:
                raise RuntimeError("Published result fails demand conservation")
        run = dict(
            result,
            id=f"published-{key}",
            scenario_id=f"scenario-{key}",
            input_snapshot=inputs,
            input_hash=result["provenance"]["input_hash"],
            created_at=created,
        )
        run["warnings"].append(
            "Published build-time result. GitHub Pages cannot run the Python solver or persist accounts/scenarios."
        )
        runs.append(run)
        explanations[run["id"]] = explain(run)
        print(f"Published {key}: {result['status']}, {result['objective_usd']:.2f} USD")
    output = ROOT / "apps/web/public/demo/data.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(
            {
                "locations": load_locations(),
                "candidates": load_candidates(),
                "runs": runs,
                "explanations": explanations,
                "generated_at": created,
            },
            allow_nan=False,
        )
    )


if __name__ == "__main__":
    main()
