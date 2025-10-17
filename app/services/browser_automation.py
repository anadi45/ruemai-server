import asyncio
from typing import Dict, Any
from browser_use import Agent
import logging

logger = logging.getLogger(__name__)

class BrowserAutomationService:
    """Service for browser automation tasks using browser-use."""
    
    def __init__(self):
        self.agent = None
    
    async def __aenter__(self):
        """Async context manager entry."""
        self.agent = Agent(
            task="Login to website",
            llm=None,  # browser-use will use default LLM
            use_vision=True,
            max_steps=10  # Explicitly set max_steps as integer
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.agent:
            try:
                await self.agent.close()
            except:
                pass
    
    async def login_to_website(self, website_url: str, username: str, password: str) -> Dict[str, Any]:
        """
        Attempt to login to a website using provided credentials.
        
        Args:
            website_url (str): The URL of the website to login to
            username (str): Username for login
            password (str): Password for login
            
        Returns:
            Dict[str, Any]: Result containing success status and details
        """
        try:
            logger.info(f"Attempting to login to {website_url}")
            
            # Create a detailed login instruction for the agent
            login_instruction = f"""
            Navigate to {website_url} and login using the following credentials:
            Username: {username}
            Password: {password}
            
            Please:
            1. Go to the website
            2. Find the login form
            3. Enter the username and password
            4. Submit the form
            5. Check if login was successful
            
            If login is successful, you should see a dashboard, profile page, or similar authenticated content.
            If login fails, you should see an error message.
            """
            
            # Run the agent with the login instruction
            # Note: The run method expects max_steps as first parameter, not the instruction
            # We need to set the task on the agent first, then run without parameters
            self.agent.task = login_instruction
            result = await self.agent.run()
            
            # Analyze the result to determine success
            success = self._analyze_login_result(result, website_url)
            
            if success:
                logger.info("Login successful")
                return {
                    "success": True,
                    "message": "Login successful",
                    "url": result.get("url", website_url),
                    "title": result.get("title", ""),
                    "agent_result": result
                }
            else:
                logger.warning("Login failed")
                return {
                    "success": False,
                    "message": "Login failed - could not authenticate",
                    "url": result.get("url", website_url),
                    "agent_result": result
                }
                
        except Exception as e:
            logger.error(f"Error during login process: {str(e)}")
            return {
                "success": False,
                "message": f"Login process failed: {str(e)}",
                "error": str(e)
            }
    
    def _analyze_login_result(self, result: Dict[str, Any], original_url: str) -> bool:
        """
        Analyze the agent result to determine if login was successful.
        
        Args:
            result (Dict[str, Any]): Result from browser-use agent
            original_url (str): Original website URL
            
        Returns:
            bool: True if login appears successful, False otherwise
        """
        try:
            # Check if we're still on the login page (indicates failure)
            current_url = result.get("url", "")
            if "login" in current_url.lower() or "signin" in current_url.lower():
                return False
            
            # Check for success indicators in the result
            result_text = str(result).lower()
            success_indicators = [
                "dashboard", "profile", "welcome", "logout", "account", 
                "settings", "authenticated", "logged in"
            ]
            
            failure_indicators = [
                "invalid", "incorrect", "wrong", "failed", "error", 
                "denied", "unauthorized", "login failed"
            ]
            
            # Check for failure indicators first
            for indicator in failure_indicators:
                if indicator in result_text:
                    return False
            
            # Check for success indicators
            for indicator in success_indicators:
                if indicator in result_text:
                    return True
            
            # If URL changed from original, assume success
            if current_url != original_url and current_url:
                return True
            
            # Default to failure if we can't determine
            return False
            
        except Exception as e:
            logger.error(f"Error analyzing login result: {str(e)}")
            return False

# Convenience function for easy usage
async def login_to_website(website_url: str, username: str, password: str) -> Dict[str, Any]:
    """
    Convenience function to login to a website using browser-use.
    
    Args:
        website_url (str): The URL of the website to login to
        username (str): Username for login
        password (str): Password for login
        
    Returns:
        Dict[str, Any]: Result containing success status and details
    """
    async with BrowserAutomationService() as browser_service:
        return await browser_service.login_to_website(website_url, username, password)
