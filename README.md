# SAF COMMAND

**From biomass to boarding gates. Every decision optimised.**

A decision cockpit for sustainable aviation fuel infrastructure across Kalimantan. It jointly selects preprocessing depots and refineries, their sizes, and material flows to Supadio (PNK), Iskandar (PKN), Sultan Aji Muhamad Sulaiman (BPN), and Juwata (TRK). It is designed for planners, fuel developers, and investment teams comparing explicit assumptions.

This repository contains the application source, not only the original specification ZIP. Results come from a real SciPy/HiGHS mixed-integer linear program. There are no hardcoded facility solutions. The original ZIP and datasets are retained as supplied.

## Run the application

Requirements: Docker Engine and Docker Compose v2, with approximately 4 GB free RAM and Internet access for the first image/dependency build.

```bash
cp .env.example .env && docker compose up --build
```

Compose starts PostgreSQL 16, applies the Alembic schema migration, seeds the 80 supply locations and four airports idempotently, starts FastAPI, and starts the Next.js production server. The local UI is served on port **3000**, the API on **8000**, and interactive API documentation at **`/docs`** on the API port. The database is internal to the Compose network; published application ports bind to loopback by default.

No account, AI key, or map-service key is required. The application issues an isolated guest session and allows you to save scenarios, solve, compare, explain, and export. Optional registered accounts retain their own scenarios. PostgreSQL data is retained in the `postgres_data` named volume, and the generated local-development session secret is retained in `api_local`. Production requires an explicit strong session secret.

```bash
docker compose down       # Stop services; keep the database
docker compose logs api  # Inspect startup or solver failures
python3 scripts/smoke_test.py
npm ci --prefix e2e
cd e2e && npx playwright install chromium && npm test
```

Do not use `docker compose down -v` unless you intend to delete the local database.

### Manual development

Requirements: Python 3.12 and Node.js 22 or later. SQLite is supported for convenient local development and tests; Compose uses PostgreSQL.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r services/api/requirements.lock.txt
npm --prefix apps/web ci
bash scripts/dev.sh
```

The script applies migrations and starts both services, using `.run/safcommand.db` and an ignored, locally generated session secret. It checks that ports 3000 and 8000 are available, refuses to replace other services, and stops its own processes on Ctrl-C. To reuse another Python environment, set `SAF_API_PYTHON` to its absolute Python path. To use PostgreSQL manually, set `DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/DB` before starting. Never commit a real connection string.

### Managed-cloud Docker builds

The Dockerfiles support an optional BuildKit CA secret for session proxies. Keep HTTPS verification enabled. With the managed environment's combined CA bundle, build using:

```bash
SAF_BUILD_CA=/etc/ssl/certs/ca-certificates.crt \
  docker compose -f compose.yaml -f compose.cloud.yaml build
docker compose up --wait
```

The build mounts the public CA only during dependency installation; it is not copied into images. If using optional AI in a managed cloud environment, start with the same two Compose files and `SAF_BUILD_CA` setting so the API also receives a read-only runtime CA mount. Use the platform-provided reachable proxy and Docker configuration. The default deterministic explanation needs no external network access.

## What you can do

- **Command Centre / Scenario Studio:** edit demand at all four airports; adjust conversion yield, horizon, discount rate, distance multiplier, and fixed annual refinery OpEx; exclude candidate sites; save, duplicate, solve, and revisit scenarios.
- **Supply Atlas:** inspect the 80 real supply records and four airports, filter by province, toggle overlays, and inspect selected facilities and all three flow stages. The map remains useful without external tiles or a paid key.
- **Network results:** see actual selected locations, small/large sizes, input capacity, utilisation, cost components, airport deliveries, solve duration, status, and relative MIP gap.
- **Compare:** compare two persisted runs, cost and demand deltas, and added/removed facility choices. Runs retain immutable input snapshots even when their parent scenario changes.
- **Explain:** obtain a deterministic narrative grounded in the saved run. An explicitly opted-in optional provider integration can improve presentation without deciding facilities or changing quantities.
- **Export:** download the saved result and assumptions as JSON or facilities/flows as CSV.
- **Accounts:** register, log in, and log out with cookie sessions. Guest and account resources are owner-scoped on the server.

## Architecture and source layout

```mermaid
flowchart LR
    Browser[Next.js + TypeScript] --> API[FastAPI]
    API --> DB[(PostgreSQL 16)]
    API --> Solver[SciPy MILP / HiGHS]
    API --> Explain[Deterministic explanation]
    Explain -. explicit opt-in .-> AI[Optional OpenAI API]
