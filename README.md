
# Solid API

FastAPI starter with SQLite, SQLAlchemy 2.0 ORM, and Pydantic.

## Features

- FastAPI with built-in docs enabled at `/docs` and `/redoc`
- SQLite database configured via SQLAlchemy
- Pydantic models for request/response validation
- Simple health and items endpoints

## Project layout

```
app/
  config.py
  db.py
  main.py
  models.py
  routers/
	 health.py
	 items.py
  schemas.py
main.py
```

## Quick start (uv)

1. Create a virtual environment and sync dependencies:
	- `uv venv`
	- `uv sync`
2. (Optional) Create a local env file:
	- `cp .env.example .env`
3. Run the API:
	- `uv run uvicorn main:app --reload`

The API docs will be available at:
- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/redoc`

## API overview

- `GET /health` → health check
- `POST /items` → create item
- `GET /items` → list items
- `GET /items/{item_id}` → fetch item

## SQLite configuration

The default database is configured in `app/config.py` as:
`sqlite:///./app.db`

Override it via `DATABASE_URL` in `.env` if needed.

## Migrations (Alembic)

Alembic is configured in [alembic.ini](alembic.ini) and [alembic/env.py](alembic/env.py).

Create a migration:
- `uv run alembic revision --autogenerate -m "init"`

Apply migrations:
- `uv run alembic upgrade head`
