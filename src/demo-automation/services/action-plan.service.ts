import { Injectable } from '@nestjs/common';
import { ProductDocs, ActionPlan } from '../types/demo-automation.types';
import { LLMService } from './llm.service';

/**
 * Service responsible for generating action plans for web automation
 */
@Injectable()
export class ActionPlanService {
  constructor(private readonly llmService: LLMService) {}

  /**
   * Generate an action plan for demonstrating a feature on a website
   */
  async generateActionPlan(
    featureDocs: ProductDocs,
    websiteUrl: string
  ): Promise<ActionPlan> {
    const systemPrompt = `You are an expert user experience specialist. Your task is to create a user-focused action plan for demonstrating a feature on a website.

Think about how a real user would interact with the website to accomplish the feature demonstration. Focus on the natural user journey and interactions.

Guidelines:
- Create 3-7 user-focused actions that describe how a person would naturally interact with the website
- Each action should describe what the user does, not technical implementation
- Focus on user behavior: clicking, typing, navigating, reading, etc.
- Use natural language that describes user interactions
- Actions should flow logically from one to the next
- Include dependencies between actions where one must happen before another`;

    const prompt = `
Create a user-focused action plan for demonstrating this feature:

Feature: ${featureDocs.featureName}
Description: ${featureDocs.description}
Website: ${websiteUrl}

Steps to demonstrate:
${featureDocs.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

Expected outcomes:
${featureDocs.expectedOutcomes.map(outcome => `- ${outcome}`).join('\n')}

Prerequisites:
${featureDocs.prerequisites.map(prereq => `- ${prereq}`).join('\n')}

Create an action plan that describes how a user would naturally interact with the website to demonstrate this feature. Think about the user's journey and what they would do step by step.

Return in this JSON format:
{
  "actions": [
    {
      "id": "action_1",
      "type": "navigate",
      "description": "User opens the website and navigates to the main page",
      "dependencies": []
    },
    {
      "id": "action_2", 
      "type": "click",
      "description": "User looks for and clicks on the feature button or menu item",
      "dependencies": ["action_1"]
    },
    {
      "id": "action_3",
      "type": "type",
      "description": "User fills in any required form fields or inputs",
      "dependencies": ["action_2"]
    }
  ]
}
`;

    const response = await this.llmService.callLLM(prompt, systemPrompt, 0.1);
    
    if (!response.success) {
      console.error('LLM response:', response);
      throw new Error('Failed to generate action plan');
    }

    // Transform the LLM response to match ActionPlan interface
    const llmResponse = response as any;
    
    if (!llmResponse.actions || !Array.isArray(llmResponse.actions)) {
      console.error('LLM response missing actions array:', llmResponse);
      throw new Error('Failed to generate action plan - no actions array');
    }
    
    const actionPlan: ActionPlan = {
      featureName: featureDocs.featureName,
      actions: llmResponse.actions?.map((action: any, index: number) => ({
        id: action.id || `action_${index + 1}`,
        type: action.type || 'click',
        description: action.description || '',
        dependencies: action.dependencies || []
      })) || []
    };

    return actionPlan;
  }

}
