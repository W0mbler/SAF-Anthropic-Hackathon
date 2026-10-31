"""Validate public deployment configuration and actual child-process lifecycle."""

import importlib.util
import os
import sys
import threading
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("render_start", Path(__file__).with_name("start.py"))
deployment = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = deployment
spec.loader.exec_module(deployment)


@pytest.fixture
def environment():
    return {
        "DATABASE_URL": "postgresql://demo:fake-testing-password@db.internal/saf",
        "SESSION_SECRET": "not-a-real-secret-for-testing-only-123456789",
        "RENDER_EXTERNAL_URL": "https://saf-command.onrender.com",
        "PORT": "10000",
    }


def test_render_environment_is_secure_and_same_origin(environment):
    config = deployment.configuration(environment)
    assert config.port == 10000
    assert config.environment["APP_ENV"] == "production"
    assert config.environment["NODE_ENV"] == "production"
    assert config.environment["HOSTNAME"] == "0.0.0.0"
    assert config.environment["ALLOWED_ORIGINS"] == "https://saf-command.onrender.com"
    assert config.environment["DATABASE_URL"].startswith("postgresql+psycopg://")
    assert environment["DATABASE_URL"].startswith("postgresql://")


@pytest.mark.parametrize("scheme", ["postgres", "postgresql", "postgresql+psycopg"])
def test_database_driver_normalisation_preserves_encoded_password_and_tls(scheme):
    suffix = "fake:p%40ss%2Fword@database.internal:5432/saf?sslmode=require"
    assert deployment.database_url(scheme + "://" + suffix) == "postgresql+psycopg://" + suffix


@pytest.mark.parametrize("url", ["", "sqlite:///db.sqlite", "https://db.example/test", "postgresql://db", "postgresql://db/test#fragment", "postgresql://db:bad/test"])
def test_invalid_database_urls_do_not_expose_credentials(url):
    with pytest.raises(ValueError, match="PostgreSQL connection URL"):
        deployment.database_url(url)


@pytest.mark.parametrize("value", ["0", "8000", "18012", "18013", "19099", "65536", "-1", "invalid", "80", "10000.5"])
def test_invalid_web_ports(environment, value):
    environment["PORT"] = value
    with pytest.raises(ValueError, match="PORT"):
        deployment.configuration(environment)


@pytest.mark.parametrize("value", ["http://app.onrender.com", "https://user:password@app.onrender.com", "https://app.onrender.com/path", "https://app.onrender.com?x=1", "https://app.onrender.com#anchor", "https://*.onrender.com", "https://app.onrender.com:invalid", "https://app.onrender.com trailing"])
def test_invalid_render_origins(environment, value):
    environment["RENDER_EXTERNAL_URL"] = value
    with pytest.raises(ValueError, match="HTTPS origins"):
        deployment.configuration(environment)


def test_explicit_custom_and_local_test_origins(environment):
    environment["ALLOWED_ORIGINS"] = "https://app.example.com,http://localhost:3001,http://127.0.0.1:3001"
    config = deployment.configuration(environment)
    assert config.environment["ALLOWED_ORIGINS"] == environment["ALLOWED_ORIGINS"]
    assert config.environment["APP_ENV"] == "production"


def test_public_http_origin_cannot_be_added_as_override(environment):
    environment["ALLOWED_ORIGINS"] = "http://public.example.com"
    with pytest.raises(ValueError, match="HTTPS origins"):
        deployment.configuration(environment)


def test_missing_origin_or_secret_stops_before_services_start(environment):
    environment.pop("RENDER_EXTERNAL_URL")
    with pytest.raises(ValueError, match="RENDER_EXTERNAL_URL"):
        deployment.configuration(environment)
    environment["ALLOWED_ORIGINS"] = "https://app.example.com"
    environment["SESSION_SECRET"] = "short"
    with pytest.raises(ValueError, match="SESSION_SECRET"):
        deployment.configuration(environment)


def test_failure_of_one_real_child_stops_and_reaps_the_peer(tmp_path):
    supervisor = deployment.Supervisor()
    peer = supervisor.spawn([sys.executable, "-c", "import time; time.sleep(60)"], cwd=tmp_path, env=dict(os.environ))
    failure = supervisor.spawn([sys.executable, "-c", "raise SystemExit(7)"], cwd=tmp_path, env=dict(os.environ))
    try:
        with pytest.raises(deployment.ChildFailed) as stopped:
            supervisor.monitor([("API", failure), ("Web", peer)])
        assert stopped.value.code == 7
        assert stopped.value.name == "API"
    finally:
        supervisor.close(grace_seconds=1)
    assert peer.poll() is not None and failure.poll() == 7
    with pytest.raises(ChildProcessError):
        os.waitpid(peer.pid, os.WNOHANG)


def test_shutdown_request_terminates_real_child_and_returns_control(tmp_path):
    supervisor = deployment.Supervisor()
    child = supervisor.spawn([sys.executable, "-c", "import time; time.sleep(60)"], cwd=tmp_path, env=dict(os.environ))
    timer = threading.Timer(0.05, supervisor.stop.set)
    timer.start()
    try:
        with pytest.raises(deployment.ShutdownRequested):
            supervisor.monitor([("API", child)])
    finally:
        timer.cancel()
        supervisor.close(grace_seconds=1)
    assert child.poll() is not None


def test_successful_migration_is_reaped_before_service_start(tmp_path):
    supervisor = deployment.Supervisor()
    child = supervisor.spawn([sys.executable, "-c", "raise SystemExit(0)"], cwd=tmp_path, env=dict(os.environ))
    supervisor.completed(child, "Database migration")
    assert child.returncode == 0
    assert child not in supervisor.children
    with pytest.raises(ChildProcessError):
        os.waitpid(child.pid, os.WNOHANG)
