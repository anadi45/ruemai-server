from fastapi import APIRouter, Form, File, UploadFile, HTTPException
from app.services.browser_automation import execute_browser_task
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/demo", tags=["demo"])

@router.post("/create-demo")
async def create_demo(
    task: str = Form(...),
    featureName: str = Form(None),
    featureDocs: UploadFile = File(None),
):
    """Create demo endpoint that accepts a task and optional feature details, then executes browser automation."""
    try:
        logger.info(f"Executing browser automation task: {task}")
        
        # Execute the browser automation task
        automation_result = await execute_browser_task(task)
        
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
        if featureName:
            response_data["feature_name"] = featureName
        
        if featureDocs:
            response_data["uploaded_file"] = featureDocs.filename
        
        # Add error details if automation failed
        if not automation_result["success"]:
            response_data["automation_result"]["error"] = automation_result.get("error")
            response_data["message"] = "Demo created but automation failed"
        
        logger.info(f"Demo execution completed with status: {automation_result['success']}")
        return response_data
            
    except Exception as e:
        logger.error(f"Error in create_demo endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during demo creation: {str(e)}"
        )

