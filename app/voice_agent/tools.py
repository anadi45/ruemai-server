import json
import os
import random
import asyncio
import sys
from pathlib import Path
from livekit.agents import (
    function_tool,
    get_job_context,
    RunContext,
    ToolError,
)

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from app.services.browser_automation import get_live_url


@function_tool()
async def get_user_location(context: RunContext, high_accuracy: bool):
    """Retrieve the user's current geolocation as lat/lng.

    Args:
        high_accuracy: Whether to use high accuracy mode, which is slower but more precise

    Returns:
        A dictionary containing latitude and longitude coordinates
    """
    RPC_METHOD = "getUserLocation"

    try:
        room = get_job_context().room
        participant_identity = next(iter(room.remote_participants))
        response = await room.local_participant.perform_rpc(
            destination_identity=participant_identity,
            method=RPC_METHOD,
            payload=json.dumps({"highAccuracy": high_accuracy}),
            response_timeout=10.0 if high_accuracy else 5.0,
        )
        return response
    except Exception:
        raise ToolError("Unable to retrieve user location")


@function_tool()
async def present_file_to_user(context: RunContext):
    """Present a file to the user by attaching it to the conversation for their reference.

    Returns:
        A dictionary containing file information and attachment status
    """
    RPC_METHOD = "presentFileToUser"

    try:
        # Get the storage directory path
        storage_dir = os.path.join(
            os.path.dirname(__file__), "..", "..", "storage", "actions"
        )
        print(f"Storage directory: {storage_dir}")

        # Check if directory exists
        if not os.path.exists(storage_dir):
            return {"error": "Storage directory not found"}

        # Get list of available files
        available_files = [
            f
            for f in os.listdir(storage_dir)
            if os.path.isfile(os.path.join(storage_dir, f))
        ]

        if not available_files:
            return {"error": "No files available in storage"}

        # Select a random file
        selected_file = random.choice(available_files)
        file_path = os.path.join(storage_dir, selected_file)

        # Get file info
        file_size = os.path.getsize(file_path)
        file_extension = os.path.splitext(selected_file)[1]

        # Get file metadata
        file_info = {
            "filename": selected_file,
            "size": file_size,
            "extension": file_extension,
        }

        # Send file information to frontend via RPC (with better error handling)
        try:
            room = get_job_context().room
            if room and room.remote_participants:
                participant_identity = next(iter(room.remote_participants))
                await room.local_participant.perform_rpc(
                    destination_identity=participant_identity,
                    method=RPC_METHOD,
                    payload=json.dumps(
                        {
                            "filename": selected_file,
                            "fileSize": file_size,
                            "fileExtension": file_extension,
                        }
                    ),
                    response_timeout=10.0,
                )
                print(f"Successfully sent file attachment: {selected_file}")
            else:
                print("No remote participants available for RPC")
        except Exception as e:
            print(f"Failed to send file info to frontend: {e}")
            # Don't fail the tool if RPC fails

        return {
            "success": True,
            "message": f"I have attached the file '{selected_file}' for your reference. Please click on it to get more insights.",
            "file_info": file_info,
        }

    except Exception as e:
        print(f"Error in present_file_to_user tool: {e}")
        return {"error": f"Unable to attach file: {str(e)}"}


@function_tool()
async def present_demo_to_user(context: RunContext):
    """Present a demo automation to the user that shows a browser performing tasks in real-time.
    This will execute a pre-configured demo automation and display the browser session in an iframe.

    Returns:
        A dictionary containing demo execution status and live URL
    """
    RPC_METHOD = "presentDemoToUser"

    try:
        # Hardcoded demo task
        demo_task = "Go to https://app.gorattle.com/home and login using harshith1234@gorattle.com & 12345678. Then create a general workflow with salesforce as source and opportunity as principal object"

        print("Starting demo automation...")

        # Import browser automation functions to create task directly
        from app.services.browser_automation import _create_sandboxed_task

        # Create sandboxed task function
        sandboxed_task = _create_sandboxed_task(demo_task)

        # Start the browser automation task in the background
        async def run_automation():
            try:
                result = await sandboxed_task()
                print(f"Demo automation completed: {result}")
            except Exception as e:
                print(f"Demo automation error: {e}")

        # Create background task
        automation_task = asyncio.create_task(run_automation())

        # Wait a bit for browser to be created and get live URL
        max_wait_time = 15  # seconds
        wait_interval = 0.5  # seconds
        waited = 0

        live_url = None
        while waited < max_wait_time and not live_url:
            await asyncio.sleep(wait_interval)
            waited += wait_interval
            live_url = get_live_url()
            if live_url:
                print(f"Got live URL: {live_url}")
                break

        # Send demo URL to frontend via RPC
        if live_url:
            try:
                room = get_job_context().room
                if room and room.remote_participants:
                    participant_identity = next(iter(room.remote_participants))
                    await room.local_participant.perform_rpc(
                        destination_identity=participant_identity,
                        method=RPC_METHOD,
                        payload=json.dumps(
                            {
                                "liveUrl": live_url,
                                "type": "demo",
                            }
                        ),
                        response_timeout=10.0,
                    )
                    print(f"Successfully sent demo URL to frontend: {live_url}")
                else:
                    print("No remote participants available for RPC")
            except Exception as e:
                print(f"Failed to send demo URL to frontend: {e}")
                # Don't fail the tool if RPC fails

        # Continue with automation in background (don't wait for it)
        # The automation will complete independently

        return {
            "success": True,
            "message": "Here is the demo.",
            "live_url": live_url,
        }

    except Exception as e:
        print(f"Error in present_demo_to_user tool: {e}")
        return {"error": f"Unable to start demo: {str(e)}"}
