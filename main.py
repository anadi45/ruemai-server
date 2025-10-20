from fastapi import FastAPI
from app.demo_automation.routes import router as demo_router
from app.voice_agent.routes import router as voice_router

app = FastAPI(title="RUEM Server", description="A basic FastAPI server", version="1.0.0")

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

