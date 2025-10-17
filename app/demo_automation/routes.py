from fastapi import APIRouter, Form, File, UploadFile, HTTPException
from app.demo_automation.service import create_demo
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/demo", tags=["demo"])

@router.post("/create-demo")
async def create_demo_endpoint(
    task: str = Form(...),
    featureName: str = Form(None),
    featureDocs: UploadFile = File(None),
):
    """Create demo endpoint that accepts a task and optional feature details, then executes browser automation."""
    try:
        logger.info(f"Creating demo for task: {task}")
        
        # Call the service method with all business logic
        response_data = await create_demo(task, featureName, featureDocs)
        
        logger.info(f"Demo creation completed with status: {response_data.get('automation_result', {}).get('success', False)}")
        return response_data
            
    except Exception as e:
        logger.error(f"Error in create_demo endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during demo creation: {str(e)}"
        )