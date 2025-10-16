import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Action, DOMState, GeminiResponse, ProductDocs, ActionPlan, PuppeteerAction, ElementMatch } from '../types/demo-automation.types';
import * as fs from 'fs';

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

  /**
   * Extract JSON content from markdown-wrapped responses
   * Handles cases where Gemini returns JSON wrapped in ```json ... ``` blocks
   */
  private extractJsonFromResponse(response: string): string {
    // Check if response contains markdown code blocks
    if (response.includes('```json')) {
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        return jsonMatch[1].trim();
      }
    }
    
    // If no markdown blocks found, return the original response
    return response;
  }

  /**
   * Analyze action failure and generate improved action using LLM
   * This enables intelligent retry with learning from failures
   */
  async analyzeFailureAndRegenerateAction(
    failedAction: Action,
    validationReasoning: string,
    currentDOMState: DOMState,
    goal: string,
    retryAttempt: number
  ): Promise<{ improvedAction: Action; analysis: string; recommendations: string[] }> {
    const prompt = `
You are an intelligent automation agent that learns from failures. Analyze the failed action and generate an improved version.

CONTEXT:
- Goal: ${goal}
- Failed Action: ${failedAction.type} - ${failedAction.description}
- Validation Failure Reason: ${validationReasoning}
- Retry Attempt: ${retryAttempt}/3
- Current URL: ${currentDOMState.currentUrl}
- Page Title: ${currentDOMState.pageTitle}

CURRENT PAGE STATE:
- Available clickable elements: ${currentDOMState.clickableSelectors.slice(0, 10).join(', ')}
- Available input elements: ${currentDOMState.inputSelectors.slice(0, 5).join(', ')}
- Visible text snippets: ${currentDOMState.visibleText.slice(0, 10).join(', ')}

ANALYSIS INSTRUCTIONS:
1. Analyze WHY the original action failed
2. Identify what went wrong (selector issues, navigation problems, timing, etc.)
3. Consider the current page state and available elements
4. Generate an improved action that addresses the failure
5. Provide specific recommendations for success

Return JSON with:
{
  "analysis": "Detailed analysis of why the action failed and what needs to be improved",
  "improvedAction": {
    "type": "click|type|navigate|wait|extract|evaluate",
    "selector": "Improved selector or navigation target",
    "inputText": "Text to input (if applicable)",
    "description": "Clear description of the improved action",
    "reasoning": "Why this improved action should work"
  },
  "recommendations": [
    "Specific recommendation 1",
    "Specific recommendation 2"
  ]
}

Focus on:
- Better selectors based on current page state
- Alternative navigation approaches
- Timing considerations
- Element discovery strategies
- Fallback approaches
`;

    try {
      const result = await this.makeRequestWithRetry(async (model) => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return await response.text();
      });

      const jsonString = this.extractJsonFromResponse(result);
      const parsed = JSON.parse(jsonString);

      console.log(`🧠 LLM Failure Analysis (Attempt ${retryAttempt}):`, {
        analysis: parsed.analysis,
        improvedAction: parsed.improvedAction,
        recommendations: parsed.recommendations
      });

      return {
        improvedAction: parsed.improvedAction,
        analysis: parsed.analysis,
        recommendations: parsed.recommendations || []
      };
    } catch (error) {
      console.error('Failed to analyze failure and regenerate action:', error);
      
      // Fallback: return the original action with basic improvements
      return {
        improvedAction: {
          ...failedAction,
          description: `${failedAction.description} (Retry ${retryAttempt} - ${validationReasoning})`
        },
        analysis: `Unable to analyze failure: ${error instanceof Error ? error.message : 'Unknown error'}`,
        recommendations: ['Retry with original action', 'Check page state manually']
      };
    }
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
- New visible text: ${currentState.visibleText.slice(0, 10).join(' | ')}

