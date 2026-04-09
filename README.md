
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
- Comprehensive Observability with OpenTelemetry (Tempo), Loki + Alloy (Logs), and Prometheus + Grafana (Metrics)
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
frontend/
	Dockerfile
	index.html
	package.json
	pnpm-lock.yaml
	src/
	... (React/Vite app with shadcn/ui components)
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

## Kubernetes (kind + Helm)

This setup uses separate Helm charts for the backend and frontend. Both target a local kind cluster.

Build and load the images:
```bash
docker build -t solid-backend:latest .
docker build -t solid-frontend:latest ./frontend
kind load docker-image solid-backend:latest --name solid-cluster
kind load docker-image solid-frontend:latest --name solid-cluster
```

Install or upgrade the backend chart:
- `helm upgrade --install backend ./k8s/backend-service`

*(Note: The backend chart will automatically create a PersistentVolumeClaim (PVC) named `backend-backend-service-data` mounted at `/app/data` to persist file downloads and database states across re-deployments).*

Install or upgrade the frontend chart:
- `helm upgrade --install frontend ./k8s/frontend-service`

Access the UI at: `http://localhost:8080/` after running `make expose-backend`
Backend API at: `http://localhost:8080/api/` through the same Traefik port-forward

## Production security baseline

For production, deploy the frontend and backend on the same hostname, with the frontend on `/` and the backend on `/api`. This keeps browser traffic same-origin and avoids needing broad cross-origin access.

Recommended production settings:

- Set `ENVIRONMENT=production`
- Set `FRONTEND_URL=https://your-domain.example`
- Set `GCP_REDIRECT_URI=https://your-domain.example/api/auth/callback`
- Set `ALLOWED_HOSTS=your-domain.example`
- Set `CORS_ALLOWED_ORIGINS=https://your-domain.example`
- Set `SESSION_HTTPS_ONLY=true`
- Set `DOCS_ENABLED=false`
- Set strong `JWT_SECRET_KEY` and `SESSION_SECRET_KEY` values through Kubernetes Secrets
- Configure Traefik ingress TLS and bind both frontend and backend ingresses to the same host

Notes:

- Keep `SESSION_SAME_SITE=lax` unless you have verified that stricter settings do not break the Google OAuth callback flow.
- The backend cannot be made callable only by frontend code in a browser environment. The realistic goal is same-origin routing, strict cookies, CSRF protection, host validation, and HTTPS-only transport.
- Do not keep real production secrets in `solid.env` or Helm values committed to the repository.
- In local kind deployments, the backend image still contains `solid.env`. If Helm injects an empty Kubernetes env var for a setting, that empty env var wins over the file value. Production should use explicit Kubernetes Secrets; local fallback should avoid injecting empty values.

## Production on Hetzner ARM64

The repository now includes a production-oriented path for a single ARM64 VPS with k3s. The intent is to keep development and production logic separate instead of overloading the current kind workflow.

What is included:

- Production Helm overrides in `k8s/backend-service/values-production.yaml` and `k8s/frontend-service/values-production.yaml`
- Production PostgreSQL overrides in `k8s/postgresql/values-production.yaml` for a lightweight in-cluster database on the VPS
- Production Traefik values in `k8s/traefik-values-production.yaml` for Cloudflare DNS challenge + Let's Encrypt
- Prod-only scripts in `scripts/` for secret bootstrap and ARM64 deploys
- Backend chart support for disabling GlitchTip DSN injection when self-hosted GlitchTip is not part of production
- Configurable backend PVC sizing for tighter disk control

Recommended production model for a small Hetzner node:

- k3s instead of kind
- Cloudflare in front of Traefik
- Frontend and backend on the same host, with `/api` routed to the backend
- PostgreSQL on the same VPS for the first production cut
- Grafana Cloud instead of self-hosted Grafana, Loki, and Tempo

### Production values

Before deploying, replace the placeholder values in:

- `k8s/traefik-values-production.yaml`
- `k8s/backend-service/values-production.yaml`
- `k8s/frontend-service/values-production.yaml`
- `k8s/postgresql/values-production.yaml`

At minimum, update:

