PYTHON := uv run
ALEMBIC := $(PYTHON) alembic
IMAGE_NAME := solid-app
IMAGE_TAG := latest
KIND_CLUSTER := solid-cluster
KUBE_NAMESPACE := default
HELM_RELEASE := backend
HELM_CHART := ./k8s/backend-service
BACKEND_DEPLOYMENT := $(HELM_RELEASE)-backend-service
OBSERVABILITY_RELEASES := monitoring loki alloy tempo otel-collector glitchtip-solid
INFRA_RELEASES := traefik-solid cnpg
SCALABLE_RELEASES := $(HELM_RELEASE) $(OBSERVABILITY_RELEASES) $(INFRA_RELEASES)
DAEMONSET_PAUSE_KEY := solid-paused
KPS_PROMETHEUS_NAME := monitoring-kube-prometheus-prometheus
KPS_ALERTMANAGER_NAME := monitoring-kube-prometheus-alertmanager
KPS_PROMETHEUS_STS := prometheus-$(KPS_PROMETHEUS_NAME)
KPS_ALERTMANAGER_STS := alertmanager-$(KPS_ALERTMANAGER_NAME)

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

.PHONY: reapply-backend
reapply-backend:
	helm upgrade --install $(HELM_RELEASE) $(HELM_CHART)

.PHONY: start-pods
start-pods:
	@for release in $(SCALABLE_RELEASES); do \
		echo "Scaling $$release workloads to 1 replica"; \
		kubectl -n $(KUBE_NAMESPACE) scale deployment,statefulset \
			-l app.kubernetes.io/instance=$$release --replicas=1 || true; \
		echo "Scaling $$release monitoring CR workloads to 1 replica"; \
		for prom in $$(kubectl -n $(KUBE_NAMESPACE) get prometheus.monitoring.coreos.com \
			-l app.kubernetes.io/instance=$$release -o name 2>/dev/null); do \
			kubectl -n $(KUBE_NAMESPACE) patch $$prom --type merge \
				-p '{"spec":{"replicas":1}}' || true; \
		done; \
		for am in $$(kubectl -n $(KUBE_NAMESPACE) get alertmanager.monitoring.coreos.com \
			-l app.kubernetes.io/instance=$$release -o name 2>/dev/null); do \
			kubectl -n $(KUBE_NAMESPACE) patch $$am --type merge \
				-p '{"spec":{"replicas":1}}' || true; \
		done; \
		echo "Scaling $$release CNPG clusters to 1 instance"; \
		for cluster in $$(kubectl -n $(KUBE_NAMESPACE) get clusters.postgresql.cnpg.io \
			-l app.kubernetes.io/instance=$$release -o name 2>/dev/null); do \
			kubectl -n $(KUBE_NAMESPACE) patch $$cluster --type merge \
				-p '{"spec":{"instances":1}}' || true; \
		done; \
		echo "Unpausing $$release daemonsets"; \
		for ds in $$(kubectl -n $(KUBE_NAMESPACE) get daemonset \
			-l app.kubernetes.io/instance=$$release -o name 2>/dev/null); do \
			kubectl -n $(KUBE_NAMESPACE) patch $$ds --type json \
				-p='[{"op":"remove","path":"/spec/template/spec/nodeSelector/$(DAEMONSET_PAUSE_KEY)"}]' || true; \
		done; \
	done
	@echo "Ensuring kube-prometheus CR workloads are scaled to 1 replica"; \
	kubectl -n $(KUBE_NAMESPACE) patch prometheus.monitoring.coreos.com/$(KPS_PROMETHEUS_NAME) \
		--type merge -p '{"spec":{"paused":false,"replicas":1}}' || true; \
	kubectl -n $(KUBE_NAMESPACE) patch alertmanager.monitoring.coreos.com/$(KPS_ALERTMANAGER_NAME) \
		--type merge -p '{"spec":{"paused":false,"replicas":1}}' || true; \
	kubectl -n $(KUBE_NAMESPACE) scale statefulset/$(KPS_PROMETHEUS_STS) --replicas=1 || true; \
	kubectl -n $(KUBE_NAMESPACE) scale statefulset/$(KPS_ALERTMANAGER_STS) --replicas=1 || true

.PHONY: stop-pods
stop-pods:
	@for release in $(SCALABLE_RELEASES); do \
		echo "Scaling $$release workloads to 0 replicas"; \
		kubectl -n $(KUBE_NAMESPACE) scale deployment,statefulset \
			-l app.kubernetes.io/instance=$$release --replicas=0 || true; \
		echo "Scaling $$release monitoring CR workloads to 0 replicas"; \
		for prom in $$(kubectl -n $(KUBE_NAMESPACE) get prometheus.monitoring.coreos.com \
			-l app.kubernetes.io/instance=$$release -o name 2>/dev/null); do \
			kubectl -n $(KUBE_NAMESPACE) patch $$prom --type merge \
				-p '{"spec":{"replicas":0}}' || true; \
		done; \
		for am in $$(kubectl -n $(KUBE_NAMESPACE) get alertmanager.monitoring.coreos.com \
			-l app.kubernetes.io/instance=$$release -o name 2>/dev/null); do \
			kubectl -n $(KUBE_NAMESPACE) patch $$am --type merge \
				-p '{"spec":{"replicas":0}}' || true; \
		done; \
		echo "Scaling $$release CNPG clusters to 0 instances"; \
		for cluster in $$(kubectl -n $(KUBE_NAMESPACE) get clusters.postgresql.cnpg.io \
			-l app.kubernetes.io/instance=$$release -o name 2>/dev/null); do \
			kubectl -n $(KUBE_NAMESPACE) patch $$cluster --type merge \
				-p '{"spec":{"instances":0}}' || true; \
		done; \
		echo "Pausing $$release daemonsets"; \
		for ds in $$(kubectl -n $(KUBE_NAMESPACE) get daemonset \
			-l app.kubernetes.io/instance=$$release -o name 2>/dev/null); do \
			kubectl -n $(KUBE_NAMESPACE) patch $$ds --type merge \
				-p '{"spec":{"template":{"spec":{"nodeSelector":{"$(DAEMONSET_PAUSE_KEY)":"true"}}}}}' || true; \
		done; \
	done
	@echo "Ensuring kube-prometheus CR workloads are scaled to 0 replicas"; \
	kubectl -n $(KUBE_NAMESPACE) patch prometheus.monitoring.coreos.com/$(KPS_PROMETHEUS_NAME) \
		--type merge -p '{"spec":{"paused":true,"replicas":0}}' || true; \
	kubectl -n $(KUBE_NAMESPACE) patch alertmanager.monitoring.coreos.com/$(KPS_ALERTMANAGER_NAME) \
		--type merge -p '{"spec":{"paused":true,"replicas":0}}' || true; \
	kubectl -n $(KUBE_NAMESPACE) scale statefulset/$(KPS_PROMETHEUS_STS) --replicas=0 || true; \
	kubectl -n $(KUBE_NAMESPACE) scale statefulset/$(KPS_ALERTMANAGER_STS) --replicas=0 || true

.PHONY: expose-backend
expose-backend:
	kubectl port-forward svc/traefik-solid 8080:80

.PHONY: redeploy-backend
redeploy-backend:
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) .
	kind load docker-image $(IMAGE_NAME):$(IMAGE_TAG) --name $(KIND_CLUSTER)
	kubectl -n $(KUBE_NAMESPACE) rollout restart deploy/$(BACKEND_DEPLOYMENT)

backend-rollout:
	kubectl -n $(KUBE_NAMESPACE) rollout restart deploy/$(BACKEND_DEPLOYMENT)