```

The browser uses the Next.js same-origin API proxy. `API_INTERNAL_URL` is the server-side backend destination, compiled into Next.js rewrites at build time. Compose sets it to `http://api:8000`; manual development uses `http://127.0.0.1:8000`. Rebuild the web image if that destination changes.

```text
apps/web/             Next.js pages, interactive map, scenario/results UI, unit tests
services/api/app/     Typed API, sessions, SQLAlchemy models, data loader and MILP
services/api/migrations/ Database migration versions
services/api/tests/   Independent solver and API/auth/persistence checks
scripts/dev.sh       Local two-service development runner
scripts/smoke_test.py Live API baseline/higher-demand integration check
compose.yaml          PostgreSQL, API and web deployment
data/DATA_PROVENANCE.md
docs/DEMO_SCRIPT.md
.github/workflows/ci.yml
```

## Model, units, and assumptions

Supply is exactly **80 locations / 6,800 kt available biomass**. Available supply does not have to be fully consumed. Candidate screening selects the median-nearest point and maximum-production point per `(province, district)` for depots and the median-nearest point for refineries, yielding **13 depot / 8 refinery candidates**. These are observed biomass coordinates, not sites with verified construction permissions.

| Input | Default | Interpretation |
| --- | --- | --- |
| Finished SAF demand, PNK / PKN / BPN / TRK | 60 / 30 / 90 / 30 kt | Illustrative annual demand, not measured airport demand |
| Biomass-to-SAF mass yield | 0.20 | Illustrative fixed conversion assumption |
| Small / large depot input capacity | 150 / 300 kt | Biomass input per model period |
| Small / large refinery input capacity | 500 / 1,087 kt | **Assumed biomass-input interpretation** of challenge capacities |
| Small / large depot CapEx | $2.25M / $4.5M | Challenge figures |
| Small / large refinery CapEx | $480M / $765M | Challenge figures |
| Farm → depot tariff | $0.10 / tonne-km | Biomass tonnes |
| Depot → refinery tariff | $0.12 / tonne-km | Biomass tonnes |
| Refinery → airport tariff | $0.08 / tonne-km | Finished SAF tonnes |
| Horizon / annual discount rate | 1 year / 0 | Illustrative finance assumptions |
| Distance multiplier | 1 | Multiplies great-circle distances; a sensitivity input |
| Annual processing OpEx | $0 per small / large refinery | Fixed annual cost per opened refinery; unspecified cost coverage |

One kilotonne is 1,000 tonnes. A 1 kt farm-to-depot flow over 100 km costs `1 × 1000 × 100 × $0.10 = $10,000`. Transport is calculated separately for every actual flow stage. Identically priced small/large truck options do not imply truck-size cost savings; this model does not optimise trip schedules.

The MILP jointly chooses binary small/large facility opens and nonnegative flow variables. It constrains source availability, exclusive facility size, depot mass conservation, refinery yield, both facility capacities, site exclusions, and exact demand fulfillment at each airport.

```text
Minimise CapEx + PVAF(H, r) × (annual transport + annual fixed refinery OpEx)
PVAF(H, 0) = H
PVAF(H, r) = (1 - (1 + r)^(-H)) / r, when r > 0
```

