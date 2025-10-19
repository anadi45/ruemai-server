import asyncio
import os
import httpx
from typing import Dict, Any, Optional
from browser_use import Agent, ChatGoogle
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

class BrowserAutomationService:
    """Service for browser automation tasks using browser-use."""
    
    def __init__(self):
        self.agent = None
        self.llm = self._get_llm()
    
    def _get_llm(self):
        """Initialize ChatGoogle LLM."""
        return ChatGoogle(model="gemini-flash-latest")
    
    async def __aenter__(self):
        """Async context manager entry."""
        # Don't create agent here - it needs a task parameter
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.agent:
            try:
                await self.agent.close()
            except:
                pass
    
    async def execute_task(self, task: str) -> Dict[str, Any]:
        """
        Execute a generic browser automation task.
        
        Args:
            task (str): The task instruction for the browser automation agent
            
        Returns:
            Dict[str, Any]: Result containing success status and details
        """
        try:
            logger.info(f"Executing browser automation task")

            task_with_instructions = f"{task}\n\n Instructions:\n 1. Whenever you enter a value in a dropdown, then you need to press Enter key to select the value from the dropdown. 2. If you are not able to find the value in the dropdown, then you need to create a new value in the dropdown to proceed."
            
            # Create the agent with the provided task
            self.agent = Agent(
                task=task_with_instructions,
                llm=self.llm,
                use_vision=True,
                max_steps=15,
                flash_mode=False,
                use_thinking=True
            )
            
            # Run the agent
            result = await self.agent.run()
            
            # Extract final result message
            final_result_message = result.final_result() if result.final_result() else "No final result available"
            
            logger.info("Task execution completed")
            return {
                "success": True,
                "message": "Task executed successfully",
                "final_result": final_result_message,
                "agent_result": result
            }
                
        except Exception as e:
            logger.error(f"Error during task execution: {str(e)}")
            return {
                "success": False,
                "message": f"Task execution failed: {str(e)}",
                "error": str(e)
            }
    
# Convenience functions for easy usage
async def execute_browser_task(task: str) -> Dict[str, Any]:
    """
    Convenience function to execute any browser automation task.
    
    Args:
        task (str): The task instruction for the browser automation agent
        
    Returns:
        Dict[str, Any]: Result containing success status and details
    """
    async with BrowserAutomationService() as browser_service:
        return await browser_service.execute_task(task)
