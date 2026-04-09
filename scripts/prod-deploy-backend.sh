#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$SCRIPT_DIR/prod-common.sh"

require_cmd docker helm kubectl "$K3S_BIN"

build_backend_image
import_image_into_k3s "${BACKEND_IMAGE_REPOSITORY}:${IMAGE_TAG}"
ensure_postgres_bootstrap_secret
deploy_postgres_release
wait_for_postgres_rollout
ensure_backend_bootstrap_secrets
deploy_backend_release
wait_for_backend_rollout
print_deploy_summary