from typing import Dict, Any, Callable, Optional
from browser_use import Browser, sandbox, ChatBrowserUse
from browser_use.agent.service import Agent
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# Store the live URL from browser creation
_live_url: Optional[str] = None


def get_live_url() -> Optional[str]:
    """
    Get the stored live URL from the browser session.

    Returns:
        str: The live URL if available, None otherwise
    """
    return _live_url


def _add_task_instructions(task: str) -> str:
    """
    Add default instructions to the task.

    Args:
        task (str): The original task instruction

    Returns:
        str: Task with additional instructions appended
    """
    return f"{task}\n\n Instructions:\n 1. Whenever you enter a value in a dropdown, then you need to press Enter key to select the value from the dropdown. 2. If you are not able to find the value in the dropdown, then you need to create a new value in the dropdown to proceed."


def _on_browser_created(data):
    """
    Callback function when browser is created.
    Stores and logs the live URL if available.
    """
    global _live_url
    if hasattr(data, "live_url") and data.live_url:
        _live_url = data.live_url
        logger.info(f"Live URL: {_live_url}")


def _create_sandboxed_task(task: str) -> Callable:
    """
    Create a sandboxed task function that captures the task in a closure.

    Args:
        task (str): The task instruction for the browser automation agent

    Returns:
        Callable: Sandboxed function ready to execute
    """
    task_with_instructions = _add_task_instructions(task)

    @sandbox(on_browser_created=_on_browser_created)
    async def _run_automation_task(browser: Browser) -> Dict[str, Any]:
        """
        Internal function that runs the automation task using sandbox pattern.

        Args:
            browser (Browser): Browser instance provided by sandbox

        Returns:
            Dict[str, Any]: Result containing success status and details
        """
        try:
            agent = Agent(
                task=task_with_instructions, browser=browser, llm=ChatBrowserUse()
            )

            result = await agent.run()

            # Extract final result message
            final_result_message = (
                result.final_result()
                if result.final_result()
                else "No final result available"
            )

            logger.info("Task execution completed")
            return {
                "success": True,
                "message": "Task executed successfully",
                "final_result": final_result_message,
                "agent_result": result,
            }

        except Exception as e:
            logger.error(f"Error during task execution: {str(e)}")
            return {
                "success": False,
                "message": f"Task execution failed: {str(e)}",
                "error": str(e),
            }

    return _run_automation_task


async def execute_browser_task(
    task: str, return_live_url: bool = False
) -> Dict[str, Any]:
    """
    Execute a browser automation task using sandbox pattern.

    Args:
        task (str): The task instruction for the browser automation agent
        return_live_url (bool): Whether to include the live URL in the response

    Returns:
        Dict[str, Any]: Result containing success status and details, optionally including live_url
    """
    try:
        global _live_url
        _live_url = None  # Reset live URL before starting new task

        logger.info(f"Executing browser automation task")

        # Create sandboxed task function with task captured in closure
        sandboxed_task = _create_sandboxed_task(task)

        # Run the sandboxed automation task (this will trigger browser creation)
        result = await sandboxed_task()

        # If live URL was requested and captured, add it to result
        if return_live_url and _live_url:
            result["live_url"] = _live_url

        return result

    except Exception as e:
        logger.error(f"Error during task execution: {str(e)}")
        return {
            "success": False,
            "message": f"Task execution failed: {str(e)}",
            "error": str(e),
        }
