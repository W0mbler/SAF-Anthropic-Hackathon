import csv
import io
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.main import create_app
from app.models import Location, RunFacility, RunFlow


@pytest.fixture
def api(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'test.db'}")
    with TestClient(app) as client:
        yield client


def session(client):
    reply = client.get("/api/v1/auth/me")
    assert reply.status_code == 200
    return {"x-csrf-token": reply.json()["csrf_token"]}


def new_scenario(client, headers, **values):
    reply = client.post("/api/v1/scenarios", json={"name": "Test", **values}, headers=headers)
    assert reply.status_code == 201, reply.text
    return reply.json()


def test_seed_health_and_idempotence(api):
    assert api.get("/health").json()["database"] == "ok"
    data = api.get("/api/v1/locations").json()
    assert len(data["sources"]) == 80
    assert sum(v["production_kilotons"] for v in data["sources"]) == pytest.approx(6800)
    assert {v["id"] for v in data["airports"]} == {"PNK", "PKN", "BPN", "TRK"}
    assert len(api.get("/api/v1/candidates").json()["depots"]) == 13
    from app.main import seed_database

    with api.app.state.sessions() as db:
        seed_database(db)
        assert db.scalar(select(func.count()).select_from(Location)) == 84


def test_guest_crud_csrf_and_isolation(api):
    headers = session(api)
    assert api.post("/api/v1/scenarios", json={"name": "Missing CSRF"}).status_code == 403
    assert (
        api.post(
            "/api/v1/scenarios",
            json={"name": "Wrong origin"},
            headers={**headers, "origin": "https://evil.example"},
        ).status_code
        == 403
    )
    row = new_scenario(api, headers)
    changed = api.patch(f"/api/v1/scenarios/{row['id']}", json={"name": "Changed"}, headers=headers)
    assert changed.json()["version"] == 2
    copy = api.post(f"/api/v1/scenarios/{row['id']}/duplicate", headers=headers)
    assert copy.status_code == 201 and copy.json()["id"] != row["id"]
    with TestClient(api.app) as other:
        session(other)
        assert other.get(f"/api/v1/scenarios/{row['id']}").status_code == 404
        assert other.get("/api/v1/scenarios").json() == []
        assert other.delete(f"/api/v1/scenarios/{row['id']}", headers=session(other)).status_code == 404
    assert api.delete(f"/api/v1/scenarios/{row['id']}", headers=headers).status_code == 204


@pytest.mark.parametrize(
    "values",
    [
        {"demand": {"PNK": -1, "PKN": 30, "BPN": 90, "TRK": 30}},
        {"demand": {"PNK": 0, "PKN": 30, "BPN": 90, "TRK": 30}},
        {"demand": {"XXX": 1}},
        {"conversion_yield": 0},
        {"conversion_yield": 1.1},
        {"horizon_years": 0},
        {"horizon_years": 1.5},
        {"discount_rate": -1},
        {"excluded_candidate_ids": ["fake"]},
        {"excluded_candidate_ids": ["a", "a"]},
        {"name": " "},
        {"distance_multiplier": -1},
        {"surprise": True},
    ],
)
def test_input_validation(api, values):
    reply = api.post("/api/v1/scenarios", json={"name": "Bad", **values}, headers=session(api))
    assert reply.status_code == 422, reply.text


def test_nan_and_password_errors_do_not_echo_inputs(api):
    headers = session(api)
    reply = api.post(
        "/api/v1/scenarios",
        content='{"name":"NaN", "conversion_yield":NaN}',
        headers={**headers, "content-type": "application/json"},
    )
    assert reply.status_code == 422
    secret = "x"
    reply = api.post("/api/v1/auth/register", json={"email": "invalid", "password": secret}, headers=headers)
    assert reply.status_code == 422
    assert '"input"' not in reply.text and '"password_hash"' not in reply.text


