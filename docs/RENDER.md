# Deploy the full Python application on Render

Render can host this app's Python API and mathematical optimiser as well as the website. GitHub stores the code; Render runs it. No API key for AI or paid map service is needed.

## What this Blueprint creates

- One **paid Docker web service** (`0.5c-512mb` compute plan) containing the Next.js website and FastAPI/SciPy API.
- One **paid persistent PostgreSQL database** (`0.1c-256mb` compute plan), with external access disabled by `ipAllowList: []`.
- A generated production session-signing secret and an internal database connection binding. No credentials are stored in Git.

Both resources use the same `singapore` region. The Render Dashboard must confirm that these plans/region are currently available and show their current charges before creation. No resources have been created, and no charges are incurred by committing these files. This is not a free GitHub Pages deployment. Start with one web instance; increase memory only if actual usage requires it. Database storage/backup and workspace charges are separate from web compute; review the entire cost shown by Render rather than assuming a fixed total.

## Deploy

1. Push the completed repository, including `render.yaml`, to GitHub.
2. Open [Deploy to Render](https://render.com/deploy?repo=https://github.com/W0mbler/SAF-Anthropic-Hackathon), sign in, and connect the GitHub repository when prompted. This lets Render read the source; no secret needs to be pasted into chat.
3. Review the Blueprint's web/database resources, plan availability, region, and current prices. Create the Blueprint only if you accept those charges.
4. Wait for the Docker build, migration, data seed and health check. Render supplies the service's real HTTPS URL in its Dashboard. No hosted URL is claimed until that deploy succeeds.
5. Open the HTTPS URL, enter Scenario Studio, and run the baseline optimisation. Then use the higher-demand preset, solve, compare, and export the result.

`autoDeployTrigger: checksPass` requests deployment of later commits after the repository checks pass. If the Git provider integration does not report those checks to Render, use a manual deploy or configure that integration in the Dashboard rather than assuming a new commit is already live.

## Same-origin design

The browser reaches only the public Next.js listener on `0.0.0.0:$PORT`. Next forwards `/api/v1/*` internally to FastAPI on `127.0.0.1:8000` in the same container. The database connection remains on Render's private network. No cross-origin browser API URL or separately priced API web service is necessary.

The startup supervisor applies Alembic migrations, starts FastAPI, waits for its database-backed `/health`, and then starts Next.js. If either service fails, it stops the other and exits nonzero so the platform can restart the container. Platform shutdown signals stop and reap both process groups. Render's public health check uses the existing database-backed `/api/v1/locations` route through Next.js.

Production session cookies are HttpOnly, Secure and SameSite=Lax. The supervisor derives the CSRF origin allowlist from Render's `RENDER_EXTERNAL_URL`, requiring an explicit HTTPS origin. For a custom domain, set `ALLOWED_ORIGINS` to the full comma-separated list of allowed HTTPS origins, including the Render URL if you still use it. Never set a wildcard. The localhost HTTP exception in the adapter is only for explicit local production-image testing; public HTTP origins are rejected.

Render's PostgreSQL `postgres://` / `postgresql://` URL is normalised to `postgresql+psycopg://` for the installed psycopg v3 driver without changing its credentials or TLS query parameters. Missing credentials, an invalid port or origin, or a short signing secret stops startup. Secret values and database URLs are not printed by the adapter.

## Verification and limitations

Run the deployment adapter checks with the application's Python test environment:

```bash
.venv/bin/python -m pytest deploy/render/test_start.py -q
```

These tests cover URL/port validation, driver conversion, origin/security configuration, real subprocess failure handling, peer shutdown and reaping. They do not establish that Render created infrastructure or that a remote deployment is healthy.

All 34 adapter tests passed locally, as did Ruff and mypy. The combined image built and started in production mode against an isolated PostgreSQL database. Its three real Chromium journeys passed with 0.5 CPU and 512 MiB container limits: baseline/higher-demand optimisation, comparison and JSON export; registration/logout/login with delayed initial session discovery; and mobile Atlas inspection. Secure cookie flags, repeated migrations/seed and clean supervisor shutdown were also checked. No live Render service or billable resource was created by these checks.

For a local image build:

```bash
docker build -f deploy/render/Dockerfile -t saf-command-render .
```

In a managed cloud with an HTTPS session proxy, add `--secret id=proxy_ca,src=/etc/ssl/certs/ca-certificates.crt` using the actual trusted combined bundle. TLS verification stays enabled. Run the image with a reachable PostgreSQL database, a strong `SESSION_SECRET`, and an explicit test origin; never commit those values. A production secure-cookie browser test on local HTTP may require the browser's localhost security exception. Public deployments must use Render HTTPS.

The app retains scenarios, accounts, sessions and immutable solver runs in PostgreSQL. Container-local files are disposable; there is no SQLite fallback in this deployment. Do not scale to multiple API replicas without shared rate/concurrency limiting. The model remains an illustrative planning model with straight-line distance proxies, assumed yield/demand, and incomplete operating economics; online hosting does not validate real-world construction or fuel certification.

## Documentation grounding

The configuration uses fields documented in Render's official repositories:

- [Blueprint field reference](https://github.com/render-oss/skills/blob/main/skills/render-blueprints/references/field-reference.md): Docker paths, health check, automatic deploy trigger, database properties and secret wiring.
- [Compute-plan reference](https://github.com/render-oss/skills/blob/main/skills/render-blueprints/references/compute-plans.md): CPU/memory plan IDs and billing distinctions.
- [Official complete example](https://github.com/render-examples/vibe-coding-app/blob/main/render.yaml): current `0.5c-512mb` web and `0.1c-256mb` database plan identifiers, `fromDatabase` and generated secrets.
- [Web-service guidance](https://github.com/render-oss/skills/blob/main/skills/render-web-services/SKILL.md): public `PORT`, binding and platform TLS termination.

These official GitHub references were retrieved during preparation. The canonical live schema at `https://render.com/schema/render.yaml.json`, current Render pricing pages and platform-aware Blueprint validation were unavailable under the task's network/tool configuration. This file therefore does not claim a completed live Render validation or deployment. Confirm the schema/plans and current pricing in Render before creating resources.
