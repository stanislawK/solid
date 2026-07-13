#!/usr/bin/env bash
#
# Deploy / upgrade the production PostgreSQL release.
#
# Run this ONLY when you intentionally change the database chart version or its
# values. Ordinary app deploys (make deploy TARGET=backend ENV=prod) no longer
# touch Postgres, so a routine app rollout can never disrupt the database.
#
# Preview first with:  DRY_RUN=1 ./scripts/prod-deploy-postgres.sh

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

export DEPLOY_ENV=prod

if [[ "${DRY_RUN:-}" == "1" ]]; then
  export HELM_UPGRADE_EXTRA="--dry-run=client"
fi

# shellcheck source=scripts/deploy-lib.sh
source "$SCRIPT_DIR/deploy-lib.sh"

require_cmd helm kubectl
ensure_postgres_bootstrap_secret
deploy_postgres_release
wait_for_postgres_rollout

echo "PostgreSQL release '$POSTGRES_RELEASE' deployed in namespace $KUBE_NAMESPACE."
