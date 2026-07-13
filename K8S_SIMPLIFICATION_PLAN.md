# Kubernetes Deployment Audit & Simplification Plan

Audit date: 2026-07-05. Scope: `k8s/`, `scripts/`, `Makefile`, deployment sections of `README.md`.

## 1. Current state (what actually exists)

Two environments, deployed by two unrelated toolchains:

| | Local (kind) | Production (single ARM64 VPS, k3s) |
|---|---|---|
| App charts | `k8s/backend-service`, `k8s/frontend-service` | same charts, `values-production.yaml` overrides |
| Database | SQLite on the backend PVC | Bitnami PostgreSQL (chart pinned in `scripts/prod-common.sh`) |
| Ingress | Traefik (`k8s/backend-service/traefik-values.yaml`) | Traefik + Cloudflare DNS-01 Let's Encrypt (`k8s/traefik-values-production.yaml`) |
| Observability | **6 Helm releases**: kube-prometheus-stack, Loki, Alloy, Tempo, OTel Collector, GlitchTip (+ CNPG operator) | **1 release**: Alloy → Grafana Cloud (logs, traces, metrics) |
| Deploy tooling | `Makefile` (redeploy-*, start/stop-pods, expose-backend) | 7 bash scripts in `scripts/` + `prod-common.sh` |
| Config source | chart `values.yaml` | `values-production.yaml` **plus** `solid-prod.env` re-injected via 11 `--set-string` flags |

Helm releases a newcomer must understand to run the *local* stack: **9–10**
(backend, frontend, traefik-solid, monitoring, loki, alloy, tempo, otel-collector, glitchtip-solid, cnpg).
Production needs 5 (backend, frontend, traefik-solid, backend-postgresql, alloy).

## 2. Findings

Ordered by how much complexity each one causes.

### F1. The local observability stack is 6 releases doing what production does with 1
Production proves the simple shape works: app → Alloy (OTLP receiver + log scraper) → backend storage.
Locally the same job is spread over kube-prometheus-stack, Loki, Alloy, Tempo, **and** a separate
OTel Collector whose only role (`k8s/otel-collector-values.yaml`) is to relay OTLP to Tempo — a relay
Alloy already performs in production (`k8s/alloy-values-production.yaml` has the identical
`otelcol.receiver.otlp` block). The OTel Collector release is pure duplication.

### F2. `make start-pods` / `stop-pods` is ~75 lines of Makefile shell that exists only to babysit F1
It patches Prometheus/Alertmanager CRs, CNPG clusters, and pauses DaemonSets via a fake
`nodeSelector` — all workarounds for the operator-managed workloads in the local observability zoo.
Shrink the zoo and this collapses to one `kubectl scale` loop.

### F3. GlitchTip is disabled everywhere but wired through everything
`observability.glitchtip.enabled: false` and `ingress.glitchtip.enabled: false` in *both* values
files, yet GlitchTip support appears in: chart values, `deployment.yaml` env block, `ingress.yaml`
host rule, `prod-bootstrap-secrets.sh`, `prod-secrets.env.example`, the Makefile release list
(`glitchtip-solid`, `cnpg`), and ~80 lines of README. Dead weight on every read.

### F4. Dead chart scaffolding from `helm create`
Confirmed by rendering the chart (`helm template`):
- `templates/httproute.yaml` + 40 lines of `httpRoute:` values — never enabled; both Traefik values files set `providers.kubernetesGateway.enabled: false`.
- `templates/hpa.yaml` + `autoscaling:` values — disabled in both environments; meaningless on a single-node VPS.
- `templates/tests/test-connection.yaml` — a busybox `wget` test pod that ships with every install.
- `values.yaml` is 221 lines; roughly half is scaffold comments and never-used knobs (`volumes`, `volumeMounts`, `nodeSelector`, `tolerations`, `affinity`, `podLabels`…).

### F5. Two deploy toolchains with different vocabularies
Local: `make redeploy-backend` (docker build → `kind load` → rollout restart, tag always `latest`).
Prod: `scripts/prod-deploy-backend.sh` (docker build → `docker save`/`k3s ctr import` → helm upgrade, tag = git SHA).
Same intent, zero shared code, different image-tagging strategies, different names. A reader must
learn both.

### F6. Production config flows through three layers
`values-production.yaml` holds placeholders (`example.com`), the real values live in unversioned
`solid-prod.env`, and `deploy_backend_release()` in `prod-common.sh` re-plumbs **11 app settings**
into `helm --set-string`. Consequences: the committed values file is misleading, `helm get values`
on the cluster is the only source of truth, and every new app setting must be added in three places
(values.yaml → deployment.yaml env → prod-common.sh).

