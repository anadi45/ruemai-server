from fastapi import APIRouter, File, UploadFile, HTTPException
from app.voice_agent.service import VoiceAgentService
import logging


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voice", tags=["voice"])


@router.get("/ping")
async def ping():
    """Simple ping endpoint for voice agent."""
    try:
        return await VoiceAgentService.ping()
    except Exception as exc:
        logger.error("Error in voice ping endpoint: %s", str(exc))
        raise HTTPException(status_code=500, detail="Voice agent ping failed")


@router.post("/transcribe")
async def transcribe(audio: UploadFile = File(None)):
    """Accept an audio file and return a placeholder transcription response."""
    try:
        return await VoiceAgentService.transcribe_audio(audio)
    except Exception as exc:
        logger.error("Error in voice transcribe endpoint: %s", str(exc))
        raise HTTPException(status_code=500, detail="Voice agent transcription failed")


