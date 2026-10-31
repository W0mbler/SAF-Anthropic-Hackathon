"""Independent arithmetic and physical checks for the public solver output."""

from __future__ import annotations

import csv
import math
from collections import defaultdict
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace

import pytest

from app import solver
from app.data import SUPPLY_FILENAME, data_directory, load_candidates, load_locations

BASELINE = {
    "name": "Illustrative baseline",
    "demand": {"PNK": 60, "PKN": 30, "BPN": 90, "TRK": 30},
    "conversion_yield": 0.2,
    "horizon_years": 1,
    "discount_rate": 0,
    "distance_multiplier": 1,
    "processing_opex": {"small": 0, "large": 0},
    "excluded_candidate_ids": [],
}


@pytest.fixture(scope="module")
def baseline():
    return solver.solve(BASELINE)


def verify_solution(result, inputs):
    """Recompute conservation, capacities and costs from emitted records."""
    assert result["feasible"] and result["status"] in {"optimal", "feasible"}
    locations = load_locations()
    sources = {row["id"]: row for row in locations["sources"]}
    airports = {row["id"]: row for row in locations["airports"]}
    candidates = load_candidates()
    source_used, depot_in, depot_out = defaultdict(float), defaultdict(float), defaultdict(float)
    refinery_in, refinery_out, delivery = defaultdict(float), defaultdict(float), defaultdict(float)
    annual_stage = defaultdict(float)
    tariff = {"farm_depot": 0.1, "depot_refinery": 0.12, "refinery_airport": 0.08}
    for flow in result["flows"]:
        origin, destination, amount = flow["from_node_id"], flow["to_node_id"], flow["quantity_kt"]
        assert amount >= 0 and math.isfinite(amount)
        stage = flow["stage"]
        if stage == "farm_depot":
            source_used[origin] += amount
            depot_in[destination] += amount
        elif stage == "depot_refinery":
            depot_out[origin] += amount
            refinery_in[destination] += amount
        elif stage == "refinery_airport":
            refinery_out[origin] += amount
            delivery[destination] += amount
        else:
            pytest.fail(f"Unexpected flow stage {stage}")
        assert flow["material"] == ("SAF" if stage == "refinery_airport" else "biomass")
        origin_record = sources[origin]
        destination_record = airports[destination] if stage == "refinery_airport" else sources[destination]
        lat1, lat2 = map(math.radians, [origin_record["latitude"], destination_record["latitude"]])
        delta_lat = lat2 - lat1
        delta_lon = math.radians(destination_record["longitude"] - origin_record["longitude"])
        hav = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
        distance = 6371 * 2 * math.atan2(math.sqrt(hav), math.sqrt(max(0, 1 - hav)))
        distance *= inputs["distance_multiplier"]
        assert flow["distance_km"] == pytest.approx(distance, abs=1e-8)
        expected_cost = amount * 1000 * distance * tariff[stage]
        assert flow["tariff_usd_per_tonne_km"] == tariff[stage]
        assert flow["transport_usd"] == pytest.approx(expected_cost, abs=1e-5)
        annual_stage[stage] += expected_cost
    assert sum(source_used.values()) == pytest.approx(
        sum(inputs["demand"].values()) / inputs["conversion_yield"]
    )
    for identifier, amount in source_used.items():
        assert amount <= sources[identifier]["production_kilotons"] + 1e-5
    for code, amount in inputs["demand"].items():
        assert delivery[code] == pytest.approx(amount, abs=1e-5)

    active, capex, processing = set(), 0, 0
    depot_ids = {row["id"] for row in candidates["depots"]}
    refinery_ids = {row["id"] for row in candidates["refineries"]}
    for facility in result["facilities"]:
        identifier, kind, size = facility["candidate_id"], facility["facility_type"], facility["size"]
        assert identifier not in inputs["excluded_candidate_ids"]
        assert (kind, identifier) not in active
        active.add((kind, identifier))
        assert facility["latitude"] == sources[identifier]["latitude"]
        assert facility["longitude"] == sources[identifier]["longitude"]
        if kind == "depot":
            assert identifier in depot_ids
            capacity = 150 if size == "small" else 300
            capital = 2_250_000 if size == "small" else 4_500_000
            throughput = depot_in[identifier]
            assert throughput == pytest.approx(depot_out[identifier], abs=1e-5)
        else:
            assert identifier in refinery_ids
            capacity = 500 if size == "small" else 1087
            capital = 480_000_000 if size == "small" else 765_000_000
            throughput = refinery_in[identifier]
            assert throughput * inputs["conversion_yield"] == pytest.approx(
                refinery_out[identifier], abs=1e-5
            )
            processing += inputs["processing_opex"][size]
        assert 0 <= throughput <= capacity + 1e-5
        assert facility["capacity_input_kt"] == capacity
        assert facility["throughput_input_kt"] == pytest.approx(throughput)
        assert facility["utilization"] == pytest.approx(throughput / capacity)
        assert facility["capex_usd"] == capital
        capex += capital
    assert all(("depot", node) in active for node in depot_in)
    assert all(("refinery", node) in active for node in refinery_in)
    years, rate = inputs["horizon_years"], inputs["discount_rate"]
    annuity = years if rate == 0 else sum((1 + rate) ** -year for year in range(1, years + 1))
    expected_total = capex + annuity * (sum(annual_stage.values()) + processing)
    assert result["costs"]["pvaf"] == pytest.approx(annuity)
    assert result["costs"]["capex_usd"] == pytest.approx(capex)
    assert result["costs"]["annual_processing_usd"] == pytest.approx(processing)
    for stage in tariff:
        assert result["costs"][stage + "_usd"] == pytest.approx(annual_stage[stage])
    assert result["costs"]["annual_transport_usd"] == pytest.approx(sum(annual_stage.values()))
    assert result["objective_usd"] == pytest.approx(expected_total, abs=0.01)
    assert result["costs"]["total_usd"] == result["objective_usd"]
    assert result["relative_gap"] is not None
    return expected_total


