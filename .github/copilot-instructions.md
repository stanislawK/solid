# Project Context: Modern Python Backend

## Technical Stack

* **Environment Manager:** `uv` (Fastest Python package installer and resolver).
* **Language:** Python 3.14 (Strict adherence to latest PEPs and syntax).
* **Type Safety:** Mandatory strict type annotations.
* **HTTP Client:** `curl_cffi` (Used for impersonating browser TLS/JA3 fingerprints and high-performance requests).
* **Database:** SQLAlchemy 2.0+ (Declarative Mapping) with SQLite.
* **Validation:** Pydantic v2 & `pydantic-settings`.
* **Migrations:** Alembic.
* **Architecture:** SOLID principles. Use Dependency Injection and Protocols/ABCs.
* **Local Kubernetes:** kind + Helm (Kubernetes CLI: kubectl).

## Coding Standards & Rules

1. **SOLID Compliance:**

* Favor Composition over Inheritance.
* Use `typing.Protocol` for structural subtyping (Interface Segregation).
* Inject dependencies via `__init__` to facilitate testing.

2. **SQLAlchemy Patterns:**

* Use `Mapped` and `mapped_column` exclusively.
* Separate Database Models (SQLAlchemy) from Domain/API Schemas (Pydantic).

3. **HTTP Operations:**

* Use `curl_cffi.requests` for asynchronous requests where browser impersonation is required.
* Prefer the `AsyncSession` context manager for resource management.

4. **Workflow (uv):**

* When suggesting package installations, use `uv add <package>`.
* When suggesting running scripts, use `uv run <script>`.
* Assume a `pyproject.toml` managed by `uv`.

5. **Kubernetes (kind + Helm):**

* For local clusters, assume kind with images loaded via `kind load docker-image`.
* Prefer Helm for installs/upgrades: `helm upgrade --install backend ./k8s/backend-service`.
* For resource control, use `kubectl scale deploy/solid-backend --replicas=0|1`.