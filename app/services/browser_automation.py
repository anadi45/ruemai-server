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
    
    async def fetch_credentials_from_api(self, api_url: str, api_key: Optional[str] = None) -> Dict[str, str]:
        """
        Fetch login credentials from an API endpoint.
        
        Args:
            api_url (str): URL of the API endpoint that returns credentials
            api_key (str, optional): API key for authentication
            
        Returns:
            Dict[str, str]: Dictionary containing username and password
        """
        try:
            headers = {}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            
            async with httpx.AsyncClient() as client:
                response = await client.get(api_url, headers=headers)
                response.raise_for_status()
                
                data = response.json()
                
                # Extract credentials from API response
                # Adjust these keys based on your API response structure
                username = data.get("username") or data.get("user") or data.get("email")
                password = data.get("password") or data.get("pass") or data.get("pwd")
                
                if not username or not password:
                    raise ValueError("API response does not contain valid credentials")
                
                return {
                    "username": username,
                    "password": password
                }
                
        except Exception as e:
            logger.error(f"Error fetching credentials from API: {str(e)}")
            raise
    
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
            
            # Create a detailed login instruction using @login_instruction pattern
            login_instruction = f"""
            @login_instruction
            You are a browser automation agent tasked with logging into a website. Follow these steps carefully:
            
            1. Navigate to: {website_url}
            2. Locate the login form (look for username/email and password fields)
            3. Fill in the credentials:
               - Username/Email: {username}
               - Password: {password}
            4. Submit the login form (click login button or press Enter)
            5. Wait for the page to load and verify login success
            
            Success indicators to look for:
            - Dashboard, profile, or account page
            - Welcome message with user's name
            - Logout button or account menu
            - URL change to authenticated area
            - Absence of login form on the page
            
            Failure indicators:
            - Error messages about invalid credentials
            - Login form still visible
            - "Access denied" or similar messages
            - Redirect back to login page
            
            After attempting login, provide a clear summary of what happened and whether the login was successful.
            """
            
            # Create the agent with the login instruction as the task
            self.agent = Agent(
                task=login_instruction,
                llm=self.llm,
                use_vision=True,
                max_steps=15,  # Increased for more complex login flows
                flash_mode=False,  # Allow thinking for better login decisions
                use_thinking=True
            )
            
            # Run the agent
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

    async def login_with_api_credentials(self, website_url: str, api_url: str, api_key: Optional[str] = None) -> Dict[str, Any]:
        """
        Login to a website using credentials fetched from an API.
        
        Args:
            website_url (str): The URL of the website to login to
            api_url (str): URL of the API endpoint that returns credentials
            api_key (str, optional): API key for authentication
            
        Returns:
            Dict[str, Any]: Result containing success status and details
        """
        try:
            # Fetch credentials from API
            credentials = await self.fetch_credentials_from_api(api_url, api_key)
            
            # Use the fetched credentials to login
            return await self.login_to_website(
                website_url, 
                credentials["username"], 
                credentials["password"]
            )
            
        except Exception as e:
            logger.error(f"Error in login_with_api_credentials: {str(e)}")
            return {
                "success": False,
                "message": f"Failed to fetch credentials or login: {str(e)}",
                "error": str(e)
            }

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

async def login_with_api_credentials(website_url: str, api_url: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    """
    Convenience function to login to a website using credentials from an API.
    
    Args:
        website_url (str): The URL of the website to login to
        api_url (str): URL of the API endpoint that returns credentials
        api_key (str, optional): API key for authentication
        
    Returns:
        Dict[str, Any]: Result containing success status and details
    """
    async with BrowserAutomationService() as browser_service:
        return await browser_service.login_with_api_credentials(website_url, api_url, api_key)
