"""Strict scenario and auth input contracts; values are physical kt and USD."""

import math
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

AIRPORT_CODES = {"PNK", "PKN", "BPN", "TRK"}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class ProcessingOpex(StrictModel):
    small: float = Field(default=0, ge=0, le=1e10)
    large: float = Field(default=0, ge=0, le=1e10)


class ScenarioInput(StrictModel):
    name: str = Field(default="Illustrative baseline", min_length=1, max_length=100)
    demand: dict[str, float] = Field(
        default_factory=lambda: {"PNK": 60.0, "PKN": 30.0, "BPN": 90.0, "TRK": 30.0}
    )
    conversion_yield: float = Field(default=0.2, gt=0, le=1)
    horizon_years: int = Field(default=1, ge=1, le=100, strict=True)
    discount_rate: float = Field(default=0, ge=0, le=1)
    distance_multiplier: float = Field(default=1, gt=0, le=20)
    processing_opex: ProcessingOpex = Field(default_factory=ProcessingOpex)
    excluded_candidate_ids: list[str] = Field(default_factory=list, max_length=80)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Scenario name cannot be blank")
        return value

    @field_validator("demand")
    @classmethod
    def validate_demand(cls, value):
        if set(value) != AIRPORT_CODES:
            raise ValueError("Demand must contain exactly PNK, PKN, BPN and TRK")
        if any(not math.isfinite(v) or v <= 0 or v > 100000 for v in value.values()):
            raise ValueError("Each airport demand must be finite and positive, at most 100000 kt SAF")
        return value

    @field_validator("excluded_candidate_ids")
    @classmethod
    def unique_candidates(cls, value):
        if len(value) != len(set(value)):
            raise ValueError("Candidate exclusions must be unique")
        return value


class AuthInput(StrictModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=10, max_length=256)
    display_name: str = Field(default="", max_length=100)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid email address")
        return value


class CompareInput(StrictModel):
    left_run_id: str = Field(min_length=1, max_length=36)
    right_run_id: str = Field(min_length=1, max_length=36)


class ExplainInput(StrictModel):
    use_ai: bool = False


class LocationResponse(BaseModel):
    sources: list[dict]
    airports: list[dict]


class CandidatesResponse(BaseModel):
    depots: list[dict]
    refineries: list[dict]
    method: str


class ScenarioResponse(ScenarioInput):
    id: str
    version: int
    created_at: str
    updated_at: str


class RunResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    scenario_id: str
    input_snapshot: dict
    input_hash: str
    created_at: str
    status: Literal["optimal", "feasible", "infeasible", "no_solution"]
    feasible: bool
    message: str
    objective_usd: float | None
    costs: dict | None
    relative_gap: float | None
    solve_seconds: float
    facilities: list[dict]
    flows: list[dict]
    warnings: list[str]
    provenance: dict
