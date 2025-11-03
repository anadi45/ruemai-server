from fastapi import APIRouter
from app.api.v1.endpoints import demo_automation

api_router = APIRouter()

api_router.include_router(demo_automation.router, prefix="/demo", tags=["demo"])
