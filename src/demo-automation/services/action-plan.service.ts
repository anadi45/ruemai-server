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
    const systemPrompt = `You are an expert web automation specialist. Your task is to create a high-level action plan for demonstrating a feature on a website.

The plan should be strategic and focus on the user journey, not technical implementation details. The agent will handle the technical execution based on visual analysis.

Guidelines:
- Create 3-7 high-level goals that logically flow from one to the next
- Each goal should be clear and actionable
- Focus on the user experience and feature demonstration
- Don't include specific selectors or technical details
- Make goals that can be achieved through visual analysis and intelligent interaction`;

    const prompt = `
Create an action plan for demonstrating this feature:

Feature: ${featureDocs.featureName}
Description: ${featureDocs.description}
Website: ${websiteUrl}

Steps to demonstrate:
${featureDocs.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

Expected outcomes:
${featureDocs.expectedOutcomes.map(outcome => `- ${outcome}`).join('\n')}

Prerequisites:
${featureDocs.prerequisites.map(prereq => `- ${prereq}`).join('\n')}

Create a high-level action plan with 3-7 strategic goals that will demonstrate this feature effectively.

Return in this JSON format:
{
  "actions": [
    {
      "id": "goal_1",
      "type": "navigate",
      "description": "Navigate to the main dashboard",
      "priority": 1,
      "dependencies": []
    },
    {
      "id": "goal_2", 
      "type": "interact",
      "description": "Find and click the feature button",
      "priority": 2,
      "dependencies": ["goal_1"]
    }
  ],
  "metadata": {
    "totalActions": 2,
    "estimatedDuration": "2-3 minutes",
    "complexity": "medium"
  }
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
      totalActions: llmResponse.actions?.length || 0,
      estimatedDuration: this.parseEstimatedDuration(llmResponse.metadata?.estimatedDuration || '2-3 minutes'),
      actions: llmResponse.actions?.map((action: any, index: number) => ({
        id: action.id || `action_${index + 1}`,
        type: this.mapActionType(action.type),
        description: action.description || '',
        priority: action.priority || index + 1,
        dependencies: action.dependencies || [],
        selector: '', // Will be filled during execution
        value: '', // Will be filled during execution
        waitTime: 1000, // Default wait time
        retryCount: 0,
        maxRetries: 3
      })) || [],
      summary: {
        clickActions: 0,
        typeActions: 0,
        navigationActions: 0,
        waitActions: 0,
        extractActions: 0,
        evaluateActions: 0
      }
    };

    // Calculate summary
    actionPlan.actions.forEach(action => {
      switch (action.type) {
        case 'click':
          actionPlan.summary.clickActions++;
          break;
        case 'type':
          actionPlan.summary.typeActions++;
          break;
        case 'navigate':
          actionPlan.summary.navigationActions++;
          break;
        case 'wait':
          actionPlan.summary.waitActions++;
          break;
        case 'extract':
          actionPlan.summary.extractActions++;
          break;
        case 'evaluate':
          actionPlan.summary.evaluateActions++;
          break;
      }
    });

    return actionPlan;
  }

  /**
   * Parse estimated duration string into seconds
   */
  private parseEstimatedDuration(duration: string): number {
    // Parse duration strings like "2-3 minutes", "5 minutes", "1 hour", etc.
    const match = duration.match(/(\d+)(?:-(\d+))?\s*(minute|hour|second)s?/i);
    if (match) {
      const min = parseInt(match[1]);
      const max = match[2] ? parseInt(match[2]) : min;
      const unit = match[3].toLowerCase();
      const avgMinutes = (min + max) / 2;
      
      switch (unit) {
        case 'second':
          return avgMinutes * 60;
        case 'minute':
          return avgMinutes * 60;
        case 'hour':
          return avgMinutes * 60 * 60;
        default:
          return avgMinutes * 60;
      }
    }
    return 180; // Default to 3 minutes
  }

  /**
   * Map LLM action types to internal action types
   */
  private mapActionType(llmType: string): string {
    // Map LLM action types to our internal action types
    const typeMap: { [key: string]: string } = {
      'navigate': 'navigate',
      'interact': 'click',
      'click': 'click',
      'type': 'type',
      'wait': 'wait',
      'extract': 'extract',
      'evaluate': 'evaluate'
    };
    return typeMap[llmType] || 'click';
  }
}
