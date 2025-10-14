import { Injectable } from '@nestjs/common';
import { StateGraph, MemorySaver } from '@langchain/langgraph';
import { GeminiService } from './gemini.service';
import { PuppeteerWorkerService } from './puppeteer-worker.service';
import { 
  Action, 
  DOMState, 
  TourStep, 
  TourConfig, 
  ProductDocs,
  DemoAutomationResult,
  ActionPlan,
  PuppeteerAction
} from '../types/demo-automation.types';

// Enhanced agent state for intelligent plan following
export interface SmartAgentState {
  // Plan tracking
  actionPlan: ActionPlan;
  currentActionIndex: number;
  completedActions: number[];
  failedActions: number[];
  
  // Current state
  currentStep: number;
  totalSteps: number;
  domState: DOMState | null;
  tourSteps: TourStep[];
  history: Action[];
  
  // Context and reasoning
  goal: string;
  featureDocs: ProductDocs;
  currentContext: string;
  reasoning: string;
  
  // Status
  isComplete: boolean;
  success: boolean;
  error?: string;
  startTime: number;
  endTime?: number;
  
  // Evidence and data
  extractedData: Record<string, any>;
  
  // Retry and adaptation
  retryCount: number;
  maxRetries: number;
  adaptationStrategy: 'strict' | 'flexible' | 'adaptive';
}

// Tool definitions for the agent
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (params: any, state: SmartAgentState) => Promise<{ success: boolean; result?: any; error?: string }>;
}

@Injectable()
export class SmartLangGraphAgentService {
  private workflow: any;
  private memory: MemorySaver;
  private tools: Map<string, AgentTool>;

  constructor(
    private geminiService: GeminiService,
    private puppeteerWorker: PuppeteerWorkerService
  ) {
    this.memory = new MemorySaver();
    this.tools = new Map();
    this.initializeTools();
    this.workflow = this.createSmartWorkflow();
  }

