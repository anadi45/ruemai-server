import logging
from typing import Optional
from fastapi import UploadFile


logger = logging.getLogger(__name__)


class VoiceAgentService:
    """Service class for handling voice agent business logic."""

    @staticmethod
    async def ping() -> dict:
        """Health-style ping for the voice agent module."""
        logger.info("VoiceAgentService.ping called")
        return {"status": 200, "message": "voice agent is reachable"}

    @staticmethod
    async def transcribe_audio(audio_file: Optional[UploadFile]) -> dict:
        """Placeholder transcription method.

        Args:
            audio_file: Optional uploaded audio file

        Returns:
            dict: Minimal response to confirm receipt; replace with real pipeline later.
        """
        if not audio_file:
            return {
                "status": 400,
                "message": "No audio file provided",
            }

        logger.info("Received audio file for transcription: %s", audio_file.filename)
        # NOTE: Replace with real ASR pipeline and streaming support in future work
        content = await audio_file.read()
        size_bytes = len(content) if content is not None else 0
        return {
            "status": 200,
            "message": "Audio received",
            "filename": audio_file.filename,
            "size_bytes": size_bytes,
        }


