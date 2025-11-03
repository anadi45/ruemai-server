from app.services.browser_automation import execute_browser_task
from app.services.llm_service import extract_feature_usage_from_file
import logging

logger = logging.getLogger(__name__)


class DemoAutomationService:
    """Service class for handling demo automation business logic."""

    @staticmethod
    async def _process_feature_documentation(feature_docs):
        """
        Process feature documentation file and extract usage instructions.

        Args:
            feature_docs: UploadFile object containing the documentation

        Returns:
            str: Extracted feature usage instructions or None
        """
        if not feature_docs:
            return None

        logger.info(f"Processing feature documentation: {feature_docs.filename}")
        file_content = await feature_docs.read()
        feature_usage_instructions = await extract_feature_usage_from_file(
            file_content, feature_docs.filename
        )
        logger.info("Feature usage instructions extracted successfully")

        return feature_usage_instructions

    @staticmethod
    def _create_final_task(original_task, feature_usage_instructions):
        """
        Combine original task with feature usage instructions.

        Args:
            original_task (str): The original task description
            feature_usage_instructions (str): Extracted feature usage instructions

        Returns:
            str: Combined final task
        """
        if not feature_usage_instructions:
            return original_task

        final_task = f"{original_task}\n\nFeature Usage Instructions:\n{feature_usage_instructions}"
        logger.info("Combined original task with feature usage instructions")
        return final_task

    @staticmethod
    async def _execute_automation_task(final_task):
        """
        Execute the browser automation task.

        Args:
            final_task (str): The final task to execute

        Returns:
            dict: Automation result
        """
        logger.info(f"Executing browser automation task: {final_task}")
        return await execute_browser_task(final_task)

    @staticmethod
    def _build_response_data(
        task,
        automation_result,
        feature_name=None,
        feature_docs=None,
        feature_usage_instructions=None,
    ):
        """
        Build the response data structure.

        Args:
            task (str): Original task
            automation_result (dict): Result from automation execution
            feature_name (str, optional): Name of the feature
            feature_docs: UploadFile object (optional)
            feature_usage_instructions (str, optional): Extracted instructions

        Returns:
            dict: Formatted response data
        """
        response_data = {
            "status": 200,
            "message": "Demo created successfully",
            "task": task,
            "automation_result": {
                "success": automation_result["success"],
                "message": automation_result["message"],
                "final_result": automation_result.get(
                    "final_result", "No result available"
                ),
            },
        }

        # Add optional feature details if provided
        if feature_name:
            response_data["feature_name"] = feature_name

        if feature_docs:
            response_data["uploaded_file"] = feature_docs.filename
            response_data["feature_usage_instructions"] = feature_usage_instructions

        # Add error details if automation failed
        if not automation_result["success"]:
            response_data["automation_result"]["error"] = automation_result.get("error")
            response_data["message"] = "Demo created but automation failed"

        logger.info(
            f"Demo execution completed with status: {automation_result['success']}"
        )
        return response_data

    @staticmethod
    async def create_demo(task, feature_name=None, feature_docs=None):
        """
        Main business logic for creating a demo.

        Args:
            task (str): The task to execute
            feature_name (str, optional): Name of the feature
            feature_docs: UploadFile object (optional)

        Returns:
            dict: Response data for the demo creation
        """
        try:
            # Process feature docs if provided
            feature_usage_instructions = (
                await DemoAutomationService._process_feature_documentation(feature_docs)
            )

            print("feature_usage_instructions: ", feature_usage_instructions)

            # Create the final task - combine original task with feature usage instructions if available
            final_task = DemoAutomationService._create_final_task(
                task, feature_usage_instructions
            )

            # Execute the browser automation task
            automation_result = await DemoAutomationService._execute_automation_task(
                final_task
            )

            # Build and return response data
            return DemoAutomationService._build_response_data(
                task=task,
                automation_result=automation_result,
                feature_name=feature_name,
                feature_docs=feature_docs,
                feature_usage_instructions=feature_usage_instructions,
            )

        except Exception as e:
            logger.error(f"Error in create_demo service: {str(e)}")
            raise e
