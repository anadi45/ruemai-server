import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Action, DOMState, GeminiResponse, ProductDocs, ActionPlan, PuppeteerAction } from '../types/demo-automation.types';

/**
 * GeminiService with API key rotation support
 * 
 * Environment Variables:
 * - GEMINI_API_KEY: Single API key (legacy support)
 * - GEMINI_API_KEYS: Multiple API keys as JSON array or comma-separated string
 * 
 * Examples:
 * GEMINI_API_KEYS='["key1", "key2", "key3"]'
 * GEMINI_API_KEYS='key1,key2,key3'
 * 
 * Features:
 * - Automatic key rotation on 429 errors
 * - Usage tracking per key
 * - Cooldown periods between key switches
 * - Fallback to least recently used key
 */
@Injectable()
export class GeminiService {
  private genAIs: GoogleGenerativeAI[];
  private models: any[];
  private currentKeyIndex: number = 0;
  private keyUsageCount: Map<number, number> = new Map();
  private keyLastUsed: Map<number, number> = new Map();
  private readonly maxRequestsPerKey = 100; // Adjust based on your rate limits
  private readonly keyCooldownMs = 60000; // 1 minute cooldown between key switches

  constructor() {
    const apiKeys = this.getApiKeys();
    if (apiKeys.length === 0) {
      throw new Error('At least one GEMINI_API_KEY is required');
    }

    this.genAIs = apiKeys.map(key => new GoogleGenerativeAI(key));
    this.models = this.genAIs.map(genAI => genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }));

    // Initialize usage tracking
    apiKeys.forEach((_, index) => {
      this.keyUsageCount.set(index, 0);
      this.keyLastUsed.set(index, 0);
    });
  }

  private getApiKeys(): string[] {
    // Support both single key and multiple keys
    const singleKey = process.env.GEMINI_API_KEY;
    const multipleKeys = process.env.GEMINI_API_KEYS;

    if (multipleKeys) {
      try {
        const keys = JSON.parse(multipleKeys);
        return Array.isArray(keys) ? keys.filter(key => key && key.trim()) : [];
      } catch (error) {
        console.warn('Failed to parse GEMINI_API_KEYS as JSON, trying comma-separated format');
        return multipleKeys.split(',').map(key => key.trim()).filter(key => key);
      }
    }

    if (singleKey) {
      return [singleKey];
    }

    return [];
  }

  private getNextAvailableKey(): { keyIndex: number; model: any } {
    const now = Date.now();

    // First, try to find a key that hasn't been used recently and is under the limit
    for (let i = 0; i < this.genAIs.length; i++) {
      const keyIndex = (this.currentKeyIndex + i) % this.genAIs.length;
      const usageCount = this.keyUsageCount.get(keyIndex) || 0;
      const lastUsed = this.keyLastUsed.get(keyIndex) || 0;

      if (usageCount < this.maxRequestsPerKey && (now - lastUsed) > this.keyCooldownMs) {
        this.currentKeyIndex = keyIndex;
        return { keyIndex, model: this.models[keyIndex] };
      }
    }

    // If all keys are at limit, find the least recently used one
    let leastRecentlyUsedIndex = 0;
    let oldestLastUsed = this.keyLastUsed.get(0) || 0;

    for (let i = 1; i < this.genAIs.length; i++) {
      const lastUsed = this.keyLastUsed.get(i) || 0;
      if (lastUsed < oldestLastUsed) {
        oldestLastUsed = lastUsed;
        leastRecentlyUsedIndex = i;
      }
    }

    this.currentKeyIndex = leastRecentlyUsedIndex;
    return { keyIndex: leastRecentlyUsedIndex, model: this.models[leastRecentlyUsedIndex] };
  }

  private updateKeyUsage(keyIndex: number): void {
    const currentCount = this.keyUsageCount.get(keyIndex) || 0;
    this.keyUsageCount.set(keyIndex, currentCount + 1);
    this.keyLastUsed.set(keyIndex, Date.now());
  }

  private async makeRequestWithRetry<T>(
    requestFn: (model: any) => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const { keyIndex, model } = this.getNextAvailableKey();

      try {
        console.log(`🔄 Using Gemini API key ${keyIndex + 1}/${this.genAIs.length} (attempt ${attempt + 1})`);
        const result = await requestFn(model);
        this.updateKeyUsage(keyIndex);
        return result;
      } catch (error: any) {
        lastError = error;
        console.warn(`❌ API key ${keyIndex + 1} failed:`, error.message);

        // Check if it's a rate limit error
        if (error.message?.includes('429') || error.message?.includes('rate limit') || error.message?.includes('quota')) {
          console.log(`⏳ Rate limit hit for key ${keyIndex + 1}, switching to next key`);
          this.keyLastUsed.set(keyIndex, Date.now() + 300000); // 5 minute penalty
          continue;
        }

        // For other errors, try next key immediately
        if (attempt < maxRetries - 1) {
          console.log(`🔄 Retrying with different API key...`);
          continue;
        }
      }
    }

    throw lastError;
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
      const result = await this.makeRequestWithRetry(async (model) => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      });

      return this.parseGeminiResponse(result);
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
      const result = await this.makeRequestWithRetry(async (model) => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
      });

      return result;
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
      const result = await this.makeRequestWithRetry(async (model) => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      });

      const jsonMatch = result.match(/\{[\s\S]*\}/);
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
      const text = await this.makeRequestWithRetry(async (model) => {
        const result = await model.generateContent([
          prompt,
          ...fileParts
        ]);

        const response = await result.response;
        return response.text();
      });

      // Log the raw Gemini response for debugging
      console.log('\n🤖 GEMINI FILE PROCESSING RESPONSE:');
      console.log('='.repeat(60));
      console.log('Raw Response:', text);
      console.log('='.repeat(60));

      // Parse the JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in file processing response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Log the parsed structured data
      console.log('\n📊 PARSED FEATURE DOCUMENTATION:');
      console.log('='.repeat(60));
      console.log('Feature Name:', parsed.featureName);
      console.log('Description:', parsed.description);
      console.log('Steps:', parsed.steps);
      console.log('Selectors:', parsed.selectors);
      console.log('Expected Outcomes:', parsed.expectedOutcomes);
      console.log('Prerequisites:', parsed.prerequisites);
      console.log('='.repeat(60));

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
      const text = await this.makeRequestWithRetry(async (model) => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      });

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
      return this.createFallbackActionPlan(featureDocs, websiteUrl);
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

