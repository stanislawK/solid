#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$SCRIPT_DIR/prod-common.sh"

require_cmd docker helm kubectl "$K3S_BIN"

build_frontend_image
import_image_into_k3s "${FRONTEND_IMAGE_REPOSITORY}:${IMAGE_TAG}"
deploy_frontend_release
wait_for_frontend_rollout
print_deploy_summary