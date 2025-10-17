# RuemAI Server

## Setup

1. **Install uv (if not already installed):**
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   # Or with pip: pip install uv
   ```

2. **Install dependencies:**
   ```bash
   uv sync
   ```

## Running the Server

### Development Mode (with hot reload)
```bash
uv run uvicorn main:app --reload
```

### Production Mode
```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

The server will be available at `http://localhost:8000`
