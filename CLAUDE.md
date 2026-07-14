# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
uv run uvicorn main:app --reload       # run API (http://127.0.0.1:8000)
make migration MSG='describe change'   # create Alembic migration
make upgrade                           # apply migrations
make downgrade REV=-1                  # rollback one migration
make format                            # run ruff formatter
make openapi                           # regenerate openapi.json from live app
```

### Frontend (run from `frontend/`)
```bash
pnpm dev      # dev server
pnpm build    # production build
pnpm lint     # lint
```

### Kubernetes (unified deploy vocabulary — ENV=local kind, ENV=prod k3s VPS)
```bash
make deploy TARGET=backend ENV=local    # build+load image then helm upgrade
make deploy TARGET=frontend ENV=local   # (TARGET=backend|frontend|all)
make reapply TARGET=backend ENV=local   # helm upgrade only, no image build
make deploy TARGET=backend ENV=prod DRY_RUN=1   # preview helm changes (--dry-run=client)
make bootstrap-secrets ENV=prod         # create/update prod secrets from SECRETS_ENV_FILE
make deploy-postgres ENV=prod           # deploy/upgrade prod PostgreSQL (only on DB changes)
make expose-backend                     # kubectl port-forward → http://localhost:8080
make start-pods / stop-pods             # scale all workloads up/down (local)
```
Deploy logic lives in `scripts/deploy.sh` + `scripts/deploy-lib.sh`. App deploys
no longer touch Postgres — use `make deploy-postgres` for that.

## Architecture

```
app/
  config.py         # pydantic-settings, loads .env then solid.env then solid-prod.env
  db.py             # SQLAlchemy async engine + session factory
  models.py         # SQLAlchemy ORM models (use Mapped / mapped_column only)
  repositories.py   # DB access layer
  schemas/          # Pydantic v2 request/response schemas (separated from ORM)
  services/         # Business logic; each file maps to a domain
    plants.py       # plant CRUD orchestration
    wiki.py         # Wikipedia fetch + Gemini summarization
    image.py        # image download via ImageStorageProtocol
    ai.py           # Gemini API wrapper
    auth.py         # JWT + Google OAuth
  routers/          # FastAPI routers mounted in app/main.py
  observability.py  # OpenTelemetry setup
app/main.py         # FastAPI app factory: mounts routers + /images StaticFiles, CORS/session middleware, OTel + Sentry init
main.py             # entrypoint that re-exports `app` from app.main (used by `uvicorn main:app`)
frontend/src/
  lib/api.ts        # typed API client (generated against openapi.json)
  lib/plants.ts     # plant-domain helpers
  components/       # React components; modular, dark/light theme support
```

**Dependency flow:** routers → services → repositories → SQLAlchemy models. Services receive their collaborators via `__init__` injection; interfaces are `typing.Protocol` (not ABCs).

**Storage:** `ImageStorageProtocol` / `LocalVolumeStorage` writes to `STORAGE_DIR` locally and `/app/data/images` in K8s (PVC-backed). Do not suggest MinIO or S3.

**DB:** SQLite locally (auto-schema creation on startup), PostgreSQL in production (Alembic-only migrations via a pre-upgrade Helm Job).

## Key Rules

- **Before writing any frontend API call, interface, or mock data** — read `openapi.json` first to stay in sync with the actual backend contract.
- Use `curl_cffi.requests` (async, browser-impersonation) for all HTTP fetching, never `httpx` or `requests`.
- Use `uv add <package>` for Python dependencies; `pnpm add` for frontend.
- All SQLAlchemy columns must use `Mapped[T]` + `mapped_column()`; never `Column()`.
- shadcn/ui components must support both dark and light themes; design mobile-first.
- Settings come from `app/config.py` (pydantic-settings). Env files load in order `.env` → `solid.env` → `solid-prod.env`, and **later files override earlier ones** (so `solid-prod.env` wins). Actual environment variables still take priority over all of them.