**DRY RUN EXECUTION STRATEGY:**
- **GO THROUGH THE ENTIRE FEATURE FLOW**: Create a plan that covers all steps of the feature from start to finish
- **AVOID FINAL SAVE/SUBMIT ACTIONS**: Do NOT include actions that would trigger save, submit, create, update, or delete API calls
- **STOP BEFORE PERSISTENT CHANGES**: End the plan just before any action that would permanently save data or make irreversible changes
- **IDENTIFY SAVE TRIGGERS**: Look for buttons/elements with text like "Save", "Submit", "Create", "Update", "Delete", "Confirm", "Finish", "Complete"
- **FOCUS ON DEMONSTRATION**: The goal is to demonstrate the feature flow without actually persisting changes
- **INCLUDE VALIDATION STEPS**: Include form validation and data entry steps, but stop before final submission

Create a comprehensive Puppeteer automation plan that includes:

**NAVIGATION & SETUP:**
- **DO NOT ASSUME LOGIN STATE**: Never assume user is logged in or logged out. Handle both scenarios
- **DETECT AUTHENTICATION STATE**: Check if redirected to login page and handle accordingly
- **PREFER DOM SELECTOR INTERACTIONS**: Use click actions on navigation elements (buttons, links, menu items) rather than direct URL navigation
- **URL NAVIGATION AS FALLBACK**: Only use direct URL navigation when DOM selectors are not available or when navigating to external pages
- Set up proper viewport and user agent

