# Re-adding GlitchTip (error tracking)

GlitchTip wiring was removed from the charts/scripts because it was disabled in
every environment. The **Sentry SDK in `app/` is still present and inert** — it
activates automatically once a `GLITCHTIP_DSN` env var is provided. This is the
step-by-step to bring GlitchTip back.

There are two independent parts: (1) run a GlitchTip instance, and (2) re-wire
the backend to report to it. You can do either or both.

---

## Part 1 — Run GlitchTip in the cluster

GlitchTip needs PostgreSQL. These commands install the CloudNativePG operator
and GlitchTip (with its own Postgres + Redis):

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
```

Open the GlitchTip web UI, create an organization/project, and copy its DSN. Use
the in-cluster service host for the DSN the backend will use, e.g.
`glitchtip-solid-web.default.svc.cluster.local` (not `glitchtip.local`).

On a small VPS you can set `VALKEY_URL=""` so GlitchTip uses PostgreSQL for its
queue/cache instead of running Redis.

## Create the DSN secret

```bash
kubectl -n default create secret generic glitchtip-secret \
  --from-literal=GLITCHTIP_DSN='<your-real-glitchtip-dsn>'
```

For production, add `GLITCHTIP_DSN=` back to your secrets env file and let
`prod-bootstrap-secrets.sh` create the secret (see Part 3).

---

## Part 2 — Re-wire the backend chart

Restore the three chart edits below, then redeploy
(`make deploy TARGET=backend ENV=<env>`).

### a) `k8s/backend-service/values.yaml` — add under `observability:`

```yaml
observability:
  # ...otel, logs...
  glitchtip:
    enabled: false            # set true (or override per-env) to inject the DSN
    existingSecret: "glitchtip-secret"
    existingSecretKey: "GLITCHTIP_DSN"
```

Do the same in `k8s/backend-service/values-production.yaml` and set
`observability.glitchtip.enabled: true` where you want it active.

### b) `k8s/backend-service/templates/deployment.yaml` — first entry under `env:`

```yaml
          env:
            {{- if .Values.observability.glitchtip.enabled }}
            - name: GLITCHTIP_DSN
              valueFrom:
                secretKeyRef:
                  name: {{ .Values.observability.glitchtip.existingSecret }}
                  key: {{ .Values.observability.glitchtip.existingSecretKey }}
            {{- end }}
            - name: ENVIRONMENT
            # ...rest of env...
```

### c) (optional) `k8s/backend-service/templates/ingress.yaml` — expose the GlitchTip UI

Add the host rule back (before the final `{{- end }}`) and the matching
`ingress.glitchtip` values (`enabled`, `host`):

```yaml
  {{- if .Values.ingress.glitchtip.enabled }}
  - host: {{ .Values.ingress.glitchtip.host | quote }}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: glitchtip-solid-web
            port:
              number: 80
  {{- end }}
```

Verify the render before shipping:
```bash
helm template backend k8s/backend-service --set observability.glitchtip.enabled=true \
  | grep -A6 GLITCHTIP_DSN
```

---

## Part 3 — Production secrets plumbing (optional)

To have `make bootstrap-secrets ENV=prod` manage the DSN secret again:

1. Add `GLITCHTIP_DSN=` to `scripts/prod-secrets.env.example` (and your real
   server-local secrets file).
2. Restore this block in `scripts/prod-bootstrap-secrets.sh` (before the
   `grafana_cloud_args=()` line):

```bash
if [[ -n "${GLITCHTIP_DSN:-}" ]]; then
  kubectl -n "$KUBE_NAMESPACE" create secret generic glitchtip-secret \
    --from-literal=GLITCHTIP_DSN="$GLITCHTIP_DSN" \
    --dry-run=client -o yaml | kubectl apply -f -
else
  echo "GLITCHTIP_DSN not set; skipping glitchtip-secret creation."
fi
```

---

## Verify it works

After redeploying with `glitchtip.enabled=true`:

```bash
kubectl -n default get deploy backend-backend-service \
  -o jsonpath='{.spec.template.spec.containers[0].env}' | tr ',' '\n' | grep -A2 GLITCHTIP
```

Trigger a handled error in the app and confirm the event appears in the
GlitchTip project dashboard.
