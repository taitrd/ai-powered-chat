"""FastAPI application entry point."""

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router as api_v1_router
from app.core.config import get_settings
from app.core.pause import (
    DAILY_LIMIT_CODE,
    PAUSED_MESSAGE,
    is_paused,
    resumes_at,
    seconds_until_resume,
)

# Paths that never touch the database, so they keep working while the demo is paused.
ALWAYS_AVAILABLE = ("/api/v1/status", "/api/v1/models")


def create_app() -> FastAPI:
    get_settings()  # Fail fast on unsafe or incomplete settings.
    app = FastAPI(title="Lightweight AI Chat", version="0.1.0")

    # Allow CORS across origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def daily_pause(request: Request, call_next):
        # While paused, refuse chat API calls before any database access, so Aurora
        # can stay asleep. The website itself and cached chats still load.
        path = request.url.path
        if path.startswith("/api/") and not path.startswith(ALWAYS_AVAILABLE):
            if await is_paused():
                return JSONResponse(
                    status_code=503,
                    content={
                        "detail": PAUSED_MESSAGE,
                        "code": DAILY_LIMIT_CODE,
                        "resumes_at": resumes_at().isoformat(),
                    },
                    headers={"Retry-After": str(seconds_until_resume())},
                )
        return await call_next(request)

    app.include_router(api_v1_router, prefix="/api/v1")

    @app.get("/healthz", tags=["health"])
    async def healthz() -> dict[str, str]:
        # Never touches the database, so health checks can't wake Aurora.
        return {"status": "ok"}

    # Mount static assets and serve SPA if static directory exists
    static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
    if os.path.isdir(static_dir):
        assets_dir = os.path.join(static_dir, "assets")
        if os.path.isdir(assets_dir):
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/{full_path:path}", tags=["spa"])
        async def serve_spa(full_path: str):
            file_path = os.path.join(static_dir, full_path)
            if full_path and os.path.isfile(file_path):
                return FileResponse(file_path)
            index_path = os.path.join(static_dir, "index.html")
            if os.path.isfile(index_path):
                return FileResponse(index_path)
            return {"status": "ok"}

    return app


app = create_app()