- the Let's Encrypt account email in `k8s/traefik-values-production.yaml`
- the Traefik storage class in `k8s/traefik-values-production.yaml` if your k3s cluster does not use `local-path`
- `example.com`
- any resource or PVC sizing values that should differ from the defaults

### Traefik production install

The backend and frontend production scripts do not install the ingress controller. Traefik remains a separate cluster-level release, but its production configuration is versioned in this repository.

This repository uses Traefik with:

- Kubernetes Ingress provider
- ingress class `traefik-solid`
- NodePorts `30080` and `30443`
- HTTP to HTTPS redirect on the Traefik entrypoint
- Let's Encrypt certificates obtained by Traefik via Cloudflare DNS challenge
- forwarded headers trusted only from published Cloudflare IP ranges

Create the Cloudflare DNS token secret in Kubernetes before installing Traefik:

```bash
kubectl -n default create secret generic traefik-cloudflare-dns \
	--from-literal=CF_DNS_API_TOKEN='replace-with-cloudflare-api-token'
```

The token should be scoped only for the DNS zone Traefik must solve challenges for. A minimal Cloudflare API token typically needs:

- `Zone:DNS:Edit`
- `Zone:Zone:Read`

Install or upgrade Traefik with the production values from this repository:

```bash
helm repo add traefik https://traefik.github.io/charts
helm repo update
helm upgrade --install traefik-solid traefik/traefik \
	-n default \
	-f ./k8s/traefik-values-production.yaml
```

How the certificate is obtained:

- You do not create the Let's Encrypt certificate manually.
- Traefik uses the Cloudflare API token to create the temporary DNS TXT records required for ACME DNS challenge.
- Traefik stores the ACME account and issued certificates in `/data/acme.json` on its persistent volume.
- Traefik renews the certificate automatically.

What must exist for that to work:

- the public DNS record in Cloudflare for your hostname, with Cloudflare proxy enabled
- the `traefik-cloudflare-dns` Kubernetes Secret containing `CF_DNS_API_TOKEN`
- persistent storage for Traefik so `/data/acme.json` survives pod restarts
- port `80` and `443` traffic from Cloudflare reaching the node, usually through NodePorts `30080` and `30443`

Recommended origin hardening:

- keep Traefik `forwardedHeaders.trustedIPs` restricted to Cloudflare ranges only
- allow inbound traffic to origin ports `80` and `443` only from Cloudflare IP ranges at the VPS firewall level
- do not expose the Traefik dashboard publicly

Useful verification commands after Traefik install:

```bash
kubectl get ingressclass
kubectl -n default get svc traefik-solid
kubectl -n default logs deploy/traefik-solid --tail=100 | grep -i acme
```

### Production secrets

Do not use a committed `.env` file for production. Instead, keep a server-local env file outside the repository and apply it into Kubernetes Secrets.

Example template:

```bash
cp scripts/prod-secrets.env.example /root/solid-prod-secrets.env
```

Create or update the secrets in the cluster:

```bash
SECRETS_ENV_FILE=/root/solid-prod-secrets.env ./scripts/prod-bootstrap-secrets.sh
```

This creates or updates:

- `backend-postgres-auth`
- `backend-db`
- `backend-auth`
- `glitchtip-secret` only when `GLITCHTIP_DSN` is set

`backend-db` is generated from the PostgreSQL credentials and points the backend at the in-cluster PostgreSQL service. The standard VPS deployment path no longer requires you to put a raw production `DATABASE_URL` in the server-local env file.

### Production PostgreSQL

Production now expects a dedicated PostgreSQL release in the same k3s cluster. The production scripts install or upgrade it before the backend so the backend migration Job can connect cleanly during `helm upgrade`.

The PostgreSQL deployment is intentionally small for a Hetzner cax11-class VPS:

- single instance
- persistent volume
- ClusterIP-only service inside the cluster
- conservative CPU and memory limits
- separate Kubernetes secret for database credentials

Tune the database footprint in `k8s/postgresql/values-production.yaml` if your node sizing changes.

### ARM64 production deploys on the VPS

