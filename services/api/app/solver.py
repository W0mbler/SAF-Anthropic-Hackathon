"""Joint facility-location, sizing and material-flow MILP, solved by HiGHS.

The numerical objective is scaled to millions of USD; every public monetary
value is returned in USD and physical flows in kt. No result is hardcoded.
"""

from __future__ import annotations

import hashlib
import json
import math
import time
from collections.abc import Sequence
from typing import Any

import numpy as np
import scipy
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import coo_matrix

from .data import (
    AIRPORT_CODES,
    CANDIDATE_METHOD,
    dataset_hashes,
    load_candidates,
    load_locations,
    validate_coordinates,
)

DEPOT_CAPACITY = (150.0, 300.0)
REFINERY_CAPACITY = (500.0, 1087.0)
DEPOT_CAPEX = (2_250_000.0, 4_500_000.0)
REFINERY_CAPEX = (480_000_000.0, 765_000_000.0)
TARIFFS = {"farm_depot": 0.10, "depot_refinery": 0.12, "refinery_airport": 0.08}
DISTANCE_METHOD = "haversine-great-circle-proxy-6371km"
WARNINGS = [
    "Airport demand and biomass-to-SAF yield are illustrative assumptions, not observed values.",
    "Straight-line distance proxy; schematic connections are not verified truck routes.",
    "Candidate sites are reference coordinates, not screened or permitted construction land.",
    "Refinery capacities are assumed to mean biomass-input throughput per model period.",
    "Processing OpEx is incomplete unless supplied; no fuel certification or lifecycle-carbon assessment.",
    "Truck sizes have identical per-tonne-km tariffs here; truck capacity does not create cost savings.",
]


def pvaf(years: int, discount_rate: float) -> float:
    """Present-value annuity factor for annual end-of-period recurring costs."""
    if isinstance(years, bool) or not isinstance(years, int) or years < 1:
        raise ValueError("Planning horizon must be a positive integer")
    if not math.isfinite(discount_rate) or discount_rate < 0:
        raise ValueError("Discount rate must be finite and nonnegative")
    if discount_rate == 0:
        return float(years)
    return -math.expm1(-years * math.log1p(discount_rate)) / discount_rate


def haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle kilometres between two (latitude, longitude) pairs."""
    validate_coordinates(*a)
    validate_coordinates(*b)
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    term = (
        math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 6371 * 2 * math.asin(math.sqrt(min(1.0, max(0.0, term))))


def _number(value: Any, label: str, minimum: float = 0) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} must be numeric")
    number = float(value)
    if not math.isfinite(number) or number < minimum:
        raise ValueError(f"{label} must be finite and at least {minimum}")
    return number


def _validated_inputs(inputs: dict[str, Any], candidate_ids: set[str]) -> dict[str, Any]:
    demand = inputs.get("demand", {"PNK": 60, "PKN": 30, "BPN": 90, "TRK": 30})
    if not isinstance(demand, dict) or set(demand) != set(AIRPORT_CODES):
        raise ValueError("Demand must contain exactly PNK, PKN, BPN and TRK")
    demand = {code: _number(demand[code], f"{code} demand") for code in AIRPORT_CODES}
    if any(amount <= 0 for amount in demand.values()):
        raise ValueError("Each airport demand must be greater than zero")
    conversion_yield = _number(inputs.get("conversion_yield", 0.20), "Conversion yield")
    if not 0 < conversion_yield <= 1:
        raise ValueError("Conversion yield must be greater than zero and at most one")
    horizon = inputs.get("horizon_years", 1)
    discount = _number(inputs.get("discount_rate", 0), "Discount rate")
    pvaf(horizon, discount)
    multiplier = _number(inputs.get("distance_multiplier", 1), "Distance multiplier")
    if multiplier <= 0:
        raise ValueError("Distance multiplier must be greater than zero")
    processing = inputs.get("processing_opex", {"small": 0, "large": 0})
    if not isinstance(processing, dict) or set(processing) != {"small", "large"}:
        raise ValueError("Processing OpEx must contain fixed annual USD for small and large refineries")
    processing = {
        size: _number(processing[size], f"{size} refinery annual processing OpEx")
        for size in ("small", "large")
    }
    excluded = inputs.get("excluded_candidate_ids", [])
    if not isinstance(excluded, list) or any(not isinstance(item, str) for item in excluded):
        raise ValueError("Excluded candidate IDs must be a list of strings")
    if len(set(excluded)) != len(excluded) or not set(excluded) <= candidate_ids:
        raise ValueError("Excluded candidate IDs must be unique and present in the candidate screen")
    return {
        "name": str(inputs.get("name", "Illustrative baseline")),
        "demand": demand,
        "conversion_yield": conversion_yield,
        "horizon_years": horizon,
        "discount_rate": discount,
        "distance_multiplier": multiplier,
        "processing_opex": processing,
        "excluded_candidate_ids": sorted(excluded),
    }


def _unsolved(message: str, provenance: dict[str, Any], started: float, status: str) -> dict[str, Any]:
    return {
        "status": status,
        "feasible": False,
        "message": message,
        "objective_usd": None,
        "costs": None,
        "relative_gap": None,
        "solve_seconds": time.monotonic() - started,
        "facilities": [],
        "flows": [],
        "warnings": list(WARNINGS),
        "provenance": provenance,
    }


def solve(inputs: dict[str, Any], time_limit: float = 20, relative_gap: float = 0.02) -> dict[str, Any]:
    """Solve a validated scenario and independently check any returned incumbent.

    A nonzero MIP gap is reported as ``feasible``, including a HiGHS success
    termination within the requested relative tolerance (at most 2%). ``optimal`` is reserved for
    a closed gap. Exclusions disable both facility types at a source coordinate.
    """
    started = time.monotonic()
    time_limit = _number(time_limit, "Solver time limit")
    if not 0 < time_limit <= 120:
        raise ValueError("Solver time limit must be greater than zero and at most 120 seconds")
    relative_gap = _number(relative_gap, "Solver relative gap")
    if relative_gap > 0.02:
        raise ValueError("Solver relative gap must be at most 0.02")
    locations = load_locations()
    candidates = load_candidates()
    sources, airports = locations["sources"], locations["airports"]
    depots, refineries = candidates["depots"], candidates["refineries"]
    valid_ids = {candidate["id"] for candidate in depots + refineries}
    values = _validated_inputs(inputs, valid_ids)
    annuity = pvaf(values["horizon_years"], values["discount_rate"])
    input_hash = hashlib.sha256(
        json.dumps(values, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()
    provenance = {
        "solver_name": "SciPy MILP / HiGHS",
        "solver_version": scipy.__version__,
        "candidate_method": CANDIDATE_METHOD,
        "distance_method": DISTANCE_METHOD,
        "pvaf": annuity,
        "time_limit_seconds": time_limit,
        "relative_gap_target": relative_gap,
        "input_hash": input_hash,
        "dataset_sha256": dataset_hashes(),
        "candidate_counts": {"depots": len(depots), "refineries": len(refineries)},
        "flow_unit": "kt; refinery-to-airport is finished SAF, earlier stages are biomass",
        "currency": "USD",
        "processing_opex_basis": "Fixed annual USD per opened refinery, by size",
    }
    unavailable = set(values["excluded_candidate_ids"])
    required = sum(values["demand"].values()) / values["conversion_yield"]
    available_supply = sum(source["production_kilotons"] for source in sources)
    available_depots = 300 * sum(depot["id"] not in unavailable for depot in depots)
    available_refineries = 1087 * sum(refinery["id"] not in unavailable for refinery in refineries)
    if required > min(available_supply, available_depots, available_refineries) + 1e-7:
        return _unsolved(
            f"Demand requires {required:,.3f} kt biomass input, exceeding available supply "
            f"or enabled facility capacity ({min(available_supply, available_depots, available_refineries):,.3f} kt). "
            "Reduce SAF demand, increase the assumed yield, or re-enable candidate sites.",
            provenance,
            started,
            "infeasible",
        )

    n, m, k, a = len(sources), len(depots), len(refineries), len(airports)
    sections: dict[str, slice] = {}
    count = 0
    for name, block_size in (("FD", n * m), ("DR", m * k), ("RA", k * a), ("DB", m * 2), ("RB", k * 2)):
        sections[name] = slice(count, count + block_size)
        count += block_size
    objective = np.zeros(count)
    lower, upper = np.zeros(count), np.full(count, np.inf)
    integrality = np.zeros(count, dtype=int)
    depot_binary, refinery_binary = sections["DB"], sections["RB"]
    for binary in (depot_binary, refinery_binary):
        integrality[binary] = 1
        upper[binary] = 1
    objective[depot_binary] = np.tile(DEPOT_CAPEX, m) / 1e6
    annual_processing = np.tile([values["processing_opex"]["small"], values["processing_opex"]["large"]], k)
    objective[refinery_binary] = (np.tile(REFINERY_CAPEX, k) + annuity * annual_processing) / 1e6

    def coordinates(node: dict[str, Any]) -> tuple[float, float]:
        return node["latitude"], node["longitude"]

    def distance_matrix(left: list[dict[str, Any]], right: list[dict[str, Any]]) -> np.ndarray:
        return (
            np.array(
                [
                    [haversine(coordinates(origin), coordinates(destination)) for destination in right]
                    for origin in left
                ]
            )
            * values["distance_multiplier"]
        )

    distances = {
        "FD": distance_matrix(sources, depots),
        "DR": distance_matrix(depots, refineries),
        "RA": distance_matrix(refineries, airports),
    }
    stage_names = {"FD": "farm_depot", "DR": "depot_refinery", "RA": "refinery_airport"}
    for section, stage in stage_names.items():
        objective[sections[section]] = distances[section].ravel() * TARIFFS[stage] * 0.001 * annuity

    def farm(i: int, j: int) -> int:
        return sections["FD"].start + i * m + j

    def middle(j: int, h: int) -> int:
        return sections["DR"].start + j * k + h

    def output(h: int, q: int) -> int:
        return sections["RA"].start + h * a + q

    def depot(j: int, size: int) -> int:
        return sections["DB"].start + j * 2 + size

    def refinery(h: int, size: int) -> int:
        return sections["RB"].start + h * 2 + size

    rows: list[int] = []
    columns: list[int] = []
    coefficients: list[float] = []
    constraint_lower: list[float] = []
    constraint_upper: list[float] = []

    def add(items: Sequence[tuple[int, float]], low: float = -np.inf, high: float = np.inf) -> None:
        row = len(constraint_lower)
        constraint_lower.append(low)
        constraint_upper.append(high)
        for column, value in items:
            if value:
                rows.append(row)
                columns.append(column)
                coefficients.append(value)

    for i, source in enumerate(sources):
        add([(farm(i, j), 1) for j in range(m)], high=source["production_kilotons"])
    for j, site in enumerate(depots):
        add(
            [(farm(i, j), 1) for i in range(n)] + [(middle(j, h), -1) for h in range(k)],
            low=0,
            high=0,
        )
        add(
            [(farm(i, j), 1) for i in range(n)]
            + [(depot(j, size), -capacity) for size, capacity in enumerate(DEPOT_CAPACITY)],
            high=0,
        )
        add([(depot(j, size), 1) for size in range(2)], high=1)
        if site["id"] in unavailable:
            upper[depot(j, 0)] = upper[depot(j, 1)] = 0
    for h, site in enumerate(refineries):
        add(
            [(middle(j, h), 1) for j in range(m)]
            + [(output(h, q), -1 / values["conversion_yield"]) for q in range(a)],
            low=0,
            high=0,
        )
        add(
            [(middle(j, h), 1) for j in range(m)]
            + [(refinery(h, size), -capacity) for size, capacity in enumerate(REFINERY_CAPACITY)],
            high=0,
        )
        add([(refinery(h, size), 1) for size in range(2)], high=1)
        if site["id"] in unavailable:
            upper[refinery(h, 0)] = upper[refinery(h, 1)] = 0
    for q, airport in enumerate(airports):
        demand = values["demand"][airport["id"]]
        add([(output(h, q), 1) for h in range(k)], low=demand, high=demand)

    matrix = coo_matrix((coefficients, (rows, columns)), shape=(len(constraint_lower), count)).tocsr()
    lows, highs = np.array(constraint_lower), np.array(constraint_upper)
    result = milp(
        c=objective,
        integrality=integrality,
        bounds=Bounds(lower, upper),
        constraints=LinearConstraint(matrix, lows, highs),
        options={"time_limit": time_limit, "mip_rel_gap": relative_gap},
    )
    provenance["raw_solver_status"] = int(result.status)
    provenance["raw_solver_message"] = str(result.message)
    if result.x is None:
        return _unsolved(
            "No feasible solution exists for these assumptions."
            if result.status == 2
            else "The solver stopped without a feasible incumbent; retry with simpler assumptions or a longer time limit.",
            provenance,
            started,
            "infeasible" if result.status == 2 else "no_solution",
        )
    solution = np.asarray(result.x, dtype=float)
    activity = matrix @ solution
    tolerance = 1e-5
    valid = (
        np.all(np.isfinite(solution))
        and np.all(solution >= lower - tolerance)
        and np.all(solution <= upper + tolerance)
        and np.all(activity >= lows - tolerance)
        and np.all(activity <= highs + tolerance)
        and np.all(np.abs(solution[integrality == 1] - np.rint(solution[integrality == 1])) <= tolerance)
    )
    if not valid:
        return _unsolved(
            "The solver incumbent failed independent feasibility checks; no network is displayed.",
            provenance,
            started,
            "no_solution",
        )

    facilities: list[dict[str, Any]] = []
    for facility_type, sites, index, capacity, capital in (
        ("depot", depots, depot, DEPOT_CAPACITY, DEPOT_CAPEX),
        ("refinery", refineries, refinery, REFINERY_CAPACITY, REFINERY_CAPEX),
    ):
        for site_index, site in enumerate(sites):
            for size_index, size in enumerate(("small", "large")):
                if solution[index(site_index, size_index)] <= 0.5:
                    continue
                throughput = (
                    sum(solution[farm(i, site_index)] for i in range(n))
                    if facility_type == "depot"
                    else sum(solution[middle(j, site_index)] for j in range(m))
                )
                facilities.append(
                    {
                        "candidate_id": site["id"],
                        "facility_type": facility_type,
                        "size": size,
                        "latitude": site["latitude"],
                        "longitude": site["longitude"],
                        "capacity_input_kt": capacity[size_index],
                        "throughput_input_kt": float(throughput),
                        "utilization": float(throughput / capacity[size_index]),
                        "capex_usd": capital[size_index],
                    }
                )

    flows: list[dict[str, Any]] = []
    for section, left, right in (
        ("FD", sources, depots),
        ("DR", depots, refineries),
        ("RA", refineries, airports),
    ):
        quantities = solution[sections[section]].reshape(len(left), len(right))
        for i, origin in enumerate(left):
            for j, destination in enumerate(right):
                quantity = float(quantities[i, j])
                if quantity <= 1e-9:
                    continue
                stage = stage_names[section]
                distance = float(distances[section][i, j])
                flows.append(
                    {
                        "stage": stage,
                        "from_node_id": origin["id"],
                        "to_node_id": destination["id"],
                        "quantity_kt": quantity,
                        "material": "SAF" if section == "RA" else "biomass",
                        "distance_km": distance,
                        "tariff_usd_per_tonne_km": TARIFFS[stage],
                        "transport_usd": quantity * 1000 * distance * TARIFFS[stage],
                    }
                )
    depot_capital = sum(f["capex_usd"] for f in facilities if f["facility_type"] == "depot")
    refinery_capital = sum(f["capex_usd"] for f in facilities if f["facility_type"] == "refinery")
    stage_cost = {
        stage: sum(flow["transport_usd"] for flow in flows if flow["stage"] == stage) for stage in TARIFFS
    }
    transport = sum(stage_cost.values())
    processing_cost = sum(
        values["processing_opex"][facility["size"]]
        for facility in facilities
        if facility["facility_type"] == "refinery"
    )
    capital = depot_capital + refinery_capital
    discounted = annuity * (transport + processing_cost)
    total = capital + discounted
    if not math.isclose(total, float(result.fun) * 1e6, rel_tol=1e-8, abs_tol=0.01):
        return _unsolved(
            "Cost reconstruction failed; no unverified result is displayed.",
            provenance,
            started,
            "no_solution",
        )
    gap = getattr(result, "mip_gap", None)
    gap = float(gap) if gap is not None and math.isfinite(gap) else None
    closed = result.status == 0 and gap is not None and gap <= 1e-8
    warnings = list(WARNINGS)
    if not closed:
        warnings.append(
            "Feasible incumbent: the global optimality gap is not closed; inspect the reported gap."
        )
    return {
        "status": "optimal" if closed else "feasible",
        "feasible": True,
        "message": "Optimal over the screened candidate set."
        if closed
        else "Feasible network; optimality gap remains open.",
        "objective_usd": total,
        "costs": {
            "capex_usd": capital,
            "depot_capex_usd": depot_capital,
            "refinery_capex_usd": refinery_capital,
            "annual_transport_usd": transport,
            "annual_processing_usd": processing_cost,
            "discounted_recurring_usd": discounted,
            "total_usd": total,
            "farm_depot_usd": stage_cost["farm_depot"],
            "depot_refinery_usd": stage_cost["depot_refinery"],
            "refinery_airport_usd": stage_cost["refinery_airport"],
            "pvaf": annuity,
        },
        "relative_gap": gap,
        "solve_seconds": time.monotonic() - started,
        "facilities": facilities,
        "flows": flows,
        "warnings": warnings,
        "provenance": provenance,
    }