The default scenario requires 1,050 kt biomass for 210 kt SAF. The higher-demand preset (70/40/110/40 kt) requires 1,300 kt at the same yield. Impossible scenarios return an infeasible state instead of invented facilities or a zero-cost solution. Solver time is bounded, with feasible incumbents and their actual gaps shown distinctly from completed solves. The configured relative MIP gap is 2%; an accepted relative-gap termination does not establish an exact mathematical optimum.

Distances use a 6,371 km mean Earth radius and haversine geometry, multiplied by the scenario's distance factor. **These are straight-line proxies, not verified truck routes.** Displayed connections are schematic material flows. The model has no verified roads, site permissions, process engineering feasibility, lifecycle emissions, fuel certification, seasonality, or unstated production costs. Results are conditional planning outputs, not a certified infrastructure investment plan.

## Configuration

`.env.example` contains local-only nonsecret defaults and optional names, never a real API key.

| Variable | Purpose |
| --- | --- |
| `APP_ENV` | `development` for local demo; `production` enables required secure settings |
| `DATABASE_URL` | SQLAlchemy database URL; Compose builds it for the internal PostgreSQL service |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Local Compose database configuration |
| `SESSION_SECRET` | Use a generated value of at least 32 characters for production |
| `ALLOWED_ORIGINS` | Explicit comma-separated browser origins |
| `SOLVER_TIME_LIMIT_SECONDS` | Maximum individual MILP solve duration, default 20 seconds |
| `SOLVER_RELATIVE_GAP` | Requested relative MIP gap, default 0.02 |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Optional server-only provider credentials/model; both needed for AI narration |
| `SAF_DATA_DIR` | Optional directory containing the exact source CSV and `airports.dat` |
| `API_INTERNAL_URL` | Next.js server-side proxy target; build-time configuration |

Never put provider keys in `NEXT_PUBLIC_*` variables. The AI request requires explicit opt-in. Without configured credentials/model, or when the provider fails validation or times out, the API returns a complete deterministic summary. AI cannot set flows, costs, sites, or solver status. Review the provider's data-handling policy before enabling it for private scenarios.

## API

OpenAPI documentation at API `/docs` defines request/response schemas and validation.

| Method / path | Behavior |
| --- | --- |
| `GET /health` | Database readiness and API health |
| `GET /api/v1/locations`, `/api/v1/candidates` | Real source, airport and screened-candidate data |
| `GET /api/v1/auth/me` | Current user/guest session and CSRF token |
| `POST /api/v1/auth/register`, `/login`, `/logout` | Account/session lifecycle |
| `GET`, `POST /api/v1/scenarios` | Owner-scoped scenario listing/creation |
| `GET`, `PATCH`, `DELETE /api/v1/scenarios/{id}` | Read, versioned edit or remove a scenario |
| `POST /api/v1/scenarios/{id}/duplicate` | Make an independent scenario copy |
| `POST /api/v1/scenarios/{id}/solve` | Execute and persist a bounded real MILP solve |
| `GET /api/v1/runs`, `/api/v1/runs/{id}` | Owned immutable saved runs |
| `POST /api/v1/compare` | Compare `{left_run_id, right_run_id}` |
| `POST /api/v1/runs/{id}/explain` | Explain saved computed facts; AI requires opt-in |
| `GET /api/v1/runs/{id}/export?format=json|csv` | Download actual inputs, facilities and flows |

An example scenario creation body:

```json
{
  "name": "Illustrative baseline",
  "demand": {"PNK": 60, "PKN": 30, "BPN": 90, "TRK": 30},
  "conversion_yield": 0.2,
  "horizon_years": 1,
  "discount_rate": 0,
  "distance_multiplier": 1,
  "processing_opex": {"small": 0, "large": 0},
  "excluded_candidate_ids": []
}
```

