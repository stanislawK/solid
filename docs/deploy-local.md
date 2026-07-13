# Local deployment (kind + Helm)

Local development runs everything inside a single-node [kind](https://kind.sigs.k8s.io/)
cluster. The topology mirrors production: **app → Alloy → Loki/Tempo** (locally
Loki + Tempo run in-cluster; in production Alloy ships to Grafana Cloud).

Prerequisites: `docker`, `kubectl`, `kind`, `helm`.

## 1. Cluster + ingress (one-time)

```bash
kind create cluster --name solid-cluster

# Traefik ingress controller (ingress class: traefik-solid)
helm repo add traefik https://traefik.github.io/charts
helm repo update
helm upgrade --install traefik-solid traefik/traefik -n default \
  -f k8s/traefik/values-local.yaml
```

## 2. Observability stack (optional, one-time)

Only Loki (logs) and Tempo (traces) run locally; Alloy collects both and also
receives app OTLP traces (it replaces the old standalone OTel Collector).

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm upgrade --install loki  grafana/loki  -n default -f k8s/loki/values-local.yaml
helm upgrade --install tempo grafana/tempo -n default -f k8s/tempo/values-local.yaml
helm upgrade --install alloy grafana/alloy -n default -f k8s/alloy/values-local.yaml
```

Local metrics dashboards (kube-prometheus-stack) are intentionally not part of
the local stack — production metrics live in Grafana Cloud, so a local
Prometheus verifies nothing about production.

## 3. Deploy the app

```bash
make deploy TARGET=backend  ENV=local    # build image (git-SHA tag) + kind load + helm upgrade
make deploy TARGET=frontend ENV=local
# or both at once:
make deploy TARGET=all ENV=local
```

To wire the backend to the local observability stack, deploy it with the
observability overlay (sets `OTEL_ENABLED=true`, exporting to Alloy):

```bash
helm upgrade --install backend k8s/backend-service \
  -f k8s/backend-service/values.yaml \
  -f k8s/backend-service/values-observability.yaml
```

Re-apply Helm config without rebuilding the image:

```bash
make reapply TARGET=backend ENV=local
```

The backend chart creates a PVC (`backend-backend-service-data`, mounted at
`/app/data`) that persists downloaded images and the SQLite database across
redeploys. No MinIO/S3 needed.

## 4. Access

```bash
make expose-backend        # kubectl port-forward svc/traefik-solid 8080:80
```

- UI: <http://localhost:8080/>
- API: <http://localhost:8080/api/> (health: `curl http://localhost:8080/api/health`)

## Start / stop the cluster workloads

```bash
make stop-pods    # scale all deploys/statefulsets to 0, pause the alloy daemonset
make start-pods   # scale back to 1, unpause
```

## Troubleshooting (Grafana shows no logs/traces)

```bash
# pods running?
kubectl get pods -n default | grep -E 'loki|alloy|tempo|backend'

# Alloy config healthy + forwarding? (look for level=error)
ALLOY_POD=$(kubectl get pod -n default -l app.kubernetes.io/name=alloy -o jsonpath='{.items[0].metadata.name}')
kubectl logs -n default "$ALLOY_POD" --tail=100

# backend has OTEL env vars?
kubectl get deploy backend-backend-service -n default \
  -o jsonpath='{.spec.template.spec.containers[0].env}'
```

Grafana datasource URLs:
- Loki: `http://loki.default.svc.cluster.local:3100`
- Tempo: `http://tempo.default.svc.cluster.local:3200`

In Explore, start with `{namespace="default"}`, narrow to `{app="solid-backend"}`;
for traces filter by service name `solid-backend`.
