from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
import logging
from app.voice_agent.service import voice_agent_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/status", response_model=Dict[str, Any])
async def get_agent_status() -> Dict[str, Any]:
    """
    Get the current status of the voice agent.
    
    Returns:
        Dict containing the agent's running status and current state
    """
    try:
        return {
            "is_running": voice_agent_service.is_running,
            "status": "active" if voice_agent_service.is_running else "inactive",
            "message": "Voice agent status retrieved successfully"
        }
    except Exception as e:
        logger.error(f"Error retrieving voice agent status: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve voice agent status"
        )
