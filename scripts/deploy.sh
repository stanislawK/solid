#!/usr/bin/env bash
#
# Unified deploy entrypoint for both environments.
#
#   ACTION=deploy|reapply  TARGET=backend|frontend|all  DEPLOY_ENV=local|prod  [DRY_RUN=1]
#
# deploy  = build + load image, then helm upgrade.
# reapply = helm upgrade only (reuse the already-loaded image).
# DRY_RUN=1 passes --dry-run to every helm upgrade (preview, no changes).
#
# Invoked via the Makefile:  make deploy TARGET=backend ENV=prod

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

: "${ACTION:=deploy}"
: "${TARGET:?TARGET is required (backend|frontend|all)}"
: "${DEPLOY_ENV:=local}"

if [[ "${DRY_RUN:-}" == "1" ]]; then
  export HELM_UPGRADE_EXTRA="--dry-run=client"
fi

# shellcheck source=scripts/deploy-lib.sh
source "$SCRIPT_DIR/deploy-lib.sh"

case "$ACTION" in deploy|reapply) ;; *) echo "Unknown ACTION: $ACTION (deploy|reapply)" >&2; exit 1 ;; esac
case "$TARGET" in backend|frontend|all) ;; *) echo "Unknown TARGET: $TARGET (backend|frontend|all)" >&2; exit 1 ;; esac
case "$DEPLOY_ENV" in local|prod) ;; *) echo "Unknown DEPLOY_ENV: $DEPLOY_ENV (local|prod)" >&2; exit 1 ;; esac

if [[ "$ACTION" == "deploy" ]]; then
  if [[ "$DEPLOY_ENV" == "local" ]]; then
    require_cmd docker helm kubectl kind
  else
    require_cmd docker helm kubectl "$K3S_BIN"
  fi
else
  require_cmd helm kubectl
fi

build_and_load_backend() {
  build_backend_image
  load_image "${BACKEND_IMAGE_REPOSITORY}:${IMAGE_TAG}"
}

build_and_load_frontend() {
  build_frontend_image
  load_image "${FRONTEND_IMAGE_REPOSITORY}:${IMAGE_TAG}"
}

release_backend() {
  # App deploys no longer touch Postgres (deploy it with make deploy-postgres).
  if [[ "$DEPLOY_ENV" == "prod" ]]; then
    check_postgres_available
    ensure_backend_bootstrap_secrets
  fi
  deploy_backend_release
  wait_for_backend_rollout
}

release_frontend() {
  deploy_frontend_release
  wait_for_frontend_rollout
}

if [[ "$ACTION" == "deploy" ]]; then
  case "$TARGET" in
    backend) build_and_load_backend ;;
    frontend) build_and_load_frontend ;;
    all) build_and_load_backend; build_and_load_frontend ;;
  esac
fi

case "$TARGET" in
  backend) release_backend ;;
  frontend) release_frontend ;;
  all)
    [[ "$DEPLOY_ENV" == "prod" ]] && deploy_alloy_release
    release_backend
    release_frontend
    ;;
esac

print_deploy_summary
