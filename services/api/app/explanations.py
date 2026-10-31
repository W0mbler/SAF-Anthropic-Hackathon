"""Explanations are assembled from verified facts; optional AI can only select caveats."""

import json
import os

import httpx

CAVEATS = [
    "Airport demand and conversion yield are illustrative assumptions.",
    "Connections use straight-line distance proxies, not verified truck routes.",
    "Candidate coordinates are not verified or permitted industrial sites.",
    "Processing operating costs are incomplete unless supplied in the scenario.",
]


def explain(run: dict, use_ai: bool = False):
    if not run["feasible"]:
        return {
            "source": "deterministic",
            "summary": f"No feasible network is available. {run['message']}",
            "facts": {},
            "warnings": CAVEATS,
        }
    inputs = run["input_snapshot"]
    demand = sum(inputs["demand"].values())
    facts = {
        "objective_usd": run["objective_usd"],
        "demand_saf_kt": demand,
        "biomass_input_kt": demand / inputs["conversion_yield"],
        "depots": sum(f["facility_type"] == "depot" for f in run["facilities"]),
        "refineries": sum(f["facility_type"] == "refinery" for f in run["facilities"]),
        "relative_gap": run["relative_gap"],
        "costs": run["costs"],
    }
    gap_description = "not reported" if run["relative_gap"] is None else f"{run['relative_gap'] * 100:.2f}%"
    summary = (
        f"The solver selected {facts['depots']} depots and {facts['refineries']} refineries to deliver "
        f"{demand:,.2f} kt of finished SAF using {facts['biomass_input_kt']:,.2f} kt of biomass. "
        f"Total modelled cost is US${run['objective_usd']:,.2f} over {inputs['horizon_years']} year(s). "
        f"The result is {run['status']} over the screened candidate set, with a relative MIP gap of "
        f"{gap_description}. "
        "Facility sizes and flow allocations were calculated by the MILP solver."
    )
    source, warnings = "deterministic", list(CAVEATS)
    key, model = os.getenv("OPENAI_API_KEY"), os.getenv("OPENAI_MODEL")
    if use_ai and key and model:
        # The provider selects only predefined caveat indices. It cannot supply prose,
        # replace numbers, or change solver decisions in the visible explanation.
        try:
            response = httpx.post(
                "https://api.openai.com/v1/responses",
                timeout=8,
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": model,
                    "instructions": "Select the most relevant caveat indices for these verified solver facts. Never add text or numbers.",
                    "input": json.dumps({"facts": facts, "caveats": CAVEATS}),
                    "text": {
                        "format": {
                            "type": "json_schema",
                            "name": "caveat_selection",
                            "strict": True,
                            "schema": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "indices": {
                                        "type": "array",
                                        "items": {"type": "integer", "enum": [0, 1, 2, 3]},
                                        "maxItems": 4,
                                    }
                                },
                                "required": ["indices"],
                            },
                        }
                    },
                },
            )
            response.raise_for_status()
            payload = response.json()
            texts = [
                c["text"]
                for item in payload.get("output", [])
                for c in item.get("content", [])
                if c.get("type") == "output_text"
            ]
            choice = json.loads("".join(texts))
            if (
                not isinstance(choice, dict)
                or set(choice) != {"indices"}
                or not isinstance(choice["indices"], list)
                or len(choice["indices"]) > 4
                or not all(type(i) is int and i in range(4) for i in choice["indices"])
            ):
                raise ValueError("Invalid provider selection")
            order = list(dict.fromkeys(choice["indices"] + list(range(4))))
            warnings = [CAVEATS[i] for i in order]
            source = "openai"
        except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
            warnings.append("Optional AI was unavailable; the complete deterministic explanation is shown.")
    elif use_ai:
        warnings.append("Optional AI is not configured; the complete deterministic explanation is shown.")
    return {"source": source, "summary": summary, "facts": facts, "warnings": warnings}
