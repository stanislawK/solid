#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)

# Deployment environment: "prod" (k3s VPS) or "local" (kind cluster).
: "${DEPLOY_ENV:=prod}"

: "${KUBE_NAMESPACE:=default}"
: "${KIND_CLUSTER:=solid-cluster}"
: "${BACKEND_RELEASE:=backend}"
: "${FRONTEND_RELEASE:=frontend}"
: "${POSTGRES_RELEASE:=backend-postgresql}"
: "${BACKEND_DEPLOYMENT_NAME:=${BACKEND_RELEASE}-backend-service}"
: "${FRONTEND_DEPLOYMENT_NAME:=frontend-deployment}"
: "${POSTGRES_STATEFULSET_NAME:=backend-postgresql}"

# Config source per environment. Local uses the chart defaults; prod layers the
# production values file (real app.* values are still injected via env below).
if [[ "$DEPLOY_ENV" == "local" ]]; then
  : "${BACKEND_VALUES_FILE:=$REPO_ROOT/k8s/backend-service/values.yaml}"
  : "${FRONTEND_VALUES_FILE:=$REPO_ROOT/k8s/frontend-service/values.yaml}"
  : "${BUILD_PLATFORM:=}"
else
  : "${BACKEND_VALUES_FILE:=$REPO_ROOT/k8s/backend-service/values-production.yaml}"
  : "${FRONTEND_VALUES_FILE:=$REPO_ROOT/k8s/frontend-service/values-production.yaml}"
  : "${BUILD_PLATFORM:=linux/arm64}"
fi

: "${POSTGRES_VALUES_FILE:=$REPO_ROOT/k8s/postgresql/values-production.yaml}"
: "${BACKEND_IMAGE_REPOSITORY:=solid-backend}"
: "${FRONTEND_IMAGE_REPOSITORY:=solid-frontend}"
: "${POSTGRES_CHART:=bitnami/postgresql}"
: "${POSTGRES_CHART_VERSION:=18.5.15}"
: "${POSTGRES_FULLNAME_OVERRIDE:=backend-postgresql}"
: "${POSTGRES_SECRET_NAME:=backend-postgres-auth}"
: "${POSTGRES_USERNAME:=solidapp}"
: "${POSTGRES_DATABASE:=solid}"
: "${POSTGRES_SERVICE_NAME:=$POSTGRES_FULLNAME_OVERRIDE}"
: "${POSTGRES_SERVICE_PORT:=5432}"
# Both environments tag images with the short git SHA (unique + rollback-able).
: "${IMAGE_TAG:=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
: "${HELM_TIMEOUT:=5m}"
: "${ROLLOUT_TIMEOUT:=180s}"
: "${K3S_BIN:=k3s}"
: "${K3S_SUDO:=sudo}"
: "${APP_ENV_FILE:=$REPO_ROOT/solid-prod.env}"
# Set to "--dry-run=client" (via DRY_RUN=1 in the entrypoint) to preview helm changes.
: "${HELM_UPGRADE_EXTRA:=}"

