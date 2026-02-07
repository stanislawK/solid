PYTHON := uv run
ALEMBIC := $(PYTHON) alembic

.PHONY: help
help:
	@echo "make migration MSG='init'  - create a new migration"
	@echo "make upgrade                - apply migrations"
	@echo "make downgrade REV=-1       - rollback migrations"

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
	helm upgrade --install backend ./k8s/backend-service

.PHONY: start-pods
start-pods:
	kubectl scale deploy/solid-backend --replicas=1

.PHONY: stop-pods
stop-pods:
	kubectl scale deploy/solid-backend --replicas=0