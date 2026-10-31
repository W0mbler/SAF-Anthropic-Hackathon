#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
mkdir -p .run
if [ -z "${SAF_API_PYTHON:-}" ]; then
  if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi
  SAF_API_PYTHON="$repo_root/.venv/bin/python"
fi
if ! "$SAF_API_PYTHON" -c 'import fastapi, sqlalchemy, scipy, psycopg, argon2' >/dev/null 2>&1; then
  "$SAF_API_PYTHON" -m pip install -r services/api/requirements.lock.txt
fi
if [ ! -d apps/web/node_modules ]; then npm --prefix apps/web ci; fi
"$SAF_API_PYTHON" - <<'PY'
import socket
for port in (3000, 8000):
    with socket.socket() as probe:
        try:
            probe.bind(('127.0.0.1', port))
        except OSError:
            raise SystemExit(f'Port {port} is already in use. Stop that service before running dev.sh.')
PY
if [ -z "${SESSION_SECRET:-}" ]; then
  if [ ! -f .run/session-secret ]; then
    (umask 077; "$SAF_API_PYTHON" -c 'import secrets; print(secrets.token_urlsafe(48))' > .run/session-secret)
  fi
  SESSION_SECRET="$(cat .run/session-secret)"
  export SESSION_SECRET
fi
export APP_ENV="${APP_ENV:-development}"
export DATABASE_URL="${DATABASE_URL:-sqlite:///$repo_root/.run/safcommand.db}"
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-2}" OPENBLAS_NUM_THREADS="${OPENBLAS_NUM_THREADS:-2}"
api_pid= web_pid=
cleanup() {
  trap - EXIT INT TERM
  if [ -n "$web_pid" ]; then kill "$web_pid" 2>/dev/null || true; fi
  if [ -n "$api_pid" ]; then kill "$api_pid" 2>/dev/null || true; fi
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM
(
  cd services/api
  "$SAF_API_PYTHON" -m alembic upgrade head
  exec "$SAF_API_PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
) &
api_pid=$!
(
  cd apps/web
  export API_INTERNAL_URL=http://127.0.0.1:8000
  exec node node_modules/next/dist/bin/next dev --hostname 127.0.0.1
) &
web_pid=$!
printf '%s\n' 'SAF Command: web port 3000; API port 8000. Press Ctrl-C to stop both services.'
wait -n "$api_pid" "$web_pid"