load_env_file_if_present() {
  local file_path=$1

  if [[ -f "$file_path" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file_path"
    set +a
  fi
}

# Real prod app.* config lives in solid-prod.env; never load it for local.
if [[ "$DEPLOY_ENV" == "prod" ]]; then
  load_env_file_if_present "$APP_ENV_FILE"
fi

require_cmd() {
  local cmd
  for cmd in "$@"; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      echo "Missing required command: $cmd" >&2
      exit 1
    fi
  done
}

require_env() {
  local var_name
  for var_name in "$@"; do
    if [[ -z "${!var_name:-}" ]]; then
      echo "Missing required environment variable: $var_name" >&2
      exit 1
    fi
  done
}

ensure_file() {
  local file_path=$1
  if [[ ! -f "$file_path" ]]; then
    echo "Required file does not exist: $file_path" >&2
    exit 1
  fi
}

ensure_secret_key_exists() {
  local secret_name=$1
  local secret_key=$2

  if ! kubectl -n "$KUBE_NAMESPACE" get secret "$secret_name" >/dev/null 2>&1; then
    echo "Required secret does not exist in namespace $KUBE_NAMESPACE: $secret_name" >&2
    exit 1
  fi

  if [[ -z "$(kubectl -n "$KUBE_NAMESPACE" get secret "$secret_name" -o "jsonpath={.data.$secret_key}")" ]]; then
    echo "Required key $secret_key is missing from secret $secret_name in namespace $KUBE_NAMESPACE" >&2
    exit 1
  fi
}

ensure_postgres_bootstrap_secret() {
  ensure_secret_key_exists "$POSTGRES_SECRET_NAME" username
  ensure_secret_key_exists "$POSTGRES_SECRET_NAME" database
  ensure_secret_key_exists "$POSTGRES_SECRET_NAME" password
  ensure_secret_key_exists "$POSTGRES_SECRET_NAME" postgres-password
}

ensure_backend_bootstrap_secrets() {
  ensure_secret_key_exists backend-db DATABASE_URL
  ensure_secret_key_exists backend-auth JWT_SECRET_KEY
  ensure_secret_key_exists backend-auth SESSION_SECRET_KEY
}

# Pre-flight liveness check: app deploys no longer (re)deploy Postgres, so make
# sure the database is already present before rolling out the backend.
check_postgres_available() {
  if ! kubectl -n "$KUBE_NAMESPACE" get statefulset "$POSTGRES_STATEFULSET_NAME" >/dev/null 2>&1; then
    echo "PostgreSQL statefulset '$POSTGRES_STATEFULSET_NAME' not found in namespace $KUBE_NAMESPACE." >&2
    echo "Deploy the database first:  make deploy-postgres ENV=prod" >&2
    exit 1
  fi
}

helm_upgrade() {
  # shellcheck disable=SC2086
  helm upgrade "$@" ${HELM_UPGRADE_EXTRA:-}
}

build_backend_image() {
  local platform_args=()
  [[ -n "${BUILD_PLATFORM:-}" ]] && platform_args=(--platform "$BUILD_PLATFORM")
  docker build "${platform_args[@]}" -t "${BACKEND_IMAGE_REPOSITORY}:${IMAGE_TAG}" "$REPO_ROOT"
}

build_frontend_image() {
  local platform_args=()
  [[ -n "${BUILD_PLATFORM:-}" ]] && platform_args=(--platform "$BUILD_PLATFORM")
  docker build "${platform_args[@]}" -t "${FRONTEND_IMAGE_REPOSITORY}:${IMAGE_TAG}" "$REPO_ROOT/frontend"
}

import_image_into_k3s() {
  local image_ref=$1
  local tar_path

  tar_path=$(mktemp "${TMPDIR:-/tmp}/$(basename "$image_ref" | tr '/:' '__').XXXXXX.tar")
  docker save -o "$tar_path" "$image_ref"
  "$K3S_SUDO" "$K3S_BIN" ctr images import "$tar_path"
  rm -f "$tar_path"
}

# Load a locally-built image into the target cluster's runtime.
load_image() {
  local image_ref=$1
  if [[ "$DEPLOY_ENV" == "local" ]]; then
    kind load docker-image "$image_ref" --name "$KIND_CLUSTER"
  else
    import_image_into_k3s "$image_ref"
  fi
}

ensure_bitnami_repo() {
  if ! helm repo list | awk '{print $1}' | grep -qx bitnami; then
    helm repo add bitnami https://charts.bitnami.com/bitnami >/dev/null
  fi
  helm repo update bitnami >/dev/null
}

ensure_grafana_repo() {
  if ! helm repo list | awk '{print $1}' | grep -qx grafana; then
    helm repo add grafana https://grafana.github.io/helm-charts >/dev/null
  fi
  helm repo update grafana >/dev/null
}

deploy_postgres_release() {
  ensure_file "$POSTGRES_VALUES_FILE"
  ensure_bitnami_repo
  helm_upgrade --install "$POSTGRES_RELEASE" "$POSTGRES_CHART" \
    --version "$POSTGRES_CHART_VERSION" \
    --namespace "$KUBE_NAMESPACE" \
    --create-namespace \
    --wait \
    --timeout "$HELM_TIMEOUT" \
    -f "$POSTGRES_VALUES_FILE" \
    --set-string fullnameOverride="$POSTGRES_FULLNAME_OVERRIDE" \
    --set-string auth.existingSecret="$POSTGRES_SECRET_NAME" \
    --set-string auth.username="$POSTGRES_USERNAME" \
    --set-string auth.database="$POSTGRES_DATABASE"
}

deploy_alloy_release() {
  ensure_grafana_repo
  helm_upgrade --install alloy grafana/alloy \
    --namespace "$KUBE_NAMESPACE" \
    --create-namespace \
    --wait \
    --timeout "$HELM_TIMEOUT" \
    -f "$REPO_ROOT/k8s/alloy/values-production.yaml"
}

deploy_backend_release() {
  ensure_file "$BACKEND_VALUES_FILE"
  local helm_args=(
    --install "$BACKEND_RELEASE" "$REPO_ROOT/k8s/backend-service"
    --namespace "$KUBE_NAMESPACE"
    --create-namespace
    --wait
    --timeout "$HELM_TIMEOUT"
    -f "$BACKEND_VALUES_FILE"
    --set-string image.repository="$BACKEND_IMAGE_REPOSITORY"
    --set-string image.tag="$IMAGE_TAG"
  )

  # Prod app.* config injected from solid-prod.env (unset -> chart defaults locally).
  [[ -n "${ENVIRONMENT:-}" ]] && helm_args+=(--set-string app.environment="$ENVIRONMENT")
  [[ -n "${FRONTEND_URL:-}" ]] && helm_args+=(--set-string app.frontendUrl="$FRONTEND_URL")
  [[ -n "${GCP_REDIRECT_URI:-}" ]] && helm_args+=(--set-string app.gcpRedirectUri="$GCP_REDIRECT_URI")
  [[ -n "${CORS_ALLOWED_ORIGINS:-}" ]] && helm_args+=(--set-string app.corsAllowedOrigins="$CORS_ALLOWED_ORIGINS")
  [[ -n "${ALLOWED_HOSTS:-}" ]] && helm_args+=(--set-string app.allowedHosts="$ALLOWED_HOSTS")
  [[ -n "${DOCS_ENABLED:-}" ]] && helm_args+=(--set-string app.docsEnabled="$DOCS_ENABLED")
  [[ -n "${SECURITY_HEADERS_ENABLED:-}" ]] && helm_args+=(--set-string app.securityHeadersEnabled="$SECURITY_HEADERS_ENABLED")
  [[ -n "${TRUST_PROXY_HEADERS:-}" ]] && helm_args+=(--set-string app.trustProxyHeaders="$TRUST_PROXY_HEADERS")
  [[ -n "${STRICT_TRANSPORT_SECURITY_SECONDS:-}" ]] && helm_args+=(--set-string app.strictTransportSecuritySeconds="$STRICT_TRANSPORT_SECURITY_SECONDS")
  [[ -n "${SESSION_HTTPS_ONLY:-}" ]] && helm_args+=(--set-string app.session.httpsOnly="$SESSION_HTTPS_ONLY")
  [[ -n "${SESSION_SAME_SITE:-}" ]] && helm_args+=(--set-string app.session.sameSite="$SESSION_SAME_SITE")

  helm_upgrade "${helm_args[@]}"
}

deploy_frontend_release() {
  ensure_file "$FRONTEND_VALUES_FILE"
  helm_upgrade --install "$FRONTEND_RELEASE" "$REPO_ROOT/k8s/frontend-service" \
    --namespace "$KUBE_NAMESPACE" \
    --create-namespace \
    --wait \
    --timeout "$HELM_TIMEOUT" \
    -f "$FRONTEND_VALUES_FILE" \
    --set-string image.repository="$FRONTEND_IMAGE_REPOSITORY" \
    --set-string image.tag="$IMAGE_TAG"
}

wait_for_postgres_rollout() {
  kubectl -n "$KUBE_NAMESPACE" rollout status statefulset/"$POSTGRES_STATEFULSET_NAME" --timeout="$ROLLOUT_TIMEOUT"
}

wait_for_backend_rollout() {
  kubectl -n "$KUBE_NAMESPACE" rollout status deployment/"$BACKEND_DEPLOYMENT_NAME" --timeout="$ROLLOUT_TIMEOUT"
}

wait_for_frontend_rollout() {
  kubectl -n "$KUBE_NAMESPACE" rollout status deployment/"$FRONTEND_DEPLOYMENT_NAME" --timeout="$ROLLOUT_TIMEOUT"
}

print_deploy_summary() {
  cat <<EOF
Environment: $DEPLOY_ENV
Namespace: $KUBE_NAMESPACE
Image tag: $IMAGE_TAG
Backend image: ${BACKEND_IMAGE_REPOSITORY}:${IMAGE_TAG}
Frontend image: ${FRONTEND_IMAGE_REPOSITORY}:${IMAGE_TAG}
EOF
}
