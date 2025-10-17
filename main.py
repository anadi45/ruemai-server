from fastapi import FastAPI

app = FastAPI(title="RUEM Server", description="A basic FastAPI server", version="1.0.0")

@app.get("/")
async def root():
    """Root endpoint that returns a welcome message."""
    return {"message": "Welcome to RUEM Server", "status": "running"}

@app.get("/health")
async def health():
    """Health check endpoint that returns server status."""
    return {"status": "healthy", "message": "Server is running properly"}
