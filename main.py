from fastapi import FastAPI
from contextlib import asynccontextmanager
import logging
from app.demo_automation.routes import router as demo_router
from app.voice_agent.routes import router as voice_router
from app.voice_agent.service import voice_agent_service

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting RUEM Server...")
    try:
        # Start the voice agent service
        await voice_agent_service.start_agent()
        logger.info("Voice agent service started successfully")
    except Exception as e:
        logger.error(f"Failed to start voice agent service: {e}")
        # Continue server startup even if voice agent fails
    
    yield
    
    # Shutdown
    logger.info("Shutting down RUEM Server...")
    try:
        await voice_agent_service.stop_agent()
        logger.info("Voice agent service stopped successfully")
    except Exception as e:
        logger.error(f"Error stopping voice agent service: {e}")


app = FastAPI(
    title="RUEM Server", 
    description="A basic FastAPI server with integrated voice agent", 
    version="1.0.0",
    lifespan=lifespan
)

# Include demo automation router
app.include_router(demo_router)
app.include_router(voice_router)

@app.get("/")
async def root():
    """Root endpoint that returns a welcome message."""
    return {"message": "Welcome to RUEM Server", "status": "running"}

@app.get("/health")
async def health():
    """Health check endpoint that returns server status."""
    return {"status": "healthy", "message": "Server is running properly"}

