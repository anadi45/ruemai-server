from dotenv import load_dotenv
import json
from livekit import agents
from livekit.agents import AgentSession, Agent, RoomInputOptions, function_tool, get_job_context, RunContext
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

class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are a helpful voice AI assistant.
            You eagerly assist users with their questions by providing information from your extensive knowledge.
            Your responses are concise, to the point, and without any complex formatting or punctuation including emojis, asterisks, or other symbols.
            You are curious, friendly, and have a sense of humor. Always start the conversation with greeting the user and telling the user their location using the get_user_location tool.""",
            tools=[get_user_location],
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