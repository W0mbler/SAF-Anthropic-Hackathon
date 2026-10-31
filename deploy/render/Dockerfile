# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS web-dependencies
WORKDIR /build/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true --no-audit --no-fund

FROM web-dependencies AS web-build
ENV NEXT_TELEMETRY_DISABLED=1 API_INTERNAL_URL=http://127.0.0.1:8000
COPY apps/web/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS api-dependencies
WORKDIR /build/api
COPY services/api/requirements.lock.txt ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; \
    pip install --no-cache-dir --prefix=/install -r requirements.lock.txt

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 APP_ENV=production \
    OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 PGCONNECT_TIMEOUT=10
WORKDIR /app
# The Node and Python stages both use Debian bookworm. Copy its matching C++
# runtime instead of adding an unverified binary or disabling package trust.
COPY --from=web-build /usr/local/bin/node /usr/local/bin/node
COPY --from=web-build /usr/lib/*/libstdc++.so.6* /usr/local/lib/
COPY --from=api-dependencies /install /usr/local
COPY --from=web-build /build/web/.next/standalone /app/web/
COPY --from=web-build /build/web/.next/static /app/web/.next/static/
COPY services/api/ /app/services/api/
COPY airports.dat kalimantan_80_locations_6800kt_full_range.csv /app/
COPY deploy/render/start.py /app/deploy/render/start.py
RUN ldconfig && node --version && useradd --uid 10001 --create-home saf \
    && chown -R saf:saf /app
USER saf
EXPOSE 10000
CMD ["python", "/app/deploy/render/start.py"]
