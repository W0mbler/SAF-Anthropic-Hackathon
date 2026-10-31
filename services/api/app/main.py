"""SAF Command REST API: owned scenarios, real solves and inspectable results."""

import csv
import hashlib
import io
import json
import logging
import math
import os
import threading
import time
import uuid
from contextlib import asynccontextmanager
from datetime import timezone

from fastapi import Body, Depends, FastAPI, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from . import models
from .auth import (
    DUMMY_HASH,
    auth_payload,
    csrf_session,
    current_session,
    db_session,
    error,
    limiter,
    new_session,
    password_hasher,
    setup_security,
    verify_password,
)
from .data import load_candidates, load_locations
from .db import Base, build_engine, session_factory
from .explanations import explain
from .schemas import (
    AuthInput,
    CandidatesResponse,
    CompareInput,
    ExplainInput,
    LocationResponse,
    RunResponse,
    ScenarioInput,
    ScenarioResponse,
)
from .solver import solve

log = logging.getLogger("saf.api")
solve_lock = threading.BoundedSemaphore(1)


def scenario_json(row):
    return {
        **row.assumptions,
        "id": row.id,
        "name": row.name,
        "version": row.version,
        "created_at": row.created_at.replace(tzinfo=timezone.utc).isoformat(),
        "updated_at": row.updated_at.replace(tzinfo=timezone.utc).isoformat(),
    }


def run_json(row):
    return {
        **row.result,
        "id": row.id,
        "scenario_id": row.scenario_id,
        "input_snapshot": row.input_snapshot,
        "input_hash": row.input_hash,
        "created_at": row.created_at.replace(tzinfo=timezone.utc).isoformat(),
    }


def ownership(principal):
    return (
        models.Scenario.user_id == principal.user_id
        if principal.user_id
        else models.Scenario.guest_session_id == principal.id
    )


def owned_scenario(db, principal, scenario_id):
    row = db.scalar(select(models.Scenario).where(models.Scenario.id == scenario_id, ownership(principal)))
    if not row:
        error(404, "scenario_not_found", "Scenario not found")
    return row


def owned_run(db, principal, run_id):
    row = db.scalar(
        select(models.OptimizationRun)
        .join(models.Scenario)
        .where(models.OptimizationRun.id == run_id, ownership(principal))
    )
    if not row:
        error(404, "run_not_found", "Run not found")
    return row


def validate_candidates(inputs):
    candidates = load_candidates()
    allowed = {v["id"] for key in ("depots", "refineries") for v in candidates[key]}
    if set(inputs.excluded_candidate_ids) - allowed:
        error(422, "invalid_candidate", "One or more candidate IDs do not exist")


def seed_database(db):
    locations = load_locations()
    for kind, records in (("biomass", locations["sources"]), ("airport", locations["airports"])):
        for record in records:
            if not db.get(models.Location, record["id"]):
                db.add(
                    models.Location(
                        id=record["id"],
                        kind=kind,
                        display_name=record["display_name"],
                        latitude=record["latitude"],
                        longitude=record["longitude"],
                        attributes=record,
                    )
                )
    db.flush()
    candidates = load_candidates()
    depot_ids = {v["id"] for v in candidates["depots"]}
    refinery_ids = {v["id"] for v in candidates["refineries"]}
    for candidate_id in depot_ids | refinery_ids:
        if not db.get(models.CandidateSite, candidate_id):
            db.add(
                models.CandidateSite(
                    id=candidate_id,
                    allows_depot=candidate_id in depot_ids,
                    allows_refinery=candidate_id in refinery_ids,
                    screening_method_version=candidates["method"],
                )
            )
    db.commit()


