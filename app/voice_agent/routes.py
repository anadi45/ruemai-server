from fastapi import APIRouter, File, UploadFile, HTTPException
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


@router.post("/start")
async def start_agent():
    """Manually start the voice agent"""
    if voice_agent_service.is_running:
        return {"message": "Voice agent is already running", "status": "already_running"}
    
    try:
        await voice_agent_service.start_agent()
        return {"message": "Voice agent started successfully", "status": "started"}
    except Exception as e:
        logger.error(f"Failed to start voice agent: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start voice agent: {str(e)}")


@router.post("/stop")
async def stop_agent():
    """Manually stop the voice agent"""
    if not voice_agent_service.is_running:
        return {"message": "Voice agent is not running", "status": "already_stopped"}
    
    try:
        await voice_agent_service.stop_agent()
        return {"message": "Voice agent stopped successfully", "status": "stopped"}
    except Exception as e:
        logger.error(f"Failed to stop voice agent: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to stop voice agent: {str(e)}")
