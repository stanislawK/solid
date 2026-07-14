#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$SCRIPT_DIR/deploy-lib.sh"

: "${SECRETS_ENV_FILE:=}"

require_cmd kubectl
require_env SECRETS_ENV_FILE
ensure_file "$SECRETS_ENV_FILE"

set -a
source "$SECRETS_ENV_FILE"
set +a

require_env JWT_SECRET_KEY SESSION_SECRET_KEY

decode_secret_key() {
  local secret_name=$1
  local secret_key=$2

  kubectl -n "$KUBE_NAMESPACE" get secret "$secret_name" -o "jsonpath={.data.$secret_key}" | base64 --decode
}

if kubectl -n "$KUBE_NAMESPACE" get secret "$POSTGRES_SECRET_NAME" >/dev/null 2>&1; then
  POSTGRES_USERNAME=$(decode_secret_key "$POSTGRES_SECRET_NAME" username)
  POSTGRES_DATABASE=$(decode_secret_key "$POSTGRES_SECRET_NAME" database)
  POSTGRES_PASSWORD=$(decode_secret_key "$POSTGRES_SECRET_NAME" password)
  POSTGRES_POSTGRES_PASSWORD=$(decode_secret_key "$POSTGRES_SECRET_NAME" postgres-password)
  echo "Reusing existing PostgreSQL credentials from secret $POSTGRES_SECRET_NAME."
else
  if [[ -z "${POSTGRES_PASSWORD:-}" || -z "${POSTGRES_POSTGRES_PASSWORD:-}" ]]; then
    require_cmd openssl
  fi

  POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-$(openssl rand -hex 32)}
  POSTGRES_POSTGRES_PASSWORD=${POSTGRES_POSTGRES_PASSWORD:-$(openssl rand -hex 32)}

  kubectl -n "$KUBE_NAMESPACE" create secret generic "$POSTGRES_SECRET_NAME" \
    --from-literal=username="$POSTGRES_USERNAME" \
    --from-literal=database="$POSTGRES_DATABASE" \
    --from-literal=password="$POSTGRES_PASSWORD" \
    --from-literal=postgres-password="$POSTGRES_POSTGRES_PASSWORD" \
    --dry-run=client \
    -o yaml | kubectl apply -f -
fi

DATABASE_URL="postgresql+psycopg://${POSTGRES_USERNAME}:${POSTGRES_PASSWORD}@${POSTGRES_SERVICE_NAME}:${POSTGRES_SERVICE_PORT}/${POSTGRES_DATABASE}"

kubectl -n "$KUBE_NAMESPACE" create secret generic backend-db \
  --from-literal=DATABASE_URL="$DATABASE_URL" \
  --dry-run=client \
  -o yaml | kubectl apply -f -

auth_secret_args=(
  --from-literal=JWT_SECRET_KEY="$JWT_SECRET_KEY"
  --from-literal=SESSION_SECRET_KEY="$SESSION_SECRET_KEY"
)

if [[ -n "${GCP_CLIENT_ID:-}" ]]; then
  auth_secret_args+=(--from-literal=GCP_CLIENT_ID="$GCP_CLIENT_ID")
fi

if [[ -n "${GCP_CLIENT_SECRET:-}" ]]; then
  auth_secret_args+=(--from-literal=GCP_CLIENT_SECRET="$GCP_CLIENT_SECRET")
fi

if [[ -n "${ADMIN_EMAIL:-}" ]]; then
  auth_secret_args+=(--from-literal=ADMIN_EMAIL="$ADMIN_EMAIL")
fi

if [[ -n "${GEM_API_KEY:-}" ]]; then
  auth_secret_args+=(--from-literal=GEM_API_KEY="$GEM_API_KEY")
fi

kubectl -n "$KUBE_NAMESPACE" create secret generic backend-auth \
  "${auth_secret_args[@]}" \
  --dry-run=client \
  -o yaml | kubectl apply -f -

grafana_cloud_args=()
[[ -n "${GRAFANA_CLOUD_LOGS_URL:-}" ]] && grafana_cloud_args+=(--from-literal=GRAFANA_CLOUD_LOGS_URL="$GRAFANA_CLOUD_LOGS_URL")
[[ -n "${GRAFANA_CLOUD_LOGS_USER:-}" ]] && grafana_cloud_args+=(--from-literal=GRAFANA_CLOUD_LOGS_USER="$GRAFANA_CLOUD_LOGS_USER")
[[ -n "${GRAFANA_CLOUD_TRACES_URL:-}" ]] && grafana_cloud_args+=(--from-literal=GRAFANA_CLOUD_TRACES_URL="$GRAFANA_CLOUD_TRACES_URL")
[[ -n "${GRAFANA_CLOUD_TRACES_USER:-}" ]] && grafana_cloud_args+=(--from-literal=GRAFANA_CLOUD_TRACES_USER="$GRAFANA_CLOUD_TRACES_USER")
[[ -n "${GRAFANA_CLOUD_METRICS_URL:-}" ]] && grafana_cloud_args+=(--from-literal=GRAFANA_CLOUD_METRICS_URL="$GRAFANA_CLOUD_METRICS_URL")
[[ -n "${GRAFANA_CLOUD_METRICS_USER:-}" ]] && grafana_cloud_args+=(--from-literal=GRAFANA_CLOUD_METRICS_USER="$GRAFANA_CLOUD_METRICS_USER")
[[ -n "${GRAFANA_CLOUD_TOKEN:-}" ]] && grafana_cloud_args+=(--from-literal=GRAFANA_CLOUD_TOKEN="$GRAFANA_CLOUD_TOKEN")

if [[ ${#grafana_cloud_args[@]} -gt 0 ]]; then
  kubectl -n "$KUBE_NAMESPACE" create secret generic grafana-cloud-auth \
    "${grafana_cloud_args[@]}" \
    --dry-run=client \
    -o yaml | kubectl apply -f -
else
  echo "Grafana Cloud configs not found; skipping grafana-cloud-auth creation."
fi

echo "Production secrets applied in namespace $KUBE_NAMESPACE."
echo "Backend DATABASE_URL now targets ${POSTGRES_SERVICE_NAME}:${POSTGRES_SERVICE_PORT}/${POSTGRES_DATABASE}."