def test_real_solve_snapshot_exports_and_normalized_storage(api):
    headers = session(api)
    scenario = new_scenario(api, headers)
    reply = api.post(f"/api/v1/scenarios/{scenario['id']}/solve", headers=headers)
    assert reply.status_code == 200, reply.text
    run = reply.json()
    assert run["feasible"] and run["objective_usd"] > 0
    assert {f["stage"] for f in run["flows"]} == {"farm_depot", "depot_refinery", "refinery_airport"}
    assert sum(f["quantity_kt"] for f in run["flows"] if f["stage"] == "refinery_airport") == pytest.approx(
        210
    )
    before = deepcopy(run)
    api.patch(f"/api/v1/scenarios/{scenario['id']}", json={"conversion_yield": 0.3}, headers=headers)
    assert api.get(f"/api/v1/runs/{run['id']}").json() == before
    exported = api.get(f"/api/v1/runs/{run['id']}/export?format=json")
    assert exported.json() == run and "attachment" in exported.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(api.get(f"/api/v1/runs/{run['id']}/export?format=csv").text)))
    assert sum(r["record_type"] == "flow" for r in rows) == len(run["flows"])
    assert sum(r["record_type"] == "facility" for r in rows) == len(run["facilities"])
    explanation = api.post(
        f"/api/v1/runs/{run['id']}/explain", json={"use_ai": False}, headers=headers
    ).json()
    assert explanation["source"] == "deterministic" and explanation["facts"]["demand_saf_kt"] == 210
    changed = api.post(f"/api/v1/scenarios/{scenario['id']}/solve", headers=headers).json()
    assert changed["feasible"] and changed["input_hash"] != run["input_hash"]
    assert changed["input_snapshot"]["conversion_yield"] == 0.3
    comparison = api.post(
        "/api/v1/compare", json={"left_run_id": run["id"], "right_run_id": changed["id"]}, headers=headers
    ).json()
    assert comparison["delta"]["objective_usd"] == pytest.approx(
        changed["objective_usd"] - run["objective_usd"]
    )
    with api.app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(RunFacility)) == len(run["facilities"]) + len(
            changed["facilities"]
        )
        assert db.scalar(select(func.count()).select_from(RunFlow)) == len(run["flows"]) + len(
            changed["flows"]
        )
    with TestClient(api.app) as other:
        other_headers = session(other)
        for suffix in ("", "/export?format=json", "/export?format=csv"):
            assert other.get(f"/api/v1/runs/{run['id']}{suffix}").status_code == 404
        assert other.post(f"/api/v1/runs/{run['id']}/explain", headers=other_headers).status_code == 404
        assert (
            other.post(
                "/api/v1/compare",
                json={"left_run_id": run["id"], "right_run_id": run["id"]},
                headers=other_headers,
            ).status_code
            == 404
        )


def test_accounts_isolate_and_rotate_sessions(api):
    headers = session(api)
    guest = new_scenario(api, headers)
    old_cookie = api.cookies.get("saf_session")
    credentials = {"email": "planner@example.com", "password": "LongAndUnique123", "display_name": "Planner"}
    registered = api.post("/api/v1/auth/register", json=credentials, headers=headers)
    assert registered.status_code == 201, registered.text
    assert registered.json()["user"]["email"] == credentials["email"]
    assert "password" not in registered.text and "token_hash" not in registered.text
    assert old_cookie != api.cookies.get("saf_session")
    assert api.get(f"/api/v1/scenarios/{guest['id']}").status_code == 200
    headers = {"x-csrf-token": registered.json()["csrf_token"]}
    out = api.post("/api/v1/auth/logout", headers=headers)
    assert out.json()["user"] is None
    assert api.get(f"/api/v1/scenarios/{guest['id']}").status_code == 404
    bad = api.post(
        "/api/v1/auth/login", json={**credentials, "password": "WrongPassword123"}, headers=session(api)
    )
    assert bad.status_code == 401
    logged_in = api.post("/api/v1/auth/login", json=credentials, headers=session(api))
    assert logged_in.status_code == 200
    assert api.get(f"/api/v1/scenarios/{guest['id']}").status_code == 200
    with TestClient(api.app) as other:
        other_headers = session(other)
        registered = other.post(
            "/api/v1/auth/register", json={**credentials, "email": "other@example.com"}, headers=other_headers
        )
        assert registered.status_code == 201
        assert other.get(f"/api/v1/scenarios/{guest['id']}").status_code == 404


