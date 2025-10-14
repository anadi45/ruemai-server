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
  ): Promise<{ success: boolean; reasoning: string }> {
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
          reasoning: parsed.reason || 'No reason provided'
        };
      }
      
      return { success: false, reasoning: 'Failed to parse validation response' };
    } catch (error) {
      console.error('Error validating action:', error);
      return { success: false, reasoning: 'Error during validation' };
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

  async processFilesDirectly(
    files: Express.Multer.File[],
    featureName?: string
  ): Promise<{
    featureName: string;
    description: string;
    steps: string[];
    selectors: Record<string, string>;
    expectedOutcomes: string[];
    prerequisites: string[];
  }> {
    try {
      const prompt = this.buildFileProcessingPrompt(featureName);
      
      // Prepare file data for Gemini
      const fileParts = files.map(file => {
        const mimeType = this.getMimeType(file.originalname);
        return {
          inlineData: {
            data: file.buffer.toString('base64'),
            mimeType: mimeType
          }
        };
      });

      // Use Gemini's file upload capabilities
      const result = await this.model.generateContent([
        prompt,
        ...fileParts
      ]);

      const response = await result.response;
      const text = response.text();
      
      // Log the raw Gemini response for debugging
      console.log('\n🤖 GEMINI FILE PROCESSING RESPONSE:');
      console.log('=' .repeat(60));
      console.log('Raw Response:', text);
      console.log('=' .repeat(60));
      
      // Parse the JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in file processing response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Log the parsed structured data
      console.log('\n📊 PARSED FEATURE DOCUMENTATION:');
      console.log('=' .repeat(60));
      console.log('Feature Name:', parsed.featureName);
      console.log('Description:', parsed.description);
      console.log('Steps:', parsed.steps);
      console.log('Selectors:', parsed.selectors);
      console.log('Expected Outcomes:', parsed.expectedOutcomes);
      console.log('Prerequisites:', parsed.prerequisites);
      console.log('=' .repeat(60));
      
      return {
        featureName: parsed.featureName || featureName || 'Extracted Feature',
        description: parsed.description || '',
        steps: parsed.steps || [],
        selectors: parsed.selectors || {},
        expectedOutcomes: parsed.expectedOutcomes || [],
        prerequisites: parsed.prerequisites || []
      };
    } catch (error) {
      console.error('Error processing files with Gemini:', error);
      throw new Error('Failed to process files with Gemini');
    }
  }

  private buildFileProcessingPrompt(featureName?: string): string {
    return `
You are an expert at analyzing product documentation and extracting structured information for automation purposes.

${featureName ? `Target Feature: ${featureName}` : ''}

Please analyze the provided files and extract structured feature documentation. The files may contain:
- Product documentation (PDF, Word, text files)
- Screenshots or images showing UI elements
- Step-by-step instructions
- Technical specifications

Extract the following information:

1. **Feature Name**: The main feature or functionality being described
2. **Description**: A clear description of what the feature does
3. **Steps**: A numbered list of user actions/steps to complete the feature
4. **Selectors**: CSS selectors or element identifiers for UI elements (if mentioned or visible in images)
5. **Expected Outcomes**: What should happen after each step or at the end
6. **Prerequisites**: Any requirements or setup needed before using this feature

Focus on:
- User actions and workflows
- UI elements and interactions visible in images
- Expected results and validations
- Any technical details about selectors or identifiers
- Combining textual instructions with visual context from images

Return the data in this JSON format:
{
  "featureName": "string",
  "description": "string", 
  "steps": ["step1", "step2", "step3"],
  "selectors": {
    "elementName": "css-selector-or-identifier"
  },
  "expectedOutcomes": ["outcome1", "outcome2"],
  "prerequisites": ["prerequisite1", "prerequisite2"]
}

Only return valid JSON. Do not include any other text or explanations.
`;
  }

  private getMimeType(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'doc': 'application/msword',
      'txt': 'text/plain',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp'
    };
    return mimeTypes[extension] || 'application/octet-stream';
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
        scrapingStrategy: parsed.scrapingStrategy || 'Standard web scraping approach',
        actions: parsed.actions || [],
        summary: {
          clickActions: parsed.summary?.clickActions || 0,
          typeActions: parsed.summary?.typeActions || 0,
          navigationActions: parsed.summary?.navigationActions || 0,
          waitActions: parsed.summary?.waitActions || 0,
          extractActions: parsed.summary?.extractActions || 0,
          evaluateActions: parsed.summary?.evaluateActions || 0,
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
You are an expert Puppeteer automation engineer specializing in programmatic web scraping. Your task is to create a detailed, executable action plan for automating web interactions using Puppeteer based on both textual documentation and visual context from images.

FEATURE: ${featureDocs.featureName}
DESCRIPTION: ${featureDocs.description}
WEBSITE: ${websiteUrl}

FEATURE STEPS (from documentation):
${featureDocs.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

AVAILABLE SELECTORS (from documentation):
${Object.entries(featureDocs.selectors).map(([key, value]) => `${key}: ${value}`).join('\n')}

EXPECTED OUTCOMES:
${featureDocs.expectedOutcomes.join('\n')}

PREREQUISITES:
${featureDocs.prerequisites?.join('\n') || 'None specified'}

VISUAL CONTEXT (from images):

CRITICAL ANALYSIS INSTRUCTIONS:
1. **Carefully analyze BOTH text and image data together** to understand the complete user interface
2. **Identify UI elements** visible in images that may not be mentioned in text
3. **Map visual elements to programmatic selectors** for Puppeteer automation
4. **Consider the actual user flow** as shown in images vs. documented steps
5. **Identify potential scraping challenges** like dynamic content, modals, or complex interactions

Create a comprehensive Puppeteer automation plan that includes:

**NAVIGATION & SETUP:**
- Navigate to specific URLs or routes
- Handle authentication and login flows
- Set up proper viewport and user agent

**ELEMENT INTERACTION:**
- Click buttons, links, menu items with robust selectors
- Fill forms and input fields with realistic data
- Handle dropdowns, checkboxes, radio buttons
- Manage file uploads if applicable

**DYNAMIC CONTENT HANDLING:**
- Wait for AJAX requests and dynamic content loading
- Handle infinite scroll or pagination
- Manage modal dialogs and overlays
- Deal with loading states and spinners

**DATA EXTRACTION:**
- Scrape text content, attributes, and metadata
- Extract form data and user inputs
- Capture structured data from tables or lists
- Handle different data formats (JSON, HTML, etc.)

**ERROR HANDLING & VALIDATION:**
- Verify element existence before interaction
- Handle network timeouts and retries
- Validate expected outcomes and states

**ADVANCED PUPPETEER TECHNIQUES:**
- Use page.evaluate() for complex DOM manipulation
- Handle iframes and shadow DOM
- Manage cookies and local storage
- Implement proper waiting strategies (waitForSelector, waitForFunction)

For each action, provide:
- **Robust selectors** (prefer data attributes, IDs, or stable classes)
- **Fallback selectors** for dynamic content
- **Realistic input data** for forms
- **Proper waiting conditions** before and after actions
- **Error handling strategies** for each step
- **Screenshot capture** at critical points
- **Data extraction** where applicable

Return the plan in this JSON format:
{
  "featureName": "string",
  "estimatedDuration": number,
  "scrapingStrategy": "Brief description of the overall scraping approach",
  "actions": [
    {
      "type": "click|type|navigate|wait|scroll|select|extract|evaluate",
      "selector": "Primary CSS selector",
      "fallbackSelector": "Alternative selector if primary fails",
      "inputText": "Text to input (for type actions)",
      "description": "Detailed description of the Puppeteer action",
      "expectedOutcome": "What should happen after this action",
      "waitCondition": "What to wait for before proceeding",
      "extractData": "What data to extract (if applicable)",
      "priority": "high|medium|low",
      "estimatedDuration": number,
      "errorHandling": "How to handle failures",
      "prerequisites": ["prerequisite1", "prerequisite2"]
    }
  ],
  "summary": {
    "clickActions": number,
    "typeActions": number,
    "navigationActions": number,
    "waitActions": number,
    "extractActions": number,
    "evaluateActions": number
  }
}

FOCUS ON PROGRAMMATIC SCRAPING:
- Create executable Puppeteer code patterns
- Use robust, maintainable selectors
- Handle real-world web application challenges
- Implement proper error handling and retries
- Consider performance and reliability
- Plan for data extraction and storage
- Account for dynamic content and user interactions
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
    ];

    return {
      featureName: featureDocs.featureName,
      totalActions: basicActions.length,
      estimatedDuration: basicActions.reduce((sum, action) => sum + action.estimatedDuration, 0),
      scrapingStrategy: 'Basic navigation and documentation capture',
      actions: basicActions,
      summary: {
        clickActions: 0,
        typeActions: 0,
        navigationActions: 1,
        waitActions: 1,
        extractActions: 0,
        evaluateActions: 0
      }
    };
  }

  async analyzeCurrentState(
    domState: DOMState,
    nextAction: PuppeteerAction,
    featureDocs: ProductDocs,
    history: Action[],
    currentContext: string
  ): Promise<{ context: string; reasoning: string; shouldProceed: boolean }> {
    const prompt = this.buildAnalysisPrompt(
      domState,
      nextAction,
      featureDocs,
      history,
      currentContext
    );

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      return this.parseAnalysisResponse(text);
    } catch (error) {
      console.error('Error analyzing current state:', error);
      return {
        context: currentContext,
        reasoning: 'Error analyzing current state',
        shouldProceed: false
      };
    }
  }

  private buildAnalysisPrompt(
    domState: DOMState,
    nextAction: PuppeteerAction,
    featureDocs: ProductDocs,
    history: Action[],
    currentContext: string
  ): string {
    const historyText = history.length > 0 
      ? history.map((action, index) => 
          `${index + 1}. ${action.type} on "${action.selector}" - ${action.description}`
        ).join('\n')
      : 'No previous actions';

    return `
You are an AI assistant analyzing the current state of a web page to determine if the next planned action should proceed.

CURRENT PAGE STATE:
- URL: ${domState.currentUrl}
- Title: ${domState.pageTitle}
- Available clickable elements: ${domState.clickableSelectors.slice(0, 10).join(', ')}
- Available input elements: ${domState.inputSelectors.slice(0, 5).join(', ')}
- Visible text on page: ${domState.visibleText.slice(0, 15).join(' | ')}

NEXT PLANNED ACTION:
- Type: ${nextAction.type}
- Selector: ${nextAction.selector}
- Description: ${nextAction.description}
- Expected Outcome: ${nextAction.expectedOutcome}
- Priority: ${nextAction.priority}

FEATURE CONTEXT:
- Feature: ${featureDocs.featureName}
- Description: ${featureDocs.description}
- Steps: ${featureDocs.steps.join('\n')}

PREVIOUS ACTIONS (${history.length}):
${historyText}

CURRENT CONTEXT: ${currentContext}

INSTRUCTIONS:
1. Analyze if the current page state is suitable for the next action
2. Check if the required elements are present and accessible
3. Consider the context and previous actions
4. Determine if we should proceed with the action or adapt the strategy
5. Provide reasoning for your decision

RESPONSE FORMAT (JSON):
{
  "context": "Updated context based on current analysis",
  "reasoning": "Why you made this decision",
  "shouldProceed": true/false
}
`;
  }

  private parseAnalysisResponse(text: string): { context: string; reasoning: string; shouldProceed: boolean } {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        context: parsed.context || 'No context provided',
        reasoning: parsed.reasoning || 'No reasoning provided',
        shouldProceed: parsed.shouldProceed !== false
      };
    } catch (error) {
      console.error('Error parsing analysis response:', error);
      console.error('Raw response:', text);
      
      return {
        context: 'Error parsing response',
        reasoning: 'Failed to parse analysis response',
        shouldProceed: false
      };
    }
  }
}
