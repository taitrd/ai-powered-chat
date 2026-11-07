# Shortcuts for the local Docker stack. Run `make` to list them.

.DEFAULT_GOAL := help
.PHONY: help up up-core down logs ps test lint migrate psql reset

help: ## List available commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-9s %s\n", $$1, $$2}'

up: ## Start everything (API, database, dev tools)
	docker compose up -d --build
	@echo "API docs  http://localhost:8000/docs"
	@echo "pgAdmin   http://localhost:5050"
	@echo "Mailpit   http://localhost:8025"
	@echo "S3 files  http://localhost:8888"

up-core: ## Start only the database and API
	docker compose up -d --build db api

down: ## Stop everything (data is kept)
	docker compose down

logs: ## Follow API logs
	docker compose logs -f api

ps: ## Show service status
	docker compose ps -a

test: ## Run backend tests
	docker compose run --rm api pytest

lint: ## Check backend lint and formatting
	docker compose run --rm --no-deps api sh -c "ruff check . && ruff format --check ."

migrate: ## Apply database migrations
	docker compose run --rm api alembic upgrade head

psql: ## Open a SQL shell on the local database
	docker compose exec db psql -U chat -d chat

reset: ## Stop everything and DELETE all local data
	docker compose down -v
