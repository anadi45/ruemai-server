from fastapi import APIRouter
import logging
from app.voice_agent.service import voice_agent_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voice-agent", tags=["voice-agent"])


@router.get("/status")
async def get_agent_status():
    """Get the current status of the voice agent"""
    return {
        "is_running": voice_agent_service.is_running,
        "status": "active" if voice_agent_service.is_running else "inactive"
    }
