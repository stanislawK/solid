PYTHON := uv run
ALEMBIC := $(PYTHON) alembic
IMAGE_NAME := solid-backend
IMAGE_TAG := latest
KIND_CLUSTER := solid-cluster
KUBE_NAMESPACE := default
HELM_RELEASE := backend
HELM_CHART := ./k8s/backend-service
BACKEND_DEPLOYMENT := $(HELM_RELEASE)-backend-service
FRONTEND_IMAGE_NAME := solid-frontend
FRONTEND_DEPLOYMENT := frontend-deployment
DAEMONSET_PAUSE_KEY := solid-paused

.PHONY: help
help:
	@echo "make migration MSG='init'  - create a new migration"
	@echo "make upgrade                - apply migrations"
	@echo "make downgrade REV=-1       - rollback migrations"
	@echo "make start-pods             - scale backend/observability/infra workloads up"
	@echo "make stop-pods              - scale backend/observability/infra workloads down"

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

.PHONY: reapply-backend
reapply-backend:
	helm upgrade --install $(HELM_RELEASE) $(HELM_CHART)

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

.PHONY: redeploy-backend
redeploy-backend:
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) .
	kind load docker-image $(IMAGE_NAME):$(IMAGE_TAG) --name $(KIND_CLUSTER)
	kubectl -n $(KUBE_NAMESPACE) rollout restart deploy/$(BACKEND_DEPLOYMENT)

.PHONY: redeploy-frontend
redeploy-frontend:
	docker build -t $(FRONTEND_IMAGE_NAME):$(IMAGE_TAG) frontend/
	kind load docker-image $(FRONTEND_IMAGE_NAME):$(IMAGE_TAG) --name $(KIND_CLUSTER)
	kubectl -n $(KUBE_NAMESPACE) rollout restart deploy/$(FRONTEND_DEPLOYMENT)

backend-rollout:
	kubectl -n $(KUBE_NAMESPACE) rollout restart deploy/$(BACKEND_DEPLOYMENT)

frontend-rollout:
	kubectl -n $(KUBE_NAMESPACE) rollout restart deploy/$(FRONTEND_DEPLOYMENT)