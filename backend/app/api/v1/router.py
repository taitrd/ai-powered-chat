"""API v1 Router aggregating sub-routers."""

from fastapi import APIRouter

from app.api.v1.conversations import router as conversations_router
from app.api.v1.messages import router as messages_router
from app.api.v1.models import router as models_router
from app.api.v1.status import router as status_router

api_router = APIRouter()
api_router.include_router(conversations_router)
api_router.include_router(messages_router)
api_router.include_router(models_router)
api_router.include_router(status_router)
