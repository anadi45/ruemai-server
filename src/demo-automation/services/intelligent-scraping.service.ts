import { Injectable } from '@nestjs/common';
import { SmartLangGraphAgentService } from './smart-langgraph-agent.service';
import { IntelligentElementDiscoveryService } from './intelligent-element-discovery.service';
import { PuppeteerWorkerService } from './puppeteer-worker.service';
import { GeminiService } from './gemini.service';
import { 
  ActionPlan, 
  TourConfig, 
  ProductDocs, 
  DemoAutomationResult,
  PuppeteerAction,
  DOMState,
  IntelligentElementDiscovery,
  ElementMatch
} from '../types/demo-automation.types';

/**
 * Enhanced Intelligent Scraping Service
 * 
 * This service demonstrates the intelligent agentic scraping approach where:
 * 1. Initial plans are created with high-level action descriptions
 * 2. During execution, the AI agent intelligently discovers and correlates
 *    actual DOM elements with the plan actions
 * 3. The system adapts to dynamic content and page changes
 */
@Injectable()
export class IntelligentScrapingService {
  constructor(
    private smartAgent: SmartLangGraphAgentService,
    private elementDiscovery: IntelligentElementDiscoveryService,
    private puppeteerWorker: PuppeteerWorkerService,
    private geminiService: GeminiService
  ) {}

  /**
   * Execute intelligent scraping with plan correlation
   * This is the main method that demonstrates the intelligent scraping workflow
   */
  async executeIntelligentScraping(
    actionPlan: ActionPlan,
    tourConfig: TourConfig,
    featureDocs: ProductDocs,
    credentials?: { username: string; password: string }
  ): Promise<DemoAutomationResult> {
    console.log('🧠 Starting Intelligent Agentic Scraping...');
    console.log(`📋 Plan: ${actionPlan.featureName} (${actionPlan.actions.length} actions)`);
    console.log(`🎯 Goal: ${tourConfig.goal}`);
    
    try {
      // Initialize the browser
      if (!this.puppeteerWorker.isInitialized()) {
        await this.puppeteerWorker.initialize();
      }

      // Navigate to the starting URL
      const startUrl = actionPlan.actions[0]?.inputText || actionPlan.actions[0]?.selector || tourConfig.goal;
      if (startUrl) {
        console.log(`🧭 Navigating to start URL: ${startUrl}`);
        await this.puppeteerWorker.navigateToUrl(startUrl);
      }

      // Login if credentials provided
      if (credentials) {
        console.log('🔐 Attempting login...');
        const loginSuccess = await this.puppeteerWorker.login(credentials);
        if (!loginSuccess) {
          console.warn('⚠️  Login failed, continuing without authentication');
        }
      }

      // Execute the intelligent scraping workflow
      const result = await this.smartAgent.runSmartAgent(
        actionPlan,
        tourConfig,
        featureDocs,
        credentials
      );

      console.log('🏁 Intelligent scraping completed');
      console.log(`✅ Success: ${result.success}`);
      console.log(`📊 Steps completed: ${result.totalSteps}`);
      console.log(`⏱️  Processing time: ${result.processingTime}ms`);

      return result;
    } catch (error) {
      console.error('❌ Intelligent scraping failed:', error);
      
      return {
        success: false,
        tourSteps: [],
        totalSteps: 0,
        processingTime: 0,
        finalUrl: this.puppeteerWorker.getCurrentUrl() || '',
        error: error instanceof Error ? error.message : 'Intelligent scraping failed',
        summary: {
          featuresCovered: [],
          actionsPerformed: [],
          successRate: 0
        }
      };
    }
  }

