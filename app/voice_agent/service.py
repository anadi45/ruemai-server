import asyncio
import logging
import os
import subprocess
import sys
from typing import Optional

logger = logging.getLogger(__name__)


class VoiceAgentService:
    def __init__(self):
        self.agent_process: Optional[subprocess.Popen] = None
        self.is_running = False
        
    async def _start_agent(self):
        """Internal method to start the LiveKit voice agent (used by FastAPI lifespan)"""
        if self.is_running:
            logger.warning("Voice agent is already running")
            return
            
        try:
            logger.info("Starting LiveKit voice agent...")
            
            # Start the agent as a subprocess using the original command
            # This is the most reliable way to avoid CLI integration issues
            self.agent_process = subprocess.Popen([
                "uv", "run", "app/voice_agent/agent.py", "dev"
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            self.is_running = True
            logger.info("LiveKit voice agent started successfully")
        except Exception as e:
            logger.error(f"Failed to start voice agent: {e}")
            raise
    
    async def _stop_agent(self):
        """Internal method to stop the LiveKit voice agent (used by FastAPI lifespan)"""
        if not self.is_running:
            logger.warning("Voice agent is not running")
            return
            
        try:
            logger.info("Stopping LiveKit voice agent...")
            if self.agent_process:
                self.agent_process.terminate()
                try:
                    # Wait for graceful shutdown
                    self.agent_process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    # Force kill if it doesn't stop gracefully
                    self.agent_process.kill()
                    self.agent_process.wait()
                self.agent_process = None
            self.is_running = False
            logger.info("LiveKit voice agent stopped successfully")
        except Exception as e:
            logger.error(f"Error stopping voice agent: {e}")


# Global instance
voice_agent_service = VoiceAgentService()
