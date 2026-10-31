"""Validated challenge data and the reproducible candidate screen.

Coordinates are latitude/longitude here. GeoJSON consumers must reverse them.
The screen identifies reference coordinates, not permitted construction sites.
"""

from __future__ import annotations

import csv
import hashlib
import math
import os
from collections import defaultdict
from pathlib import Path
from statistics import median
from typing import Any

AIRPORT_CODES = ("PNK", "PKN", "BPN", "TRK")
CANDIDATE_METHOD = "district-median-and-peak-v1"
SUPPLY_FILENAME = "kalimantan_80_locations_6800kt_full_range.csv"


def data_directory() -> Path:
    """Use the configured data mount, or the repository's original fixtures."""
    return Path(os.environ.get("SAF_DATA_DIR", Path(__file__).resolve().parents[3]))


def validate_coordinates(latitude: float, longitude: float) -> None:
    if not (
        math.isfinite(latitude)
        and math.isfinite(longitude)
        and -90 <= latitude <= 90
        and -180 <= longitude <= 180
    ):
        raise ValueError("Coordinates must be finite latitude [-90,90], longitude [-180,180]")


def load_locations() -> dict[str, list[dict[str, Any]]]:
    """Read and verify all 80 original sources and exactly four airports."""
    root = data_directory()
    sources: list[dict[str, Any]] = []
    with (root / SUPPLY_FILENAME).open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            source: dict[str, Any] = {
                "id": row["location_id"],
                "display_name": f"{row['district']} · {row['location_id']}",
                "province": row["province"],
                "district": row["district"],
                "production_kilotons": float(row["production_kilotons"]),
                "production_tonnes": float(row["production_tonnes"]),
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"]),
                "source_label": "User-supplied hackathon biomass dataset",
            }
            validate_coordinates(source["latitude"], source["longitude"])
            amount = source["production_kilotons"]
            if not math.isfinite(amount) or amount <= 0:
                raise ValueError("Biomass supply must be finite and positive")
            if not math.isclose(source["production_tonnes"], amount * 1000, abs_tol=0.01):
                raise ValueError("Biomass tonne and kilotonne columns disagree")
            if not all(source[key] for key in ("id", "province", "district")):
                raise ValueError("A source is missing its identifier or district")
            sources.append(source)
    if len(sources) != 80 or len({source["id"] for source in sources}) != 80:
        raise ValueError("The challenge dataset must contain 80 unique biomass locations")
    if not math.isclose(sum(s["production_kilotons"] for s in sources), 6800, abs_tol=1e-6):
        raise ValueError("The challenge dataset must total exactly 6,800 kt")

    selected: dict[str, dict[str, Any]] = {}
    with (root / "airports.dat").open(encoding="utf-8", newline="") as handle:
        for airport_row in csv.reader(handle):
            if len(airport_row) < 8 or airport_row[3] != "Indonesia" or airport_row[4] not in AIRPORT_CODES:
                continue
            code = airport_row[4]
            if code in selected:
                raise ValueError(f"Duplicate airport code in source dataset: {code}")
            airport: dict[str, Any] = {
                "id": code,
                "iata_code": code,
                "display_name": airport_row[1],
                "latitude": float(airport_row[6]),
                "longitude": float(airport_row[7]),
                "source_label": "User-supplied airports.dat; OpenFlights-like source",
            }
            validate_coordinates(airport["latitude"], airport["longitude"])
            selected[code] = airport
    if set(selected) != set(AIRPORT_CODES):
        raise ValueError("Airport dataset must contain PNK, PKN, BPN and TRK in Indonesia")
    return {"sources": sources, "airports": [selected[code] for code in AIRPORT_CODES]}


def load_candidates() -> dict[str, Any]:
    """Select district median-nearest and peak-supply source coordinates.

    Ties retain original CSV order. This matches the supplied reference dataset,
    whose candidate screen has 13 depot and eight refinery candidates.
    """
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for source in load_locations()["sources"]:
        groups[(source["province"], source["district"])].append(source)
    depots: list[dict[str, Any]] = []
    refineries: list[dict[str, Any]] = []
    depot_ids: set[str] = set()
    for group in sorted(groups):
        rows = groups[group]
        latitude = median(row["latitude"] for row in rows)
        longitude = median(row["longitude"] for row in rows)
        center = min(
            rows,
            key=lambda row: (row["latitude"] - latitude) ** 2 + (row["longitude"] - longitude) ** 2,
        )
        peak = max(rows, key=lambda row: row["production_kilotons"])
        for source in (center, peak):
            if source["id"] not in depot_ids:
                depots.append(dict(source))
                depot_ids.add(source["id"])
        refineries.append(dict(center))
    if len(depots) != 13 or len(refineries) != 8:
        raise ValueError("The verified candidate screen must produce 13 depots and 8 refineries")
    return {"depots": depots, "refineries": refineries, "method": CANDIDATE_METHOD}


def dataset_hashes() -> dict[str, str]:
    root = data_directory()
    return {
        filename: hashlib.sha256((root / filename).read_bytes()).hexdigest()
        for filename in (SUPPLY_FILENAME, "airports.dat")
    }
