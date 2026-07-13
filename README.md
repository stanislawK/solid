
# Solid API

FastAPI service for managing plant data, enriched from Wikipedia and summarized with Gemini.

## Features

- FastAPI with built-in docs enabled at `/docs` and `/redoc`
- SQLAlchemy 2.0 ORM with SQLite for local development and PostgreSQL support for production
- Pydantic v2 schemas for request/response validation
- Plant CRUD and Wikipedia-driven plant creation
- External data fetching via `curl_cffi` with browser impersonation
- SOLID-inspired architecture (repositories, services, protocols)
- Frontend built with React, Vite, and pnpm
- Component-driven UI using shadcn/ui
- Comprehensive mobile-first design with dark and light themes support
- Storage handling via Dependency Inversion utilizing local persistent volumes out of the box in k8s
- Observability with OpenTelemetry: traces (Tempo locally, Grafana Cloud in prod) and logs (Loki + Alloy) via a single Alloy collector
- Routing via Traefik Ingress

## Requirements

- Python 3.14
- uv
- Docker
- kubectl
- kind
- Helm

## Project layout

```
app/
	config.py         # pydantic-settings
	db.py             # async SQLAlchemy engine/session
	models.py         # ORM models
	repositories.py   # DB access layer
	schemas/          # Pydantic request/response schemas
	services/         # business logic per domain
	routers/          # FastAPI routers
	main.py           # app factory
frontend/           # React/Vite app with shadcn/ui components
k8s/                # Helm charts + per-component values (see k8s/README.md)
scripts/            # deploy.sh + deploy-lib.sh + prod bootstrap
main.py             # uvicorn entrypoint (re-exports app.main:app)
```

## Quick start (uv)

1. Create a virtual environment and sync dependencies:
	- `uv venv`
	- `uv sync`
2. (Optional) Create a local env file:
	- `cp solid.env .env`
3. Run the API:
	- `uv run uvicorn main:app --reload`

The API docs will be available at:
- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/redoc`

## Deployment

Both environments share one deploy vocabulary
(`make deploy|reapply TARGET=backend|frontend|all ENV=local|prod`, add
`DRY_RUN=1` to preview). Deploy logic lives in
[scripts/deploy.sh](scripts/deploy.sh) + `scripts/deploy-lib.sh`.

- **Local (kind):** [docs/deploy-local.md](docs/deploy-local.md)
- **Production (k3s VPS + Cloudflare + Grafana Cloud):** [docs/deploy-production.md](docs/deploy-production.md)
- **Chart & release inventory:** [k8s/README.md](k8s/README.md)
- **Re-adding GlitchTip error tracking:** [docs/glitchtip.md](docs/glitchtip.md)

Quick local start once a kind cluster + Traefik exist:

```bash
make deploy TARGET=all ENV=local
make expose-backend        # UI http://localhost:8080/  ·  API http://localhost:8080/api/
```

The backend chart provisions a PVC (`backend-backend-service-data` at
`/app/data`) for image downloads and the local SQLite DB; app deploys run a
pre-upgrade Alembic migration Job. In production, PostgreSQL is deployed
separately (`make deploy-postgres ENV=prod`) so app rollouts never touch the DB.

## Production security baseline

Deploy the frontend and backend on the same hostname (frontend on `/`, backend
on `/api`) to keep browser traffic same-origin. The production values already
set `ENVIRONMENT=production`, `SESSION_HTTPS_ONLY=true`, `DOCS_ENABLED=false`,
security headers, and host/CORS validation for the real domain; strong
`JWT_SECRET_KEY` / `SESSION_SECRET_KEY` come from Kubernetes Secrets (never
committed). Keep `SESSION_SAME_SITE=lax` unless you have verified stricter
settings do not break the Google OAuth callback. See
[docs/deploy-production.md](docs/deploy-production.md) for the full runbook.

## API overview

- `GET /health` → health check
- `POST /plants` → create plant manually
- `POST /plants/wiki` → create plant from Wikipedia + Gemini summary
- `GET /plants` → list plants
- `GET /plants/{plant_id}` → fetch plant
- `GET /wiki/get_wikipedia_articles?search_term=...` → search Wikipedia titles

## Configuration

Settings are loaded from `.env` and `solid.env` (see [app/config.py](app/config.py)).

Key variables:
- `DATABASE_URL` (default: `sqlite:///./app.db`) — for Kubernetes production, store this in a Secret and point the chart at it.
- `STORAGE_DIR` (default: `data/images` locally, `/app/data/images` in Docker/K8s to match volume mounts)
- `GEM_API_KEY` (required for Gemini summarization)
- `BROWSER` (default: `chrome`, for `curl_cffi` impersonation)
- `OTEL_ENABLED` (default: `true`)
- `OTEL_SERVICE_NAME` (default: `solid-backend`)
- `OTEL_EXPORTER_OTLP_ENDPOINT` (e.g. `http://alloy.default.svc.cluster.local:4318`)
- `OTEL_EXPORTER_OTLP_PROTOCOL` (`http/protobuf` or `grpc`)
- `OTEL_RESOURCE_ATTRIBUTES` (e.g. `deployment.environment=local`)

## Migrations (Alembic)

Alembic is configured in [alembic.ini](alembic.ini) and [alembic/env.py](alembic/env.py).

Create a migration:
- `uv run alembic revision --autogenerate -m "init"`  (or `make migration MSG='init'`)

Apply migrations:
- `uv run alembic upgrade head`  (or `make upgrade`)

In Kubernetes, the backend chart runs a pre-install/pre-upgrade migration Job
(`alembic upgrade head`) so schema changes apply before the app rolls forward.
Startup schema auto-creation only runs for SQLite.

## Storage (Image Persistence)

The backend downloads images from Wikipedia and saves them via
`LocalVolumeStorage` (Dependency Inversion — no MinIO/S3 needed). In Kubernetes a
PVC (`k8s/backend-service/templates/pvc.yaml`) is mounted at `/app/data`, and
FastAPI serves cached images via `StaticFiles` at `/images`.
