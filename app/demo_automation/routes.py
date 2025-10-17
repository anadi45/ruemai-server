from fastapi import APIRouter, Form, File, UploadFile, HTTPException
from app.services.browser_automation import login_to_website
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/demo", tags=["demo"])

@router.post("/create-demo")
async def create_demo(
    username: str = Form(...),
    password: str = Form(...),
    websiteUrl: str = Form(...),
    featureName: str = Form(...),
    featureDocs: UploadFile = File(...),
):
    """Create demo endpoint that accepts form data including file upload and attempts login."""
    try:
        # Attempt to login to the website using browser automation
        login_result = await login_to_website(websiteUrl, username, password)
        
        if login_result["success"]:
            logger.info(f"Login successful for user {username} on {websiteUrl}")
            return {
                "status": 200,
                "message": "Demo created successfully",
                "login_status": "success",
                "login_details": {
                    "success": True,
                    "message": login_result["message"],
                    "final_url": login_result.get("url"),
                    "page_title": login_result.get("title")
                },
                "feature_name": featureName,
                "uploaded_file": featureDocs.filename
            }
        else:
            logger.warning(f"Login failed for user {username} on {websiteUrl}: {login_result['message']}")
            return {
                "status": 200,
                "message": "Demo created but login failed",
                "login_status": "failed",
                "login_details": {
                    "success": False,
                    "message": login_result["message"],
                    "error": login_result.get("error")
                },
                "feature_name": featureName,
                "uploaded_file": featureDocs.filename
            }
            
    except Exception as e:
        logger.error(f"Error in create_demo endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during demo creation: {str(e)}"
        )
