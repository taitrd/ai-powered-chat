"""Service status for the frontend: is the demo paused for today? Never touches the database."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.pause import PAUSED_MESSAGE, is_paused, resumes_at

router = APIRouter(prefix="/status", tags=["status"])


class StatusOut(BaseModel):
    paused: bool
    resumes_at: str | None = None
    message: str | None = None


@router.get("", response_model=StatusOut)
async def get_status() -> StatusOut:
    if await is_paused():
        return StatusOut(paused=True, resumes_at=resumes_at().isoformat(), message=PAUSED_MESSAGE)
    return StatusOut(paused=False)