  /**
   * Demonstrate intelligent element discovery for a specific action
   * This method shows how the AI correlates plan actions with actual DOM elements
   */
  async demonstrateElementDiscovery(
    actionDescription: string,
    actionType: string,
    context?: string
  ): Promise<{
    discovery: IntelligentElementDiscovery;
    demonstration: string;
  }> {
    console.log(`🔍 Demonstrating intelligent element discovery...`);
    console.log(`📝 Action: "${actionDescription}"`);
    console.log(`🎯 Type: ${actionType}`);

    try {
      // Get current DOM state
      const domState = await this.puppeteerWorker.getDOMState();
      
      // Create a mock action for discovery
      const mockAction: PuppeteerAction = {
        type: actionType as any,
        description: actionDescription,
        expectedOutcome: 'Element found and ready for interaction',
        priority: 'high',
        estimatedDuration: 5,
        prerequisites: []
      };

      // Perform intelligent element discovery
      const discovery = await this.elementDiscovery.discoverElement(
        mockAction,
        domState,
        context
      );

      // Generate demonstration explanation
      const demonstration = this.generateDiscoveryDemonstration(discovery, actionDescription);

      console.log(`🎯 Discovery completed:`);
      console.log(`   Strategy: ${discovery.searchStrategy}`);
      console.log(`   Elements found: ${discovery.foundElements.length}`);
      console.log(`   Best match: ${discovery.bestMatch?.selector || 'None'}`);
      console.log(`   Confidence: ${discovery.bestMatch?.confidence || 0}`);

      return {
        discovery,
        demonstration
      };
    } catch (error) {
      console.error('Element discovery demonstration failed:', error);
      throw error;
    }
  }

  /**
   * Create an intelligent action plan from high-level descriptions
   * This shows how the system can convert human-readable instructions into executable plans
   */
  async createIntelligentActionPlan(
    featureName: string,
    highLevelSteps: string[],
    targetUrl: string
  ): Promise<ActionPlan> {
    console.log(`🧠 Creating intelligent action plan for: ${featureName}`);
    console.log(`📝 High-level steps: ${highLevelSteps.length}`);

    try {
      // Get initial DOM state to understand the page structure
      await this.puppeteerWorker.navigateToUrl(targetUrl);
      const domState = await this.puppeteerWorker.getDOMState();

      // Use AI to convert high-level steps into detailed actions
      const detailedActions = await this.convertStepsToActions(highLevelSteps, domState);

      const actionPlan: ActionPlan = {
        featureName,
        totalActions: detailedActions.length,
        estimatedDuration: detailedActions.reduce((sum, action) => sum + action.estimatedDuration, 0),
        scrapingStrategy: 'Intelligent AI-powered element discovery with semantic understanding',
        actions: detailedActions,
        summary: {
          clickActions: detailedActions.filter(a => a.type === 'click').length,
          typeActions: detailedActions.filter(a => a.type === 'type').length,
          navigationActions: detailedActions.filter(a => a.type === 'navigate').length,
          waitActions: detailedActions.filter(a => a.type === 'wait').length,
          extractActions: detailedActions.filter(a => a.type === 'extract').length,
          evaluateActions: detailedActions.filter(a => a.type === 'evaluate').length
        }
      };

      console.log(`✅ Intelligent action plan created:`);
      console.log(`   Total actions: ${actionPlan.totalActions}`);
      console.log(`   Estimated duration: ${actionPlan.estimatedDuration}s`);
      console.log(`   Strategy: ${actionPlan.scrapingStrategy}`);

      return actionPlan;
    } catch (error) {
      console.error('Failed to create intelligent action plan:', error);
      throw error;
    }
  }

  /**
   * Convert high-level steps into detailed actions using AI
   */
  private async convertStepsToActions(
    highLevelSteps: string[],
    domState: DOMState
  ): Promise<PuppeteerAction[]> {
    const prompt = `
You are an expert web automation AI that converts high-level user instructions into detailed, executable actions.

HIGH-LEVEL STEPS:
${highLevelSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

CURRENT PAGE CONTEXT:
- URL: ${domState.currentUrl}
- Title: ${domState.pageTitle}
- Available clickable elements: ${domState.clickableSelectors.slice(0, 15).join(', ')}
- Available input elements: ${domState.inputSelectors.slice(0, 10).join(', ')}
- Visible text samples: ${domState.visibleText.slice(0, 10).join(', ')}

TASK: Convert each high-level step into a detailed PuppeteerAction that can be executed.
Each action should include:
- type: 'click' | 'type' | 'navigate' | 'wait' | 'extract' | 'evaluate'
- description: Clear description of what the action does
- expectedOutcome: What should happen after the action
- priority: 'high' | 'medium' | 'low'
- estimatedDuration: Time in seconds
- prerequisites: Array of prerequisite action indices

For selectors, use intelligent descriptions that can be discovered at runtime.
Focus on semantic understanding rather than exact selectors.

Return JSON array of PuppeteerAction objects.
`;

    try {
      const result = await this.geminiService.generateContentFromPrompt(prompt);
      const actions = JSON.parse(result);
      
      // Validate and enhance the actions
      return actions.map((action: any, index: number) => ({
        type: action.type || 'click',
        description: action.description || highLevelSteps[index] || `Step ${index + 1}`,
        expectedOutcome: action.expectedOutcome || 'Action completed successfully',
        priority: action.priority || 'medium',
        estimatedDuration: action.estimatedDuration || 5,
        prerequisites: action.prerequisites || [],
        // These will be discovered at runtime
        selector: action.selector || undefined,
        inputText: action.inputText || undefined,
        waitCondition: action.waitCondition || undefined
      }));
    } catch (error) {
      console.error('Failed to convert steps to actions:', error);
      // Fallback: create basic actions
      return highLevelSteps.map((step, index) => ({
        type: 'click' as const,
        description: step,
        expectedOutcome: 'Step completed',
        priority: 'medium' as const,
        estimatedDuration: 5,
        prerequisites: []
      }));
    }
  }

