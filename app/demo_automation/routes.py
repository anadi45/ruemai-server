from fastapi import APIRouter, Form, File, UploadFile, HTTPException
from app.demo_automation.service import DemoAutomationService
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
        return await DemoAutomationService.create_demo(
            task=task,
            feature_name=featureName,
            feature_docs=featureDocs
        )
            
    except Exception as e:
        logger.error(f"Error in create_demo endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during demo creation: {str(e)}"
        )

