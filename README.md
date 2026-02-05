
# Solid API

FastAPI service for managing plant data, enriched from Wikipedia and summarized with Gemini.

## Features

- FastAPI with built-in docs enabled at `/docs` and `/redoc`
- SQLite database via SQLAlchemy 2.0 ORM (Declarative Mapping)
- Pydantic v2 schemas for request/response validation
- Plant CRUD and Wikipedia-driven plant creation
- External data fetching via `curl_cffi` with browser impersonation
- SOLID-inspired architecture (repositories, services, protocols)

## Project layout

```
app/
	config.py
	db.py
	main.py
	models.py
	repositories.py
	routers/
		health.py
		plants.py
		wiki.py
	schemas.py
	services.py
main.py
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
- `DATABASE_URL` (default: `sqlite:///./app.db`)
- `GEM_API_KEY` (required for Gemini summarization)
- `BROWSER` (default: `chrome`, for `curl_cffi` impersonation)

## Migrations (Alembic)

Alembic is configured in [alembic.ini](alembic.ini) and [alembic/env.py](alembic/env.py).

Create a migration:
- `uv run alembic revision --autogenerate -m "init"`

Apply migrations:
- `uv run alembic upgrade head`