### F7. PostgreSQL is helm-upgraded on every backend deploy
`prod-deploy-backend.sh` and `prod-reapply-backend.sh` both run `deploy_postgres_release`.
Routinely re-upgrading the database chart during app deploys is the riskiest habit in the setup:
a Bitnami chart default change or a values typo takes the DB down together with an app rollout.

### F8. Chart hygiene issues (small, but real traps)
- `backend-service/templates/ingress.yaml:36` hardcodes the service name `backend-backend-service` — the chart silently breaks if released under any name other than `backend`.
- The backend chart's ingress also routes `monitoring.local` (Grafana) and `glitchtip.local` — cluster-level routing concerns embedded in an app chart.
- `middleware.yaml` renders unconditionally (confirmed via `helm template`) even with `ingress.enabled: false`, and uses fixed names `api-stripprefix` / `api-security-headers`.
- The frontend chart hardcodes `frontend-deployment` / `frontend-service` / `frontend-ingress` and ignores Helm labels/helpers entirely — inconsistent with the backend chart (pick one style; see Phase 4).
- `k8s/traefik-values-production.yaml` repeats the 22 Cloudflare IP ranges twice (web + websecure).
- Local Traefik values live *inside* the backend chart directory (`k8s/backend-service/traefik-values.yaml`) while prod Traefik values live at `k8s/`.
- `k8s/alloy-values.yaml` and `k8s/alloy-values-production.yaml` duplicate ~40 identical lines of discovery/relabel rules.

### F9. Deployment documentation is a single 576-line README
Local quickstart, prod runbook, GlitchTip recipes, Postgres-sharing notes and TLS setup are
interleaved; there is no place that says "to deploy prod, run X".

### What is already good (keep as-is)
- Migration handling: pre-upgrade Helm hook Job with `--wait` is the right pattern.
- Secret handling: bootstrap script + `existingSecret` references; no secrets in values files.
- `prod-bootstrap-secrets.sh` reusing existing Postgres credentials is thoughtful.
- Traefik hardening (Cloudflare-only trusted IPs, no public dashboard, security-headers middleware).
- Pinned Postgres chart version, `--wait` + rollout-status gates in the deploy scripts.

---

## 3. Simplification plan

Principles: **production behavior must not change unless a phase explicitly says so**; every phase
is independently shippable and verified before the next; anything touching prod has a rollback line.

### Phase 0 — Safety net (do first, no changes)

1. Snapshot live state on both clusters:
   ```bash
   helm list -A > snapshot-releases.txt
   for r in backend frontend traefik-solid backend-postgresql alloy; do
     helm get values "$r" > "snapshot-values-$r.yaml"
     helm get manifest "$r" > "snapshot-manifest-$r.yaml"
   done
   kubectl get deploy,sts,svc,ingress,secret,pvc -o wide > snapshot-objects.txt
   ```
   Keep snapshots outside the repo (they may contain hostnames you don't want committed — secrets
   themselves are not included in `helm get values` here, but check before storing).
2. Install the `helm-diff` plugin on the VPS and locally: `helm plugin install https://github.com/databus23/helm-diff`.
   Every later phase uses `helm diff upgrade …` as the gate: **if the diff shows anything you did
   not intend, stop.**
3. Baseline render for offline comparison:
   ```bash
   helm template backend k8s/backend-service -f k8s/backend-service/values-production.yaml > /tmp/baseline-backend.yaml
   helm template frontend k8s/frontend-service -f k8s/frontend-service/values-production.yaml > /tmp/baseline-frontend.yaml
   ```

### Phase 1 — Delete dead code (no runtime change, verified by identical rendering)

Target: rendered manifests are **byte-identical** to the Phase 0 baseline, except resources that
never rendered anyway or that we deliberately drop (test pod).

1. Delete `templates/httproute.yaml` and the `httpRoute:` block from `values.yaml`.
2. Delete `templates/hpa.yaml` and the `autoscaling:` block from both values files; remove the
   `{{- if not .Values.autoscaling.enabled }}` guard around `replicas:` in `deployment.yaml`.
3. Delete `templates/tests/test-connection.yaml` (only affects `helm test`, which nothing runs).
4. Strip `values.yaml` scaffold comments and unused knobs (`podLabels`, `volumes`, `volumeMounts`,
   `nodeSelector`, `tolerations`, `affinity`, `nameOverride`/`fullnameOverride` if unused). Keep
   `imagePullSecrets` only if you foresee a private registry. Target: ~90 lines with meaningful
   comments only.
