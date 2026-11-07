"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import chat
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()  # Fail fast on unsafe or incomplete settings.
    app = FastAPI(title="Lightweight AI Chat", version="0.1.0")

    # Local development CORS (in production, CloudFront serves both on the same origin)
    if settings.app_env in ("local", "test"):
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(chat.router, prefix="/api/v1")
    app.include_router(chat.models_router, prefix="/api/v1")

    @app.get("/healthz", tags=["health"])
    async def healthz() -> dict[str, str]:
        # Never touches the database, so health checks can't wake Aurora.
        return {"status": "ok"}

    return app


app = create_app()