def create_app(database_url: str | None = None):
    def solver_setting(name: str, default: str, minimum: float, maximum: float) -> float:
        message = f"{name} must be a finite number between {minimum} and {maximum}"
        try:
            value = float(os.environ.get(name, default))
        except ValueError as exc:
            raise RuntimeError(message) from exc
        if not math.isfinite(value) or not minimum <= value <= maximum:
            raise RuntimeError(message)
        return value

    solver_time_limit = solver_setting("SOLVER_TIME_LIMIT_SECONDS", "20", 1, 120)
    solver_relative_gap = solver_setting("SOLVER_RELATIVE_GAP", "0.02", 0, 0.02)
    engine = build_engine(database_url)

    @asynccontextmanager
    async def lifespan(app):
        # Alembic is used for deployments; create_all also makes the zero-config
        # SQLite development path and independent test databases usable.
        Base.metadata.create_all(engine)
        with app.state.sessions() as db:
            seed_database(db)
        yield
        engine.dispose()

    app = FastAPI(title="SAF Command", version="1.0.0", lifespan=lifespan)
    app.state.engine = engine
    app.state.sessions = session_factory(engine)
    app.state.allowed_origins = set(
        os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    )
    if "*" in app.state.allowed_origins:
        raise RuntimeError("ALLOWED_ORIGINS must list explicit origins when cookies are enabled")
    setup_security(app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(app.state.allowed_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
    )

    @app.middleware("http")
    async def request_logging(request: Request, call_next):
        request_id = str(uuid.uuid4())
        start = time.monotonic()
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        log.info(
            json.dumps(
                {
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": round((time.monotonic() - start) * 1000, 2),
                }
            )
        )
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(_, exc):
        problems = [
            {"location": list(e["loc"]), "message": e["msg"], "type": e["type"]} for e in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={
                "detail": {
                    "code": "validation_error",
                    "message": "Check the supplied values",
                    "errors": problems,
                }
            },
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_error(_, exc):
        log.error("Database request failed: %s", type(exc).__name__)
        return JSONResponse(
            status_code=503,
            content={
                "detail": {"code": "database_unavailable", "message": "Database unavailable; please retry"}
            },
        )

    @app.get("/health")
    def health(db=Depends(db_session)):
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "ok", "version": "1.0.0"}

    @app.get("/api/v1/locations", response_model=LocationResponse)
    def locations(province: str | None = Query(None, max_length=100), db=Depends(db_session)):
        rows = db.scalars(select(models.Location).order_by(models.Location.id)).all()
        return {
            "sources": [
                r.attributes
                for r in rows
                if r.kind == "biomass" and (not province or r.attributes.get("province") == province)
            ],
            "airports": [r.attributes for r in rows if r.kind == "airport"],
        }

    @app.get("/api/v1/candidates", response_model=CandidatesResponse)
    def candidates():
        return load_candidates()

    @app.get("/api/v1/auth/me")
    def me(principal=Depends(current_session), db=Depends(db_session)):
        return auth_payload(principal, db)

    def authenticate(request, response, credentials, principal, db, registration):
        limiter.check("auth", request.client.host if request.client else "unknown", 15)
        user = db.scalar(select(models.User).where(models.User.email == credentials.email))
        if registration:
            if user:
                error(409, "email_unavailable", "This email cannot be registered; try signing in")
            user = models.User(
                email=credentials.email,
                password_hash=password_hasher.hash(credentials.password),
                display_name=credentials.display_name.strip(),
            )
            db.add(user)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                error(409, "email_unavailable", "This email cannot be registered; try signing in")
        elif (
            not verify_password(user.password_hash if user else DUMMY_HASH, credentials.password) or not user
        ):
            error(401, "invalid_credentials", "Email or password is incorrect")
        if not principal.user_id:
            for scenario in db.scalars(
                select(models.Scenario).where(models.Scenario.guest_session_id == principal.id)
            ):
                scenario.user_id, scenario.guest_session_id = user.id, None
        db.delete(principal)
        db.commit()
        return auth_payload(new_session(request, response, db, user.id), db)

    @app.post("/api/v1/auth/register", status_code=201)
    def register(
        request: Request,
        response: Response,
        credentials: AuthInput,
        principal=Depends(csrf_session),
        db=Depends(db_session),
    ):
        return authenticate(request, response, credentials, principal, db, True)

    @app.post("/api/v1/auth/login")
    def login(
        request: Request,
        response: Response,
        credentials: AuthInput,
        principal=Depends(csrf_session),
        db=Depends(db_session),
    ):
        return authenticate(request, response, credentials, principal, db, False)

    @app.post("/api/v1/auth/logout")
    def logout(request: Request, response: Response, principal=Depends(csrf_session), db=Depends(db_session)):
        # Guest-owned scenarios remain attached to their expiring old session.
        # Deleting it would discard guest history or violate its foreign key.
        principal.expires_at = models.now()
        db.commit()
        return auth_payload(new_session(request, response, db), db)

    @app.get("/api/v1/scenarios", response_model=list[ScenarioResponse])
    def list_scenarios(principal=Depends(current_session), db=Depends(db_session)):
        return [
            scenario_json(s)
            for s in db.scalars(
                select(models.Scenario)
                .where(ownership(principal))
                .order_by(models.Scenario.created_at.desc())
            ).all()
        ]

    @app.post("/api/v1/scenarios", status_code=201, response_model=ScenarioResponse)
    def add_scenario(inputs: ScenarioInput, principal=Depends(csrf_session), db=Depends(db_session)):
        limiter.check("write", principal.id, 60)
        validate_candidates(inputs)
        row = models.Scenario(
            name=inputs.name,
            assumptions=inputs.model_dump(),
            user_id=principal.user_id,
            guest_session_id=None if principal.user_id else principal.id,
        )
        db.add(row)
        db.commit()
        return scenario_json(row)

    @app.get("/api/v1/scenarios/{scenario_id}", response_model=ScenarioResponse)
    def get_scenario(scenario_id: str, principal=Depends(current_session), db=Depends(db_session)):
        return scenario_json(owned_scenario(db, principal, scenario_id))

    @app.patch("/api/v1/scenarios/{scenario_id}", response_model=ScenarioResponse)
    def edit_scenario(
        scenario_id: str, patch: dict = Body(...), principal=Depends(csrf_session), db=Depends(db_session)
    ):
        from pydantic import ValidationError

        limiter.check("write", principal.id, 60)
        row = owned_scenario(db, principal, scenario_id)
        try:
            inputs = ScenarioInput.model_validate({**row.assumptions, **patch})
        except ValidationError as exc:
            error(422, "validation_error", "; ".join(e["msg"] for e in exc.errors()))
        validate_candidates(inputs)
        row.assumptions, row.name = inputs.model_dump(), inputs.name
        row.version += 1
        db.commit()
        return scenario_json(row)

    @app.post("/api/v1/scenarios/{scenario_id}/duplicate", status_code=201, response_model=ScenarioResponse)
    def duplicate_scenario(scenario_id: str, principal=Depends(csrf_session), db=Depends(db_session)):
        limiter.check("write", principal.id, 60)
        old = owned_scenario(db, principal, scenario_id)
        values = {**old.assumptions, "name": (old.name[:94] + " copy")}
        row = models.Scenario(
            name=values["name"],
            assumptions=values,
            user_id=principal.user_id,
            guest_session_id=None if principal.user_id else principal.id,
        )
        db.add(row)
        db.commit()
        return scenario_json(row)

    @app.delete("/api/v1/scenarios/{scenario_id}", status_code=204)
    def delete_scenario(scenario_id: str, principal=Depends(csrf_session), db=Depends(db_session)):
        limiter.check("write", principal.id, 60)
        row = owned_scenario(db, principal, scenario_id)
        if not solve_lock.acquire(blocking=False):
            error(
                409, "solver_busy", "Wait for the current optimisation to finish before deleting a scenario"
            )
        try:
            db.delete(row)
            db.commit()
        finally:
            solve_lock.release()
        return Response(status_code=204)

    @app.post("/api/v1/scenarios/{scenario_id}/solve", response_model=RunResponse)
    def solve_scenario(scenario_id: str, principal=Depends(csrf_session), db=Depends(db_session)):
        scenario = owned_scenario(db, principal, scenario_id)
        limiter.check("solve", principal.id, 12)
        if not solve_lock.acquire(blocking=False):
            error(429, "solver_busy", "Another optimisation is running; please retry shortly")
        snapshot = json.loads(json.dumps(scenario.assumptions))
        input_hash = hashlib.sha256(
            json.dumps(snapshot, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        try:
            result = solve(snapshot, time_limit=solver_time_limit, relative_gap=solver_relative_gap)
        except (ValueError, ArithmeticError) as exc:
            log.error("Solver rejected valid request: %s", type(exc).__name__)
            error(422, "solver_input_error", "The solver could not process these assumptions")
        except Exception as exc:
            log.error("Solver execution failed: %s", type(exc).__name__)
            error(500, "solver_failure", "The optimisation could not complete; please retry")
        finally:
            solve_lock.release()
        row = models.OptimizationRun(
            scenario_id=scenario.id, input_snapshot=snapshot, input_hash=input_hash, result=result
        )
        db.add(row)
        db.flush()
        for facility in result["facilities"]:
            values = {
                k: facility[k]
                for k in (
                    "facility_type",
                    "size",
                    "latitude",
                    "longitude",
                    "capacity_input_kt",
                    "throughput_input_kt",
                    "capex_usd",
                )
            }
            db.add(
                models.RunFacility(
                    optimization_run_id=row.id, candidate_site_id=facility["candidate_id"], **values
                )
            )
        for flow in result["flows"]:
            values = {
                k: flow[k]
                for k in (
                    "stage",
                    "from_node_id",
                    "to_node_id",
                    "quantity_kt",
                    "material",
                    "distance_km",
                    "tariff_usd_per_tonne_km",
                    "transport_usd",
                )
            }
            db.add(models.RunFlow(optimization_run_id=row.id, **values))
        db.commit()
        log.info(
            json.dumps(
                {
                    "event": "solve",
                    "run_id": row.id,
                    "status": result["status"],
                    "seconds": result["solve_seconds"],
                }
            )
        )
        return run_json(row)

    @app.get("/api/v1/runs", response_model=list[RunResponse])
    def list_runs(principal=Depends(current_session), db=Depends(db_session)):
        rows = db.scalars(
            select(models.OptimizationRun)
            .join(models.Scenario)
            .where(ownership(principal))
            .order_by(models.OptimizationRun.created_at.desc())
        ).all()
        return [run_json(r) for r in rows]

    @app.get("/api/v1/runs/{run_id}", response_model=RunResponse)
    def get_run(run_id: str, principal=Depends(current_session), db=Depends(db_session)):
        return run_json(owned_run(db, principal, run_id))

    @app.post("/api/v1/compare")
    def compare(inputs: CompareInput, principal=Depends(csrf_session), db=Depends(db_session)):
        left = run_json(owned_run(db, principal, inputs.left_run_id))
        right = run_json(owned_run(db, principal, inputs.right_run_id))
        warnings = []
        if left["input_snapshot"]["horizon_years"] != right["input_snapshot"]["horizon_years"]:
            warnings.append("Planning horizons differ; objective costs cover different periods.")
        if not left["feasible"] or not right["feasible"]:
            warnings.append("At least one run has no feasible network; cost differences are unavailable.")

        def difference(key):
            a, b = (left["costs"] or {}).get(key), (right["costs"] or {}).get(key)
            return b - a if a is not None and b is not None else None

        def key(f):
            return (f["candidate_id"], f["facility_type"], f["size"])

        left_sites, right_sites = {key(f) for f in left["facilities"]}, {key(f) for f in right["facilities"]}
        return {
            "left": left,
            "right": right,
            "delta": {
                "objective_usd": difference("total_usd"),
                "capex_usd": difference("capex_usd"),
                "annual_transport_usd": difference("annual_transport_usd"),
                "facility_count": len(right["facilities"]) - len(left["facilities"]),
                "demand_saf_kt": sum(right["input_snapshot"]["demand"].values())
                - sum(left["input_snapshot"]["demand"].values()),
            },
            "added_facilities": [f for f in right["facilities"] if key(f) not in left_sites],
            "removed_facilities": [f for f in left["facilities"] if key(f) not in right_sites],
            "warnings": warnings,
        }

    @app.post("/api/v1/runs/{run_id}/explain")
    def explain_run(
        run_id: str,
        inputs: ExplainInput = Body(default_factory=ExplainInput),
        principal=Depends(csrf_session),
        db=Depends(db_session),
    ):
        limiter.check("explain", principal.id, 20)
        return explain(run_json(owned_run(db, principal, run_id)), inputs.use_ai)

    @app.get("/api/v1/runs/{run_id}/export")
    def export(
        run_id: str,
        format: str = Query("json", pattern="^(json|csv)$"),
        principal=Depends(current_session),
        db=Depends(db_session),
    ):
        run = run_json(owned_run(db, principal, run_id))
        headers = {"Content-Disposition": f'attachment; filename="saf-command-{run_id}.{format}"'}
        if format == "json":
            return Response(
                json.dumps(run, indent=2, allow_nan=False), media_type="application/json", headers=headers
            )
        rows = [{"record_type": "facility", **r} for r in run["facilities"]] + [
            {"record_type": "flow", **r} for r in run["flows"]
        ]
        rows += [
            {
                "record_type": "assumptions",
                "scenario_inputs": json.dumps(run["input_snapshot"], sort_keys=True),
                "warnings": "; ".join(run["warnings"]),
            }
        ]
        fields = list(dict.fromkeys(k for row in rows for k in row))
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    k: "'" + v if isinstance(v, str) and v[:1] in ("=", "+", "-", "@") else v
                    for k, v in row.items()
                }
            )
        return Response(buffer.getvalue(), media_type="text/csv", headers=headers)

    return app


app = create_app()