  /**
   * Generate a human-readable demonstration of the element discovery process
   */
  private generateDiscoveryDemonstration(
    discovery: IntelligentElementDiscovery,
    actionDescription: string
  ): string {
    const lines = [
      `🧠 Intelligent Element Discovery Demonstration`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `📝 Target Action: "${actionDescription}"`,
      `🔍 Discovery Strategy: ${discovery.searchStrategy}`,
      `📊 Elements Found: ${discovery.foundElements.length}`,
      ``,
    ];

    if (discovery.bestMatch) {
      lines.push(
        `✅ Best Match Found:`,
        `   Selector: ${discovery.bestMatch.selector}`,
        `   Confidence: ${(discovery.bestMatch.confidence * 100).toFixed(1)}%`,
        `   Type: ${discovery.bestMatch.elementType}`,
        `   Text: "${discovery.bestMatch.textContent || 'N/A'}"`,
        `   Visible: ${discovery.bestMatch.isVisible ? 'Yes' : 'No'}`,
        `   Clickable: ${discovery.bestMatch.isClickable ? 'Yes' : 'No'}`,
        `   Reasoning: ${discovery.bestMatch.reasoning}`,
        ``
      );
    } else {
      lines.push(
        `❌ No suitable element found`,
        `   This could mean:`,
        `   - The element is not present on the page`,
        `   - The page hasn't loaded completely`,
        `   - The description is too vague`,
        ``
      );
    }

    if (discovery.foundElements.length > 0) {
      lines.push(
        `🔍 All Found Elements:`,
        ``
      );
      
      discovery.foundElements.forEach((element, index) => {
        lines.push(
          `${index + 1}. ${element.selector}`,
          `   Confidence: ${(element.confidence * 100).toFixed(1)}%`,
          `   Text: "${element.textContent || 'N/A'}"`,
          `   Type: ${element.elementType}`,
          ``
        );
      });
    }

    if (discovery.recommendations.length > 0) {
      lines.push(
        `💡 Recommendations:`,
        ``
      );
      
      discovery.recommendations.forEach((rec, index) => {
        lines.push(`${index + 1}. ${rec}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Analyze the effectiveness of the intelligent scraping approach
   */
  async analyzeScrapingEffectiveness(
    result: DemoAutomationResult,
    originalPlan: ActionPlan
  ): Promise<{
    effectiveness: number;
    insights: string[];
    improvements: string[];
  }> {
    const successRate = result.summary.successRate;
    const totalActions = originalPlan.actions.length;
    const completedActions = result.tourSteps.length;
    
    const effectiveness = (successRate * completedActions) / totalActions;
    
    const insights = [
      `Success Rate: ${(successRate * 100).toFixed(1)}%`,
      `Actions Completed: ${completedActions}/${totalActions}`,
      `Processing Time: ${result.processingTime}ms`,
      `Final URL: ${result.finalUrl}`
    ];

    const improvements = [];
    
    if (successRate < 0.8) {
      improvements.push('Consider improving element discovery strategies');
    }
    
    if (completedActions < totalActions) {
      improvements.push('Some actions were skipped - review plan completeness');
    }
    
    if (result.processingTime > 60000) {
      improvements.push('Processing time is high - consider optimizing wait times');
    }

    return {
      effectiveness,
      insights,
      improvements
    };
  }
}
