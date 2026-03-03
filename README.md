
# Solid API

FastAPI service for managing plant data, enriched from Wikipedia and summarized with Gemini.

## Features

- FastAPI with built-in docs enabled at `/docs` and `/redoc`
- SQLite database via SQLAlchemy 2.0 ORM (Declarative Mapping)
- Pydantic v2 schemas for request/response validation
- Plant CRUD and Wikipedia-driven plant creation
- External data fetching via `curl_cffi` with browser impersonation
- SOLID-inspired architecture (repositories, services, protocols)

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

This chart targets a local kind cluster with an image loaded via `kind load docker-image`.

Scale down:
- `kubectl scale deploy/solid-backend --replicas=0`

Scale up:
- `kubectl scale deploy/solid-backend --replicas=1`

Install or upgrade the chart:
- `helm upgrade --install backend ./k8s/backend-service`

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

Add traefik:
```bash
helm repo add traefik https://traefik.github.io/charts
helm repo update
helm install traefik-solid traefik/traefik
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