def test_dataset_integrity_and_candidates():
    locations = load_locations()
    assert len(locations["sources"]) == 80
    assert sum(row["production_kilotons"] for row in locations["sources"]) == pytest.approx(6800)
    assert [row["id"] for row in locations["airports"]] == ["PNK", "PKN", "BPN", "TRK"]
    candidates = load_candidates()
    assert len(candidates["depots"]) == 13 and len(candidates["refineries"]) == 8
    assert candidates == load_candidates()


def test_baseline_independent_constraints(baseline):
    cost = verify_solution(baseline, BASELINE)
    assert cost == pytest.approx(800_989_000, abs=30_000)
    assert baseline["relative_gap"] <= 0.02
    assert sum(
        f["throughput_input_kt"] for f in baseline["facilities"] if f["facility_type"] == "refinery"
    ) == pytest.approx(1050)


def test_higher_demand():
    inputs = deepcopy(BASELINE)
    inputs["demand"] = {"PNK": 70, "PKN": 40, "BPN": 110, "TRK": 40}
    result = solver.solve(inputs)
    verify_solution(result, inputs)
    assert sum(
        f["throughput_input_kt"] for f in result["facilities"] if f["facility_type"] == "refinery"
    ) == pytest.approx(1300)
    assert sum(f["facility_type"] == "refinery" for f in result["facilities"]) >= 2


def test_finance_distance_and_fixed_processing_opex():
    inputs = deepcopy(BASELINE)
    inputs.update(horizon_years=10, discount_rate=0.08, distance_multiplier=1.5)
    inputs["processing_opex"] = {"small": 1_000_000, "large": 2_000_000}
    result = solver.solve(inputs)
    verify_solution(result, inputs)
    assert result["costs"]["annual_processing_usd"] > 0


def test_excluding_selected_site_changes_network(baseline):
    inputs = deepcopy(BASELINE)
    excluded = next(f["candidate_id"] for f in baseline["facilities"] if f["facility_type"] == "refinery")
    inputs["excluded_candidate_ids"] = [excluded]
    result = solver.solve(inputs)
    verify_solution(result, inputs)
    assert all(f["candidate_id"] != excluded for f in result["facilities"])
    assert result["provenance"]["input_hash"] != baseline["provenance"]["input_hash"]