**ELEMENT INTERACTION (PRIORITY APPROACH):**
- **PRIMARY**: Click buttons, links, menu items with robust selectors to navigate
- **SECONDARY**: Use direct URL navigation only when DOM selectors fail or are unavailable
- Fill forms and input fields with realistic data
- Handle dropdowns, checkboxes, radio buttons
- Manage file uploads if applicable
- **AVOID SAVE/SUBMIT ACTIONS**: Do NOT include clicks on save, submit, create, update, delete buttons
- **STOP BEFORE PERSISTENCE**: End the plan before any action that would save data to the server

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

**SELECTOR INTERACTION PRIORITY:**
1. **FIRST CHOICE**: Use DOM selectors to click navigation elements (buttons, links, menu items)
2. **SECOND CHOICE**: Use DOM selectors to interact with forms and inputs
3. **FALLBACK ONLY**: Use direct URL navigation when DOM selectors are unavailable or fail
4. **AVOID**: Direct URL navigation for internal page transitions - always prefer clicking UI elements

Return the plan in this JSON format:
{
  "featureName": "string",
  "totalActions": number,
  "estimatedDuration": number,
  "scrapingStrategy": "Brief description of the overall scraping approach",
  "actions": [
    {
      "type": "click|type|navigate|wait|scroll|select|extract|evaluate",
      "selector": "Primary CSS selector",
      "fallbackAction": "Alternative action with different type if needed (e.g., click -> navigate)",
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
- **PRIORITIZE DOM INTERACTIONS**: Always prefer clicking UI elements over direct URL navigation
- Create executable Puppeteer code patterns that mimic real user behavior
- Use robust, maintainable selectors for all interactions
- Handle real-world web application challenges through DOM manipulation
- Implement proper error handling and retries
- Consider performance and reliability
- Plan for data extraction and storage
- Account for dynamic content and user interactions
- **NAVIGATION STRATEGY**: Use click actions on navigation elements (buttons, links, menus) as the primary method, with URL navigation only as a last resort

**AUTHENTICATION HANDLING:**
- **NO ASSUMPTIONS**: Do not assume user is logged in or out
- **DETECT REDIRECTS**: If redirected to login page, handle authentication flow
- **FLEXIBLE APPROACH**: Plan should work whether user starts logged in or not
- **HANDLE BOTH SCENARIOS**: Include logic to detect and handle authentication state

**DRY RUN EXECUTION REQUIREMENTS:**
- **COMPLETE FEATURE COVERAGE**: Include all steps of the feature flow from start to finish
- **AVOID DATA PERSISTENCE**: Do NOT include actions that would save, submit, create, update, or delete data
- **DEMONSTRATION FOCUS**: The plan should demonstrate the complete user journey without making permanent changes
- **STOP BEFORE SAVE**: End the plan just before any button or action that would trigger API calls to save data
- **INCLUDE VALIDATION**: Include form filling, validation, and navigation steps, but stop before final submission
`;
  }

  private createFallbackActionPlan(featureDocs: ProductDocs, websiteUrl?: string): ActionPlan {
    const basicActions: PuppeteerAction[] = [
      {
        type: 'navigate',
        selector: undefined,
        inputText: websiteUrl || 'https://app.gorattle.com',
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
      const text = await this.makeRequestWithRetry(async (model) => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      });

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

  // Utility method to get API key status for monitoring
  getApiKeyStatus(): { keyIndex: number; usageCount: number; lastUsed: number; totalKeys: number }[] {
    const status = [];
    for (let i = 0; i < this.genAIs.length; i++) {
      status.push({
        keyIndex: i,
        usageCount: this.keyUsageCount.get(i) || 0,
        lastUsed: this.keyLastUsed.get(i) || 0,
        totalKeys: this.genAIs.length
      });
    }
    return status;
  }

  // Method to reset key usage (useful for testing or manual reset)
  resetKeyUsage(): void {
    this.keyUsageCount.clear();
    this.keyLastUsed.clear();
    this.genAIs.forEach((_, index) => {
      this.keyUsageCount.set(index, 0);
      this.keyLastUsed.set(index, 0);
    });
    console.log('🔄 API key usage counters reset');
  }
}
