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