def test_impossible_demand_and_all_candidates_disabled():
    inputs = deepcopy(BASELINE)
    inputs["demand"] = dict.fromkeys(inputs["demand"], 2000)
    result = solver.solve(inputs)
    assert result["status"] == "infeasible" and not result["feasible"]
    assert result["objective_usd"] is None and result["facilities"] == [] and result["flows"] == []
    inputs = deepcopy(BASELINE)
    inputs["excluded_candidate_ids"] = [row["id"] for row in load_candidates()["depots"]]
    assert solver.solve(inputs)["status"] == "infeasible"


@pytest.mark.parametrize(
    "key,value",
    [
        ("conversion_yield", 0),
        ("conversion_yield", -0.2),
        ("conversion_yield", 1.1),
        ("conversion_yield", float("nan")),
        ("horizon_years", 0),
        ("horizon_years", 1.5),
        ("discount_rate", -0.1),
        ("distance_multiplier", 0),
        ("processing_opex", {"small": -1, "large": 0}),
        ("excluded_candidate_ids", ["unknown"]),
    ],
)
def test_invalid_assumptions(key, value):
    inputs = deepcopy(BASELINE)
    inputs[key] = value
    with pytest.raises(ValueError):
        solver.solve(inputs)


@pytest.mark.parametrize("value", [0, -1, float("nan"), float("inf"), True])
def test_invalid_demand(value):
    inputs = deepcopy(BASELINE)
    inputs["demand"]["PNK"] = value
    with pytest.raises(ValueError):
        solver.solve(inputs)


def test_units_haversine_and_annuity():
    assert 1 * 1000 * 0.10 * 100 == 10_000
    assert solver.haversine((0, 0), (0, 0)) == 0
    assert solver.haversine((0, 0), (0, 1)) == pytest.approx(111.1949266)
    assert solver.pvaf(10, 0) == 10
    assert solver.pvaf(10, 0.1) == pytest.approx(sum(1.1**-i for i in range(1, 11)))
    assert solver.pvaf(10, 1e-12) == pytest.approx(10)
    with pytest.raises(ValueError):
        solver.haversine((91, 0), (0, 0))


def test_loader_rejects_invalid_coordinates(tmp_path: Path, monkeypatch):
    root = data_directory()
    with (root / SUPPLY_FILENAME).open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    rows[0]["latitude"] = "nan"
    with (tmp_path / SUPPLY_FILENAME).open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    monkeypatch.setenv("SAF_DATA_DIR", str(tmp_path))
    with pytest.raises(ValueError, match="Coordinates"):
        load_locations()


def test_time_limit_without_incumbent(monkeypatch):
    monkeypatch.setattr(
        solver, "milp", lambda **kwargs: SimpleNamespace(status=1, message="Time limit", x=None)
    )
    result = solver.solve(BASELINE)
    assert result["status"] == "no_solution" and not result["feasible"]
    assert result["objective_usd"] is None and result["flows"] == []


@pytest.mark.parametrize("target", [0, 0.005, 0.02])
def test_configured_relative_gap_reaches_highs_and_provenance(monkeypatch, target):
    options = []

    def capture(**kwargs):
        options.append(kwargs["options"])
        return SimpleNamespace(status=1, message="Time limit", x=None)

    monkeypatch.setattr(solver, "milp", capture)
    result = solver.solve(BASELINE, relative_gap=target)
    assert options[0]["mip_rel_gap"] == target
    assert result["provenance"]["relative_gap_target"] == target


@pytest.mark.parametrize("target", [-0.001, 0.020001, float("nan"), float("inf"), True, "0.01"])
def test_invalid_solver_relative_gap(target):
    with pytest.raises(ValueError, match="relative gap"):
        solver.solve(BASELINE, relative_gap=target)


def test_time_limited_feasible_incumbent_and_invalid_incumbent(monkeypatch):
    original = solver.milp

    def limited(**kwargs):
        result = original(**kwargs)
        result.status, result.mip_gap = 1, 0.03
        return result

    monkeypatch.setattr(solver, "milp", limited)
    result = solver.solve(BASELINE)
    verify_solution(result, BASELINE)
    assert result["status"] == "feasible" and result["relative_gap"] == 0.03

    def invalid(**kwargs):
        result = original(**kwargs)
        result.x[0] = -1
        return result

    monkeypatch.setattr(solver, "milp", invalid)
    result = solver.solve(BASELINE)
    assert result["status"] == "no_solution" and not result["feasible"]
