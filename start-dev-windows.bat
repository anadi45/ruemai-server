@echo off
echo Killing any processes on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
    echo Killing process %%a
    taskkill /f /pid %%a 2>nul
)
echo Waiting 2 seconds for processes to terminate...
timeout /t 2 /nobreak >nul
echo Starting development server...
nest start --watch