5. GlitchTip — **decision point**: it is disabled in all committed values, but confirm nothing in
   the local cluster still depends on the `glitchtip-solid`/`cnpg` releases
   (`helm list | grep -E 'glitchtip|cnpg'`). If unused, remove in one sweep:
   - `observability.glitchtip.*` values + the `GLITCHTIP_DSN` env block in `deployment.yaml`
   - `ingress.glitchtip.*` + the glitchtip host rule in `ingress.yaml`
   - glitchtip section of `prod-bootstrap-secrets.sh` and `prod-secrets.env.example`
   - `glitchtip-solid` and `cnpg` from the Makefile release lists
   - GlitchTip sections of the README
   (Sentry-SDK wiring in `app/` can stay; it is inert without a DSN.)
6. Verify: `helm template … | diff` against baseline → only expected deletions.
   `helm diff upgrade backend k8s/backend-service -f …values-production.yaml` on the VPS → shows
   only the removed (never-rendered) resources, i.e. effectively empty. Then
   `scripts/prod-reapply-backend.sh` at a quiet time; `curl https://<host>/api/health`.
   Rollback: `helm rollback backend <prev>`.

### Phase 2 — Shrink the local observability stack to the production shape (local only)

Goal: local topology mirrors prod (app → Alloy → storage), removing 2–3 releases.

1. Drop the **OTel Collector** release. Port the `otelcol.receiver.otlp` / `batch` / exporter
   blocks from `alloy-values-production.yaml` into `alloy-values.yaml`, exporting traces to
   `tempo.default.svc.cluster.local:4317`. Point
   `values-observability.yaml → observability.otel.exporter.endpoint` at
   `http://alloy.default.svc.cluster.local:4318`. Delete `k8s/otel-collector-values.yaml`.
   Now the *only* config difference between local and prod Alloy is the write destination —
   which also makes the two Alloy values files trivially diffable.
2. **Decision point — kube-prometheus-stack locally.** It is the main driver of the
   start/stop-pods CR-patching logic and by far the heaviest release. Options:
   - (a) Remove it; keep Grafana only (`grafana/grafana` single release) with Loki + Tempo
     datasources. You lose local Prometheus metrics dashboards — acceptable if you mostly use
     logs + traces locally (metrics are Grafana-Cloud-only in prod anyway).
   - (b) Keep it and accept the extra Makefile logic.
   Recommendation: (a) — prod observability is Grafana Cloud, so local Prometheus verifies
   nothing about production.
3. Rewrite `start-pods`/`stop-pods` for the remaining releases. Without operator CRs it becomes:
   ```make
   stop-pods:
   	kubectl scale deploy,sts --all --replicas=0 -n default
   ```
   (plus the DaemonSet pause for Alloy if you still want it). ~75 lines → ~10.
4. Verify locally: redeploy backend with `values-observability.yaml`, generate traffic, confirm
   traces in Tempo and logs in Loki through Grafana. No prod involvement at all.

### Phase 3 — One config path and one deploy vocabulary

3a. **Make `values-production.yaml` the single source of prod app config.**
   The 11 env-var overrides in `deploy_backend_release()` exist only because real hostnames were
   kept out of the repo. Domain names, CORS origins and flags are not secrets (they are public in
   every HTTP response). Either:
   - commit the real values into `values-production.yaml` (recommended — `helm get values backend`
     shows you the exact current values to copy), or
   - if you truly don't want the domain in git, keep **one** untracked
     `k8s/backend-service/values-production-real.yaml` layered with a second `-f` flag.
   Then delete the `--set-string app.*` plumbing from `prod-common.sh`. Adding a future app setting
   touches two places (values + deployment.yaml) instead of three.
   Verify: `helm diff upgrade` must be **empty** (same values now come from the file). This is the
   phase most worth double-checking — an empty diff proves nothing changed.

3b. **Decouple Postgres from app deploys.** Remove `deploy_postgres_release`/`wait_for_postgres_rollout`
   from `prod-deploy-backend.sh`, `prod-reapply-backend.sh` and the combined scripts; keep
   `ensure_postgres_bootstrap_secret` as a pre-flight check plus a cheap
   `kubectl get sts backend-postgresql` liveness check. Add a dedicated `scripts/prod-deploy-postgres.sh`
   run only when you intentionally change DB config/version. App deploys can no longer surprise
   the database.

