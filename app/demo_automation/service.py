import logging
from typing import Optional, Dict, Any
from fastapi import UploadFile
from app.services.browser_automation import execute_browser_task
from app.services.gemini_service import extract_feature_usage_from_file

logger = logging.getLogger(__name__)

class DemoAutomationService:
    """Service for handling demo automation tasks with feature usage instructions."""
    
    def __init__(self):
        pass
    
    def _combine_task_with_feature_instructions(self, task: str, feature_usage_instructions: Optional[str] = None) -> str:
        """
        Combine the original task with feature usage instructions if provided.
        
        Args:
            task (str): The original task string
            feature_usage_instructions (Optional[str]): Feature usage instructions to append
            
        Returns:
            str: Combined task string with feature instructions appended
        """
        try:
            logger.info("Combining task with feature usage instructions")
            
            # Start with the original task
            combined_task = task
            
            # If feature usage instructions are provided, append them
            if feature_usage_instructions and feature_usage_instructions.strip():
                logger.info("Appending feature usage instructions to task")
                combined_task = f"{task}\n\nFeature Usage Instructions:\n{feature_usage_instructions.strip()}"
            else:
                logger.info("No feature usage instructions provided, using original task")
            
            logger.info(f"Combined task length: {len(combined_task)} characters")
            return combined_task
            
        except Exception as e:
            logger.error(f"Error combining task with feature instructions: {str(e)}")
            # Return original task if combination fails
            return task
    
    async def _prepare_demo_task(self, task: str, feature_usage_instructions: Optional[str] = None) -> str:
        """
        Prepare the demo task by combining it with feature usage instructions.
        
        Args:
            task (str): The original task string
            feature_usage_instructions (Optional[str]): Feature usage instructions to append
            
        Returns:
            str: Prepared task string ready for browser automation
        """
        try:
            logger.info("Preparing demo task with feature instructions")
            return self._combine_task_with_feature_instructions(task, feature_usage_instructions)
        except Exception as e:
            logger.error(f"Error preparing demo task: {str(e)}")
            raise

    async def create_demo(self, task: str, feature_name: Optional[str] = None, feature_docs: Optional[UploadFile] = None) -> Dict[str, Any]:
        """
        Main method to create a demo with all business logic.
        
        Args:
            task (str): The task to execute
            feature_name (Optional[str]): Name of the feature
            feature_docs (Optional[UploadFile]): Feature documentation file
            
        Returns:
            Dict[str, Any]: Complete response data with automation results
        """
        try:
            logger.info(f"Creating demo for task: {task}")
            
            # Process feature docs if provided
            feature_usage_instructions = None
            if feature_docs:
                logger.info(f"Processing feature documentation: {feature_docs.filename}")
                file_content = await feature_docs.read()
                feature_usage_instructions = await extract_feature_usage_from_file(file_content, feature_docs.filename)
                logger.info("Feature usage instructions extracted successfully")

            print("feature_usage_instructions: ", feature_usage_instructions)
            
            # Prepare the demo task by combining it with feature usage instructions
            prepared_task = await self._prepare_demo_task(task, feature_usage_instructions)
            logger.info(f"Prepared task for execution: {prepared_task[:200]}...")
            
            # Execute the browser automation task with the prepared task
            automation_result = await execute_browser_task(prepared_task)
            
            # Prepare response data
            response_data = {
                "status": 200,
                "message": "Demo created successfully",
                "task": task,
                "automation_result": {
                    "success": automation_result["success"],
                    "message": automation_result["message"],
                    "final_result": automation_result.get("final_result", "No result available")
                }
            }
            
            # Add optional feature details if provided
            if feature_name:
                response_data["feature_name"] = feature_name
            
            if feature_docs:
                response_data["uploaded_file"] = feature_docs.filename
                response_data["feature_usage_instructions"] = feature_usage_instructions
            
            # Add error details if automation failed
            if not automation_result["success"]:
                response_data["automation_result"]["error"] = automation_result.get("error")
                response_data["message"] = "Demo created but automation failed"
            
            logger.info(f"Demo execution completed with status: {automation_result['success']}")
            return response_data
                
        except Exception as e:
            logger.error(f"Error in create_demo: {str(e)}")
            raise

# Convenience function for easy usage
async def create_demo(task: str, feature_name: Optional[str] = None, feature_docs: Optional[UploadFile] = None) -> Dict[str, Any]:
    """
    Convenience function to create a demo with all business logic.
    
    Args:
        task (str): The task to execute
        feature_name (Optional[str]): Name of the feature
        feature_docs (Optional[UploadFile]): Feature documentation file
        
    Returns:
        Dict[str, Any]: Complete response data with automation results
    """
    service = DemoAutomationService()
    return await service.create_demo(task, feature_name, feature_docs)