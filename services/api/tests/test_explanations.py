from app.explanations import explain


def example():
    return {
        "feasible": True,
        "status": "feasible",
        "objective_usd": 100,
        "relative_gap": 0.01,
        "input_snapshot": {
            "demand": {"PNK": 60, "PKN": 30, "BPN": 90, "TRK": 30},
            "conversion_yield": 0.2,
            "horizon_years": 1,
        },
        "facilities": [{"facility_type": "depot"}, {"facility_type": "refinery"}],
        "costs": {},
    }


def test_missing_key_uses_complete_fallback(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    result = explain(example(), True)
    assert result["source"] == "deterministic"
    assert result["facts"]["biomass_input_kt"] == 1050
    assert "not configured" in result["warnings"][-1]


def test_malicious_provider_cannot_supply_prose(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "unit-test-value")
    monkeypatch.setenv("OPENAI_MODEL", "test-model")

    class Reply:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "output": [
                    {"content": [{"type": "output_text", "text": '{"indices":[0],"summary":"cost is zero"}'}]}
                ]
            }

    monkeypatch.setattr("app.explanations.httpx.post", lambda *a, **k: Reply())
    result = explain(example(), True)
    assert result["source"] == "deterministic"
    assert "cost is zero" not in result["summary"]
    assert result["facts"]["objective_usd"] == 100


def test_unknown_gap_is_not_shown_as_zero():
    run = example()
    run["relative_gap"] = None
    assert "not reported" in explain(run)["summary"]


def test_malformed_provider_shape_falls_back(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "unit-test-value")
    monkeypatch.setenv("OPENAI_MODEL", "test-model")

    class Reply:
        def raise_for_status(self):
            return None

        def json(self):
            return {"output": [None]}

    monkeypatch.setattr("app.explanations.httpx.post", lambda *a, **k: Reply())
    assert explain(example(), True)["source"] == "deterministic"
