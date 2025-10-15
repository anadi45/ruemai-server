import { Injectable } from '@nestjs/common';
import { PuppeteerWorkerService } from './puppeteer-worker.service';
import { GeminiService } from './gemini.service';
import { 
  ElementMatch, 
  IntelligentElementDiscovery, 
  DOMState, 
  PuppeteerAction 
} from '../types/demo-automation.types';

@Injectable()
export class IntelligentElementDiscoveryService {
  constructor(
    private puppeteerWorker: PuppeteerWorkerService,
    private geminiService: GeminiService
  ) {}

  /**
   * Intelligently discover elements on the page based on action description
   * This is the core method that correlates plan actions with actual DOM elements
   */
  async discoverElement(
    action: PuppeteerAction,
    domState: DOMState,
    context?: string
  ): Promise<IntelligentElementDiscovery> {
    console.log(`🔍 Intelligent element discovery for: "${action.description}"`);
    
    const targetDescription = this.extractTargetDescription(action);
    const searchContext = this.buildSearchContext(action, domState, context);
    
    // Try multiple discovery strategies in order of preference
    const strategies = [
      () => this.semanticElementDiscovery(targetDescription, domState, searchContext),
      () => this.textBasedElementDiscovery(targetDescription, domState),
      () => this.attributeBasedElementDiscovery(action, domState),
      () => this.fallbackElementDiscovery(action, domState)
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        const discovery = await strategies[i]();
        if (discovery.bestMatch && discovery.bestMatch.confidence > 0.3) {
          console.log(`✅ Element found using strategy ${i + 1}: ${discovery.bestMatch.selector}`);
          return discovery;
        }
      } catch (error) {
        console.warn(`Strategy ${i + 1} failed:`, error);
        continue;
      }
    }

