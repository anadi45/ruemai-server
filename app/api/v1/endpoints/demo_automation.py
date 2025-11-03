from fastapi import APIRouter, Form, File, UploadFile, HTTPException, Depends
from typing import Dict, Any, Optional
import logging
from app.demo_automation.service import DemoAutomationService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/create-demo", response_model=Dict[str, Any])
async def create_demo(
    task: str = Form(..., description="The task to be automated"),
    featureName: Optional[str] = Form(None, description="Optional feature name"),
    featureDocs: Optional[UploadFile] = File(
        None, description="Optional feature documentation file"
    ),
) -> Dict[str, Any]:
    """
    Create demo endpoint that accepts a task and optional feature details,
    then executes browser automation.

    Args:
        task: The automation task to perform
        featureName: Optional name of the feature being demonstrated
        featureDocs: Optional documentation file for the feature

    Returns:
        Dict containing the demo creation result

    Raises:
        HTTPException: If demo creation fails
    """
    try:
        logger.info(f"Creating demo for task: {task}")

        result = await DemoAutomationService.create_demo(
            task=task, feature_name=featureName, feature_docs=featureDocs
        )

        logger.info("Demo created successfully")
        return {"success": True, "message": "Demo created successfully", "data": result}

    except Exception as e:
        logger.error(f"Error in create_demo endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during demo creation: {str(e)}",
        )