Cookie-authenticated mutations also require `X-CSRF-Token` from `auth/me`; use the same cookie jar/session for both. IDs are server-authorised, including comparison, explanation and exports. Invalid assumptions return a validation error; unknown or foreign-owned resources return 404. Existing saved runs retain their original assumptions and input hashes when scenario settings change.

## Security and deployment

Passwords are Argon2-hashed. Session cookies are HttpOnly and SameSite=Lax; production cookies are Secure. Every private scenario and run is scoped to the current account or isolated guest. CSRF checks, bounded solve concurrency, rate limits, validated finite inputs, request IDs and sanitised errors provide basic demo safeguards.

For a deployment, place the services behind an HTTPS reverse proxy, use `APP_ENV=production`, configure a unique strong `SESSION_SECRET`, replace local database credentials, restrict origins, and configure backups. The Compose defaults bind to the local machine and are not a public deployment configuration. Do not expose PostgreSQL or run the development server publicly. Use one API worker for the current in-process solve-concurrency guard; multiple API replicas require shared rate limits and a bounded job queue. Add central monitoring and secret management before operating as a production service.

## Tests and checks

```bash
cd services/api
../../.venv/bin/ruff check .
../../.venv/bin/mypy app
../../.venv/bin/pytest -q
cd ../../apps/web
npm run lint
npm run typecheck
npm test
npm run build
cd ../..
python3 scripts/smoke_test.py
```

Backend tests independently recompute mass/capacity and cost constraints, and exercise scenarios, auth ownership, validation, exports and immutable runs. Frontend tests cover input/formatting/result behavior. The live smoke test performs baseline and changed-demand solves, verifies all three material-flow stages and mass balance, and exercises persistence, comparison, explanation, export and guest isolation. Playwright exercises the real browser workflow against running services. GitHub Actions runs critical backend/frontend checks and a real PostgreSQL Compose integration job with API smoke and browser tests. These commands are reproducible checks; consult the current run output or Actions results for actual pass/fail status.

## Demo, screenshots, and next work

See [the demo walkthrough](docs/DEMO_SCRIPT.md). These screenshots were captured from the running application after real API solves and Atlas interactions:

![Solved network and scenario controls](docs/screenshots/optimized-network.png)

[Mobile Supply Atlas screenshot](docs/screenshots/atlas-mobile.png)

Core model extensions require verified road matrices, legally eligible sites, validated refinery/biomass conversion data, measured demand, lifecycle analysis, and calibrated operating economics. No hosted demo URL or video is claimed.

### Verified implementation status

The production Next.js container and PostgreSQL-backed API passed live smoke and browser checks for baseline and higher-demand solves, all three flow stages, mass balance, comparison, exports, account sessions, and mobile Atlas inspection. Backend tests also cover candidate exclusions, infeasibility, independent cost/capacity checks, immutable runs, CSRF and owner isolation. See `docs/VALIDATION.md` for the current verification record.

Dependency checks found no runtime advisories or high/critical development advisories. The compatible Next.js ESLint toolchain still has 16 upstream moderate development-only advisories, primarily inherited glob-matching dependencies. ESLint 10 is not yet compatible with the official config's React/import/accessibility plugin peer requirements; no incompatible major overrides were forced. The vulnerable older test runner was upgraded to Vitest 5.0.5. Run `npm audit` to obtain current advisory status. Optional real-provider AI calls were not exercised because no provider key/model is configured; deterministic output and provider failure/malformed-output fallbacks are tested. AI currently selects the order of predefined caveats; the numerical narrative stays deterministic.

## Licence and data provenance

New application source code is MIT-licensed; see [LICENSE](LICENSE). This does **not** license the supplied datasets or original archive. The biomass dataset's redistribution rights are unknown. `airports.dat` resembles OpenFlights data, whose database is published under ODbL with attribution and share-alike obligations; verify the precise source and applicable licence before redistributing derivatives. See [data provenance](data/DATA_PROVENANCE.md).
