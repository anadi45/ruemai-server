import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Action, DOMState, GeminiResponse, ProductDocs, ActionPlan, PuppeteerAction } from '../types/demo-automation.types';

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

  async analyzeImage(base64Image: string, prompt: string): Promise<string> {
    try {
      // Use Gemini's vision capabilities for image analysis
      const visionModel = this.genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash-latest',
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1000,
        }
      });

      const result = await visionModel.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Image,
            mimeType: 'image/jpeg' // Default mime type, could be enhanced to detect actual type
          }
        }
      ]);

      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Error analyzing image with Gemini:', error);
      
      // Fallback to a generic description
      return 'Screenshot showing UI elements and interface components';
    }
  }

  async generateActionPlan(featureDocs: ProductDocs, websiteUrl: string): Promise<ActionPlan> {
    try {
      const prompt = this.buildActionPlanningPrompt(featureDocs, websiteUrl);
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Parse the JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in action plan response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate and structure the response
      const actionPlan: ActionPlan = {
        featureName: parsed.featureName || featureDocs.featureName,
        totalActions: parsed.actions?.length || 0,
        estimatedDuration: parsed.estimatedDuration || 0,
        actions: parsed.actions || [],
        summary: {
          clickActions: parsed.summary?.clickActions || 0,
          typeActions: parsed.summary?.typeActions || 0,
          navigationActions: parsed.summary?.navigationActions || 0,
          waitActions: parsed.summary?.waitActions || 0,
          screenshotActions: parsed.summary?.screenshotActions || 0,
        }
      };

      return actionPlan;
    } catch (error) {
      console.error('Error generating action plan:', error);
      
      // Fallback to basic action plan
      return this.createFallbackActionPlan(featureDocs);
    }
  }

  private buildActionPlanningPrompt(featureDocs: ProductDocs, websiteUrl: string): string {
    return `
You are an expert automation engineer. Create a detailed action plan for automating the following feature using Puppeteer.

FEATURE: ${featureDocs.featureName}
DESCRIPTION: ${featureDocs.description}
WEBSITE: ${websiteUrl}

FEATURE STEPS:
${featureDocs.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

SELECTORS AVAILABLE:
${Object.entries(featureDocs.selectors).map(([key, value]) => `${key}: ${value}`).join('\n')}

EXPECTED OUTCOMES:
${featureDocs.expectedOutcomes.join('\n')}

PREREQUISITES:
${featureDocs.prerequisites?.join('\n') || 'None specified'}

Create a comprehensive action plan that includes:

1. **Navigation actions** - Navigate to the feature
2. **Click actions** - Click buttons, links, menu items
3. **Type actions** - Fill forms, input fields
4. **Wait actions** - Wait for elements to load, animations to complete
5. **Screenshot actions** - Capture key moments for documentation
6. **Scroll actions** - Scroll to reveal elements
7. **Select actions** - Select options from dropdowns

For each action, specify:
- Action type (click, type, navigate, wait, scroll, screenshot, select)
- CSS selector (use the provided selectors or suggest new ones)
- Description of what the action does
- Expected outcome after the action
- Priority level (high, medium, low)
- Estimated duration in seconds
- Any prerequisites

Return the plan in this JSON format:
{
  "featureName": "string",
  "estimatedDuration": number,
  "actions": [
    {
      "type": "click|type|navigate|wait|scroll|screenshot|select",
      "selector": "CSS selector",
      "inputText": "text to type (for type actions)",
      "description": "What this action does",
      "expectedOutcome": "What should happen after this action",
      "priority": "high|medium|low",
      "estimatedDuration": number,
      "prerequisites": ["prerequisite1", "prerequisite2"]
    }
  ],
  "summary": {
    "clickActions": number,
    "typeActions": number,
    "navigationActions": number,
    "waitActions": number,
    "screenshotActions": number
  }
}

Focus on:
- Logical sequence of actions
- Realistic selectors and interactions
- Proper waiting for page loads and animations
- Capturing key moments with screenshots
- Handling form inputs and selections
- Error handling and validation steps
`;
  }

  private createFallbackActionPlan(featureDocs: ProductDocs): ActionPlan {
    const basicActions: PuppeteerAction[] = [
      {
        type: 'navigate',
        description: `Navigate to the ${featureDocs.featureName} feature`,
        expectedOutcome: 'Feature page loads successfully',
        priority: 'high',
        estimatedDuration: 3,
        prerequisites: []
      },
      {
        type: 'wait',
        description: 'Wait for page to load completely',
        expectedOutcome: 'Page is fully loaded and interactive',
        priority: 'high',
        estimatedDuration: 2,
        prerequisites: []
      },
      {
        type: 'screenshot',
        description: 'Capture initial state of the feature',
        expectedOutcome: 'Screenshot saved for documentation',
        priority: 'medium',
        estimatedDuration: 1,
        prerequisites: []
      }
    ];

    return {
      featureName: featureDocs.featureName,
      totalActions: basicActions.length,
      estimatedDuration: basicActions.reduce((sum, action) => sum + action.estimatedDuration, 0),
      actions: basicActions,
      summary: {
        clickActions: 0,
        typeActions: 0,
        navigationActions: 1,
        waitActions: 1,
        screenshotActions: 1
      }
    };
  }
}
