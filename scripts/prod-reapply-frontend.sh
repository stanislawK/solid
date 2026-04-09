#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$SCRIPT_DIR/prod-common.sh"

require_cmd helm kubectl

deploy_frontend_release
wait_for_frontend_rollout
print_deploy_summary