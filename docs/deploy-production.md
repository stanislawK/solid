# Production deployment (single ARM64 VPS, k3s)

Production runs on one ARM64 Hetzner-class VPS with k3s, Cloudflare in front of
Traefik, in-cluster PostgreSQL, and **Grafana Alloy → Grafana Cloud** for
telemetry (no self-hosted Grafana/Loki/Tempo/Prometheus).

Frontend and backend share one hostname: frontend on `/`, backend on `/api`
(same-origin, so no broad CORS needed).

The server needs `docker`, `kubectl`, `helm`, `k3s`, and `sudo k3s ctr images import`.

## Config sources

| What | Where | Notes |
|---|---|---|
| Secrets (JWT, session, GCP, Postgres, Grafana Cloud) | server-local env file → `make bootstrap-secrets` | never committed |
| App config (hostnames, CORS, flags) | `solid-prod.env` at repo root, mapped into Helm `--set-string app.*` | `APP_ENV_FILE` overrides the path |
| Chart/infra values | `k8s/*/values-production.yaml` | committed (placeholders for the domain) |

> The app pod does **not** read `solid-prod.env` from disk — those values are
> injected into the Helm release at deploy time. Alternatively, set the real
> domain directly in `k8s/backend-service/values-production.yaml`.

## One-time setup

### 1. Fill in the production values

Replace placeholders (`example.com`, Let's Encrypt email, storage class) in:
`k8s/traefik/values-production.yaml`, `k8s/backend-service/values-production.yaml`,
`k8s/frontend-service/values-production.yaml`, `k8s/postgresql/values-production.yaml`.

### 2. Traefik (Cloudflare DNS-01 + Let's Encrypt)

```bash
kubectl -n default create secret generic traefik-cloudflare-dns \
  --from-literal=CF_DNS_API_TOKEN='<cloudflare-api-token>'   # scope: Zone:DNS:Edit, Zone:Zone:Read

helm repo add traefik https://traefik.github.io/charts
helm repo update
helm upgrade --install traefik-solid traefik/traefik -n default \
  -f k8s/traefik/values-production.yaml
```

Traefik obtains and renews the certificate automatically via the Cloudflare DNS
challenge, storing it in `/data/acme.json` on its PVC. Firewall: allow `80`/`443`
from Cloudflare IP ranges only; do not expose the dashboard.

Verify:
```bash
kubectl get ingressclass
kubectl -n default get svc traefik-solid
kubectl -n default logs deploy/traefik-solid --tail=100 | grep -i acme
```

### 3. Secrets

```bash
cp scripts/prod-secrets.env.example /root/solid-prod-secrets.env   # then edit
SECRETS_ENV_FILE=/root/solid-prod-secrets.env make bootstrap-secrets ENV=prod
```

Creates/updates `backend-postgres-auth`, `backend-db`, `backend-auth`, and
(when the `GRAFANA_CLOUD_*` values are set) `grafana-cloud-auth`.

### 4. PostgreSQL

The database is deployed **independently of app deploys** so a routine app
rollout can never disrupt it. Run this only for the initial install or when you
intentionally change DB version/values:

```bash
DRY_RUN=1 make deploy-postgres ENV=prod    # preview
make deploy-postgres ENV=prod
```

## Per-deploy (the two commands you actually run)

```bash
# Preview first — DRY_RUN=1 adds --dry-run=client (no changes):
DRY_RUN=1 make deploy TARGET=all ENV=prod

# Then deploy (build ARM64 image -> import into k3s -> helm upgrade):
make deploy TARGET=all ENV=prod            # or TARGET=backend | frontend
```

Images are tagged with the git short SHA automatically. To re-apply Helm config
without rebuilding the image:

```bash
make reapply TARGET=backend ENV=prod
```

App deploys run a pre-flight check that the `backend-postgresql` statefulset
exists (they no longer deploy Postgres themselves) and a pre-upgrade Alembic
migration Job (`alembic upgrade head`) before the new pods roll forward.

## Verify after every deploy

```bash
kubectl -n default rollout status deploy/backend-backend-service
kubectl -n default rollout status deploy/frontend-deployment
curl -sf https://<your-host>/api/health          # {"status":"ok"}
# logs/traces: Grafana Cloud Explore -> {app="solid-backend"}
```

## Rollback

```bash
helm history backend -n default                  # find the last-good REVISION
helm rollback backend <revision> -n default
```

The two PVCs (`backend-backend-service-data` and the Postgres PVC) must never be
deleted or appear in a deploy diff. If they do, stop.

## Delete the backend (careful — keeps the PVC unless you delete it)

```bash
kubectl -n default scale deployment/backend-backend-service --replicas=0 || true
helm -n default uninstall backend
kubectl -n default delete pvc backend-backend-service-data --ignore-not-found   # destroys data
```

## Production observability (Grafana Cloud)

Alloy pushes logs, traces, and metrics to the Grafana Cloud free tier.

1. Create a Grafana Cloud account and an access policy token with `traces:write`,
   `logs:write`, `metrics:write`.
2. Put the `GRAFANA_CLOUD_*` URLs + token into your secrets env file.
3. `make bootstrap-secrets ENV=prod` creates the `grafana-cloud-auth` secret.
4. `make deploy TARGET=all ENV=prod` deploys Alloy
   (`k8s/alloy/values-production.yaml`) and wires the backend.

In Grafana Cloud Explore: `{app="solid-backend"}` for logs, service name
`solid-backend` for traces.

## Maintenance — reclaim disk on the VPS

```bash
docker image prune -a
docker builder prune
crictl rmi --prune            # containerd image GC (k3s)
```
