# Implement a Backend Feature

Steps for adding an API resource or endpoint. Follow [`CONVENTIONS.md`](CONVENTIONS.md) throughout.

## Overview

> The work moves through Schemas → Models and migration → Repositories → Services → Routes → Tests. Do each layer in order, and keep existing endpoints and response shapes backward compatible, because the frontend and cached browser data depend on them.

## Steps

### 1. Schemas (`app/api/v1/schemas/`)

- Add request models (`<resource>.py`: `<Resource>Create`, `<Resource>Update`) and response models (`<Resource>Out`).
- Reuse existing types, such as `Title`, rather than duplicating validation.
- Response models use `ConfigDict(from_attributes=True)`.
- Re-export new models in `app/api/v1/schemas/__init__.py`.
- Keep frontend `src/types.ts` in step with these shapes.

### 2. Models and migration (`app/db/models.py`, `alembic/versions/`)

- Add or change the SQLAlchemy model, using UUID keys and `timestamptz` columns.
- Add indexes for queries you'll run, such as `user_id` with a sort column.
- Use `ON DELETE CASCADE` for child rows.
- Write a migration:
  1. Create it with `docker compose run --rm api alembic revision -m "<change>"`.
  2. Write `upgrade()` and `downgrade()` by hand.
  3. Make it backward compatible: add first, remove in a later release.
- Check it rolls back and reapplies: `alembic downgrade -1 && alembic upgrade head`.

### 3. Repositories (`app/repositories/`)

- Add plain async query functions in `app/repositories/<resource>.py`.
- Every query operating on user data MUST accept `user_id: uuid.UUID` and filter by it.
- Never write business rules or raise `HTTPException` in repositories.

### 4. Services (`app/services/`, `app/llm/`)

- Put logic that isn't HTTP-specific here: limits, provider calls, auto-titling, formatting.
- Services receive plain values or an `AsyncSession`, never FastAPI `Request` objects.
- Services raise custom domain exceptions (e.g. `LimitExceededError`), never `HTTPException`.
- For a new AI provider, add an adapter in `app/llm/` and an entry in `providers.yaml`.

### 5. Routes (`app/api/v1/`)

- Add thin handlers in `app/api/v1/<resource>.py`, and register any new router in `app/api/v1/router.py`.
- **Required dependencies:**
  - `user: User = Depends(get_current_user)`
  - `session: AsyncSession = Depends(get_session)`
- **Ownership:** load owned rows with a `user_id` filter via repository, and return `404` when there's no match.
- Keep handlers thin: parse requests, call services/repositories, map exceptions to HTTP status codes, return schemas.

### 6. Tests (`tests/`)

- Add `tests/test_<resource>.py`, marked `pytestmark = pytest.mark.anyio`.
- Unit test services and repositories directly for speed and edge-case coverage.
- Integration test API routes using `client` fixture and `as_user("alice")` headers:
  - Success cases.
  - Validation (`422` or `400`).
  - Unknown ID (`404`).
  - **Another user's data (`404`).**
  - Limit enforcement (`429`).
- Mock AI providers. Never use real keys in tests.

### 7. Docs

- **New settings:** document them in `docs/local-setup.md` and `.env.example`.
- **Architecture or cost changes:** update `docs/architecture.md` or `docs/design-decisions.md`.
