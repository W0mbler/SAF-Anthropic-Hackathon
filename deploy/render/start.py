"""Run the same-origin Next.js + FastAPI application on a Render web service.

Secrets and database URLs are never printed. Each child owns a fresh process
group so shutdown can clean up only the processes started by this supervisor.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path


def database_url(value: str) -> str:
    """Select the installed psycopg v3 driver without exposing credentials."""
    try:
        parsed = urllib.parse.urlsplit(value)
        valid = (
            parsed.scheme in {"postgres", "postgresql", "postgresql+psycopg"}
            and parsed.hostname
            and parsed.path not in {"", "/"}
            and not parsed.fragment
        )
        # Accessing port also rejects malformed/out-of-range port values.
        _ = parsed.port
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("DATABASE_URL must be a PostgreSQL connection URL")
    return "postgresql+psycopg://" + value.split("://", 1)[1]


def origin(value: str, *, allow_local_http: bool = False) -> str:
    """Accept a concrete origin, never a wildcard, credentials, path or query."""
    try:
        parsed = urllib.parse.urlsplit(value)
        secure = parsed.scheme == "https"
        local = (
            allow_local_http
            and parsed.scheme == "http"
            and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
        )
        valid = (
            (secure or local)
            and parsed.hostname
            and "*" not in parsed.netloc
            and not parsed.username
            and not parsed.password
            and parsed.path in {"", "/"}
            and not parsed.query
            and not parsed.fragment
            and not any(character.isspace() for character in value)
        )
        _ = parsed.port
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("Public application URLs must be explicit HTTPS origins")
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))


@dataclass(frozen=True)
class Configuration:
    port: int
    environment: dict[str, str]
    api_directory: Path = Path("/app/services/api")
    web_directory: Path = Path("/app/web")


def configuration(values: Mapping[str, str]) -> Configuration:
    environment = dict(values)
    try:
        port = int(values.get("PORT", "10000"))
    except ValueError as exc:
        raise ValueError("PORT must be an integer") from exc
    if not 1024 <= port <= 65535 or port in {8000, 18012, 18013, 19099}:
        raise ValueError("PORT must be an unreserved port from 1024 to 65535, excluding 8000")
    environment["DATABASE_URL"] = database_url(values.get("DATABASE_URL", ""))
    if len(values.get("SESSION_SECRET", "")) < 32:
        raise ValueError("SESSION_SECRET must contain at least 32 characters")
    render_origin = values.get("RENDER_EXTERNAL_URL", "")
    if render_origin:
        render_origin = origin(render_origin)
    explicit = values.get("ALLOWED_ORIGINS", "")
    if explicit:
        allowed = [origin(item.strip(), allow_local_http=True) for item in explicit.split(",")]
    elif render_origin:
        allowed = [render_origin]
    else:
        raise ValueError("RENDER_EXTERNAL_URL or explicit ALLOWED_ORIGINS is required")
    environment.update(
        APP_ENV="production",
        NODE_ENV="production",
        HOSTNAME="0.0.0.0",
        PORT=str(port),
        ALLOWED_ORIGINS=",".join(dict.fromkeys(allowed)),
    )
    environment.setdefault("PGCONNECT_TIMEOUT", "10")
    return Configuration(port=port, environment=environment)


class ShutdownRequested(Exception):
    """Graceful stop was requested by the platform."""


class ChildFailed(Exception):
    """A required service or startup command exited."""

    def __init__(self, name: str, code: int):
        self.name = name
        self.code = code if code > 0 else 1
        super().__init__(f"{name} exited before the service was stopped")


class Supervisor:
    def __init__(self, stop: threading.Event | None = None):
        self.stop = stop or threading.Event()
        self.children: list[subprocess.Popen] = []

    def spawn(self, command: list[str], *, cwd: Path, env: dict[str, str]) -> subprocess.Popen:
        child = subprocess.Popen(command, cwd=cwd, env=env, start_new_session=True)
        self.children.append(child)
        return child

    def check(self, child: subprocess.Popen, name: str) -> None:
        if self.stop.is_set():
            raise ShutdownRequested()
        code = child.poll()
        if code is not None:
            raise ChildFailed(name, code)

    def completed(self, child: subprocess.Popen, name: str) -> None:
        while child.poll() is None:
            if self.stop.wait(0.1):
                raise ShutdownRequested()
        if child.returncode:
            raise ChildFailed(name, child.returncode)
        self.children.remove(child)

    def ready(self, child: subprocess.Popen, *, timeout: float = 60) -> None:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            self.check(child, "API")
            try:
                with opener.open("http://127.0.0.1:8000/health", timeout=1) as response:
                    if response.status == 200:
                        return
            except (OSError, urllib.error.URLError):
                if self.stop.wait(0.2):
                    raise ShutdownRequested()
        raise RuntimeError("API readiness check timed out")

    def monitor(self, services: list[tuple[str, subprocess.Popen]]) -> None:
        while not self.stop.wait(0.1):
            for name, child in services:
                self.check(child, name)
        raise ShutdownRequested()

    def close(self, *, grace_seconds: float = 15) -> None:
        # A group can still contain descendants after its direct child exits.
        for child in self.children:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                continue
        deadline = time.monotonic() + grace_seconds
        for child in self.children:
            try:
                child.wait(timeout=max(0, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                continue
        for child in self.children:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                continue
            child.wait()


def serve(config: Configuration, supervisor: Supervisor) -> None:
    migration = supervisor.spawn(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=config.api_directory,
        env=config.environment,
    )
    supervisor.completed(migration, "Database migration")
    api = supervisor.spawn(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=config.api_directory,
        env=config.environment,
    )
    supervisor.ready(api)
    web = supervisor.spawn(["node", "server.js"], cwd=config.web_directory, env=config.environment)
    supervisor.monitor([("API", api), ("Web", web)])


def main() -> int:
    supervisor = Supervisor()
    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, lambda _signum, _frame: supervisor.stop.set())
    try:
        config = configuration(os.environ)
        serve(config, supervisor)
    except ShutdownRequested:
        return 0
    except ChildFailed as exc:
        print(f"SAF Command startup failed: {exc.name} stopped (exit {exc.code})", file=sys.stderr)
        return exc.code
    except (ValueError, RuntimeError) as exc:
        print(f"SAF Command configuration/startup error: {exc}", file=sys.stderr)
        return 1
    except OSError:
        print("SAF Command could not start a required process", file=sys.stderr)
        return 1
    finally:
        supervisor.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
