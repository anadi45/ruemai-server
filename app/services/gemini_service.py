import os
import tempfile
import mimetypes
from typing import Optional
import google.generativeai as genai
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

class GeminiService:
    """Service for uploading files to Gemini and extracting feature usage instructions."""
    
    def __init__(self):
        self.api_key = os.getenv("GOOGLE_API_KEY")
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY environment variable is required")
        
        try:
            # Configure the API
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel('gemini-2.0-flash')
            
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
        Fallback method to extract feature usage from text content directly.
        
        Args:
            text_content (str): The text content to analyze
            
        Returns:
            str: Extracted feature usage instructions
        """
        try:
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
            return response.text if response.text else "No usage instructions could be extracted"
            
        except Exception as e:
            logger.error(f"Error in text-based extraction: {str(e)}")
            return f"Error processing text content: {str(e)}"

    async def extract_feature_usage(self, file_content: bytes, filename: str) -> str:
        """
        Extract feature usage instructions from file using Gemini API.
        
        Args:
            file_content (bytes): The file content to analyze
            filename (str): The name of the file
            
        Returns:
            str: Extracted feature usage instructions as a string
        """
        try:
            logger.info(f"Extracting feature usage from file: {filename}")
            
            # For now, use direct text extraction since file upload has API issues
            # This works for text-based files and PDFs with text extraction
            if filename.lower().endswith('.pdf'):
                try:
                    import PyPDF2
                    import io
                    pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
                    text_content = ""
                    for page in pdf_reader.pages:
                        text_content += page.extract_text() + "\n"
                    
                    if text_content.strip():
                        logger.info("PDF text extracted successfully, using direct text analysis")
                        return await self._extract_from_text_content(text_content)
                except Exception as pdf_error:
                    logger.warning(f"PDF text extraction failed: {str(pdf_error)}")
            
            # For text files, use direct text analysis
            if filename.lower().endswith(('.txt', '.md', '.rst')):
                try:
                    text_content = file_content.decode('utf-8', errors='ignore')
                    return await self._extract_from_text_content(text_content)
                except Exception as text_error:
                    logger.warning(f"Direct text extraction failed: {str(text_error)}")
            
            # If we get here, the file type is not supported for direct text extraction
            raise Exception(f"File type {filename.split('.')[-1]} is not supported for direct text extraction")
                    
        except Exception as e:
            logger.error(f"Error extracting feature usage from {filename}: {str(e)}")
            raise Exception(f"Failed to process file {filename}: {str(e)}")

# Convenience function for easy usage
async def extract_feature_usage_from_file(file_content: bytes, filename: str) -> str:
    """
    Convenience function to extract feature usage instructions from a file.
    
    Args:
        file_content (bytes): The file content to analyze
        filename (str): The name of the file
        
    Returns:
        str: Extracted feature usage instructions
    """
    service = GeminiService()
    return await service.extract_feature_usage(file_content, filename)