  private initializeTools(): void {
    // Navigation Tool
    this.tools.set('navigate', {
      name: 'navigate',
      description: 'Navigate to a specific URL or page',
      parameters: { url: 'string', waitFor: 'string' },
      execute: async (params, state) => {
        try {
          await this.puppeteerWorker.navigateToUrl(params.url);
          if (params.waitFor) {
            await this.puppeteerWorker.waitForElement(params.waitFor);
          }
          return { success: true, result: { url: params.url } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Navigation failed' };
        }
      }
    });

    // Click Tool
    this.tools.set('click', {
      name: 'click',
      description: 'Click on an element using selector',
      parameters: { selector: 'string', fallbackSelector: 'string', waitAfter: 'number' },
      execute: async (params, state) => {
        try {
          let success = false;
          let selector = params.selector;
          
          // Try primary selector first
          try {
            await this.puppeteerWorker.executeAction({
              type: 'click',
              selector: params.selector,
              description: `Click on ${params.selector}`
            });
            success = true;
          } catch (error) {
            // Try fallback selector if provided
            if (params.fallbackSelector) {
              try {
                await this.puppeteerWorker.executeAction({
                  type: 'click',
                  selector: params.fallbackSelector,
                  description: `Click on fallback ${params.fallbackSelector}`
                });
                success = true;
                selector = params.fallbackSelector;
              } catch (fallbackError) {
                // Both selectors failed
              }
            }
          }
          
          if (params.waitAfter) {
            await new Promise(resolve => setTimeout(resolve, params.waitAfter));
          }
          
          return { success, result: { selector, usedFallback: selector !== params.selector } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Click failed' };
        }
      }
    });

    // Type Tool
    this.tools.set('type', {
      name: 'type',
      description: 'Type text into an input field',
      parameters: { selector: 'string', text: 'string', clearFirst: 'boolean' },
      execute: async (params, state) => {
        try {
          if (params.clearFirst) {
            await this.puppeteerWorker.executeAction({
              type: 'click',
              selector: params.selector,
              description: `Clear and focus ${params.selector}`
            });
            // Clear the field
            await this.puppeteerWorker.executeAction({
              type: 'type',
              selector: params.selector,
              inputText: '',
              description: `Clear ${params.selector}`
            });
          }
          
          await this.puppeteerWorker.executeAction({
            type: 'type',
            selector: params.selector,
            inputText: params.text,
            description: `Type "${params.text}" into ${params.selector}`
          });
          
          return { success: true, result: { text: params.text, selector: params.selector } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Type failed' };
        }
      }
    });

    // Wait Tool
    this.tools.set('wait', {
      name: 'wait',
      description: 'Wait for a condition or time period',
      parameters: { condition: 'string', duration: 'number', selector: 'string' },
      execute: async (params, state) => {
        try {
          if (params.condition === 'element' && params.selector) {
            const found = await this.puppeteerWorker.waitForElement(params.selector, params.duration * 1000);
            return { success: found, result: { condition: params.condition, selector: params.selector } };
          } else if (params.condition === 'navigation') {
            const navigated = await this.puppeteerWorker.waitForNavigation(params.duration * 1000);
            return { success: navigated, result: { condition: params.condition } };
          } else {
            // Simple time-based wait
            await new Promise(resolve => setTimeout(resolve, params.duration * 1000));
            return { success: true, result: { duration: params.duration } };
          }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Wait failed' };
        }
      }
    });


    // Extract Tool
    this.tools.set('extract', {
      name: 'extract',
      description: 'Extract data from the current page',
      parameters: { selector: 'string', dataType: 'string', attribute: 'string' },
      execute: async (params, state) => {
        try {
          const domState = await this.puppeteerWorker.getDOMState();
          let extractedValue = '';
          
          if (params.dataType === 'text') {
            // Extract text content
            const element = await this.puppeteerWorker.getElement(params.selector);
            if (element) {
              extractedValue = await element.evaluate(el => el.textContent || '');
            }
          } else if (params.dataType === 'attribute' && params.attribute) {
            // Extract specific attribute
            const element = await this.puppeteerWorker.getElement(params.selector);
            if (element) {
              extractedValue = await element.evaluate((el, attr) => el.getAttribute(attr) || '', params.attribute);
            }
          }
          
          return { success: true, result: { value: extractedValue, selector: params.selector, dataType: params.dataType } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Extract failed' };
        }
      }
    });

    // Evaluate Tool
    this.tools.set('evaluate', {
      name: 'evaluate',
      description: 'Evaluate a condition or state on the page',
      parameters: { condition: 'string', expectedValue: 'string', selector: 'string' },
      execute: async (params, state) => {
        try {
          let result = false;
          let actualValue = '';
          
          if (params.condition === 'element_exists') {
            const element = await this.puppeteerWorker.getElement(params.selector);
            result = element !== null;
          } else if (params.condition === 'text_contains') {
            const element = await this.puppeteerWorker.getElement(params.selector);
            if (element) {
              actualValue = await element.evaluate(el => el.textContent || '');
              result = actualValue.includes(params.expectedValue);
            }
          } else if (params.condition === 'url_contains') {
            const currentUrl = this.puppeteerWorker.getCurrentUrl() || '';
            result = currentUrl.includes(params.expectedValue);
            actualValue = currentUrl;
          }
          
          return { success: true, result: { condition: params.condition, result, actualValue, expectedValue: params.expectedValue } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Evaluate failed' };
        }
      }
    });
  }

  private createSmartWorkflow(): any {
    const self = this;
    
    return {
      async invoke(initialState: SmartAgentState, options?: any): Promise<SmartAgentState> {
        let state = { ...initialState };
        
        try {
          console.log('🤖 Starting Smart LangGraph Agent...');
          console.log(`📋 Following plan: ${state.actionPlan.featureName}`);
          console.log(`🎯 Total actions in plan: ${state.actionPlan.actions.length}`);
          
          // Initialize the agent
          state = await self.initializeAgent(state);
          
          // Main execution loop
          while (!state.isComplete && state.currentActionIndex < state.actionPlan.actions.length) {
            console.log(`\n🔄 Executing action ${state.currentActionIndex + 1}/${state.actionPlan.actions.length}`);
            
            // Analyze current state and plan
            state = await self.analyzeAndPlan(state);
            
            if (state.isComplete) break;
            
            // Select and execute the best tool
            state = await self.selectAndExecuteTool(state);
            
            // Validate the action result
            state = await self.validateAction(state);
            
            // Adapt if necessary
            state = await self.adaptStrategy(state);
            
            state.currentActionIndex++;
          }
          
          // Complete the workflow
          state = await self.completeWorkflow(state);
          
        } catch (error) {
          console.error('❌ Smart Agent Error:', error);
          state = await self.handleError(state, error);
        }
        
        return state;
      }
    };
  }

  private async initializeAgent(state: SmartAgentState): Promise<SmartAgentState> {
    console.log('🚀 Initializing Smart Agent...');
    
    try {
      // Ensure Puppeteer is initialized
      if (!this.puppeteerWorker.isInitialized()) {
        await this.puppeteerWorker.initialize();
      }
      
      // Get initial DOM state
      const domState = await this.puppeteerWorker.getDOMState(true);
      
      return {
        ...state,
        domState,
        startTime: Date.now(),
        currentActionIndex: 0,
        completedActions: [],
        failedActions: [],
        extractedData: {},
        retryCount: 0,
        maxRetries: 3,
        adaptationStrategy: 'adaptive'
      };
    } catch (error) {
      console.error('Initialization failed:', error);
      return {
        ...state,
        error: error instanceof Error ? error.message : 'Initialization failed',
        isComplete: true
      };
    }
  }

  private async analyzeAndPlan(state: SmartAgentState): Promise<SmartAgentState> {
    console.log('🧠 Analyzing current state and planning next action...');
    
    try {
      // Get current DOM state
      const currentDomState = await this.puppeteerWorker.getDOMState(true);
      
      // Get the next action from the plan
      const nextAction = state.actionPlan.actions[state.currentActionIndex];
      
      if (!nextAction) {
        return {
          ...state,
          isComplete: true,
          reasoning: 'All actions in plan completed'
        };
      }
      
      // Use Gemini to analyze the current state and determine if we should proceed
      const analysis = await this.geminiService.analyzeCurrentState(
        currentDomState,
        nextAction,
        state.featureDocs,
        state.history,
        state.currentContext
      );
      
      return {
        ...state,
        domState: currentDomState,
        currentContext: analysis.context,
        reasoning: analysis.reasoning,
        // Store the next action for execution
        ...analysis
      };
    } catch (error) {
      console.error('Analysis failed:', error);
      return {
        ...state,
        error: error instanceof Error ? error.message : 'Analysis failed',
        isComplete: true
      };
    }
  }

  private async selectAndExecuteTool(state: SmartAgentState): Promise<SmartAgentState> {
    console.log('🔧 Selecting and executing tool...');
    
    try {
      const nextAction = state.actionPlan.actions[state.currentActionIndex];
      
      // Map action type to tool
      const toolName = this.mapActionToTool(nextAction.type);
      const tool = this.tools.get(toolName);
      
      if (!tool) {
        throw new Error(`No tool available for action type: ${nextAction.type}`);
      }
      
      // Prepare tool parameters
      const toolParams = this.prepareToolParameters(nextAction, state);
      
      console.log(`🛠️  Executing tool: ${toolName} with params:`, toolParams);
      
      // Execute the tool
      const result = await tool.execute(toolParams, state);
      
      if (result.success) {
        console.log('✅ Tool execution successful');
        
        // Create tour step
        const tourStep: TourStep = {
          order: state.currentActionIndex + 1,
          action: {
            type: nextAction.type,
            selector: nextAction.selector,
            inputText: nextAction.inputText,
            description: nextAction.description
          },
          selector: nextAction.selector || '',
          description: nextAction.description,
          tooltip: nextAction.expectedOutcome,
          timestamp: Date.now(),
          success: true
        };
        
        return {
          ...state,
          completedActions: [...state.completedActions, state.currentActionIndex],
          tourSteps: [...state.tourSteps, tourStep],
          extractedData: { ...state.extractedData, ...result.result }
        };
      } else {
        console.log('❌ Tool execution failed:', result.error);
        
        const tourStep: TourStep = {
          order: state.currentActionIndex + 1,
          action: {
            type: nextAction.type,
            selector: nextAction.selector,
            inputText: nextAction.inputText,
            description: nextAction.description
          },
          selector: nextAction.selector || '',
          description: nextAction.description,
          tooltip: 'Action failed',
          timestamp: Date.now(),
          success: false,
          errorMessage: result.error
        };
        
        return {
          ...state,
          failedActions: [...state.failedActions, state.currentActionIndex],
          tourSteps: [...state.tourSteps, tourStep],
          retryCount: state.retryCount + 1
        };
      }
    } catch (error) {
      console.error('Tool execution failed:', error);
      return {
        ...state,
        error: error instanceof Error ? error.message : 'Tool execution failed',
        failedActions: [...state.failedActions, state.currentActionIndex]
      };
    }
  }

  private async validateAction(state: SmartAgentState): Promise<SmartAgentState> {
    console.log('✅ Validating action result...');
    
    try {
      const nextAction = state.actionPlan.actions[state.currentActionIndex];
      const currentDomState = await this.puppeteerWorker.getDOMState();
      
      // Use Gemini to validate the action was successful
      const validation = await this.geminiService.validateActionSuccess(
        {
          type: nextAction.type,
          selector: nextAction.selector,
          inputText: nextAction.inputText,
          description: nextAction.description
        },
        state.domState!,
        currentDomState,
        nextAction.expectedOutcome
      );
      
      if (!validation.success && state.retryCount < state.maxRetries) {
        console.log('🔄 Action validation failed, will retry...');
        return {
          ...state,
          retryCount: state.retryCount + 1,
          currentActionIndex: state.currentActionIndex - 1 // Retry the same action
        };
      }
      
      return {
        ...state,
        domState: currentDomState,
        reasoning: validation.reasoning
      };
    } catch (error) {
      console.error('Validation failed:', error);
      return state; // Continue with the next action
    }
  }

  private async adaptStrategy(state: SmartAgentState): Promise<SmartAgentState> {
    console.log('🔄 Adapting strategy based on results...');
    
    try {
      // If we have too many failures, adapt the strategy
      const failureRate = state.failedActions.length / (state.currentActionIndex + 1);
      
      if (failureRate > 0.3 && state.adaptationStrategy === 'strict') {
        console.log('📈 High failure rate detected, switching to flexible strategy');
        return {
          ...state,
          adaptationStrategy: 'flexible'
        };
      }
      
      if (failureRate > 0.5 && state.adaptationStrategy === 'flexible') {
        console.log('📈 Very high failure rate detected, switching to adaptive strategy');
        return {
          ...state,
          adaptationStrategy: 'adaptive'
        };
      }
      
      return state;
    } catch (error) {
      console.error('Strategy adaptation failed:', error);
      return state;
    }
  }

  private async completeWorkflow(state: SmartAgentState): Promise<SmartAgentState> {
    console.log('🏁 Completing workflow...');
    
    const endTime = Date.now();
    const processingTime = endTime - state.startTime;
    const successRate = state.completedActions.length / state.actionPlan.actions.length;
    
    console.log(`📊 Workflow completed:`);
    console.log(`   ✅ Successful actions: ${state.completedActions.length}`);
    console.log(`   ❌ Failed actions: ${state.failedActions.length}`);
    console.log(`   📈 Success rate: ${(successRate * 100).toFixed(1)}%`);
    console.log(`   ⏱️  Processing time: ${processingTime}ms`);
    
    return {
      ...state,
      endTime,
      isComplete: true,
      success: successRate > 0.5, // Consider successful if more than 50% actions succeeded
      reasoning: `Completed ${state.completedActions.length}/${state.actionPlan.actions.length} actions with ${(successRate * 100).toFixed(1)}% success rate`
    };
  }

  private async handleError(state: SmartAgentState, error: any): Promise<SmartAgentState> {
    console.error('💥 Handling error:', error);
    
    return {
      ...state,
      error: error instanceof Error ? error.message : 'Unknown error',
      isComplete: true,
      success: false,
      endTime: Date.now()
    };
  }

  private mapActionToTool(actionType: string): string {
    const mapping: Record<string, string> = {
      'click': 'click',
      'type': 'type',
      'navigate': 'navigate',
      'wait': 'wait',
      'scroll': 'wait', // Map scroll to wait for now
      'select': 'click', // Map select to click
      'hover': 'click', // Map hover to click
      'extract': 'extract',
      'evaluate': 'evaluate'
    };
    
    return mapping[actionType] || 'click';
  }

  private prepareToolParameters(action: PuppeteerAction, state: SmartAgentState): any {
    const baseParams = {
      selector: action.selector,
      fallbackSelector: action.fallbackSelector,
      inputText: action.inputText,
      description: action.description
    };
    
    switch (action.type) {
      case 'navigate':
        return {
          url: action.inputText,
          waitFor: action.waitCondition
        };
      
      case 'click':
        return {
          selector: action.selector,
          fallbackSelector: action.fallbackSelector,
          waitAfter: action.estimatedDuration * 1000
        };
      
      case 'type':
        return {
          selector: action.selector,
          text: action.inputText,
          clearFirst: true
        };
      
      case 'wait':
        return {
          condition: action.waitCondition || 'time',
          duration: action.estimatedDuration,
          selector: action.selector
        };
      
      case 'extract':
        return {
          selector: action.selector,
          dataType: 'text',
          attribute: action.extractData
        };
      
      case 'evaluate':
        return {
          condition: 'element_exists',
          selector: action.selector,
          expectedValue: action.expectedOutcome
        };
      
      default:
        return baseParams;
    }
  }

  // Public method to run the smart agent
  async runSmartAgent(
    actionPlan: ActionPlan,
    tourConfig: TourConfig,
    featureDocs: ProductDocs,
    credentials?: { username: string; password: string }
  ): Promise<DemoAutomationResult> {
    console.log('🤖 Starting Smart LangGraph Agent...');
    console.log(`📋 Plan: ${actionPlan.featureName} (${actionPlan.actions.length} actions)`);
    
    try {
      // Initialize state
      const initialState: SmartAgentState = {
        actionPlan,
        currentActionIndex: 0,
        completedActions: [],
        failedActions: [],
        currentStep: 0,
        totalSteps: actionPlan.actions.length,
        domState: null,
        tourSteps: [],
        history: [],
        goal: tourConfig.goal,
        featureDocs,
        currentContext: '',
        reasoning: '',
        isComplete: false,
        success: false,
        startTime: Date.now(),
        extractedData: {},
        retryCount: 0,
        maxRetries: 3,
        adaptationStrategy: 'adaptive'
      };
      
      // Run the workflow
      const result = await this.workflow.invoke(initialState, {
        configurable: {
          thread_id: `smart-agent-${Date.now()}`
        }
      });
      
      // Build final result
      const processingTime = result.endTime ? result.endTime - result.startTime : 0;
      const successRate = result.completedActions.length / actionPlan.actions.length;
      
      return {
        success: result.success && successRate > 0.5,
        tourSteps: result.tourSteps,
        totalSteps: result.tourSteps.length,
        processingTime,
        finalUrl: this.puppeteerWorker.getCurrentUrl() || '',
        error: result.error,
        summary: {
          featuresCovered: [actionPlan.featureName],
          actionsPerformed: result.tourSteps.map(step => step.action.type),
          successRate
        }
      };
    } catch (error) {
      console.error('Smart Agent failed:', error);
      
      return {
        success: false,
        tourSteps: [],
        totalSteps: 0,
        processingTime: 0,
        finalUrl: '',
        error: error instanceof Error ? error.message : 'Smart Agent failed',
        summary: {
          featuresCovered: [],
          actionsPerformed: [],
          successRate: 0
        }
      };
    }
  }

  async stopAgent(): Promise<void> {
    await this.puppeteerWorker.cleanup();
  }
}
