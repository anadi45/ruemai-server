import os
import tempfile
import mimetypes
from typing import Optional, Protocol
from abc import ABC, abstractmethod
import logging

# Load environment variables
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class LLMProvider(Protocol):
    """Protocol defining the interface for LLM providers."""

    async def extract_feature_usage(self, file_content: bytes, filename: str) -> str:
        """
        Extract feature usage instructions from file.

        Args:
            file_content (bytes): The file content to analyze
            filename (str): The name of the file

        Returns:
            str: Extracted feature usage instructions
        """
        ...


class BaseLLMProvider(ABC):
    """Abstract base class for LLM providers."""

    def __init__(self):
        self._validate_config()
        self._initialize_provider()

    @abstractmethod
    def _validate_config(self) -> None:
        """Validate provider-specific configuration."""
        pass

    @abstractmethod
    def _initialize_provider(self) -> None:
        """Initialize the provider."""
        pass

    @abstractmethod
    async def _extract_from_text_content(self, text_content: str) -> str:
        """
        Extract feature usage from text content.

        Args:
            text_content (str): The text content to analyze

        Returns:
            str: Extracted feature usage instructions
        """
        pass

    async def extract_feature_usage(self, file_content: bytes, filename: str) -> str:
        """
        Extract feature usage instructions from file using the provider.

        Args:
            file_content (bytes): The file content to analyze
            filename (str): The name of the file

        Returns:
            str: Extracted feature usage instructions as a string
        """
        try:
            logger.info(f"Extracting feature usage from file: {filename}")

            # Handle PDF files
            if filename.lower().endswith(".pdf"):
                try:
                    import PyPDF2
                    import io

                    pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
                    text_content = ""
                    for page in pdf_reader.pages:
                        text_content += page.extract_text() + "\n"

                    if text_content.strip():
                        logger.info(
                            "PDF text extracted successfully, using direct text analysis"
                        )
                        return await self._extract_from_text_content(text_content)
                except Exception as pdf_error:
                    logger.warning(f"PDF text extraction failed: {str(pdf_error)}")

            # Handle text files
            if filename.lower().endswith((".txt", ".md", ".rst")):
                try:
                    text_content = file_content.decode("utf-8", errors="ignore")
                    return await self._extract_from_text_content(text_content)
                except Exception as text_error:
                    logger.warning(f"Direct text extraction failed: {str(text_error)}")

            # If we get here, the file type is not supported for direct text extraction
            raise Exception(
                f"File type {filename.split('.')[-1]} is not supported for direct text extraction"
            )

        except Exception as e:
            logger.error(f"Error extracting feature usage from {filename}: {str(e)}")
            raise Exception(f"Failed to process file {filename}: {str(e)}")


class GeminiProvider(BaseLLMProvider):
    """Gemini provider implementation."""

    def _validate_config(self) -> None:
        """Validate Gemini configuration."""
        self.api_key = os.getenv("GOOGLE_API_KEY")
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY environment variable is required")

    def _initialize_provider(self) -> None:
        """Initialize Gemini provider."""
        try:
            import google.generativeai as genai

            # Configure the API
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel("gemini-2.0-flash")

            # Test the API connection with a simple request
            test_response = self.model.generate_content("Hello")
            if test_response and test_response.text:
                logger.info("Gemini API configured and tested successfully")
            else:
                logger.warning("Gemini API configured but test request failed")

        except Exception as e:
            logger.error(f"Failed to configure Gemini API: {str(e)}")
            raise

    async def _extract_from_text_content(self, text_content: str) -> str:
        """
        Extract feature usage from text content using Gemini.

        Args:
            text_content (str): The text content to analyze

        Returns:
            str: Extracted feature usage instructions
        """
        try:
            import google.generativeai as genai

            prompt = """
            Please analyze this documentation and extract clear, actionable instructions on how to use the feature described.
            
            Focus on:
            1. Step-by-step instructions for using the feature
            2. Key actions or workflows the user should perform
            3. Important settings or configurations
            4. Expected outcomes or results
            5. Any prerequisites or setup requirements
            
            Provide the instructions in a clear, concise format that can be used for browser automation.
            Do not return JSON, just plain text instructions.
            """

            response = self.model.generate_content([prompt, text_content])
            return (
                response.text
                if response.text
                else "No usage instructions could be extracted"
            )

        except Exception as e:
            logger.error(f"Error in Gemini text-based extraction: {str(e)}")
            return f"Error processing text content: {str(e)}"


class LLMService:
    """Main service class for LLM operations with provider abstraction."""

    def __init__(self, provider: Optional[LLMProvider] = None):
        """
        Initialize the LLM service.

        Args:
            provider (LLMProvider, optional): The LLM provider to use. Defaults to GeminiProvider.
        """
        self.provider = provider or GeminiProvider()

    async def extract_feature_usage(self, file_content: bytes, filename: str) -> str:
        """
        Extract feature usage instructions from file.

        Args:
            file_content (bytes): The file content to analyze
            filename (str): The name of the file

        Returns:
            str: Extracted feature usage instructions
        """
        return await self.provider.extract_feature_usage(file_content, filename)


# Convenience function for easy usage (maintains backward compatibility)
async def extract_feature_usage_from_file(file_content: bytes, filename: str) -> str:
    """
    Convenience function to extract feature usage instructions from a file.

    Args:
        file_content (bytes): The file content to analyze
        filename (str): The name of the file

    Returns:
        str: Extracted feature usage instructions
    """
    service = LLMService()
    return await service.extract_feature_usage(file_content, filename)