The production scripts are designed for native ARM64 builds on the target VPS. They build Docker images locally and import them into the single-node k3s container runtime before running Helm upgrades.

Deploy order for backend-aware production scripts is now:

1. PostgreSQL
2. Backend migration job plus backend deployment
3. Frontend deployment

Deploy both services:

```bash
IMAGE_TAG=$(git rev-parse --short HEAD) ./scripts/prod-deploy.sh
```

Deploy only the backend:

```bash
IMAGE_TAG=$(git rev-parse --short HEAD) ./scripts/prod-deploy-backend.sh
```

Deploy only the frontend:

```bash
IMAGE_TAG=$(git rev-parse --short HEAD) ./scripts/prod-deploy-frontend.sh
```

Reapply Helm configuration without rebuilding images:

```bash
IMAGE_TAG=$(git rev-parse --short HEAD) ./scripts/prod-reapply.sh
IMAGE_TAG=$(git rev-parse --short HEAD) ./scripts/prod-reapply-backend.sh
IMAGE_TAG=$(git rev-parse --short HEAD) ./scripts/prod-reapply-frontend.sh
```

Optional environment variables supported by the deploy scripts:

- `KUBE_NAMESPACE` default: `default`
- `BACKEND_RELEASE` default: `backend`
- `FRONTEND_RELEASE` default: `frontend`
- `BACKEND_IMAGE_REPOSITORY` default: `solid-backend`
- `FRONTEND_IMAGE_REPOSITORY` default: `solid-frontend`
- `IMAGE_TAG` default: current git short SHA, or a timestamp if git is unavailable

The scripts assume `docker`, `kubectl`, `helm`, and `k3s` are installed on the server, and that `sudo k3s ctr images import` is available for loading images into the cluster.

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
- For Kubernetes production, prefer storing `DATABASE_URL` in a Secret and pointing the chart at that secret.
- `STORAGE_DIR` (default: `data/images` locally, should be `/app/data/images` in Docker/K8s to match volume mounts)
- `GEM_API_KEY` (required for Gemini summarization)
- `BROWSER` (default: `chrome`, for `curl_cffi` impersonation)
- `OTEL_ENABLED` (default: `true`)
- `OTEL_SERVICE_NAME` (default: `solid-backend`)
- `OTEL_EXPORTER_OTLP_ENDPOINT` (for example `http://otel-collector-opentelemetry-collector.default.svc.cluster.local:4318`)
- `OTEL_EXPORTER_OTLP_PROTOCOL` (`http/protobuf` or `grpc`)
- `OTEL_RESOURCE_ATTRIBUTES` (for example `deployment.environment=local`)

## Migrations (Alembic)

Alembic is configured in [alembic.ini](alembic.ini) and [alembic/env.py](alembic/env.py).

Create a migration:
- `uv run alembic revision --autogenerate -m "init"`

Apply migrations:
- `uv run alembic upgrade head`

## PostgreSQL deployment

The backend still defaults to SQLite locally, but the production path is now PostgreSQL-first:

- Startup schema creation only runs automatically for SQLite.
- Kubernetes deployments should run Alembic migrations before the app starts.
- The backend chart reads `DATABASE_URL` from a Kubernetes Secret.

Recommended layout when reusing the PostgreSQL server from GlitchTip:

- Reuse the same PostgreSQL server or cluster.
- Create a separate database for this backend.
- Create a separate backend database user.
- Do not share GlitchTip's database schema with this app.

Because CloudNativePG disables external superuser access by default, you can create the database and user by executing directly into the PostgreSQL primary pod:

```bash
# Execute into the primary pod to create the user and database
kubectl exec -it glitchtip-solid-pg-1 -- psql -c "CREATE USER solid_backend WITH LOGIN PASSWORD 'change-me';"
kubectl exec -it glitchtip-solid-pg-1 -- psql -c "CREATE DATABASE solid_backend OWNER solid_backend;"
```

Create a backend database secret:

```bash
kubectl create secret generic backend-db \
	--from-literal=DATABASE_URL='postgresql+psycopg://solid_backend:change-me@postgres-host:5432/solid_backend'
```

