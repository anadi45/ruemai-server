from dotenv import load_dotenv
import json
import os
import random
from livekit import agents
from livekit.agents import AgentSession, Agent, RoomInputOptions, function_tool, get_job_context, RunContext, ToolError
from livekit.plugins import noise_cancellation, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

load_dotenv(".env")



@function_tool()
async def get_user_location(
    context: RunContext,    
    high_accuracy: bool
):
    """Retrieve the user's current geolocation as lat/lng.
    
    Args:
        high_accuracy: Whether to use high accuracy mode, which is slower but more precise
    
    Returns:
        A dictionary containing latitude and longitude coordinates
    """
    try:
        room = get_job_context().room
        participant_identity = next(iter(room.remote_participants))
        response = await room.local_participant.perform_rpc(
            destination_identity=participant_identity,
            method="getUserLocation",
            payload=json.dumps({
                "highAccuracy": high_accuracy
            }),
            response_timeout=10.0 if high_accuracy else 5.0,
        )
        return response
    except Exception:
        raise ToolError("Unable to retrieve user location")


@function_tool()
async def attach_file(
    context: RunContext,
    file_type: str = "random"
):
    """Attach a file to the conversation for the user's reference.
    
    Args:
        file_type: Type of file to attach (default: "random" for a random file)
    
    Returns:
        A dictionary containing file information and attachment status
    """
    try:
        # Get the storage directory path
        storage_dir = os.path.join(os.path.dirname(__file__), "..", "..", "storage", "actions")
        print(f"Storage directory: {storage_dir}")
        
        # Check if directory exists
        if not os.path.exists(storage_dir):
            return {"error": "Storage directory not found"}
        
        # Get list of available files
        available_files = [f for f in os.listdir(storage_dir) if os.path.isfile(os.path.join(storage_dir, f))]
        
        if not available_files:
            return {"error": "No files available in storage"}
        
        # Select a random file
        selected_file = random.choice(available_files)
        file_path = os.path.join(storage_dir, selected_file)
        
        # Get file info
        file_size = os.path.getsize(file_path)
        file_extension = os.path.splitext(selected_file)[1]
        
        # Read file content (for text files) or just metadata
        file_info = {
            "filename": selected_file,
            "size": file_size,
            "extension": file_extension,
            "path": file_path
        }
        
        # For text files, include content preview
        if file_extension in ['.txt', '.json']:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    # Truncate if too long
                    if len(content) > 500:
                        content = content[:500] + "..."
                    file_info["content_preview"] = content
            except Exception:
                file_info["content_preview"] = "Unable to read file content"
        
        # Send file information to frontend via RPC (with better error handling)
        try:
            room = get_job_context().room
            if room and room.remote_participants:
                participant_identity = next(iter(room.remote_participants))
                await room.local_participant.perform_rpc(
                    destination_identity=participant_identity,
                    method="attachFile",
                    payload=json.dumps({
                        "filename": selected_file,
                        "fileSize": file_size,
                        "fileExtension": file_extension,
                        "filePath": file_path,
                        "contentPreview": file_info.get("content_preview", "")
                    }),
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
            "file_info": file_info
        }
        
    except Exception as e:
        print(f"Error in attach_file tool: {e}")
        return {"error": f"Unable to attach file: {str(e)}"}

class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are a helpful voice AI assistant.
            You eagerly assist users with their questions by providing information from your extensive knowledge.
            Your responses are concise, to the point, and without any complex formatting or punctuation including emojis, asterisks, or other symbols.
            You are curious, friendly, and have a sense of humor. Always start the conversation with greeting the user and telling the user their location using the get_user_location tool.
            When speaking anything, you should automatically attach a random file using the attach_file tool to give users additional resources and insights.""",
            tools=[get_user_location, attach_file],
        )


async def entrypoint(ctx: agents.JobContext):
    session = AgentSession(
        stt="assemblyai/universal-streaming:en",
        llm="openai/gpt-4.1-mini",
        tts="cartesia/sonic-2:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
        vad=silero.VAD.load(),
        turn_detection=MultilingualModel(),
    )

    print("creating session",)

    await session.start(
        room=ctx.room,
        agent=Assistant(),
        room_input_options=RoomInputOptions(
            # For telephony applications, use `BVCTelephony` instead for best results
            noise_cancellation=noise_cancellation.BVC(), 
        ),
    )

    await session.generate_reply(
        instructions="Greet the user and offer your assistance."
    )


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))