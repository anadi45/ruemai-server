import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Action, DOMState, GeminiResponse, ProductDocs } from '../types/demo-automation.types';

@Injectable()
export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }

  async decideNextAction(
    domState: DOMState,
    goal: string,
    featureDocs: ProductDocs,
    history: Action[],
    maxSteps: number,
    currentStep: number
  ): Promise<GeminiResponse> {
    const prompt = this.buildDecisionPrompt(
      domState,
      goal,
      featureDocs,
      history,
      maxSteps,
      currentStep
    );

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      return this.parseGeminiResponse(text);
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      return {
        action: null,
        reasoning: 'Error calling Gemini API',
        confidence: 0,
        nextSteps: ['Check API key and network connection']
      };
    }
  }

  private buildDecisionPrompt(
    domState: DOMState,
    goal: string,
    featureDocs: ProductDocs,
    history: Action[],
    maxSteps: number,
    currentStep: number
  ): string {
    const historyText = history.length > 0 
      ? history.map((action, index) => 
          `${index + 1}. ${action.type} on "${action.selector}" - ${action.description}`
        ).join('\n')
      : 'No previous actions';

    const availableSelectors = [
      ...domState.clickableSelectors,
      ...domState.inputSelectors,
      ...domState.selectSelectors
    ].join(', ');

    return `
You are an AI assistant that helps create automated product tours by analyzing web pages and deciding the next action to take.

GOAL: ${goal}
FEATURE: ${featureDocs.featureName}
DESCRIPTION: ${featureDocs.description}

CURRENT PAGE STATE:
- URL: ${domState.currentUrl}
- Title: ${domState.pageTitle}
- Available clickable elements: ${domState.clickableSelectors.join(', ')}
- Available input elements: ${domState.inputSelectors.join(', ')}
- Available select elements: ${domState.selectSelectors.join(', ')}
- Visible text on page: ${domState.visibleText.slice(0, 10).join(' | ')}

PREVIOUS ACTIONS (${history.length}):
${historyText}

FEATURE DOCUMENTATION:
${featureDocs.steps.join('\n')}

EXPECTED OUTCOMES:
${featureDocs.expectedOutcomes.join('\n')}

PROGRESS: Step ${currentStep} of ${maxSteps}

INSTRUCTIONS:
1. Analyze the current page state and available elements
2. Consider the goal and feature documentation
3. Decide the next action to take to progress toward the goal
4. If the goal is achieved or no more progress can be made, respond with action: null
5. Choose selectors that are most likely to be stable and accessible
6. Provide clear, user-friendly descriptions for tooltips

RESPONSE FORMAT (JSON):
{
  "action": {
    "type": "click|type|hover|select|navigate|wait",
    "selector": "CSS selector or XPath",
    "inputText": "text to type (for type actions)",
    "description": "What this action does",
    "position": {"x": 0, "y": 0}
  },
  "reasoning": "Why you chose this action",
  "confidence": 0.0-1.0,
  "nextSteps": ["What should happen next"]
}

If no action should be taken (goal achieved, error, or no progress possible), set action to null.
`;
  }

  private parseGeminiResponse(text: string): GeminiResponse {
    try {
      // Extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        action: parsed.action,
        reasoning: parsed.reasoning || 'No reasoning provided',
        confidence: parsed.confidence || 0.5,
        nextSteps: parsed.nextSteps || []
      };
    } catch (error) {
      console.error('Error parsing Gemini response:', error);
      console.error('Raw response:', text);
      
      return {
        action: null,
        reasoning: 'Failed to parse response',
        confidence: 0,
        nextSteps: ['Check response format']
      };
    }
  }

  async generateTooltipText(
    action: Action,
    domState: DOMState,
    featureDocs: ProductDocs
  ): Promise<string> {
    const prompt = `
Generate a user-friendly tooltip text for this action:

ACTION: ${action.type} on "${action.selector}"
DESCRIPTION: ${action.description}
FEATURE: ${featureDocs.featureName}

CONTEXT:
- Page title: ${domState.pageTitle}
- Available text: ${domState.visibleText.slice(0, 5).join(' | ')}

Generate a concise, helpful tooltip (max 100 characters) that explains what the user will see or do.
`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      console.error('Error generating tooltip:', error);
      return action.description;
    }
  }

  async validateActionSuccess(
    action: Action,
    previousState: DOMState,
    currentState: DOMState,
    expectedOutcome: string
  ): Promise<{ success: boolean; reason: string }> {
    const prompt = `
Validate if the action was successful:

ACTION PERFORMED: ${action.type} on "${action.selector}"
EXPECTED OUTCOME: ${expectedOutcome}

BEFORE ACTION:
- URL: ${previousState.currentUrl}
- Title: ${previousState.pageTitle}

AFTER ACTION:
- URL: ${currentState.currentUrl}
- Title: ${currentState.pageTitle}
- New visible text: ${currentState.visibleText.slice(0, 5).join(' | ')}

Determine if the action was successful and provide reasoning.

RESPONSE FORMAT (JSON):
{
  "success": true/false,
  "reason": "Explanation of why it succeeded or failed"
}
`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: parsed.success || false,
          reason: parsed.reason || 'No reason provided'
        };
      }
      
      return { success: false, reason: 'Failed to parse validation response' };
    } catch (error) {
      console.error('Error validating action:', error);
      return { success: false, reason: 'Error during validation' };
    }
  }

  async extractStructuredData(prompt: string): Promise<string> {
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Error extracting structured data:', error);
      
      // If it's a model not found error, try with a different model
      if (error.message && error.message.includes('not found')) {
        console.log('Trying with gemini-1.5-flash-latest model...');
        try {
          const fallbackModel = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
          const result = await fallbackModel.generateContent(prompt);
          const response = await result.response;
          return response.text();
        } catch (fallbackError) {
          console.error('Fallback model also failed:', fallbackError);
          throw new Error('Failed to extract structured data from document - no available models');
        }
      }
      
      throw new Error('Failed to extract structured data from document');
    }
  }
}