> **Note**: Be sure to replace `change-me` with your actual password and `postgres-host` with your actual PostgreSQL service hostname (e.g., `glitchtip-postgresql.default.svc.cluster.local`).

If you do not provide `database.existingSecret`, the chart creates its own secret from `database.url` in `values.yaml`. That is acceptable for local clusters, but not recommended for production because the database URL ends up in Helm-managed values.

The chart now runs a pre-install and pre-upgrade migration Job using `alembic upgrade head`, so schema changes are applied before the backend deployment rolls forward.

If the migration Job fails with `BackoffLimitExceeded`, check these first:

- The secret value must use the SQLAlchemy psycopg URL form: `postgresql+psycopg://...`, not just `postgresql://...`.
- Rebuild and reload the backend image after adding the PostgreSQL driver dependency:

```bash
docker build -t solid-backend:latest .
kind load docker-image solid-backend:latest --name solid-cluster
```

- The backend database user must have permission to create and alter tables for Alembic migrations.
- The secret must contain the key named `DATABASE_URL` unless you also override `database.existingSecretKey`.

Useful commands:

```bash
kubectl logs job/backend-backend-service-migrate --all-containers=true
kubectl describe job backend-backend-service-migrate
kubectl get secret backend-db -o jsonpath='{.data.DATABASE_URL}' | base64 -d; echo
```

For GlitchTip on a small VPS, Valkey/Redis is optional. Current GlitchTip docs state that setting `VALKEY_URL` to an empty string makes GlitchTip use PostgreSQL for its task queue, cache, and sessions. This is best paired with GlitchTip all-in-one mode for small, low-traffic deployments. For Kubernetes or higher-throughput setups, keep Valkey enabled.

Add traefik:
```bash
kubectl -n default create secret generic traefik-cloudflare-dns \
	--from-literal=CF_DNS_API_TOKEN='replace-with-cloudflare-api-token'

helm repo add traefik https://traefik.github.io/charts
helm repo update
helm upgrade --install traefik-solid traefik/traefik \
	-n default \
	-f ./k8s/traefik-values-production.yaml
```

Add prometheus:
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install monitoring prometheus-community/kube-prometheus-stack \
  --set grafana.persistence.enabled=true \
  --set grafana.persistence.size=10Gi \
  --set grafana.persistence.storageClassName=standard
```

Get Grafana password:
```bash
kubectl -n default get secret monitoring-grafana -o jsonpath="{.data.admin-password}" | base64 -d; echo
```

Add Loki (centralized logs):
```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm upgrade --install loki grafana/loki \
  -n default \
  -f ./k8s/loki-values.yaml

helm upgrade --install alloy grafana/alloy \
  -n default \
  -f ./k8s/alloy-values.yaml
```

If you already tried installing Loki with default chart values and got
`Please define loki.storage.bucketNames.chunk`, run:
```bash
helm uninstall loki -n default || true
helm upgrade --install loki grafana/loki \
  -n default \
  -f ./k8s/loki-values.yaml
```

Verify Loki + Alloy:
```bash
kubectl get pods -n default | grep -E 'loki|alloy'
ALLOY_POD=$(kubectl get pod -n default -l app.kubernetes.io/instance=alloy -o jsonpath='{.items[0].metadata.name}')
kubectl logs -n default "$ALLOY_POD" --tail=50
```

Add OpenTelemetry traces (Tempo + Collector):
```bash
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
helm repo update
helm upgrade --install tempo grafana/tempo -n default
helm upgrade --install otel-collector open-telemetry/opentelemetry-collector \
  -n default \
  -f ./k8s/otel-collector-values.yaml
```

Enable backend OTEL/log wiring from this repository chart:
```bash
helm upgrade --install backend ./k8s/backend-service \
  -f ./k8s/backend-service/values-observability.yaml
```

Grafana datasources to add:
- Loki (logs): `http://loki.default.svc.cluster.local:3100`
- Tempo (traces): `http://tempo.default.svc.cluster.local:3200`
- Use Grafana built-in `Tempo` datasource type (do not install Tempo plugin from Marketplace).

In Grafana Explore, query logs with labels like:
- `{namespace="default"}`
- `{app="solid-backend"}`

