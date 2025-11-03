from fastapi import FastAPI
import logging
from app.api.v1.api import api_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="RUEM Server",
    description="A FastAPI server with voice agent capabilities",
    version="1.0.0",
)

# Include API router with all endpoints
app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root():
    """Root endpoint that returns a welcome message."""
    return {"message": "Welcome to RUEM Server", "status": "running"}


@app.get("/health")
async def health():
    """Health check endpoint that returns server status."""
    return {"status": "healthy", "message": "Server is running properly"}
