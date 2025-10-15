import { Injectable } from '@nestjs/common';
import { PuppeteerWorkerService } from './puppeteer-worker.service';
import { GeminiService } from './gemini.service';
import { 
  ElementMatch, 
  IntelligentElementDiscovery, 
  CoordinateDiscovery,
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
    // Note: Coordinate-based discovery requires screenshot, so it's handled separately
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
   * Discover element coordinates using screenshot analysis
   */
  async discoverElementWithCoordinates(
    action: PuppeteerAction,
    screenshot: string,
    currentUrl: string,
    pageTitle: string,
    viewportDimensions: { width: number; height: number },
    context?: string
  ): Promise<CoordinateDiscovery> {
    console.log(`🎯 Coordinate discovery with screenshot for: "${action.description}"`);
    
    const targetDescription = this.extractTargetDescription(action);
    const searchContext = this.buildCoordinateSearchContext(action, currentUrl, pageTitle, viewportDimensions, context);
    
    try {
      // Use Gemini to detect click coordinates
      const coordinateResult = await this.geminiService.detectClickCoordinates(
        targetDescription,
        screenshot,
        currentUrl,
        pageTitle,
        viewportDimensions,
        searchContext
      );
      
      const bestMatch = coordinateResult.coordinates.length > 0 
        ? coordinateResult.coordinates.reduce((best, current) => 
            current.confidence > best.confidence ? current : best
          )
        : null;
      
      if (bestMatch && bestMatch.confidence > 0.3) {
        console.log(`✅ Coordinates found: (${bestMatch.x}, ${bestMatch.y}) with confidence ${bestMatch.confidence}`);
      }
      
      return {
        targetDescription,
        coordinates: coordinateResult.coordinates,
        pageAnalysis: coordinateResult.pageAnalysis,
        searchStrategy: 'coordinate-detection',
        searchContext,
        recommendations: coordinateResult.recommendations,
        bestMatch
      };
    } catch (error) {
      console.warn(`Coordinate discovery failed:`, error);
      
      // Fallback to basic coordinate discovery
      return {
        targetDescription,
        coordinates: [],
        pageAnalysis: 'Coordinate discovery failed',
        searchStrategy: 'coordinate-detection',
        searchContext,
        recommendations: ['Coordinate discovery failed. Consider using DOM-based discovery or checking if the page has loaded correctly.'],
        bestMatch: null
      };
    }
  }

  /**
   * Intelligently discover elements using screenshot analysis
   * This method uses visual analysis to find elements based on action description
   */
  async discoverElementWithScreenshot(
    action: PuppeteerAction,
    screenshot: string,
    currentUrl: string,
    pageTitle: string,
    context?: string
  ): Promise<IntelligentElementDiscovery> {
    console.log(`🔍 Intelligent element discovery with screenshot for: "${action.description}"`);
    
    const targetDescription = this.extractTargetDescription(action);
    const searchContext = this.buildScreenshotSearchContext(action, currentUrl, pageTitle, context);
    
    // Use coordinate-based discovery as primary strategy
    try {
      // First try coordinate-based discovery
      const coordinateDiscovery = await this.discoverElementWithCoordinates(
        action,
        screenshot,
        currentUrl,
        pageTitle,
        { width: 1920, height: 1080 }, // Default viewport
        context
      );
      
      if (coordinateDiscovery.bestMatch && coordinateDiscovery.bestMatch.confidence > 0.3) {
        console.log(`✅ Element found using coordinate discovery: (${coordinateDiscovery.bestMatch.x}, ${coordinateDiscovery.bestMatch.y})`);
        
        // Convert coordinate discovery to element discovery format
        const elementMatch: ElementMatch = {
          selector: `coordinates:${coordinateDiscovery.bestMatch.x},${coordinateDiscovery.bestMatch.y}`,
          textContent: coordinateDiscovery.bestMatch.elementDescription,
          elementType: 'coordinates',
          isVisible: true,
          isClickable: true,
          confidence: coordinateDiscovery.bestMatch.confidence,
          reasoning: coordinateDiscovery.bestMatch.reasoning,
          attributes: {
            x: coordinateDiscovery.bestMatch.x.toString(),
            y: coordinateDiscovery.bestMatch.y.toString(),
            confidence: coordinateDiscovery.bestMatch.confidence.toString()
          }
        };
        
        return {
          targetDescription,
          foundElements: [elementMatch],
          bestMatch: elementMatch,
          searchStrategy: 'coordinate-discovery',
          searchContext,
          recommendations: coordinateDiscovery.recommendations
        };
      }
      
      // Fallback to traditional screenshot-based discovery
      const discovery = await this.screenshotBasedElementDiscovery(
        targetDescription,
        screenshot,
        currentUrl,
        pageTitle,
        searchContext
      );
      
      if (discovery.bestMatch && discovery.bestMatch.confidence > 0.3) {
        console.log(`✅ Element found using screenshot analysis: ${discovery.bestMatch.selector}`);
        return discovery;
      }
      
      return discovery;
    } catch (error) {
      console.warn(`Screenshot-based discovery failed:`, error);
      
      // Fallback to basic discovery
      return {
        targetDescription,
        foundElements: [],
        bestMatch: null,
        searchStrategy: 'screenshot-fallback',
        searchContext,
        recommendations: ['Screenshot analysis failed. Consider using DOM-based discovery or checking if the page has loaded correctly.']
      };
    }
  }

  /**
   * NEW: Discover click coordinates using screenshot analysis
   * This is the primary method for coordinate-based automation
   */
  async discoverCoordinatesWithScreenshot(
    action: PuppeteerAction,
    screenshot: string,
    currentUrl: string,
    pageTitle: string,
    viewportDimensions: { width: number; height: number },
    context?: string
  ): Promise<CoordinateDiscovery> {
    console.log(`🎯 Coordinate discovery with screenshot for: "${action.description}"`);
    
    const targetDescription = this.extractTargetDescription(action);
    const searchContext = this.buildCoordinateSearchContext(action, currentUrl, pageTitle, viewportDimensions, context);
    
    console.log(`📊 Coordinate Discovery Input:`, {
      targetDescription,
      currentUrl,
      pageTitle,
      viewportDimensions,
      screenshotLength: screenshot.length,
      searchContext,
      context
    });
    
    try {
      // Use Gemini to detect click coordinates
      const coordinateResult = await this.geminiService.detectClickCoordinates(
        targetDescription,
        screenshot,
        currentUrl,
        pageTitle,
        viewportDimensions,
        searchContext
      );
      
      console.log(`📊 Coordinate Discovery Output:`, {
        coordinatesFound: coordinateResult.coordinates.length,
        coordinates: coordinateResult.coordinates,
        pageAnalysis: coordinateResult.pageAnalysis,
        recommendations: coordinateResult.recommendations
      });
      
      const bestMatch = coordinateResult.coordinates.length > 0 
        ? coordinateResult.coordinates.reduce((best, current) => 
            current.confidence > best.confidence ? current : best
          )
        : null;
      
      if (bestMatch && bestMatch.confidence > 0.3) {
        console.log(`✅ Coordinates found: (${bestMatch.x}, ${bestMatch.y}) with confidence ${bestMatch.confidence}`);
      }
      
      return {
        targetDescription,
        coordinates: coordinateResult.coordinates,
        pageAnalysis: coordinateResult.pageAnalysis,
        searchStrategy: 'coordinate-detection',
        searchContext,
        recommendations: coordinateResult.recommendations,
        bestMatch
      };
    } catch (error) {
      console.warn(`Coordinate discovery failed:`, error);
      
      // Fallback to basic coordinate discovery
      return {
        targetDescription,
        coordinates: [],
        pageAnalysis: 'Coordinate discovery failed',
        searchStrategy: 'coordinate-fallback',
        searchContext,
        recommendations: ['Coordinate discovery failed. Consider using DOM-based discovery or checking if the page has loaded correctly.'],
        bestMatch: null
      };
    }
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
   * Build search context for screenshot-based AI analysis
   */
  private buildScreenshotSearchContext(
    action: PuppeteerAction,
    currentUrl: string,
    pageTitle: string,
    additionalContext?: string
  ): string {
    const context = [
      `Action: ${action.description}`,
      `Expected Outcome: ${action.expectedOutcome}`,
      `Current URL: ${currentUrl}`,
      `Page Title: ${pageTitle}`,
      `Screenshot: [Image provided for visual analysis]`
    ];

    if (additionalContext) {
      context.push(`Additional context: ${additionalContext}`);
    }

    return context.join('\n');
  }

  /**
   * NEW: Build search context for coordinate-based AI analysis
   */
  private buildCoordinateSearchContext(
    action: PuppeteerAction,
    currentUrl: string,
    pageTitle: string,
    viewportDimensions: { width: number; height: number },
    additionalContext?: string
  ): string {
    const context = [
      `HUMAN-LIKE VISUAL TARGET DISCOVERY:`,
      `User Intent: ${action.description}`,
      `Expected Outcome: ${action.expectedOutcome}`,
      `Current Page: ${pageTitle} (${currentUrl})`,
      `Screen Size: ${viewportDimensions.width}x${viewportDimensions.height}`,
      `Screenshot: [Image provided for human-like visual analysis]`,
      ``,
      `HUMAN BEHAVIOR SIMULATION:`,
      `- Think like a human user scanning the page visually`,
      `- Look for the most prominent and obvious target element`,
      `- Focus on visual cues: text, buttons, icons, colors, positioning`,
      `- Consider what a human would naturally click on first`,
      `- Account for visual hierarchy and user interface patterns`,
      `- Prioritize elements that are clearly visible and accessible`,
      ``,
      `COORDINATE DETECTION APPROACH:`,
      `- Scan the screenshot like a human would`,
      `- Identify the target by its visual appearance and context`,
      `- Determine the natural click point (center of button, middle of text, etc.)`,
      `- Consider the element's visual prominence and accessibility`,
      `- Provide coordinates that simulate human clicking behavior`
    ];

    if (additionalContext) {
      context.push(`User Context: ${additionalContext}`);
    }

    return context.join('\n');
  }

  /**
   * Screenshot-based element discovery using visual analysis
   */
  private async screenshotBasedElementDiscovery(
    targetDescription: string,
    screenshot: string,
    currentUrl: string,
    pageTitle: string,
    searchContext: string
  ): Promise<IntelligentElementDiscovery> {
    console.log('📸 Using screenshot-based discovery strategy...');
    
    // Use Gemini to analyze the screenshot and find elements
    const analysis = await this.geminiService.analyzePageForElementWithScreenshot(
      targetDescription,
      screenshot,
      currentUrl,
      pageTitle,
      searchContext
    );

    const foundElements: ElementMatch[] = [];
    
    if (analysis.suggestedSelectors && analysis.suggestedSelectors.length > 0) {
      for (const suggestion of analysis.suggestedSelectors) {
        try {
          const element = await this.puppeteerWorker.getElement(suggestion.selector);
          if (element) {
            const match = await this.analyzeElement(element, suggestion.selector, suggestion.reasoning);
            if (match) {
              match.confidence = suggestion.confidence;
              foundElements.push(match);
            }
          }
        } catch (error) {
          console.warn(`Failed to analyze suggested selector: ${suggestion.selector}`, error);
        }
      }
    }

    // If no elements found through AI analysis, try fallback strategies
    if (foundElements.length === 0) {
      console.log('🔄 No elements found through AI analysis, trying fallback strategies...');
      
      // Try to find elements by text content
      const textBasedElements = await this.findElementsByTextContent(targetDescription);
      foundElements.push(...textBasedElements);
      
      // Try to find elements by common patterns
      const patternBasedElements = await this.findElementsByCommonPatterns(targetDescription);
      foundElements.push(...patternBasedElements);
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
      searchStrategy: 'screenshot-analysis',
      searchContext,
      recommendations: analysis.recommendations || ['Screenshot analysis completed']
    };
  }

  /**
   * Find elements by text content as a fallback strategy
   */
  private async findElementsByTextContent(targetDescription: string): Promise<ElementMatch[]> {
    console.log('🔍 Searching for elements by text content...');
    
    const searchTerms = this.extractSearchTerms(targetDescription);
    const foundElements: ElementMatch[] = [];
    
    // Get all clickable elements
    const clickableElements = await this.puppeteerWorker.evaluate(() => {
      const elements = document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"], [onclick]');
      return Array.from(elements).map(el => ({
        tagName: el.tagName,
        textContent: el.textContent?.trim() || '',
        className: el.className,
        id: el.id,
        role: el.getAttribute('role'),
        onclick: el.getAttribute('onclick'),
        href: el.getAttribute('href')
      }));
    });
    
    if (!clickableElements) return foundElements;
    
    // Find elements that match our search terms
    for (const element of clickableElements) {
      const text = element.textContent.toLowerCase();
      const matches = searchTerms.filter(term => text.includes(term.toLowerCase()));
      
      if (matches.length > 0) {
        const confidence = matches.length / searchTerms.length;
        
        // Generate selector for this element
        let selector = '';
        if (element.id) {
          selector = `#${element.id}`;
        } else if (element.className) {
          selector = `.${element.className.split(' ')[0]}`;
        } else if (element.href) {
          selector = `a[href="${element.href}"]`;
        } else {
          selector = `${element.tagName.toLowerCase()}:contains("${element.textContent}")`;
        }
        
        try {
          const puppeteerElement = await this.puppeteerWorker.getElement(selector);
          if (puppeteerElement) {
            const match = await this.analyzeElement(puppeteerElement, selector, `Text match: "${element.textContent}"`);
            if (match) {
              match.confidence = confidence;
              foundElements.push(match);
            }
          }
        } catch (error) {
          console.warn(`Failed to analyze element: ${selector}`, error);
        }
      }
    }
    
    return foundElements;
  }

  /**
   * Find elements by common UI patterns
   */
  private async findElementsByCommonPatterns(targetDescription: string): Promise<ElementMatch[]> {
    console.log('🔍 Searching for elements by common patterns...');
    
    const foundElements: ElementMatch[] = [];
    const searchTerms = this.extractSearchTerms(targetDescription);
    
    // Common UI patterns based on description
    const patterns = this.generateCommonPatterns(targetDescription, searchTerms);
    
    for (const pattern of patterns) {
      try {
        const element = await this.puppeteerWorker.getElement(pattern.selector);
        if (element) {
          const match = await this.analyzeElement(element, pattern.selector, pattern.reasoning);
          if (match) {
            match.confidence = pattern.confidence;
            foundElements.push(match);
          }
        }
      } catch (error) {
        console.warn(`Pattern failed: ${pattern.selector}`, error);
      }
    }
    
    return foundElements;
  }

  /**
   * Generate common UI patterns based on description
   */
  private generateCommonPatterns(targetDescription: string, searchTerms: string[]): Array<{selector: string; confidence: number; reasoning: string}> {
    const patterns: Array<{selector: string; confidence: number; reasoning: string}> = [];
    const description = targetDescription.toLowerCase();
    
    // Navigation patterns
    if (description.includes('workflow') || description.includes('workflows')) {
      patterns.push(
        { selector: 'a[href*="workflow"]', confidence: 0.8, reasoning: 'Link containing "workflow" in href' },
        { selector: 'button:contains("Workflow")', confidence: 0.7, reasoning: 'Button containing "Workflow" text' },
        { selector: '[data-testid*="workflow"]', confidence: 0.6, reasoning: 'Element with workflow test ID' }
      );
    }
    
    if (description.includes('dashboard')) {
      patterns.push(
        { selector: 'a[href*="dashboard"]', confidence: 0.8, reasoning: 'Link containing "dashboard" in href' },
        { selector: 'button:contains("Dashboard")', confidence: 0.7, reasoning: 'Button containing "Dashboard" text' },
        { selector: '[data-testid*="dashboard"]', confidence: 0.6, reasoning: 'Element with dashboard test ID' }
      );
    }
    
    if (description.includes('setting') || description.includes('settings')) {
      patterns.push(
        { selector: 'a[href*="setting"]', confidence: 0.8, reasoning: 'Link containing "setting" in href' },
        { selector: 'button:contains("Setting")', confidence: 0.7, reasoning: 'Button containing "Setting" text' },
        { selector: '[data-testid*="setting"]', confidence: 0.6, reasoning: 'Element with setting test ID' }
      );
    }
    
    // Sidebar/navigation patterns
    if (description.includes('left') || description.includes('sidebar') || description.includes('nav')) {
      patterns.push(
        { selector: 'nav a', confidence: 0.6, reasoning: 'Navigation link' },
        { selector: '.sidebar a', confidence: 0.7, reasoning: 'Sidebar link' },
        { selector: '.nav a', confidence: 0.6, reasoning: 'Navigation link' },
        { selector: '[role="navigation"] a', confidence: 0.5, reasoning: 'Navigation role link' }
      );
    }
    
    // Button patterns
    if (description.includes('button') || description.includes('click')) {
      patterns.push(
        { selector: 'button', confidence: 0.5, reasoning: 'Generic button' },
        { selector: '[role="button"]', confidence: 0.4, reasoning: 'Element with button role' },
        { selector: 'input[type="button"]', confidence: 0.4, reasoning: 'Input button' }
      );
    }
    
    // Link patterns
    if (description.includes('link') || description.includes('href')) {
      patterns.push(
        { selector: 'a', confidence: 0.5, reasoning: 'Generic link' },
        { selector: 'a[href]', confidence: 0.6, reasoning: 'Link with href attribute' }
      );
    }
    
    return patterns;
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
