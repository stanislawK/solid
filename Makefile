PYTHON := uv run
ALEMBIC := $(PYTHON) alembic
KUBE_NAMESPACE := default
BACKEND_DEPLOYMENT := backend-backend-service
FRONTEND_DEPLOYMENT := frontend-deployment
DAEMONSET_PAUSE_KEY := solid-paused

# Deploy vocabulary (see scripts/deploy.sh): make deploy TARGET=backend ENV=prod
ENV ?= local
TARGET ?= backend

.PHONY: help
help:
	@echo "make migration MSG='init'          - create a new migration"
	@echo "make upgrade                        - apply migrations"
	@echo "make downgrade REV=-1               - rollback migrations"
	@echo "make deploy TARGET=backend ENV=prod - build+load image then helm upgrade"
	@echo "make reapply TARGET=backend ENV=prod- helm upgrade only (no image build)"
	@echo "make bootstrap-secrets ENV=prod     - create/update prod secrets"
	@echo "make deploy-postgres ENV=prod       - deploy/upgrade prod PostgreSQL"
	@echo "  (append DRY_RUN=1 to deploy/reapply/deploy-postgres to preview helm changes)"
	@echo "make start-pods / stop-pods         - scale all workloads up/down (local)"

.PHONY: migration
migration:
	$(ALEMBIC) revision --autogenerate -m "$(MSG)"

.PHONY: upgrade
upgrade:
	$(ALEMBIC) upgrade head

.PHONY: downgrade
downgrade:
	$(ALEMBIC) downgrade $(REV)

.PHONY: format
format:
	$(PYTHON) ruff format .

.PHONY: openapi
openapi:
	$(PYTHON) python -c "import json; from main import app; open('openapi.json', 'w').write(json.dumps(app.openapi(), indent=2))"

.PHONY: deploy
deploy:                # build+load image then helm upgrade. e.g. make deploy TARGET=backend ENV=prod
	ACTION=deploy TARGET=$(TARGET) DEPLOY_ENV=$(ENV) DRY_RUN=$(DRY_RUN) ./scripts/deploy.sh

.PHONY: reapply
reapply:               # helm upgrade only, no image build. e.g. make reapply TARGET=backend ENV=prod
	ACTION=reapply TARGET=$(TARGET) DEPLOY_ENV=$(ENV) DRY_RUN=$(DRY_RUN) ./scripts/deploy.sh

.PHONY: bootstrap-secrets
bootstrap-secrets:     # create/update prod secrets from SECRETS_ENV_FILE
	DEPLOY_ENV=$(ENV) ./scripts/prod-bootstrap-secrets.sh

.PHONY: deploy-postgres
deploy-postgres:       # deploy/upgrade prod PostgreSQL (run only on intentional DB changes)
	DRY_RUN=$(DRY_RUN) ./scripts/prod-deploy-postgres.sh

.PHONY: start-pods
start-pods:
	kubectl -n $(KUBE_NAMESPACE) scale deployment,statefulset --all --replicas=1
	@echo "Unpausing daemonsets (e.g. alloy)"; \
	for ds in $$(kubectl -n $(KUBE_NAMESPACE) get daemonset -o name 2>/dev/null); do \
		kubectl -n $(KUBE_NAMESPACE) patch $$ds --type json \
			-p='[{"op":"remove","path":"/spec/template/spec/nodeSelector/$(DAEMONSET_PAUSE_KEY)"}]' 2>/dev/null || true; \
	done

.PHONY: stop-pods
stop-pods:
	kubectl -n $(KUBE_NAMESPACE) scale deployment,statefulset --all --replicas=0
	@echo "Pausing daemonsets (e.g. alloy)"; \
	for ds in $$(kubectl -n $(KUBE_NAMESPACE) get daemonset -o name 2>/dev/null); do \
		kubectl -n $(KUBE_NAMESPACE) patch $$ds --type merge \
			-p '{"spec":{"template":{"spec":{"nodeSelector":{"$(DAEMONSET_PAUSE_KEY)":"true"}}}}}' || true; \
	done

.PHONY: expose-backend
expose-backend:
	kubectl port-forward svc/traefik-solid 8080:80

.PHONY: backend-rollout
backend-rollout:
	kubectl -n $(KUBE_NAMESPACE) rollout restart deploy/$(BACKEND_DEPLOYMENT)

.PHONY: frontend-rollout
frontend-rollout:
	kubectl -n $(KUBE_NAMESPACE) rollout restart deploy/$(FRONTEND_DEPLOYMENT)