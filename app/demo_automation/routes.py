from fastapi import APIRouter, Form, File, UploadFile

router = APIRouter(prefix="/demo", tags=["demo"])

@router.post("/create-demo")
async def create_demo(
    username: str = Form(...),
    password: str = Form(...),
    websiteUrl: str = Form(...),
    featureName: str = Form(...),
    featureDocs: UploadFile = File(...),
):
    """Create demo endpoint that accepts form data including file upload."""
    return {"status": 200, "message": "Demo created successfully"}
