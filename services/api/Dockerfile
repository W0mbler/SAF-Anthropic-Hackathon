# syntax=docker/dockerfile:1
FROM python:3.12-slim AS dependencies
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/services/api
COPY services/api/requirements.txt services/api/requirements.lock.txt ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; \
    pip install --no-cache-dir --prefix=/install -r requirements.lock.txt

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/services/api
COPY --from=dependencies /install /usr/local
COPY services/api/ ./
COPY airports.dat kalimantan_80_locations_6800kt_full_range.csv /app/
RUN useradd --uid 10001 --create-home saf && mkdir -p /app/services/api/.local && chown -R saf:saf /app
USER saf
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