3c. **Collapse the 7 prod scripts + Makefile into one entry point.** The scripts are already
   compositions of `prod-common.sh` functions; expose them as make targets so both environments
   share one vocabulary:
   ```
   make deploy TARGET=backend ENV=prod    # was scripts/prod-deploy-backend.sh
   make deploy TARGET=frontend ENV=local  # was make redeploy-frontend
   make reapply TARGET=backend ENV=prod   # helm upgrade, no image build
   make bootstrap-secrets ENV=prod
   ```
   Implementation: keep `prod-common.sh` (rename `scripts/deploy-lib.sh`), add a `local` image-load
   path (`kind load`) beside the `k3s ctr import` path, delete the 6 thin wrapper scripts.
   Also fix the local/prod inconsistency where local always deploys `:latest` — use the git-SHA tag
   in both (kind works fine with unique tags, and rollbacks become possible locally too).

### Phase 4 — Chart hygiene (some prod object renames; do in a quiet window)

Ordered from safe to needs-care:

1. `ingress.yaml`: replace hardcoded `backend-backend-service` with
   `{{ include "backend-service.fullname" . }}` — renders identically today (release is named
   `backend`), removes the trap. Verify with `helm diff` (must be empty).
2. Gate `middleware.yaml` behind `{{- if .Values.ingress.enabled }}`.
3. Remove the `monitoring.local` / `glitchtip.local` host rules from the backend chart's ingress
   (both disabled; if local Grafana routing is still wanted after Phase 2, give Grafana its own
   tiny ingress manifest under `k8s/grafana/` instead of hiding it in the backend chart).
4. Deduplicate the Cloudflare CIDR list in `k8s/traefik-values-production.yaml` with a YAML anchor
   (`x-cloudflare-ips: &cf [...]` / `trustedIPs: *cf`). Verify: `helm diff upgrade traefik-solid …` empty.
5. Normalize file layout so every component looks the same:
   ```
   k8s/
     backend-service/   # chart: values.yaml + values-production.yaml
     frontend-service/  # chart: values.yaml + values-production.yaml
     traefik/           # values-local.yaml + values-production.yaml
     postgresql/        # values-production.yaml
     alloy/             # values-local.yaml + values-production.yaml
     loki/              # values-local.yaml
     tempo/             # (add the currently-implicit `helm upgrade --install tempo grafana/tempo` values here, even if empty, so the release list is discoverable from the tree)
   ```
   Moves only — update paths in Makefile/scripts/README; no manifest changes.
6. **Optional / explicitly risky — skip unless it bothers you:** aligning the frontend chart with
   Helm conventions (helpers, `fullname`-based names) renames `frontend-deployment` →
   `frontend-frontend-service` etc. Helm handles rename-as-replace, but it is a
   delete-and-recreate of the prod Deployment/Service (brief 404s while the new ingress backend
   comes up). The cheaper consistency move is the opposite direction: the charts are
   single-purpose, so fixed, simple names are fine — just make that an explicit convention and
   leave runtime objects untouched.

### Phase 5 — Documentation

1. Split deployment docs out of the README:
   - `docs/deploy-local.md` — kind quickstart: create cluster → traefik → observability (short list) → `make deploy TARGET=… ENV=local`.
   - `docs/deploy-production.md` — VPS runbook: one-time setup (traefik, secrets bootstrap, postgres) then the two commands you actually run per deploy, plus rollback (`helm rollback`) and the verification commands.
   README keeps a 10-line summary linking to both.
2. Add `k8s/README.md` (~20 lines): the release inventory table from §1 of this document, kept current.

---

## 4. Expected end state

| Metric | Before | After |
|---|---|---|
| Local Helm releases | 9–10 | 5–6 (backend, frontend, traefik, loki, tempo, alloy [+ grafana]) |
| Deploy entry points | Makefile targets **+** 7 shell scripts | one Makefile vocabulary + 1–2 scripts |
| `backend-service/values.yaml` | 221 lines | ~90 lines, all meaningful |
| Backend chart templates | 12 files (3 never render) | 9 files, all in use |
| Places to add one app setting | 3 | 2 |
| `start/stop-pods` logic | ~75 lines patching 4 CRD types | ~10 lines |
| Prod DB touched on app deploy | every time | only via dedicated script |
| Config source of truth (prod) | values ⊕ env-file ⊕ `--set` flags | values files |

## 5. Standing safety rules for the whole effort

- One phase per PR/commit; never mix a refactor with a behavior change.
- `helm diff upgrade` before every prod `helm upgrade`; an unexpected line = stop.
- Never run a phase against prod before it has run against the kind cluster.
- After every prod apply: `kubectl rollout status`, `curl https://<host>/api/health`, check logs in Grafana Cloud.
- Rollback is always `helm rollback <release> <revision>`; know the revision (`helm history`) before you upgrade.
- The PVC (`backend-backend-service-data`) and the Postgres PVC must never appear in any diff. If they do, stop.
