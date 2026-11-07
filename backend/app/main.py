"""FastAPI application entry point."""

from fastapi import FastAPI

from app.api.v1 import chat
from app.core.config import get_settings


def create_app() -> FastAPI:
    get_settings()  # Fail fast on unsafe or incomplete settings.
    app = FastAPI(title="Lightweight AI Chat", version="0.1.0")
    app.include_router(chat.router, prefix="/api/v1")

    @app.get("/healthz", tags=["health"])
    async def healthz() -> dict[str, str]:
        # Never touches the database, so health checks can't wake Aurora.
        return {"status": "ok"}

    return app


app = create_app()
