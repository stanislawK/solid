# k8s/ — chart & release inventory

Deployment runbooks: [docs/deploy-local.md](../docs/deploy-local.md) ·
[docs/deploy-production.md](../docs/deploy-production.md). Deploy vocabulary
lives in [scripts/deploy.sh](../scripts/deploy.sh) + `scripts/deploy-lib.sh`
(`make deploy TARGET=… ENV=…`).

## Layout

```
k8s/
  backend-service/    # app chart: values.yaml (+ values-observability.yaml overlay), values-production.yaml
  frontend-service/   # app chart: values.yaml, values-production.yaml
  traefik/            # values-local.yaml, values-production.yaml
  postgresql/         # values-production.yaml (Bitnami chart, prod only)
  alloy/              # values-local.yaml, values-production.yaml
  loki/               # values-local.yaml (local only)
  tempo/              # values-local.yaml (local only)
```

## Release inventory

| Release | Chart | Local | Prod | Purpose |
|---|---|:-:|:-:|---|
| `backend` | `k8s/backend-service` | ✅ | ✅ | FastAPI app (+ pre-upgrade migration Job, PVC) |
| `frontend` | `k8s/frontend-service` | ✅ | ✅ | React/Vite UI |
| `traefik-solid` | `traefik/traefik` | ✅ | ✅ | Ingress (prod: Cloudflare DNS-01 + Let's Encrypt) |
| `backend-postgresql` | `bitnami/postgresql` | ➖ | ✅ | Database (local uses SQLite on the PVC) |
| `alloy` | `grafana/alloy` | ✅ | ✅ | Telemetry collector (local → Loki/Tempo; prod → Grafana Cloud) |
| `loki` | `grafana/loki` | ✅ | ➖ | Logs (prod logs go to Grafana Cloud) |
| `tempo` | `grafana/tempo` | ✅ | ➖ | Traces (prod traces go to Grafana Cloud) |

Local: **~6 releases**. Prod: **5 releases** (backend, frontend, traefik-solid,
backend-postgresql, alloy). GlitchTip/kube-prometheus-stack/OTel-Collector are
no longer part of the stack — re-add GlitchTip via
[docs/glitchtip.md](../docs/glitchtip.md).

## Naming convention

The two app charts use **fixed, simple object names** (`backend` release →
`backend-backend-service`; frontend → `frontend-deployment` / `frontend-service`
/ `frontend-ingress`) rather than full Helm `fullname` templating. These charts
are single-purpose and single-instance, so fixed names are intentional — do not
"Helm-ify" them, since renaming live objects is a delete-and-recreate of the
prod Deployment/Service.
