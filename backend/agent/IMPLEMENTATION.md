# Implement a Backend Feature

Steps for adding an API resource or endpoint. Follow [`CONVENTIONS.md`](CONVENTIONS.md) throughout.

## Overview

> The work moves through Schemas → Models and migration → Services → Routes → Tests. Do each layer in order, and keep existing endpoints and response shapes backward compatible, because the frontend and cached browser data depend on them.

## Steps

### 1. Schemas (`app/api/v1/schemas.py`)

- Add request models (`<Resource>Create`, `<Resource>Update`) and response models (`<Resource>Out`).
- Reuse existing types, such as `Title`, rather than duplicating validation.
- Response models use `ConfigDict(from_attributes=True)`.
- Keep frontend `src/types.ts` in step with these shapes.

### 2. Models and migration (`app/db/models.py`, `alembic/versions/`)

- Add or change the SQLAlchemy model, using UUID keys and `timestamptz` columns.
- Add indexes for the queries you'll run, such as `user_id` with a sort column.
- Use `ON DELETE CASCADE` for child rows.
- Write a migration:
  1. Create it with `docker compose run --rm api alembic revision -m "<change>"`.
  2. Write `upgrade()` and `downgrade()` by hand.
  3. Make it backward compatible: add first, remove in a later release.
- Check it rolls back and reapplies: `alembic downgrade -1 && alembic upgrade head`.

### 3. Services (`app/services/`, `app/llm/`)

- Put logic that isn't HTTP-specific here, such as limits, provider calls and formatting.
- Services receive a session or plain values, not `Request` objects.
- For a new AI provider, add an adapter in `app/llm/` and an entry in `providers.yaml`.

### 4. Routes (`app/api/v1/`)

- Add the handler to the resource's router, and register any new router in `app/main.py` under `/api/v1`.
- **Required dependencies:**
  - `user: User = Depends(get_current_user)`
  - `session: AsyncSession = Depends(get_session)`
- **Ownership:** load owned rows with a `user_id` filter, and return `404` when there's no match.
- Keep handlers thin: validate, call a service, commit, return the schema.

### 5. Tests (`tests/`)

- Add `tests/test_<resource>.py`, marked `pytestmark = pytest.mark.anyio`.
- Use the `client` fixture and `as_user("alice")` headers.
- **Cover these cases:**
  - Success.
  - Validation (`422`).
  - Unknown ID (`404`).
  - **Another user's data (`404`).**
  - Any limits.
- Mock AI providers. Never use real keys in tests.

### 6. Docs

- **New settings:** document them in `docs/local-setup.md` and `.env.example`.
- **Architecture or cost changes:** update `docs/architecture.md` or `docs/design-decisions.md`.

## Verification

```bash
make lint   # ruff check and format check
make test   # pytest against PostgreSQL in Docker
```

Then call the endpoint through http://localhost:8000/docs, or with `curl` and an `X-Dev-User` header.
