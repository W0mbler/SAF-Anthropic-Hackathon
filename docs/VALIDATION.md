# Validation record

Validated on 31 October 2026 in the managed Linux cloud environment using Python 3.12, Node.js 24 on the host, Node.js 22 in the production image, PostgreSQL 16, and system Chromium.

## Final results

| Check | Result |
| --- | --- |
| Backend `pytest -q` | **70 passed**: 34 solver/data checks and 36 API/explanation checks |
| Backend `ruff check .` | Passed |
| Backend `mypy app` | Passed, all 9 app modules |
| Frontend `npm run lint` | Passed, no lint errors or warnings |
| Frontend `npm run typecheck` | Passed, strict TypeScript |
| Frontend `npm test` | **9 passed**, Vitest 5.0.5 |
| Production API and web Docker builds | Passed using the managed CA, with TLS verification enabled |
| `docker compose up -d --wait --wait-timeout 120` | PostgreSQL, API and web healthy |
| `python3 scripts/smoke_test.py` | Passed against the rebuilt PostgreSQL-backed API |
| `CAPTURE_SCREENSHOTS=1 npm --prefix e2e test` | **3 passed**, real Chromium browser journeys |
| SQLite Alembic upgrade/current/downgrade | Passed |
| Frozen Python requirements and npm lockfile installs | Passed; Python `pip check` found no conflicts |
| `npm audit --omit=dev` | 0 reported runtime advisories |
| Full frontend `npm audit` | 0 high/critical, 16 moderate development-only advisories |

Backend checks independently recompute per-source supply limits, depot/refinery mass balances, conversion yield, facility capacities and mutual size exclusivity, distance/unit arithmetic, annual transport and fixed processing costs, present-value factors and the complete objective. They exercise 210 kt and 260 kt scenarios, exclusions, infeasibility, invalid inputs, configured solver limits/gap, feasible-incumbent handling, immutable saved inputs, normalized records, account/guest isolation, CSRF, origin validation, cookie security, session restart persistence, exports and explanation fallbacks.

The live smoke checks loaded exactly 80 sources totaling 6,800 kt and exactly PNK, PKN, BPN and TRK. Baseline and higher-demand scenarios served all four demands with 1,050 kt and 1,300 kt of biomass input respectively. All three material-flow stages were present. Comparison, saved-run persistence, deterministic explanation, exact JSON/CSV exports and a separate guest's access denial passed.

The browser suite completed real baseline and higher-demand solves, independently checked deliveries and biomass consumption, compared saved runs, downloaded matching JSON, registered/logged out/logged back in, and inspected/filter-selected records in the mobile Atlas at 390 px without horizontal page overflow. Actual screenshots are retained in `docs/screenshots/`. The local MapLibre renderer and SVG fallback use supplied coordinates and local schematic geography; no paid map key is needed.

## Limits of this verification

- Optional real-provider AI requests were not run because no provider key/model is configured. Missing-key, malformed-output and provider-failure fallbacks are tested. The optional integration orders predefined caveats; the numerical narrative is deterministic.
- Official Next.js ESLint plugins currently require the compatible ESLint 9 major. Its inherited glob-matching toolchain has moderate development-only advisories. The incompatible ESLint 10 major was not forced into those plugins. The older vulnerable test runner was replaced with Vitest 5.0.5. Advisory status can change; use `npm audit` for a current report.
- The backend suite emits one upstream Starlette/httpx TestClient deprecation warning. It does not prevent the tests from running or passing.
- The manual development runner received shell syntax checks. The complete production Compose path, rather than the optional host SQLite/Next development runner, received live API/browser verification.
- GitHub Actions configuration is included. Hosted Actions and public application deployment require their own remote status checks; local test results do not establish either. No new-task environment restoration is claimed.
- Updated environment installation/start instructions were saved as a configuration draft. Saving a draft does not publish the prepared filesystem snapshot. Review and save the changes in environment settings, then publish the environment to retain the prepared snapshot for later tasks.

## Model and data caveats

Airport demands and conversion yield are illustrative. Distances are straight-line proxies, not verified roads. Candidate coordinates are not permitted construction land. Refinery capacities are interpreted as biomass input. Unspecified processing economics and lifecycle emissions are absent. Biomass redistribution rights remain unverified, and airport data carries the supplied OpenFlights/ODbL provenance caution. Passing these software checks does not establish a physically feasible, certified fuel supply plan.
