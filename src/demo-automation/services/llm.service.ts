import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { Action, DOMState, LLMResponse, ProductDocs, PuppeteerAction, ElementMatch } from '../types/demo-automation.types';
import * as fs from 'fs';

/**
 * LLMService with API key rotation support
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
export class LLMService {
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
   * Handles cases where LLM returns JSON wrapped in ```json ... ``` blocks
   */
  private extractJsonFromMarkdown(text: string): string {
    // First try to find JSON wrapped in markdown code blocks
    const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      return jsonBlockMatch[1].trim();
    }

    // If no markdown blocks, try to find JSON object/array
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }

    // Handle cases where response starts with text like "text" or "Genera"
    // Look for JSON after any initial text
    const textThenJsonMatch = text.match(/^[^{[]*(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (textThenJsonMatch) {
      return textThenJsonMatch[1].trim();
    }

    // If no JSON found, return the original text
    return text.trim();
  }

  private getApiKeys(): string[] {
    const singleKey = process.env.GEMINI_API_KEY;
    const multipleKeys = process.env.GEMINI_API_KEYS;

    if (multipleKeys) {
      try {
        // Try parsing as JSON array first
        const parsed = JSON.parse(multipleKeys);
        if (Array.isArray(parsed)) {
          return parsed.filter(key => key && typeof key === 'string');
        }
      } catch {
        // If JSON parsing fails, try comma-separated format
        console.warn('Failed to parse GEMINI_API_KEYS as JSON, trying comma-separated format');
        return multipleKeys.split(',').map(key => key.trim()).filter(key => key);
      }
    }

    if (singleKey) {
      return [singleKey];
    }

    return [];
  }

  private async callWithKeyRotation<T>(
    operation: (model: any) => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const keyIndex = this.getNextKeyIndex();
      const model = this.models[keyIndex];

      try {
        console.log(`🔄 Using LLM API key ${keyIndex + 1}/${this.genAIs.length} (attempt ${attempt + 1})`);
        
        // Update usage tracking
        this.keyUsageCount.set(keyIndex, (this.keyUsageCount.get(keyIndex) || 0) + 1);
        this.keyLastUsed.set(keyIndex, Date.now());

        const result = await operation(model);
        return result;
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a rate limit error (429) or quota exceeded
        if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('rate limit')) {
          console.warn(`⚠️ Rate limit hit for key ${keyIndex + 1}, trying next key...`);
          this.keyLastUsed.set(keyIndex, Date.now() + this.keyCooldownMs);
          continue;
        }
        
        // For other errors, don't retry with different keys
        throw error;
      }
    }

    throw lastError || new Error('All API keys exhausted');
  }

  private getNextKeyIndex(): number {
    const now = Date.now();
    const availableKeys = this.models.map((_, index) => index).filter(index => {
      const lastUsed = this.keyLastUsed.get(index) || 0;
      return now - lastUsed >= this.keyCooldownMs;
    });

    if (availableKeys.length === 0) {
      // If all keys are in cooldown, use the least recently used one
      const leastUsedIndex = Array.from(this.keyLastUsed.entries())
        .sort(([, a], [, b]) => a - b)[0][0];
      return leastUsedIndex;
    }

    // Use the key with the least usage count among available keys
    const leastUsedAvailable = availableKeys.reduce((minIndex, currentIndex) => {
      const minUsage = this.keyUsageCount.get(minIndex) || 0;
      const currentUsage = this.keyUsageCount.get(currentIndex) || 0;
      return currentUsage < minUsage ? currentIndex : minIndex;
    });

    return leastUsedAvailable;
  }

  /**
   * Upload files directly to Gemini and return file references
   */
  private async uploadFilesToGemini(files: Express.Multer.File[]): Promise<any[]> {
    const uploadedFiles = [];
    
    for (const file of files) {
      try {
        console.log(`Uploading file: ${file.originalname} (${file.mimetype})`);
        
        // Get API key for file upload
        const keyIndex = this.getNextKeyIndex();
        const apiKey = this.getApiKeys()[keyIndex];
        
        // Create file manager instance
        const fileManager = new GoogleAIFileManager(apiKey);
        
        // Upload file directly using buffer
        const uploadedFile = await fileManager.uploadFile(file.buffer, {
          mimeType: file.mimetype,
          displayName: file.originalname
        });
        
        uploadedFiles.push(uploadedFile.file);
        
        console.log(`Successfully uploaded: ${file.originalname} to ${uploadedFile.file.uri}`);
      } catch (error) {
        console.error(`Failed to upload file ${file.originalname}:`, error);
        throw new Error(`Failed to upload file ${file.originalname}`);
      }
    }
    
    return uploadedFiles;
  }

  /**
   * Call LLM with uploaded files and return raw text response
   */
  private async callLLMWithFiles(
    prompt: string,
    uploadedFiles: any[],
    temperature: number = 0.1
  ): Promise<string> {
    try {
      const result = await this.callWithKeyRotation(async (model) => {
        // Create content array with file data and prompt (using correct Gemini format)
        const content = [
          // Add text prompt first
          prompt,
          // Add file data parts
          ...uploadedFiles.map(file => ({
            fileData: {
              fileUri: file.uri,
              mimeType: file.mimeType
            }
          }))
        ];
        
        const response = await model.generateContent(content);
        return response.response.text();
      });

      return result;
    } catch (error) {
      console.error('Error calling LLM with files:', error);
      throw error;
    }
  }

  async callLLM(
    prompt: string,
    systemPrompt?: string,
    temperature: number = 0.1
  ): Promise<LLMResponse> {
    try {
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
      
      const result = await this.callWithKeyRotation(async (model) => {
        const response = await model.generateContent(fullPrompt);
        return response.response.text();
      });

      return this.parseLLMResponse(result);
    } catch (error) {
      console.error('Error calling LLM API:', error);
      return {
        success: false,
        reasoning: 'Error calling LLM API',
        action: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private parseLLMResponse(text: string): LLMResponse {
    try {
      const jsonText = this.extractJsonFromMarkdown(text);
      console.log('Extracted JSON text:', jsonText.substring(0, 200) + (jsonText.length > 200 ? '...' : ''));
      
      const parsed = JSON.parse(jsonText);
      
      return {
        success: parsed.success !== false,
        reasoning: parsed.reasoning || 'No reasoning provided',
        action: parsed.action || null,
        error: parsed.error || null,
        ...parsed
      };
    } catch (error) {
      console.error('Error parsing LLM response:', error);
      console.error('Original text:', text.substring(0, 500) + (text.length > 500 ? '...' : ''));
      console.error('Extracted text:', this.extractJsonFromMarkdown(text).substring(0, 500) + (this.extractJsonFromMarkdown(text).length > 500 ? '...' : ''));
      return {
        success: false,
        reasoning: 'Failed to parse LLM response',
        action: null,
        error: 'Invalid JSON response from LLM'
      };
    }
  }

  async processFilesDirectly(
    files: Express.Multer.File[],
    featureName?: string
  ): Promise<{
    featureName: string;
    description: string;
    steps: string[];
    selectors: string[];
    expectedOutcomes: string[];
    prerequisites: string[];
  }> {
    try {
      console.log(`Processing ${files.length} files directly with Gemini...`);
      
      // Upload files directly to Gemini and get file references
      const uploadedFiles = await this.uploadFilesToGemini(files);
      
      const prompt = `
Analyze the following uploaded files and extract feature information for "${featureName || 'the feature'}".

Please extract:
1. Feature name
2. Description of what the feature does
3. Step-by-step instructions for using the feature
4. CSS selectors or element identifiers needed
5. Expected outcomes after completing the feature
6. Any prerequisites or setup requirements

IMPORTANT: You must respond with ONLY valid JSON. Do not include any text before or after the JSON. Do not wrap the JSON in markdown code blocks.

Return the information in this exact JSON format:
{
  "featureName": "string",
  "description": "string", 
  "steps": ["step1", "step2", "step3"],
  "selectors": ["selector1", "selector2"],
  "expectedOutcomes": ["outcome1", "outcome2"],
  "prerequisites": ["prereq1", "prereq2"]
}
`;

      // Use the uploaded files with Gemini
      const response = await this.callLLMWithFiles(prompt, uploadedFiles, 0.1);
      
      // Parse the JSON response from the LLM
      try {
        const jsonText = this.extractJsonFromMarkdown(response);
        console.log('Extracted JSON text:', jsonText.substring(0, 200) + (jsonText.length > 200 ? '...' : ''));
        const parsed = JSON.parse(jsonText);
        return parsed;
      } catch (parseError) {
        console.error('Error parsing LLM response:', parseError);
        console.error('Raw response:', response);
        throw new Error('Failed to parse LLM response');
      }
    } catch (error) {
      console.error('Error processing files with LLM:', error);
      throw new Error('Failed to process files with LLM');
    }
  }


  async decideNextAction(
    domState: DOMState,
    goal: string,
    featureDocs: ProductDocs,
    history: Action[],
    totalSteps: number,
    currentStep: number
  ): Promise<LLMResponse> {
    const systemPrompt = `You are an expert web automation agent. Analyze the current page state and decide the next action to take.

You have access to:
- Current DOM state with all elements and their properties
- The goal you're trying to achieve
- Feature documentation
- Previous actions taken
- Current step progress

Guidelines:
- Always prioritize user-like behavior
- Look for the most obvious and intuitive elements
- Consider the context and flow of the user journey
- If you can't find the right element, suggest a navigation action
- Be specific about what you're looking for
- Return null if the goal is already achieved or cannot be achieved`;

    const prompt = `
Current Page State:
- URL: ${domState.currentUrl}
- Title: ${domState.pageTitle}
- Available selectors: ${domState.clickableSelectors.length + domState.inputSelectors.length + domState.selectSelectors.length} total

Goal: ${goal}
Current Step: ${currentStep}/${totalSteps}

Feature Documentation:
- Name: ${featureDocs.featureName}
- Description: ${featureDocs.description}
- Steps: ${featureDocs.steps.join(', ')}

Previous Actions (${history.length}):
${history.map((action, i) => `${i + 1}. ${action.type}: ${action.description}`).join('\n')}

Available Selectors:
- Clickable: ${domState.clickableSelectors.slice(0, 10).join(', ')}
- Inputs: ${domState.inputSelectors.slice(0, 10).join(', ')}
- Selects: ${domState.selectSelectors.slice(0, 10).join(', ')}

Based on the current state and goal, decide the next action. Return in this JSON format:
{
  "success": true,
  "reasoning": "Your reasoning for this decision",
  "action": {
    "type": "click|type|navigate|wait|scroll",
    "selector": "CSS selector or element identifier",
    "value": "value to type (if applicable)",
    "description": "Human-readable description of the action"
  }
}
`;

    return await this.callLLM(prompt, systemPrompt, 0.1);
  }

  async validateActionSuccess(
    action: Action,
    previousState: DOMState,
    currentState: DOMState,
    expectedOutcome: string
  ): Promise<LLMResponse> {
    const systemPrompt = `You are an expert web automation validator. Analyze whether an action was successful by comparing the page state before and after the action.

Guidelines:
- Look for meaningful changes in the page state
- Consider the expected outcome
- Check if the action achieved its intended purpose
- Be realistic about what constitutes success
- Consider loading states and dynamic content`;

    const prompt = `
Action Performed:
- Type: ${action.type}
- Description: ${action.description}
- Selector: ${action.selector}

Expected Outcome: ${expectedOutcome}

Previous State:
- URL: ${previousState.currentUrl}
- Title: ${previousState.pageTitle}
- Selectors: ${previousState.clickableSelectors.length + previousState.inputSelectors.length + previousState.selectSelectors.length} total

Current State:
- URL: ${currentState.currentUrl}
- Title: ${currentState.pageTitle}
- Selectors: ${currentState.clickableSelectors.length + currentState.inputSelectors.length + currentState.selectSelectors.length} total

Key Changes:
${this.getStateChanges(previousState, currentState)}

Was this action successful? Return in this JSON format:
{
  "success": true/false,
  "reasoning": "Your analysis of why it was/wasn't successful",
  "confidence": 0.0-1.0
}
`;

    return await this.callLLM(prompt, systemPrompt, 0.1);
  }

  private getStateChanges(previous: DOMState, current: DOMState): string {
    const changes = [];
    
    if (previous.currentUrl !== current.currentUrl) {
      changes.push(`URL changed: ${previous.currentUrl} → ${current.currentUrl}`);
    }
    
    if (previous.pageTitle !== current.pageTitle) {
      changes.push(`Title changed: ${previous.pageTitle} → ${current.pageTitle}`);
    }
    
    const previousSelectorCount = previous.clickableSelectors.length + previous.inputSelectors.length + previous.selectSelectors.length;
    const currentSelectorCount = current.clickableSelectors.length + current.inputSelectors.length + current.selectSelectors.length;
    const selectorDiff = currentSelectorCount - previousSelectorCount;
    
    if (selectorDiff !== 0) {
      changes.push(`Selectors count changed: ${previousSelectorCount} → ${currentSelectorCount} (${selectorDiff > 0 ? '+' : ''}${selectorDiff})`);
    }
    
    return changes.length > 0 ? changes.join('\n') : 'No significant changes detected';
  }

  async analyzeCurrentStateWithScreenshot(
    screenshot: string,
    currentUrl: string,
    pageTitle: string,
    nextAction: any,
    featureDocs: ProductDocs,
    history: Action[],
    enhancedContext: string
  ): Promise<LLMResponse> {
    const systemPrompt = `You are an expert web automation agent with visual analysis capabilities. Analyze the current page state using both DOM data and visual information from the screenshot.

Guidelines:
- Use the screenshot to understand the visual layout and context
- Combine visual information with DOM data for better decisions
- Look for visual cues that might not be obvious in the DOM
- Consider the user experience and visual hierarchy
- Be specific about what you can see and what actions are possible`;

    const prompt = `
Current Page Analysis:
- URL: ${currentUrl}
- Title: ${pageTitle}
- Next Action from Plan: ${nextAction?.description || 'No specific action planned'}
- Feature: ${featureDocs.featureName}

Previous Actions (${history.length}):
${history.map((action, i) => `${i + 1}. ${action.type}: ${action.description}`).join('\n')}

Enhanced Context:
${enhancedContext}

Screenshot Analysis:
[Base64 screenshot provided - analyze the visual layout, buttons, forms, and interactive elements]

Based on the visual analysis and current state, what should be the next action? Return in this JSON format:
{
  "success": true,
  "reasoning": "Your analysis of the current state and reasoning for the next action",
  "action": {
    "type": "click|type|navigate|wait|scroll",
    "selector": "CSS selector or element identifier",
    "value": "value to type (if applicable)",
    "description": "Human-readable description of the action"
  }
}
`;

    // For now, we'll use the text-based analysis since we can't actually process images
    // In a real implementation, you would use the Google Generative AI vision capabilities
    return await this.callLLM(prompt, systemPrompt, 0.1);
  }

  async validateActionSuccessWithScreenshot(
    action: Action,
    currentScreenshot: string,
    currentUrl: string,
    pageTitle: string,
    expectedOutcome: string,
    screenshotData?: any,
    screenshotPath?: string
  ): Promise<LLMResponse> {
    const systemPrompt = `You are an expert web automation validator with visual analysis capabilities. Compare the before and after screenshots to determine if an action was successful.

Guidelines:
- Use visual comparison to detect meaningful changes
- Look for UI state changes, new elements, or visual feedback
- Consider loading states and dynamic content
- Be realistic about what constitutes success
- Combine visual analysis with DOM state changes`;

    const prompt = `
Action Performed:
- Type: ${action.type}
- Description: ${action.description}
- Selector: ${action.selector}

Expected Outcome: ${expectedOutcome}

Current State:
- URL: ${currentUrl}
- Title: ${pageTitle}

Screenshot Analysis:
[Current screenshot provided - analyze visual state and changes]

Was this action successful based on the visual analysis? Return in this JSON format:
{
  "success": true/false,
  "reasoning": "Your analysis of the visual state and whether the action was successful",
  "confidence": 0.0-1.0
}
`;

    // For now, we'll use the text-based analysis since we can't actually process images
    return await this.callLLM(prompt, systemPrompt, 0.1);
  }

  async analyzeFailureAndRegenerateAction(
    failedAction: Action,
    error: string,
    currentState: DOMState | null,
    goal: string,
    retryCount: number
  ): Promise<LLMResponse> {
    const systemPrompt = `You are an expert web automation agent specializing in error recovery. When an action fails, analyze the failure and suggest an alternative approach.

Guidelines:
- Understand why the previous action failed
- Look for alternative ways to achieve the same goal
- Consider different selectors or interaction methods
- Be creative but realistic in your suggestions
- Learn from the failure to avoid similar issues`;

    const prompt = `
Failed Action Analysis:
- Action: ${failedAction.type} - ${failedAction.description}
- Selector: ${failedAction.selector}
- Error: ${error}
- Retry Count: ${retryCount}

Current State:
${currentState ? `
- URL: ${currentState.currentUrl}
- Title: ${currentState.pageTitle}
- Available selectors: ${currentState.clickableSelectors.length + currentState.inputSelectors.length + currentState.selectSelectors.length} total

Available Selectors:
- Clickable: ${currentState.clickableSelectors.slice(0, 10).join(', ')}
- Inputs: ${currentState.inputSelectors.slice(0, 10).join(', ')}
- Selects: ${currentState.selectSelectors.slice(0, 10).join(', ')}
` : 'No DOM state available (coordinate-based action)'}

Goal: ${goal}

Based on the failure analysis, suggest an alternative action. Return in this JSON format:
{
  "success": true,
  "reasoning": "Your analysis of the failure and reasoning for the alternative",
  "action": {
    "type": "click|type|navigate|wait|scroll",
    "selector": "CSS selector or element identifier",
    "value": "value to type (if applicable)",
    "description": "Human-readable description of the alternative action"
  }
}
`;

    return await this.callLLM(prompt, systemPrompt, 0.2);
  }

  async detectClickCoordinates(
    targetDescription: string,
    screenshot: string,
    currentUrl: string,
    pageTitle: string,
    viewportDimensions: { width: number; height: number },
    searchContext: string,
    screenshotData?: any,
    screenshotPath?: string
  ): Promise<{
    coordinates: Array<{ x: number; y: number; confidence: number; reasoning: string; elementDescription: string; element: any }>;
    pageAnalysis: string;
    recommendations: string[];
  }> {
    const systemPrompt = `You are an expert web automation agent specializing in coordinate-based interactions. Analyze the screenshot and determine the best coordinates for clicking on elements.

Guidelines:
- Look for elements that match the action description
- Consider the visual layout and element positioning
- Return multiple potential coordinates ranked by confidence
- Prioritize elements that are visible and interactive
- Consider the element's position and size`;

    const prompt = `
Target Description: ${targetDescription}
Current URL: ${currentUrl}
Page Title: ${pageTitle}
Viewport: ${viewportDimensions.width}x${viewportDimensions.height}
Search Context: ${searchContext}

Screenshot Analysis:
[Base64 screenshot provided - analyze the visual layout and interactive elements]

Find the best coordinates for this action. Return in this JSON format:
{
  "success": true,
  "reasoning": "Your analysis of the page and coordinate selection",
  "coordinates": [
    {
      "x": 100,
      "y": 200,
      "confidence": 0.9,
      "reasoning": "High confidence match based on text content and positioning",
      "elementDescription": "Submit button with clear text",
      "element": {
        "tagName": "button",
        "textContent": "Click me",
        "attributes": {...}
      }
    }
  ],
  "pageAnalysis": "Analysis of the page layout and available elements",
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}
`;

    try {
      const response = await this.callLLM(prompt, systemPrompt, 0.1);
      
      if (response.success && response.action) {
        const result = response.action as any;
        console.log("🚀 ~ LLMService ~ detectClickCoordinates ~ result:", result);
        return {
          coordinates: (result.coordinates || []).map(coord => ({
            x: coord.x,
            y: coord.y,
            confidence: coord.confidence,
            reasoning: coord.reasoning || 'No reasoning provided',
            elementDescription: coord.elementDescription || 'No description provided',
            element: coord.element
          })),
          pageAnalysis: result.pageAnalysis || '',
          recommendations: result.recommendations || []
        };
      }
      
      return {
        coordinates: [],
        pageAnalysis: 'No coordinates found',
        recommendations: ['Try a different approach']
      };
    } catch (error) {
      console.error('Error detecting click coordinates:', error);
      return {
        coordinates: [],
        pageAnalysis: 'Error analyzing page',
        recommendations: ['Check page state and try again']
      };
    }
  }

  async analyzePageForElement(
    targetDescription: string,
    domState: DOMState,
    context: string
  ): Promise<{
    matches: ElementMatch[];
    suggestedSelectors: Array<{ selector: string; reasoning: string; confidence: number }>;
    recommendations: string[];
  }> {
    const systemPrompt = `You are an expert web automation agent specializing in element discovery. Analyze the DOM state to find elements that match the action description.

Guidelines:
- Look for elements that semantically match the action description
- Consider different ways the same action might be represented
- Return multiple potential matches ranked by relevance
- Include confidence scores for each match
- Consider the element's context and surrounding text`;

    const prompt = `
Target Description: ${targetDescription}
Context: ${context}

Current Page:
- URL: ${domState.currentUrl}
- Title: ${domState.pageTitle}

Available Selectors:
- Clickable: ${domState.clickableSelectors.join(', ')}
- Inputs: ${domState.inputSelectors.join(', ')}
- Selects: ${domState.selectSelectors.join(', ')}

Find elements that match this action. Return in this JSON format:
{
  "success": true,
  "reasoning": "Your analysis of the page and element matching",
  "matches": [
    {
      "element": {
        "tagName": "button",
        "textContent": "Submit",
        "attributes": {...}
      },
      "confidence": 0.9,
      "reasoning": "High confidence match based on text content"
    }
  ],
  "suggestedSelectors": [
    {
      "selector": "#submit-btn",
      "reasoning": "High confidence match based on ID",
      "confidence": 0.9
    },
    {
      "selector": ".btn-primary",
      "reasoning": "Good match based on class",
      "confidence": 0.7
    }
  ],
  "recommendations": ["Try clicking the submit button", "Check if form is valid"]
}
`;

    try {
      const response = await this.callLLM(prompt, systemPrompt, 0.1);
      
      if (response.success && response.action) {
        const result = response.action as any;
        return {
          matches: result.matches || [],
          suggestedSelectors: result.suggestedSelectors || [],
          recommendations: result.recommendations || []
        };
      }
      
      return {
        matches: [],
        suggestedSelectors: [],
        recommendations: ['Try a different approach']
      };
    } catch (error) {
      console.error('Error analyzing page for element:', error);
      return {
        matches: [],
        suggestedSelectors: [],
        recommendations: ['Error analyzing page']
      };
    }
  }

  async analyzePageForElementWithScreenshot(
    targetDescription: string,
    screenshot: string,
    currentUrl: string,
    pageTitle: string,
    searchContext: string
  ): Promise<{
    matches: ElementMatch[];
    suggestedSelectors: Array<{ selector: string; reasoning: string; confidence: number }>;
    recommendations: string[];
  }> {
    const systemPrompt = `You are an expert web automation agent with visual analysis capabilities. Use both DOM data and visual information to find elements that match the action description.

Guidelines:
- Use the screenshot to understand the visual layout
- Combine visual cues with DOM data for better matching
- Look for visual elements that might not be obvious in the DOM
- Consider the user experience and visual hierarchy
- Return multiple potential matches with confidence scores`;

    const prompt = `
Target Description: ${targetDescription}
Current URL: ${currentUrl}
Page Title: ${pageTitle}
Search Context: ${searchContext}

Screenshot Analysis:
[Base64 screenshot provided - analyze the visual layout and interactive elements]

Find elements that match this action using both DOM and visual analysis. Return in this JSON format:
{
  "success": true,
  "reasoning": "Your analysis of the page and element matching",
  "matches": [
    {
      "element": {
        "tagName": "button",
        "textContent": "Submit",
        "attributes": {...}
      },
      "confidence": 0.9,
      "reasoning": "High confidence match based on visual and text analysis"
    }
  ],
  "suggestedSelectors": [
    {
      "selector": "#submit-btn",
      "reasoning": "High confidence match based on ID",
      "confidence": 0.9
    },
    {
      "selector": ".btn-primary",
      "reasoning": "Good match based on class",
      "confidence": 0.7
    }
  ],
  "recommendations": ["Try clicking the submit button", "Check if form is valid"]
}
`;

    // For now, we'll use the text-based analysis since we can't actually process images
    // We need to create a minimal DOM state for the fallback
    const minimalDomState: DOMState = {
      domHtml: '',
      visibleText: [],
      clickableSelectors: [],
      inputSelectors: [],
      selectSelectors: [],
      currentUrl: currentUrl,
      pageTitle: pageTitle,
      timestamp: Date.now()
    };
    return await this.analyzePageForElement(targetDescription, minimalDomState, searchContext);
  }
}
