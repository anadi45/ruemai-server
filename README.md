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

3. **Set up environment variables:**
   Copy the sample environment file and configure your API keys:
   ```bash
   # Copy the sample environment file
   cp .env.sample .env
   ```
   
   Edit the `.env` file and replace the placeholder values with your actual API keys:
   - **GOOGLE_API_KEY**: Get your API key from [Google AI Studio](https://aistudio.google.com/api-keys)
   - **BROWSER_USE_API_KEY**: Get your API key from [Browser Use Cloud](https://cloud.browser-use.com/settings)

## Running the Server

### Development Mode (with hot reload)
```bash
uv run uvicorn main:app --reload
uv run python app/voice_agent/agent.py dev # Run the agent
```

### Production Mode
```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

The server will be available at `http://localhost:8000`
