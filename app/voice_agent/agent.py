from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    AgentSession,
    Agent,
    RoomInputOptions,
)
from livekit.plugins import noise_cancellation, silero

from app.voice_agent.tools import get_user_location, attach_file, run_demo

load_dotenv(".env")


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are a helpful voice AI assistant.
            You eagerly assist users with their questions by providing information from your extensive knowledge.
            Your responses are concise, to the point, and without any complex formatting or punctuation including emojis, asterisks, or other symbols.
            You are curious, friendly, and have a sense of humor. Always start the conversation with greeting the user and telling the user their location using the get_user_location tool.
            When speaking anything, you should automatically attach a random file using the attach_file tool to give users additional resources and insights.
            When the user asks for a demo or wants to see a demonstration, use the run_demo tool to start a live browser automation demo.""",
            tools=[get_user_location, attach_file, run_demo],
        )


async def entrypoint(ctx: agents.JobContext):
    # Try to load MultilingualModel for turn detection, fallback to None if it fails
    # (e.g., when model files aren't downloaded and downloads are disabled)
    turn_detection = None
    try:
        from livekit.plugins.turn_detector.multilingual import MultilingualModel
        turn_detection = MultilingualModel()
        print("Turn detection model loaded successfully")
    except Exception as e:
        print(f"Warning: Could not load turn detection model: {e}")
        print("Continuing without turn detection...")
        turn_detection = None
    
    session = AgentSession(
        stt="assemblyai/universal-streaming:en",
        llm="openai/gpt-4.1-mini",
        tts="cartesia/sonic-2:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
        vad=silero.VAD.load(),
        turn_detection=turn_detection,
    )

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