Traefik note:
- Backend, Collector, Loki, and Tempo communicate via internal Kubernetes Services (`*.svc.cluster.local`), not through Traefik.
- Use Traefik Ingress only for external browser access (for example Grafana at `monitoring.local`).

## Storage (Image Persistence)

The backend handles image downloads from Wikipedia and saves them locally. This follows SOLID's Dependency Inversion Principle, currently implemented using `LocalVolumeStorage`.

To accommodate this in Kubernetes (especially useful for lightweight k3s instances):
1. A **PersistentVolumeClaim (PVC)** is integrated directly via `./k8s/backend-service/templates/pvc.yaml`.
2. The `backend-service` Deployment automatically mounts this volume into the pod at `/app/data`.
3. You don't need any external service like MinIO or S3. Upon upgrading the helm chart, K8s creates and attaches the volume using its default storage class.
4. FastAPI serves these cached images persistently using `StaticFiles` mounted at the `/images` route.

Apply network config:
```bash
kubectl apply -f k8s/backend-service/templates/ingress.yaml
```

Troubleshooting (Grafana shows no app logs/traces):
```bash
# 1) Check pods are running
kubectl get pods -n default | grep -E 'loki|alloy|tempo|otel-collector|backend'

# 2) Check Alloy is forwarding logs
ALLOY_POD=$(kubectl get pod -n default -l app.kubernetes.io/instance=alloy -o jsonpath='{.items[0].metadata.name}')
kubectl logs -n default "$ALLOY_POD" --tail=100

# 3) Check Collector receives and exports traces
OTEL_POD=$(kubectl get pod -n default -l app.kubernetes.io/instance=otel-collector -o jsonpath='{.items[0].metadata.name}')
kubectl logs -n default "$OTEL_POD" --tail=100

# 4) Check backend has OTEL env vars
kubectl get deploy backend-backend-service -n default -o jsonpath='{.spec.template.spec.containers[0].env}'
```

Run bash inside a backend pod:
```bash
POD=$(kubectl get pod -n default -l app.kubernetes.io/name=backend-service,app.kubernetes.io/instance=backend -o jsonpath='{.items[0].metadata.name}')
kubectl exec -it "$POD" -- bash
```

If traces are still empty and backend rollout is stuck in `ImagePullBackOff`:
```bash
# Build image locally
docker build -t solid-backend:latest .

# Load image into kind node(s)
kind load docker-image solid-backend:latest --name solid-cluster

# Ensure chart uses local image and does not pull from Docker Hub
helm upgrade --install backend ./k8s/backend-service \
  -f ./k8s/backend-service/values-observability.yaml \
  --set image.repository=solid-backend \
  --set image.tag=latest \
  --set image.pullPolicy=IfNotPresent

# Restart deployment and wait
kubectl rollout restart deploy/backend-backend-service -n default
kubectl rollout status deploy/backend-backend-service -n default
```

Grafana checks:
- Verify Loki datasource URL is `http://loki.default.svc.cluster.local:3100`.
- Verify Tempo datasource URL is `http://tempo.default.svc.cluster.local:3200`.
- In Explore (Logs), start with `{namespace="default"}` then narrow to `{app="solid-backend"}`.
- In Explore (Traces), filter by service name `solid-backend`.

Add GlitchTip:
```bash
helm repo add glitchtip https://glitchtip.github.io/glitchtip-helm-chart/
helm repo add cnpg https://cloudnative-pg.github.io/charts
helm repo update
helm install cnpg cnpg/cloudnative-pg
helm upgrade --install glitchtip-solid glitchtip/glitchtip \
  --set postgresql.enabled=true \
  --set redis.enabled=true \
  --set glitchtip.secretKey="$SECRET_KEY" \
  --set glitchtip.domain="http://glitchtip.local"

kubectl create secret generic glitchtip-secret \
  --from-literal=GLITCHTIP_DSN='YOUR_REAL_GLITCHTIP_DSN_HERE<use service DNS host name e.g. glitchtip-solid-web.default.svc.cluster.local instead of glitchtip.local>'
```
