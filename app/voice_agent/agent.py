from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    AgentSession,
    Agent,
    RoomInputOptions,
)
from livekit.plugins import noise_cancellation, silero

from app.voice_agent.tools import (
    get_user_location,
    present_file_to_user,
    present_demo_to_user,
)

load_dotenv(".env")


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are Ruem AI Agent. An intelligent agent that is used to give demo, knowledge etc to the user about a product. You need to act like a sales executive 
            and make sure the user is happy and satisfied with the demo and knowledge you are providing. The user if satisfied can convert into a qualified lead and we can help a company with their inbound sales funnel.
            There are 2 cases when you need to call tools. First, if the user asks about pricing, then call present_file_to_user tool to present the pricing information. Second, if the user asks for a demo, then call present_demo_to_user tool to start a live browser automation demo.""",
            tools=[present_file_to_user, present_demo_to_user],
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