VALIDATION GUIDELINES:
- For navigation actions: Check if the URL changed or if the expected page content is now visible
- For click actions: Check if the element was clicked successfully (element may still be present but action completed)
- For wait actions: Check if the expected element or content is now visible - focus on the functional presence rather than exact selector matching
- For dynamic web applications: Elements may be implemented as buttons, divs, or other components - not just anchor tags
- Focus on the functional outcome rather than strict selector matching
- Consider that modern web apps use JavaScript frameworks that may render elements differently
- For wait actions with href selectors: If the text content is visible and the element appears to be a navigation link, consider it successful even if the exact href attribute structure differs
- Priority should be given to functional visibility over exact attribute matching

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

  async validateActionSuccessWithScreenshot(
    action: Action,
    screenshot: string,
    currentUrl: string,
    pageTitle: string,
    expectedOutcome: string,
    screenshotData?: { data: string; mimeType: string },
    screenshotPath?: string
  ): Promise<{ success: boolean; reasoning: string }> {
    console.log(`📊 Validation Analysis Input:`, {
      actionType: action.type,
      actionDescription: action.description,
      selector: action.selector,
      inputText: action.inputText,
      coordinates: action.coordinates,
      currentUrl,
      pageTitle,
      expectedOutcome,
      screenshotLength: screenshot.length
    });
    const prompt = `
You are an AI assistant that validates whether an action was successful by looking at a screenshot.

ACTION PERFORMED: ${action.type} - ${action.description}
EXPECTED OUTCOME: ${expectedOutcome}

CURRENT STATE:
- URL: ${currentUrl}
- Title: ${pageTitle}
- Screenshot: [Image provided below]

QUESTIONS TO ANSWER:
1. What do you see in the screenshot? Describe the current state of the page.
2. Does the page look like it's in the expected state after the action?
3. Are there any visual indicators that the action was successful?
4. Do you see any errors, loading states, or issues that suggest the action failed?
5. What evidence in the screenshot supports or contradicts the expected outcome?

Please analyze the screenshot and provide your assessment in this JSON format:
{
  "pageState": "Description of what you see in the screenshot",
  "successIndicators": ["Visual signs that the action succeeded"],
  "failureIndicators": ["Visual signs that the action failed"],
  "evidence": "Specific evidence from the screenshot that supports your conclusion",
  "success": true/false,
  "reason": "Explanation of why you think it succeeded or failed based on what you see"
}
`;

    try {
      const result = await this.makeRequestWithRetry(async (model) => {
        let imageData;
        
        // Use file-based approach if screenshotPath is provided
        if (screenshotPath && fs.existsSync(screenshotPath)) {
          console.log(`📁 Using file-based screenshot for validation: ${screenshotPath}`);
          const fileData = fs.readFileSync(screenshotPath);
          imageData = {
            inlineData: {
              data: fileData.toString('base64'),
              mimeType: 'image/png'
            }
          };
        } else {
          console.log(`📊 Using base64 screenshot data for validation`);
          imageData = {
            inlineData: screenshotData || {
              data: screenshot,
              mimeType: 'image/png'
            }
          };
        }
        
        const result = await model.generateContent([
          prompt,
          imageData
        ]);
        const response = await result.response;
        return response.text();
      });

      console.log(`📊 Validation Analysis Raw Output:`, {
        rawResponse: result
      });
      
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const finalResult = {
          success: parsed.success || false,
          reasoning: parsed.reason || 'No reason provided'
        };
        
        console.log(`📊 Validation Analysis Final Output:`, {
          success: finalResult.success,
          reasoning: finalResult.reasoning,
          parsedResponse: parsed
        });
        
        return finalResult;
      }

      console.log(`📊 Validation Analysis Failed to Parse:`, {
        rawResponse: result,
        error: 'No JSON match found'
      });

      return { success: false, reasoning: 'Failed to parse validation response' };
    } catch (error) {
      console.error('Error validating action with screenshot:', error);
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

      // Parse the JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in file processing response');
      }

      const parsed = JSON.parse(jsonMatch[0]);


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

      // Validate and structure the response as a roadmap
      const actionPlan: ActionPlan = {
        featureName: parsed.featureName || featureDocs.featureName,
        totalActions: parsed.actions?.length || 0,
        estimatedDuration: parsed.estimatedDuration || 0,
        scrapingStrategy: parsed.scrapingStrategy || 'Intelligent visual analysis with goal-based execution',
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

      // Validate plan completeness
      this.validatePlanCompleteness(actionPlan, featureDocs);

      return actionPlan;
    } catch (error) {
      console.error('Error generating action plan:', error);

      // Fallback to basic action plan
      return this.createFallbackActionPlan(featureDocs, websiteUrl);
    }
  }

  private buildActionPlanningPrompt(featureDocs: ProductDocs, websiteUrl: string): string {
    return `
You are creating a HIGH-LEVEL ROADMAP for an intelligent automation agent. Your task is to create a strategic plan that tells the agent WHAT to accomplish, not HOW to accomplish it. The agent will figure out the execution details based on visual analysis.

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

**ROADMAP PLANNING PRINCIPLES:**
1. **GOAL-ORIENTED**: Focus on WHAT needs to be achieved, not HOW to achieve it
2. **HIGH-LEVEL GUIDANCE**: Provide strategic direction, not technical implementation
3. **VISUAL INTELLIGENCE**: Trust the agent to analyze screenshots and make decisions
4. **ADAPTIVE EXECUTION**: Let the agent figure out the best approach based on what it sees
5. **CONTEXTUAL AWARENESS**: The agent will understand the current page state and adapt

**ROADMAP STRUCTURE:**
Create a plan with these types of high-level goals:

**NAVIGATION GOALS:**
- "Navigate to the [Feature Name] section"
- "Find and access the [Feature Name] functionality"
- "Reach the [Feature Name] area of the application"

**INTERACTION GOALS:**
- "Use the [Feature Name] feature"
- "Demonstrate [Feature Name] functionality"
- "Show how to [specific action from documentation]"

**VALIDATION GOALS:**
- "Verify the [Feature Name] is working correctly"
- "Confirm the [Feature Name] functionality is accessible"
- "Validate the [Feature Name] feature behavior"

**IMPORTANT CONSTRAINTS:**
- **NO TECHNICAL DETAILS**: Don't specify selectors, click targets, or technical steps
- **NO IMPLEMENTATION**: Don't tell the agent how to find elements or interact with them
- **GOAL FOCUS**: Only describe what needs to be accomplished
- **VISUAL TRUST**: Trust the agent to figure out the visual elements and interactions
- **ADAPTIVE APPROACH**: Let the agent adapt based on what it sees on the page

**ROADMAP REQUIREMENTS:**
- **HIGH-LEVEL OBJECTIVES**: Create goals that describe the desired outcome
- **FEATURE-FOCUSED**: Focus on reaching and using the specific feature
- **DEMONSTRATION-ORIENTED**: Plan to show the feature in action
- **VISUAL-DRIVEN**: Let the agent use visual analysis to execute the goals
- **FLEXIBLE EXECUTION**: Allow the agent to adapt the approach based on page state

**EXAMPLE ROADMAP STRUCTURE:**
1. "Navigate to the [Feature Name] section of the application"
2. "Access the [Feature Name] functionality"
3. "Use the [Feature Name] feature to [specific action]"
4. "Verify the [Feature Name] is working as expected"
5. "Demonstrate the [Feature Name] capabilities"

**AGENT INTELLIGENCE:**
The agent will:
- **Analyze screenshots** to understand the current page state
- **Find navigation elements** visually to reach the feature
- **Discover interaction elements** based on visual context
- **Adapt the approach** based on what it sees on the page
- **Make intelligent decisions** about how to accomplish each goal
- **Use visual cues** to determine the best interaction method

Create a roadmap that provides clear goals for the agent to accomplish, while letting the agent figure out the execution details through visual analysis and intelligent decision-making.
- **Click "Home" link** → Fallback: navigate to "/" or "/home"
- **Click "Back" button** → Fallback: navigate to previous page or parent URL
- **Click "Next" button** → Fallback: navigate to next page or increment URL
- **Click "Save" button** → Fallback: navigate to "/save" or "/submit"
- **Click "Cancel" button** → Fallback: navigate to previous page or "/cancel"
- **Click "Submit" button** → Fallback: navigate to "/submit" or "/confirm"
- **Click "Delete" button** → Fallback: navigate to "/delete" or "/remove"
- **Click "Edit" button** → Fallback: navigate to "/edit" or "/modify"
- **Click "View" button** → Fallback: navigate to "/view" or "/show"
- **Click "Search" button** → Fallback: navigate to "/search" or "/find"
- **Click "Filter" button** → Fallback: navigate to "/filter" or "/sort"
- **Click "Export" button** → Fallback: navigate to "/export" or "/download"
- **Click "Import" button** → Fallback: navigate to "/import" or "/upload"

**SELECTOR INTERACTION PRIORITY:**
1. **FIRST CHOICE**: Use generic element descriptions to click navigation elements (buttons, links, menu items)
2. **SECOND CHOICE**: Use generic element descriptions to interact with forms and inputs
3. **FALLBACK ONLY**: Use direct URL navigation when DOM selectors are unavailable or fail
4. **AVOID**: Direct URL navigation for internal page transitions - always prefer clicking UI elements
5. **IMPORTANT**: Use descriptive element names like "workflows link", "create button", "name input field" instead of CSS selectors like "a[href='/workflows']", "button[data-testid='create-workflow-button']"

Return the plan in this JSON format:
{
  "featureName": "string",
  "totalActions": number,
  "estimatedDuration": number,
  "scrapingStrategy": "Brief description of the overall scraping approach with screenshot + coordinate execution",
  "actions": [
    {
      "type": "click|type|navigate|wait|scroll|select|extract|evaluate|expand|collapse|hover",
      "selector": "Human-readable visual target description (e.g., 'Click the blue Create Workflow button', 'Navigate to the Settings menu', 'Fill in the Project Name field')",
      "fallbackAction": {
        "type": "navigate|click|wait|retry|expand|collapse",
        "selector": "Alternative human-readable target or URL",
        "inputText": "Alternative input or URL path",
        "description": "Fallback action description in human terms"
      },
      "inputText": "Text to input (for type actions)",
      "description": "Natural language description of what a human user would do (e.g., 'Click the Create Workflow button in the top navigation', 'Fill in the project name field with a descriptive title')",
      "expectedOutcome": "What a human user would expect to see after this action (visual changes, page transitions, new elements appearing)",
      "waitCondition": "What a human would wait for visually (e.g., 'Wait for the form to appear', 'Wait for the menu to expand', 'Wait for the page to load')",
      "extractData": "What data to extract (if applicable)",
      "priority": "high|medium|low",
      "estimatedDuration": number,
      "errorHandling": "How a human would handle failures (e.g., 'Try clicking the alternative button', 'Refresh the page and retry')",
      "prerequisites": ["prerequisite1", "prerequisite2"],
      "visualContext": "Description of what a human would see on the screen and the visual state for screenshot analysis"
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
- **USE GENERIC ELEMENT DESCRIPTIONS**: Use descriptive names like "workflows link", "create button", "name input field" instead of specific CSS selectors
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

**FINAL VALIDATION CHECKLIST (MANDATORY):**
Before generating the final plan, you MUST verify:
1. **STEP COUNT MATCH**: The number of actions should be sufficient to cover all documented steps
2. **SEQUENCE LOGIC**: Each action logically follows from the previous one
3. **COMPLETENESS AUDIT**: Every documented step has at least one corresponding action
4. **NAVIGATION FLOW**: All necessary page transitions and navigation steps are included
5. **FORM COVERAGE**: All form fields, inputs, and interactions are covered
6. **VALIDATION STEPS**: All validation, confirmation, and error handling steps are included
7. **NO GAPS**: No logical gaps exist between actions
8. **REALISTIC FLOW**: The plan represents a realistic user journey through the feature

**SPECIFIC UI PATTERN EXAMPLES:**
- **DROPDOWN MENUS**: If you see "Workflows" in documentation, plan to first click "Workflows" to expand the dropdown, then click "General" submenu item
- **NESTED NAVIGATION**: Plan for multi-level menu structures where each level must be expanded before accessing the next level
- **COLLAPSIBLE SECTIONS**: Account for accordion-style interfaces where sections need to be expanded to reveal content
- **TAB INTERFACES**: Plan for tab-based navigation where content changes based on selected tabs
- **MODAL DIALOGS**: Plan for popup windows or overlays that may appear during the interaction flow

**CRITICAL REMINDER**: This plan will be executed by an automation system using screenshot + coordinate based execution. Missing steps or incorrect sequences will cause the automation to fail. Be extremely thorough and methodical in your analysis, paying special attention to collapsible UI elements and visual hierarchy.
`;
  }

  private validatePlanCompleteness(actionPlan: ActionPlan, featureDocs: ProductDocs): void {
    console.log('🔍 Validating plan completeness...');
    
    // Check if we have enough actions for the documented steps
    const documentedSteps = featureDocs.steps.length;
    const plannedActions = actionPlan.actions.length;
    
    console.log(`📊 Documented steps: ${documentedSteps}, Planned actions: ${plannedActions}`);
    
    // Warn if there are significantly fewer actions than documented steps
    if (plannedActions < documentedSteps * 0.5) {
      console.warn(`⚠️  WARNING: Plan has ${plannedActions} actions but ${documentedSteps} documented steps. This may indicate missing steps.`);
    }
    
    // Check for critical action types that should be present
    const hasNavigation = actionPlan.actions.some(action => action.type === 'navigate');
    const hasClicks = actionPlan.actions.some(action => action.type === 'click');
    const hasTyping = actionPlan.actions.some(action => action.type === 'type');
    
    if (!hasNavigation && !hasClicks) {
      console.warn('⚠️  WARNING: Plan lacks navigation or click actions. This may indicate incomplete coverage.');
    }
    
    // Log plan summary for review
    console.log('📋 Plan Summary:');
    console.log(`   - Total actions: ${plannedActions}`);
    console.log(`   - Click actions: ${actionPlan.summary.clickActions}`);
    console.log(`   - Type actions: ${actionPlan.summary.typeActions}`);
    console.log(`   - Navigation actions: ${actionPlan.summary.navigationActions}`);
    console.log(`   - Wait actions: ${actionPlan.summary.waitActions}`);
    
    console.log('✅ Plan validation completed');
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

  async analyzeCurrentStateWithScreenshot(
    screenshot: string,
    currentUrl: string,
    pageTitle: string,
    nextAction: PuppeteerAction,
    featureDocs: ProductDocs,
    history: Action[],
    currentContext: string
  ): Promise<{ context: string; reasoning: string; shouldProceed: boolean }> {
    const prompt = this.buildScreenshotAnalysisPrompt(
      screenshot,
      currentUrl,
      pageTitle,
      nextAction,
      featureDocs,
      history,
      currentContext
    );

    try {
      const text = await this.makeRequestWithRetry(async (model) => {
        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: screenshot,
              mimeType: 'image/png'
            }
          }
        ]);
        const response = await result.response;
        return response.text();
      });

      return this.parseAnalysisResponse(text);
    } catch (error) {
      console.error('Error analyzing current state with screenshot:', error);
      return {
        context: currentContext,
        reasoning: 'Error analyzing current state with screenshot',
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

  private buildScreenshotAnalysisPrompt(
    screenshot: string,
    currentUrl: string,
    pageTitle: string,
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
You are an intelligent AI assistant analyzing a screenshot to make adaptive automation decisions. Your role is to understand the current page state and intelligently determine the best course of action based on visual context.

CURRENT PAGE STATE:
- URL: ${currentUrl}
- Title: ${pageTitle}
- Screenshot: [Image provided below]

NEXT PLANNED ACTION (GUIDANCE ONLY):
- Type: ${nextAction.type}
- Description: ${nextAction.description}
- Expected Outcome: ${nextAction.expectedOutcome}

FEATURE CONTEXT:
- Feature: ${featureDocs.featureName}
- Description: ${featureDocs.description}

PREVIOUS ACTIONS (${history.length}):
${historyText}

CURRENT CONTEXT: ${currentContext}

INTELLIGENT ANALYSIS INSTRUCTIONS:
1. **VISUAL CONTEXT ANALYSIS**: Analyze the screenshot to understand the current page state, layout, and available elements
2. **INTELLIGENT DECISION MAKING**: Based on what you see, determine the most appropriate action to take next
3. **ADAPTIVE APPROACH**: Don't strictly follow the planned action if the visual context suggests a better approach
4. **GOAL-ORIENTED THINKING**: Focus on achieving the feature goals rather than following rigid steps
5. **CONTEXTUAL AWARENESS**: Consider the current page state, available elements, and user flow

INTELLIGENT ANALYSIS QUESTIONS:
1. **What do you see in the screenshot?** Describe the main elements, layout, and current state
2. **What is the page trying to accomplish?** Understand the user's goal and the page's purpose
3. **What elements are available for interaction?** Identify clickable elements, forms, navigation, etc.
4. **What would be the most intelligent next action?** Based on visual context, what should happen next?
5. **Are there any obstacles or opportunities?** Look for errors, loading states, or new opportunities
6. **How can we adapt the approach?** What changes should be made based on what you see?

INTELLIGENT DECISION MAKING:
- **VISUAL INTELLIGENCE**: Use visual cues to make smart decisions about what to do next
- **ADAPTIVE EXECUTION**: Adapt the approach based on what you see rather than following rigid plans
- **GOAL-ORIENTED ACTIONS**: Focus on achieving the feature goals through intelligent automation
- **CONTEXTUAL AWARENESS**: Make decisions based on the current page state and available options
- **INTELLIGENT DISCOVERY**: Find the best elements to interact with based on visual analysis

Please provide your intelligent analysis in this JSON format:
{
  "pageDescription": "Detailed description of what you see in the screenshot",
  "pagePurpose": "What the page is trying to accomplish or what the user's goal is",
  "availableElements": ["Elements that are available for interaction"],
  "intelligentTargets": ["Best elements to interact with based on visual analysis"],
  "pageState": "Current state of the page (ready, loading, error, etc.)",
  "obstacles": ["Any problems, errors, or obstacles visible"],
  "opportunities": ["New opportunities or elements that appeared"],
  "intelligentRecommendations": ["What should be done next based on visual intelligence"],
  "adaptiveApproach": "How to adapt the approach based on what you see",
  "context": "Updated context based on visual analysis",
  "reasoning": "Why you made this decision based on the screenshot and visual context",
  "shouldProceed": true/false,
  "alternativeActions": ["Alternative actions that might be better based on visual context"]
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

      // Enhanced context with intelligent analysis
      const enhancedContext = [
        parsed.context || 'No context provided',
        parsed.pageDescription ? `Page: ${parsed.pageDescription}` : '',
        parsed.pagePurpose ? `Purpose: ${parsed.pagePurpose}` : '',
        parsed.intelligentRecommendations ? `Recommendations: ${parsed.intelligentRecommendations.join(', ')}` : '',
        parsed.adaptiveApproach ? `Adaptive approach: ${parsed.adaptiveApproach}` : ''
      ].filter(Boolean).join('\n');

      // Enhanced reasoning with intelligent analysis
      const enhancedReasoning = [
        parsed.reasoning || 'No reasoning provided',
        parsed.intelligentTargets ? `Intelligent targets: ${parsed.intelligentTargets.join(', ')}` : '',
        parsed.opportunities ? `Opportunities: ${parsed.opportunities.join(', ')}` : '',
        parsed.obstacles ? `Obstacles: ${parsed.obstacles.join(', ')}` : '',
        parsed.alternativeActions ? `Alternatives: ${parsed.alternativeActions.join(', ')}` : ''
      ].filter(Boolean).join('\n');

      return {
        context: enhancedContext,
        reasoning: enhancedReasoning,
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

  /**
   * Analyze page content to find elements that match the target description
   * This is the core AI-powered element discovery method
   */
  async analyzePageForElement(
    targetDescription: string,
    domState: DOMState,
    context: string
  ): Promise<{
    suggestedSelectors: Array<{ selector: string; confidence: number; reasoning: string }>;
    recommendations: string[];
  }> {
    const prompt = `
You are an expert web automation AI that finds DOM elements based on user intent.

TARGET: Find elements that match: "${targetDescription}"

CONTEXT:
${context}

CURRENT PAGE STATE:
- URL: ${domState.currentUrl}
- Title: ${domState.pageTitle}
- Available clickable elements: ${domState.clickableSelectors.slice(0, 20).join(', ')}
- Available input elements: ${domState.inputSelectors.slice(0, 10).join(', ')}
- Visible text samples: ${domState.visibleText.slice(0, 15).join(', ')}

TASK: Analyze the page and suggest CSS selectors that could match the target element.
Consider:
1. Text content matching
2. Element attributes (id, class, data-*)
3. Element hierarchy and context
4. Common UI patterns
5. Accessibility attributes

Return JSON with suggested selectors and confidence scores:
{
  "suggestedSelectors": [
    {
      "selector": "string",
      "confidence": number (0-1),
      "reasoning": "string"
    }
  ],
  "recommendations": ["string"]
}

Focus on high-confidence matches that are likely to be the intended element.
`;

    try {
      const result = await this.makeRequestWithRetry(async (model) => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return await response.text();
      });
      
      const jsonString = this.extractJsonFromResponse(result);
      const parsed = JSON.parse(jsonString);
      
      return {
        suggestedSelectors: parsed.suggestedSelectors || [],
        recommendations: parsed.recommendations || []
      };
    } catch (error) {
      console.error('Element analysis failed:', error);
      return {
        suggestedSelectors: [],
        recommendations: ['AI analysis failed - using fallback strategies']
      };
    }
  }

  /**
   * Analyze page screenshot to find elements that match the target description
   * This method uses visual analysis to understand what's on the page and find target elements
   */
  async analyzePageForElementWithScreenshot(
    targetDescription: string,
    screenshot: string,
    currentUrl: string,
    pageTitle: string,
    context: string
  ): Promise<{
    suggestedSelectors: Array<{ selector: string; confidence: number; reasoning: string }>;
    recommendations: string[];
  }> {
    const prompt = `
You are an expert web automation AI that analyzes screenshots to help with element discovery.

TARGET: Find elements that match: "${targetDescription}"

CONTEXT:
${context}

CURRENT PAGE STATE:
- URL: ${currentUrl}
- Title: ${pageTitle}
- Screenshot: [Image provided below]

TASK: Look at the screenshot and help identify elements that match the target description.

Based on what you see in the screenshot, provide:
1. A description of what elements you can see that might match the target
2. Any text content that could help identify the target element
3. Visual characteristics that could be used to locate the element
4. Suggestions for how to interact with the page

Return JSON with your analysis:
{
  "visibleElements": [
    {
      "description": "string - what you see in the screenshot",
      "text": "string - any visible text",
      "type": "string - button, link, input, etc.",
      "location": "string - where it appears on screen"
    }
  ],
  "targetMatches": [
    {
      "description": "string - elements that might match the target",
      "confidence": number (0-1),
      "reasoning": "string - why this might be the target"
    }
  ],
  "recommendations": ["string - suggestions for next steps"]
}

Focus on describing what you actually see in the screenshot rather than trying to generate CSS selectors.
`;

    try {
      const result = await this.makeRequestWithRetry(async (model) => {
        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: screenshot,
              mimeType: 'image/png'
            }
          }
        ]);
        const response = await result.response;
        return await response.text();
      });
      
      const jsonString = this.extractJsonFromResponse(result);
      const parsed = JSON.parse(jsonString);
      
      // Convert the visual analysis into selector suggestions
      const suggestedSelectors = this.convertVisualAnalysisToSelectors(parsed, targetDescription);
      
      return {
        suggestedSelectors,
        recommendations: parsed.recommendations || []
      };
    } catch (error) {
      console.error('Screenshot element analysis failed:', error);
      return {
        suggestedSelectors: [],
        recommendations: ['Screenshot analysis failed - using fallback strategies']
      };
    }
  }

  /**
   * NEW: Analyze screenshot to detect click coordinates for target elements
   * This is the core method for coordinate-based automation
   */
  async detectClickCoordinates(
    targetDescription: string,
    screenshot: string,
    currentUrl: string,
    pageTitle: string,
    viewportDimensions: { width: number; height: number },
    context: string,
    screenshotData?: { data: string; mimeType: string },
    screenshotPath?: string
  ): Promise<{
    coordinates: Array<{ x: number; y: number; confidence: number; reasoning: string; elementDescription: string }>;
    recommendations: string[];
    pageAnalysis: string;
  }> {
    console.log(`📊 Gemini Coordinate Detection Input:`, {
      targetDescription,
      currentUrl,
      pageTitle,
      viewportDimensions,
      screenshotLength: screenshot.length,
      context
    });
    const prompt = `
You are a human user looking at a web page screenshot. Your task is to identify and click on visual targets that match the user's intent.

HUMAN BEHAVIOR SIMULATION:
- Think like a human user scanning the page visually
- Look for visual cues, text, buttons, links, and interactive elements
- Focus on what a human would naturally click on
- Consider visual hierarchy and user interface patterns

TARGET TO FIND: "${targetDescription}"

CONTEXT:
${context}

CURRENT PAGE STATE:
- URL: ${currentUrl}
- Title: ${pageTitle}
- Viewport Dimensions: ${viewportDimensions.width}x${viewportDimensions.height}
- Screenshot: [Image provided below]

HUMAN-LIKE ANALYSIS APPROACH:
1. **VISUAL SCANNING**: Look at the screenshot as a human would - scan for the target element
2. **VISUAL IDENTIFICATION**: Identify elements by their visual appearance, text, or position
3. **NATURAL CLICKING**: Determine where a human would naturally click on the target
4. **VISUAL HIERARCHY**: Consider the visual importance and prominence of elements
5. **USER INTENT**: Focus on what the user wants to accomplish, not technical selectors

COORDINATE DETECTION REQUIREMENTS:
- Provide exact pixel coordinates (x, y) where a human would click
- Coordinates should be relative to the screenshot/viewport (0,0 is top-left)
- Focus on the center or most natural click point of the target element
- Account for the viewport dimensions: ${viewportDimensions.width}x${viewportDimensions.height}
- Provide confidence scores (0-1) based on how clearly you can see the target
- Explain your reasoning from a human perspective

TASK: Analyze the screenshot like a human user and provide click coordinates for the target.

Return JSON with your analysis:
{
  "pageAnalysis": "string - overall description of what you see in the screenshot",
  "coordinates": [
    {
      "x": number,
      "y": number,
      "confidence": number (0-1),
      "reasoning": "string - why you chose these coordinates",
      "elementDescription": "string - description of the element at these coordinates"
    }
  ],
  "recommendations": ["string - suggestions for automation"]
}

IMPORTANT: 
- Coordinates must be within the viewport bounds (0 to ${viewportDimensions.width} for x, 0 to ${viewportDimensions.height} for y)
- Focus on the center of clickable elements (buttons, links, etc.)
- Consider visual hierarchy and user interaction patterns
- Provide multiple coordinate options if you see multiple potential targets
`;

    try {
      const result = await this.makeRequestWithRetry(async (model) => {
        let imageData;
        
        // Use file-based approach if screenshotPath is provided
        if (screenshotPath && fs.existsSync(screenshotPath)) {
          console.log(`📁 Using file-based screenshot: ${screenshotPath}`);
          const fileData = fs.readFileSync(screenshotPath);
          imageData = {
            inlineData: {
              data: fileData.toString('base64'),
              mimeType: 'image/png'
            }
          };
        } else {
          console.log(`📊 Using base64 screenshot data`);
          imageData = {
            inlineData: screenshotData || {
              data: screenshot,
              mimeType: 'image/png'
            }
          };
        }
        
        const result = await model.generateContent([
          prompt,
          imageData
        ]);
        const response = await result.response;
        return await response.text();
      });
        console.log("🚀 ~ GeminiService ~ detectClickCoordinates ~ result:", result)
      
      const jsonString = this.extractJsonFromResponse(result);
      const parsed = JSON.parse(jsonString);
      
      console.log(`📊 Gemini Coordinate Detection Raw Output:`, {
        rawResponse: result,
        parsedResponse: parsed
      });
      
      // Validate coordinates are within viewport bounds
      const validatedCoordinates = parsed.coordinates?.map((coord: any) => ({
        ...coord,
        x: Math.max(0, Math.min(coord.x, viewportDimensions.width)),
        y: Math.max(0, Math.min(coord.y, viewportDimensions.height))
      })) || [];
      
      const finalResult = {
        coordinates: validatedCoordinates,
        recommendations: parsed.recommendations || [],
        pageAnalysis: parsed.pageAnalysis || 'Screenshot analysis completed'
      };
      
      console.log(`📊 Gemini Coordinate Detection Final Output:`, {
        coordinatesFound: finalResult.coordinates.length,
        coordinates: finalResult.coordinates,
        recommendations: finalResult.recommendations,
        pageAnalysis: finalResult.pageAnalysis
      });
      
      return finalResult;
    } catch (error) {
      console.error('Coordinate detection failed:', error);
      return {
        coordinates: [],
        recommendations: ['Coordinate detection failed - using fallback strategies'],
        pageAnalysis: 'Failed to analyze screenshot for coordinates'
      };
    }
  }

  /**
   * Convert visual analysis results into CSS selector suggestions
   */
  private convertVisualAnalysisToSelectors(
    analysis: any,
    targetDescription: string
  ): Array<{ selector: string; confidence: number; reasoning: string }> {
    const selectors: Array<{ selector: string; confidence: number; reasoning: string }> = [];
    
    if (analysis.targetMatches && analysis.targetMatches.length > 0) {
      for (const match of analysis.targetMatches) {
        // Generate common selectors based on the visual analysis
        const textBasedSelectors = this.generateTextBasedSelectors(match.description, match.text);
        const typeBasedSelectors = this.generateTypeBasedSelectors(match.type);
        
        selectors.push(...textBasedSelectors.map(selector => ({
          selector,
          confidence: match.confidence * 0.8, // Slightly lower confidence for generated selectors
          reasoning: `Visual analysis: ${match.reasoning}`
        })));
        
        selectors.push(...typeBasedSelectors.map(selector => ({
          selector,
          confidence: match.confidence * 0.6,
          reasoning: `Type-based from visual analysis: ${match.reasoning}`
        })));
      }
    }
    
    return selectors;
  }

  /**
   * Generate text-based selectors from visual analysis
   */
  private generateTextBasedSelectors(description: string, text: string): string[] {
    const selectors: string[] = [];
    
    if (text) {
      // Button with text
      selectors.push(`button:contains("${text}")`);
      selectors.push(`input[value="${text}"]`);
      selectors.push(`a:contains("${text}")`);
      
      // Generic text-based selectors
      selectors.push(`*:contains("${text}")`);
    }
    
    return selectors;
  }

  /**
   * Generate type-based selectors from visual analysis
   */
  private generateTypeBasedSelectors(type: string): string[] {
    const selectors: string[] = [];
    
    switch (type?.toLowerCase()) {
      case 'button':
        selectors.push('button');
        selectors.push('input[type="button"]');
        selectors.push('input[type="submit"]');
        selectors.push('[role="button"]');
        break;
      case 'link':
        selectors.push('a');
        selectors.push('[role="link"]');
        break;
      case 'input':
        selectors.push('input');
        selectors.push('textarea');
        selectors.push('select');
        break;
      case 'form':
        selectors.push('form');
        selectors.push('[role="form"]');
        break;
    }
    
    return selectors;
  }

  /**
   * Enhanced element discovery using semantic understanding
   */
  async discoverElementSemantically(
    action: PuppeteerAction,
    domState: DOMState,
    availableElements: ElementMatch[]
  ): Promise<{
    bestMatch: ElementMatch | null;
    reasoning: string;
    confidence: number;
  }> {
    const prompt = `
You are an expert web automation AI that understands user intent and matches it to DOM elements.

ACTION INTENT: ${action.description}
EXPECTED OUTCOME: ${action.expectedOutcome}
ACTION TYPE: ${action.type}

AVAILABLE ELEMENTS:
${availableElements.map((el, i) => `
${i + 1}. Selector: ${el.selector}
   Text: "${el.textContent || 'N/A'}"
   Type: ${el.elementType}
   Visible: ${el.isVisible}
   Clickable: ${el.isClickable}
   Attributes: ${JSON.stringify(el.attributes || {})}
`).join('\n')}

PAGE CONTEXT:
- URL: ${domState.currentUrl}
- Title: ${domState.pageTitle}
- Available clickable elements: ${domState.clickableSelectors.slice(0, 10).join(', ')}

TASK: Analyze the user's intent and select the best matching element from the available options.
Consider:
1. Semantic meaning of the action description
2. Element text content relevance
3. Element type appropriateness for the action
4. Element visibility and interactivity
5. Context clues from the page

Return JSON:
{
  "bestMatchIndex": number (index of best match, or -1 if none suitable),
  "reasoning": "string",
  "confidence": number (0-1)
}
`;

    try {
      const result = await this.makeRequestWithRetry(async (model) => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return await response.text();
      });
      
      const jsonString = this.extractJsonFromResponse(result);
      const parsed = JSON.parse(jsonString);
      
      const bestMatch = parsed.bestMatchIndex >= 0 
        ? availableElements[parsed.bestMatchIndex] 
        : null;
      
      return {
        bestMatch,
        reasoning: parsed.reasoning || 'No suitable match found',
        confidence: parsed.confidence || 0
      };
    } catch (error) {
      console.error('Semantic element discovery failed:', error);
      return {
        bestMatch: null,
        reasoning: 'Semantic analysis failed',
        confidence: 0
      };
    }
  }

  /**
   * Generate content from a prompt using the AI model
   * This is a public method that can be used by other services
   */
  async generateContentFromPrompt(prompt: string): Promise<string> {
    try {
      const result = await this.makeRequestWithRetry(async (model) => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return await response.text();
      });
      
      return result;
    } catch (error) {
      console.error('Content generation failed:', error);
      throw error;
    }
  }

  /**
   * Analyze DOM changes to understand what happened after an action
   */
  async analyzeDOMChanges(
    previousState: DOMState,
    currentState: DOMState,
    action: PuppeteerAction
  ): Promise<{
    actionImpact: string;
    newElements: string[];
    recommendations: string[];
  }> {
    const prompt = `
You are an expert web automation AI that analyzes DOM changes to understand action impact.

ACTION PERFORMED: ${action.type} - ${action.description}
EXPECTED OUTCOME: ${action.expectedOutcome}

PREVIOUS STATE:
- URL: ${previousState.currentUrl}
- Title: ${previousState.pageTitle}
- Clickable elements: ${previousState.clickableSelectors.slice(0, 10).join(', ')}

CURRENT STATE:
- URL: ${currentState.currentUrl}
- Title: ${currentState.pageTitle}
- Clickable elements: ${currentState.clickableSelectors.slice(0, 10).join(', ')}

NEW ELEMENTS: ${currentState.clickableSelectors.filter(s => !previousState.clickableSelectors.includes(s)).join(', ')}

TASK: Analyze what changed and provide insights about the action's impact.

Return JSON:
{
  "actionImpact": "string describing what happened",
  "newElements": ["array of new element selectors"],
  "recommendations": ["array of next steps or suggestions"]
}
`;

    try {
      const result = await this.makeRequestWithRetry(async (model) => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return await response.text();
      });
      
      const jsonString = this.extractJsonFromResponse(result);
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('DOM change analysis failed:', error);
      return {
        actionImpact: 'Unable to analyze changes',
        newElements: [],
        recommendations: ['Continue with next action']
      };
    }
  }
}
