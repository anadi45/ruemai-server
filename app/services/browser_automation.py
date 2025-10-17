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
            
            # Extract final result message
            final_result_message = result.final_result() if result.final_result() else "No final result available"
            
            if success:
                logger.info("Login successful")
                return {
                    "success": True,
                    "message": "Login successful",
                    "final_result": final_result_message,
                    "agent_result": result
                }
            else:
                logger.warning("Login failed")
                return {
                    "success": False,
                    "message": "Login failed - could not authenticate",
                    "final_result": final_result_message,
                    "agent_result": result
                }
                
        except Exception as e:
            logger.error(f"Error during login process: {str(e)}")
            return {
                "success": False,
                "message": f"Login process failed: {str(e)}",
                "error": str(e)
            }
    
    def _analyze_login_result(self, result, original_url: str) -> bool:
        """
        Analyze the agent result to determine if login was successful.
        
        Args:
            result: AgentHistoryList from browser-use agent
            original_url (str): Original website URL
            
        Returns:
            bool: True if login appears successful, False otherwise
        """
        try:
            # Get the final result message from the agent
            final_result = result.final_result()
            if not final_result:
                return False
            
            # Convert to lowercase for analysis
            result_text = final_result.lower()
            
            # Check for success indicators
            success_indicators = [
                "dashboard", "profile", "welcome", "logout", "account", 
                "settings", "authenticated", "logged in", "success", "completed"
            ]
            
            failure_indicators = [
                "invalid", "incorrect", "wrong", "failed", "error", 
                "denied", "unauthorized", "login failed", "unable to", "cannot"
            ]
            
            # Check for failure indicators first
            for indicator in failure_indicators:
                if indicator in result_text:
                    return False
            
            # Check for success indicators
            for indicator in success_indicators:
                if indicator in result_text:
                    return True
            
            # Check the action results for any browser state changes
            action_results = result.action_results()
            if action_results:
                # Look at the last action result for any success indicators
                last_result = action_results[-1]
                if hasattr(last_result, 'extracted_content') and last_result.extracted_content:
                    content = last_result.extracted_content.lower()
                    for indicator in success_indicators:
                        if indicator in content:
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