    // If all strategies fail, return empty discovery
    return {
      targetDescription,
      foundElements: [],
      bestMatch: null,
      searchStrategy: 'fallback',
      searchContext,
      recommendations: ['No suitable elements found. Consider updating the action description or checking if the page has loaded correctly.']
    };
  }

  /**
   * Semantic element discovery using AI to understand the intent
   */
  private async semanticElementDiscovery(
    targetDescription: string,
    domState: DOMState,
    context: string
  ): Promise<IntelligentElementDiscovery> {
    console.log('🧠 Using semantic discovery strategy...');
    
    // Use Gemini to analyze the page and find semantically matching elements
    const analysis = await this.geminiService.analyzePageForElement(
      targetDescription,
      domState,
      context
    );

    const foundElements: ElementMatch[] = [];
    
    if (analysis.suggestedSelectors && analysis.suggestedSelectors.length > 0) {
      for (const suggestion of analysis.suggestedSelectors) {
        try {
          const element = await this.puppeteerWorker.getElement(suggestion.selector);
          if (element) {
            const match = await this.analyzeElement(element, suggestion.selector, suggestion.reasoning);
            if (match) {
              foundElements.push(match);
            }
          }
        } catch (error) {
          console.warn(`Failed to analyze suggested selector: ${suggestion.selector}`, error);
        }
      }
    }

    const bestMatch = foundElements.length > 0 
      ? foundElements.reduce((best, current) => 
          current.confidence > best.confidence ? current : best
        )
      : null;

    return {
      targetDescription,
      foundElements,
      bestMatch,
      searchStrategy: 'semantic_match',
      searchContext: context,
      recommendations: analysis.recommendations || []
    };
  }

  /**
   * Text-based element discovery - look for elements with matching text content
   */
  private async textBasedElementDiscovery(
    targetDescription: string,
    domState: DOMState
  ): Promise<IntelligentElementDiscovery> {
    console.log('📝 Using text-based discovery strategy...');
    
    const foundElements: ElementMatch[] = [];
    const searchTerms = this.extractSearchTerms(targetDescription);
    
    // Search through all clickable elements for text matches
    for (const selector of domState.clickableSelectors) {
      try {
        const element = await this.puppeteerWorker.getElement(selector);
        if (element) {
          const textContent = await element.evaluate(el => el.textContent?.trim() || '');
          const confidence = this.calculateTextMatchConfidence(textContent, searchTerms);
          
          if (confidence > 0.3) {
            const match = await this.analyzeElement(element, selector, `Text match: "${textContent}"`);
            if (match) {
              match.confidence = confidence;
              foundElements.push(match);
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to analyze element: ${selector}`, error);
      }
    }

    const bestMatch = foundElements.length > 0 
      ? foundElements.reduce((best, current) => 
          current.confidence > best.confidence ? current : best
        )
      : null;

    return {
      targetDescription,
      foundElements,
      bestMatch,
      searchStrategy: 'text_match',
      searchContext: `Searching for text containing: ${searchTerms.join(', ')}`,
      recommendations: foundElements.length > 0 
        ? ['Text-based match found. Verify the element is the intended target.']
        : ['No text matches found. Try using more specific search terms.']
    };
  }

  /**
   * Attribute-based element discovery - look for elements with matching attributes
   */
  private async attributeBasedElementDiscovery(
    action: PuppeteerAction,
    domState: DOMState
  ): Promise<IntelligentElementDiscovery> {
    console.log('🏷️ Using attribute-based discovery strategy...');
    
    const foundElements: ElementMatch[] = [];
    
    // If action already has a selector, try to find it
    if (action.selector) {
      try {
        const element = await this.puppeteerWorker.getElement(action.selector);
        if (element) {
          const match = await this.analyzeElement(element, action.selector, 'Original selector match');
          if (match) {
            foundElements.push(match);
          }
        }
      } catch (error) {
        console.warn(`Original selector failed: ${action.selector}`, error);
      }
    }

    // Try to find elements by common attributes
    const attributePatterns = this.generateAttributePatterns(action);
    
    for (const pattern of attributePatterns) {
      try {
        const element = await this.puppeteerWorker.getElement(pattern);
        if (element) {
          const match = await this.analyzeElement(element, pattern, `Attribute match: ${pattern}`);
          if (match) {
            foundElements.push(match);
          }
        }
      } catch (error) {
        console.warn(`Attribute pattern failed: ${pattern}`, error);
      }
    }

    const bestMatch = foundElements.length > 0 
      ? foundElements.reduce((best, current) => 
          current.confidence > best.confidence ? current : best
        )
      : null;

    return {
      targetDescription: action.description,
      foundElements,
      bestMatch,
      searchStrategy: 'attribute_match',
      searchContext: `Searching for attributes: ${attributePatterns.join(', ')}`,
      recommendations: foundElements.length > 0 
        ? ['Attribute-based match found. Verify the element is the intended target.']
        : ['No attribute matches found. The element might not be present on the page.']
    };
  }

  /**
   * Fallback element discovery - try generic selectors
   */
  private async fallbackElementDiscovery(
    action: PuppeteerAction,
    domState: DOMState
  ): Promise<IntelligentElementDiscovery> {
    console.log('🔄 Using fallback discovery strategy...');
    
    const foundElements: ElementMatch[] = [];
    const fallbackSelectors = this.generateFallbackSelectors(action);
    
    for (const selector of fallbackSelectors) {
      try {
        const element = await this.puppeteerWorker.getElement(selector);
        if (element) {
          const match = await this.analyzeElement(element, selector, 'Fallback selector match');
          if (match) {
            foundElements.push(match);
          }
        }
      } catch (error) {
        console.warn(`Fallback selector failed: ${selector}`, error);
      }
    }

    const bestMatch = foundElements.length > 0 
      ? foundElements.reduce((best, current) => 
          current.confidence > best.confidence ? current : best
        )
      : null;

    return {
      targetDescription: action.description,
      foundElements,
      bestMatch,
      searchStrategy: 'fallback',
      searchContext: `Trying fallback selectors: ${fallbackSelectors.join(', ')}`,
      recommendations: foundElements.length > 0 
        ? ['Fallback match found. This might not be the intended element.']
        : ['No elements found with any strategy. The page might not be loaded correctly.']
    };
  }

  /**
   * Analyze a found element and create an ElementMatch
   */
  private async analyzeElement(
    element: any,
    selector: string,
    reasoning: string
  ): Promise<ElementMatch | null> {
    try {
      const textContent = await element.evaluate(el => el.textContent?.trim() || '');
      const tagName = await element.evaluate(el => el.tagName.toLowerCase());
      const isVisible = await element.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
      });
      const isClickable = await element.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.pointerEvents !== 'none' && !el.disabled;
      });
      
      const boundingBox = await element.boundingBox();
      const position = boundingBox ? {
        x: boundingBox.x + boundingBox.width / 2,
        y: boundingBox.y + boundingBox.height / 2
      } : undefined;

      const attributes = await element.evaluate(el => {
        const attrs: Record<string, string> = {};
        for (const attr of el.attributes) {
          attrs[attr.name] = attr.value;
        }
        return attrs;
      });

      const elementType = this.determineElementType(tagName, attributes);

      return {
        selector,
        confidence: 0.5, // Base confidence, will be adjusted by discovery strategy
        reasoning,
        elementType,
        textContent,
        attributes,
        position,
        isVisible,
        isClickable
      };
    } catch (error) {
      console.warn(`Failed to analyze element: ${selector}`, error);
      return null;
    }
  }

  /**
   * Extract target description from action
   */
  private extractTargetDescription(action: PuppeteerAction): string {
    // Extract key terms from the action description
    const description = action.description.toLowerCase();
    
    // Look for button/click actions
    if (description.includes('click') || description.includes('button')) {
      return description.replace(/click\s+(on\s+)?/i, '').replace(/button/i, '').trim();
    }
    
    // Look for input/type actions
    if (description.includes('type') || description.includes('enter') || description.includes('input')) {
      return description.replace(/type\s+(in\s+)?/i, '').replace(/enter\s+(in\s+)?/i, '').trim();
    }
    
    // Look for navigation actions
    if (description.includes('navigate') || description.includes('go to')) {
      return description.replace(/navigate\s+(to\s+)?/i, '').replace(/go\s+to\s+/i, '').trim();
    }
    
    return description;
  }

  /**
   * Build search context for AI analysis
   */
  private buildSearchContext(
    action: PuppeteerAction,
    domState: DOMState,
    additionalContext?: string
  ): string {
    const context = [
      `Action: ${action.description}`,
      `Expected Outcome: ${action.expectedOutcome}`,
      `Current URL: ${domState.currentUrl}`,
      `Page Title: ${domState.pageTitle}`,
      `Available clickable elements: ${domState.clickableSelectors.slice(0, 10).join(', ')}`,
      `Available input elements: ${domState.inputSelectors.slice(0, 5).join(', ')}`,
      `Visible text samples: ${domState.visibleText.slice(0, 10).join(', ')}`
    ];

    if (additionalContext) {
      context.push(`Additional context: ${additionalContext}`);
    }

    return context.join('\n');
  }

  /**
   * Extract search terms from target description
   */
  private extractSearchTerms(description: string): string[] {
    // Remove common words and extract meaningful terms
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    const words = description.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));
    
    return words;
  }

  /**
   * Calculate text match confidence
   */
  private calculateTextMatchConfidence(text: string, searchTerms: string[]): number {
    if (!text || searchTerms.length === 0) return 0;
    
    const textLower = text.toLowerCase();
    let matches = 0;
    
    for (const term of searchTerms) {
      if (textLower.includes(term)) {
        matches++;
      }
    }
    
    return matches / searchTerms.length;
  }

  /**
   * Generate attribute patterns for element discovery
   */
  private generateAttributePatterns(action: PuppeteerAction): string[] {
    const patterns: string[] = [];
    
    // If we have a selector, try variations
    if (action.selector) {
      patterns.push(action.selector);
      
      // Try without attributes
      const baseSelector = action.selector.replace(/\[.*?\]/g, '');
      if (baseSelector !== action.selector) {
        patterns.push(baseSelector);
      }
    }
    
    // Generate common patterns based on action type
    if (action.type === 'click') {
      patterns.push('button', 'a', '[role="button"]', 'input[type="button"]', 'input[type="submit"]');
    } else if (action.type === 'type') {
      patterns.push('input[type="text"]', 'input[type="email"]', 'input:not([type])', 'textarea');
    }
    
    return patterns;
  }

  /**
   * Generate fallback selectors
   */
  private generateFallbackSelectors(action: PuppeteerAction): string[] {
    const selectors: string[] = [];
    
    // Try generic selectors based on action type
    if (action.type === 'click') {
      selectors.push('button', 'a', '[role="button"]');
    } else if (action.type === 'type') {
      selectors.push('input', 'textarea');
    } else if (action.type === 'navigate') {
      selectors.push('a[href]');
    }
    
    return selectors;
  }

  /**
   * Determine element type based on tag and attributes
   */
  private determineElementType(tagName: string, attributes: Record<string, string>): ElementMatch['elementType'] {
    if (tagName === 'button' || attributes.role === 'button') return 'button';
    if (tagName === 'input') return 'input';
    if (tagName === 'a') return 'link';
    if (tagName === 'select') return 'dropdown';
    if (tagName === 'div' || tagName === 'span') return 'container';
    return 'text';
  }
}