def test_production_rejects_weak_secret(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SESSION_SECRET", "weak")
    with pytest.raises(RuntimeError, match="SESSION_SECRET"):
        create_app(f"sqlite:///{tmp_path / 'prod.db'}")


def test_guest_session_survives_restart(monkeypatch, tmp_path):
    monkeypatch.delenv("SESSION_SECRET", raising=False)
    monkeypatch.setenv("SESSION_SECRET_FILE", str(tmp_path / "session-secret"))
    url = f"sqlite:///{tmp_path / 'persist.db'}"
    with TestClient(create_app(url)) as first:
        headers = session(first)
        scenario = new_scenario(first, headers)
        cookie = first.cookies.get("saf_session")
        response = first.get("/api/v1/auth/me")
        assert response.json()["user"] is None
    with TestClient(create_app(url)) as restarted:
        restarted.cookies.set("saf_session", cookie)
        assert restarted.get(f"/api/v1/scenarios/{scenario['id']}").status_code == 200
    assert (tmp_path / "session-secret").stat().st_mode & 0o777 == 0o600


def test_production_cookie_flags(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SESSION_SECRET", "production-test-signing-key-of-at-least-32-chars")
    with TestClient(
        create_app(f"sqlite:///{tmp_path / 'secure.db'}"), base_url="https://testserver"
    ) as client:
        response = client.get("/api/v1/auth/me")
        cookie = response.headers["set-cookie"]
        assert "Secure" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie


def test_solver_busy_and_infeasible_truthful(api, monkeypatch):
    import app.main as main

    headers = session(api)
    row = new_scenario(api, headers, demand={"PNK": 99999, "PKN": 99999, "BPN": 99999, "TRK": 99999})
    main.solve_lock.acquire()
    try:
        assert api.post(f"/api/v1/scenarios/{row['id']}/solve", headers=headers).status_code == 429
    finally:
        main.solve_lock.release()
    result = api.post(f"/api/v1/scenarios/{row['id']}/solve", headers=headers).json()
    assert not result["feasible"] and result["objective_usd"] is None and result["facilities"] == []


@pytest.mark.parametrize(
    "name,value",
    [
        ("SOLVER_TIME_LIMIT_SECONDS", "not-a-number"),
        ("SOLVER_TIME_LIMIT_SECONDS", "nan"),
        ("SOLVER_TIME_LIMIT_SECONDS", "0"),
        ("SOLVER_TIME_LIMIT_SECONDS", "121"),
        ("SOLVER_RELATIVE_GAP", "not-a-number"),
        ("SOLVER_RELATIVE_GAP", "inf"),
        ("SOLVER_RELATIVE_GAP", "-0.001"),
        ("SOLVER_RELATIVE_GAP", "0.021"),
    ],
)
def test_invalid_solver_environment_rejected_at_startup(monkeypatch, tmp_path, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises(RuntimeError, match=name):
        create_app(f"sqlite:///{tmp_path / 'invalid-env.db'}")


def test_validated_solver_environment_forwarded(monkeypatch, tmp_path):
    import app.main as main

    monkeypatch.setenv("SOLVER_TIME_LIMIT_SECONDS", "7")
    monkeypatch.setenv("SOLVER_RELATIVE_GAP", "0.01")
    original = main.solve
    received = {}

    def capture_solve(inputs, *, time_limit, relative_gap):
        received.update(time_limit=time_limit, relative_gap=relative_gap)
        return original(inputs, time_limit=time_limit, relative_gap=relative_gap)

    monkeypatch.setattr(main, "solve", capture_solve)
    configured = create_app(f"sqlite:///{tmp_path / 'configured.db'}")
    # Settings are captured once at construction, not re-read per request.
    monkeypatch.setenv("SOLVER_RELATIVE_GAP", "invalid-after-construction")
    with TestClient(configured) as client:
        headers = session(client)
        row = new_scenario(client, headers)
        result = client.post(f"/api/v1/scenarios/{row['id']}/solve", headers=headers)
        assert result.status_code == 200, result.text
        assert result.json()["feasible"]
    assert received == {"time_limit": 7, "relative_gap": 0.01}


def test_unexpected_solver_failure_is_sanitized_and_releases_lock(api, monkeypatch):
    import app.main as main

    def broken_solver(*args, **kwargs):
        raise RuntimeError("Internal solver path /private/internal.dat and sensitive diagnostics")

    monkeypatch.setattr(main, "solve", broken_solver)
    headers = session(api)
    row = new_scenario(api, headers)
    result = api.post(f"/api/v1/scenarios/{row['id']}/solve", headers=headers)
    assert result.status_code == 500
    assert result.json()["detail"]["code"] == "solver_failure"
    assert "private" not in result.text and "RuntimeError" not in result.text
    assert api.get("/api/v1/runs").json() == []
    assert main.solve_lock.acquire(blocking=False)
    main.solve_lock.release()
