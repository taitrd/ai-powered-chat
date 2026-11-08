# Feature Implementation Checklist

Follow these 6 steps in order when adding or updating backend features. Adhere to [`CONVENTIONS.md`](CONVENTIONS.md) throughout.

---

### Step 1: Schemas (`app/api/v1/schemas/<resource>.py`)
- Define request models (`<Resource>Create`, `<Resource>Update`) and response models (`<Resource>Out`).
- Use `ConfigDict(from_attributes=True)` on response models.
- Re-export models in `app/api/v1/schemas/__init__.py`.
- Sync corresponding shapes with `frontend/src/types.ts`.

### Step 2: Models & Migrations (`app/db/models.py`, `alembic/versions/`)
- Add or update SQLAlchemy models (UUID primary keys, `timestamptz`, `ON DELETE CASCADE`).
- Create migration: `docker compose run --rm api alembic revision -m "<change>"`.
- Write backward-compatible `upgrade()` and `downgrade()` methods.
- Test migration locally: `make migrate`.

### Step 3: Repositories (`app/repositories/<resource>.py`)
- Write plain async functions for all SQL queries.
- Accept `session: AsyncSession` and `user_id: uuid.UUID` on all user-scoped data.
- Return domain models or `None`. Do **not** raise `HTTPException`.

### Step 4: Services (`app/services/<feature>.py`)
- Implement business rules (validation, limits, LLM orchestration, auto-titling).
- Raise domain exceptions (e.g. `LimitExceededError`). Do **not** import FastAPI.
- For new AI providers, add adapter in `app/llm/` and entry in `providers.yaml`.

### Step 5: Routes (`app/api/v1/<resource>.py`)
- Implement thin HTTP handlers.
- Inject dependencies: `user: User = Depends(get_current_user)`, `session: AsyncSession = Depends(get_session)`.
- Catch service exceptions and raise `HTTPException(status_code, detail)`.
- Register the router in `app/api/v1/router.py`.

### Step 6: Tests (`tests/`)
- Add unit tests in `tests/test_services.py` or `tests/test_repositories.py`.
- Add route tests in `tests/test_<resource>.py` covering:
  - Happy path.
  - Validation failures (`400` / `422`).
  - Missing resource (`404`).
  - Other user's data returns `404`.
  - Rate limits (`429`).
- Run `make test` and `make lint`.
