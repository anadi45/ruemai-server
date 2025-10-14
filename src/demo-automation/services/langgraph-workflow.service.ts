import { Injectable } from '@nestjs/common';
import { StateGraph, MemorySaver } from '@langchain/langgraph';
import { GeminiService } from './gemini.service';
import { PuppeteerWorkerService } from './puppeteer-worker.service';
import { 
  Action, 
  DOMState, 
  DemoAutomationState, 
  TourStep, 
  TourConfig, 
  ProductDocs,
  DemoAutomationResult 
} from '../types/demo-automation.types';

@Injectable()
export class LangGraphWorkflowService {
  private workflow: any;
  private memory: MemorySaver;

  constructor(
    private geminiService: GeminiService,
    private puppeteerWorker: PuppeteerWorkerService
  ) {
    this.memory = new MemorySaver();
    this.workflow = this.createWorkflow();
  }

  private createWorkflow(): any {
    // Create a simplified workflow using a state machine approach
    // Since LangGraphJS API is complex, we'll implement a custom workflow
    const self = this;
    return {
      async invoke(initialState: DemoAutomationState, options?: any): Promise<DemoAutomationState> {
        let state = { ...initialState };
        
        try {
          // Initialize
          const initResult = await self.initializeNode(state);
          state = { ...state, ...initResult };
          
          // Main loop
          while (!state.isComplete && state.currentStep < state.totalSteps) {
            // Analyze
            const analyzeResult = await self.analyzeNode(state);
            state = { ...state, ...analyzeResult };
            
            if (state.isComplete) break;
            
            // Execute
            const executeResult = await self.executeNode(state);
            state = { ...state, ...executeResult };
            
            // Validate
            const validateResult = await self.validateNode(state);
            state = { ...state, ...validateResult };
            
            state.currentStep++;
          }
          
          // Complete
          const completeResult = await self.completeNode(state);
          state = { ...state, ...completeResult };
          
        } catch (error) {
          const errorResult = await self.errorNode(state);
          state = { ...state, ...errorResult };
          state.error = error instanceof Error ? error.message : 'Unknown error';
        }
        
        return state;
      }
    };
  }

  private async initializeNode(state: DemoAutomationState): Promise<Partial<DemoAutomationState>> {
    console.log('Initializing demo automation workflow...');
    
    try {
      // Initialize Puppeteer if not already initialized
      if (!this.puppeteerWorker.isInitialized()) {
        await this.puppeteerWorker.initialize();
        
        // Navigate to the website
        await this.puppeteerWorker.navigateToUrl(state.goal);
      }
      
      // Get initial DOM state
      const domState = await this.puppeteerWorker.getDOMState(true);
      
      return {
        currentStep: 0,
        totalSteps: 0,
        domState,
        startTime: Date.now(),
        isComplete: false
      };
    } catch (error) {
      console.error('Initialization failed:', error);
      return {
        error: error instanceof Error ? error.message : 'Initialization failed',
        isComplete: true
      };
    }
  }

  private async analyzeNode(state: DemoAutomationState): Promise<Partial<DemoAutomationState>> {
    console.log(`Analyzing step ${state.currentStep}...`);
    
    try {
      // Get current DOM state
      const domState = await this.puppeteerWorker.getDOMState(true);
      
      // Parse feature docs
      const featureDocs: ProductDocs = JSON.parse(state.featureDocs);
      
      // Ask Gemini for next action
      const geminiResponse = await this.geminiService.decideNextAction(
        domState,
        state.goal,
        featureDocs,
        state.history,
        state.totalSteps,
        state.currentStep
      );

      if (!geminiResponse.action) {
        return {
          isComplete: true,
          endTime: Date.now()
        };
      }

      return {
        domState,
        // Store the next action in a temporary field
        ...geminiResponse
      };
    } catch (error) {
      console.error('Analysis failed:', error);
      return {
        error: error instanceof Error ? error.message : 'Analysis failed',
        isComplete: true
      };
    }
  }

  private async executeNode(state: DemoAutomationState): Promise<Partial<DemoAutomationState>> {
    console.log(`Executing action: ${(state as any).action?.type} on ${(state as any).action?.selector}`);
    
    try {
      const action = (state as any).action as Action;
      if (!action) {
        throw new Error('No action to execute');
      }

      // Execute the action
      const result = await this.puppeteerWorker.executeAction(action);
      
      if (!result.success) {
        throw new Error(result.error || 'Action execution failed');
      }

      // Get element position for tooltip placement
      const position = await this.puppeteerWorker.getElementPosition(action.selector!);

      // Create tour step
      const tourStep: TourStep = {
        order: state.currentStep + 1,
        action,
        selector: action.selector!,
        description: action.description,
        tooltip: action.description, // Will be enhanced by Gemini
        position: position || undefined,
        timestamp: Date.now(),
        success: true
      };

      return {
        currentStep: state.currentStep + 1,
        history: [...state.history, action],
        tourSteps: [...state.tourSteps, tourStep]
      };
    } catch (error) {
      console.error('Execution failed:', error);
      
      // Check if this is a critical action that should stop the workflow
      const action = (state as any).action as Action;
      const isCriticalAction = this.isCriticalAction(action);
      
      if (isCriticalAction) {
        console.error('💥 CRITICAL ACTION EXECUTION FAILED - STOPPING WORKFLOW');
        console.error(`Critical action: ${action?.type} - ${action?.description}`);
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        const tourStep: TourStep = {
          order: state.currentStep + 1,
          action: action,
          selector: action?.selector || '',
          description: action?.description || '',
          tooltip: 'Critical action failed - stopping workflow',
          timestamp: Date.now(),
          success: false,
          errorMessage: `CRITICAL EXECUTION FAILURE (STOPPING): ${error instanceof Error ? error.message : 'Unknown error'}`
        };

        return {
          currentStep: state.currentStep + 1,
          tourSteps: [...state.tourSteps, tourStep],
          error: `Critical action execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          isComplete: true
        };
      }
      
      const tourStep: TourStep = {
        order: state.currentStep + 1,
        action: (state as any).action,
        selector: (state as any).action?.selector || '',
        description: (state as any).action?.description || '',
        tooltip: 'Action failed',
        timestamp: Date.now(),
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };

      return {
        currentStep: state.currentStep + 1,
        tourSteps: [...state.tourSteps, tourStep],
        error: error instanceof Error ? error.message : 'Execution failed'
      };
    }
  }

  private async validateNode(state: DemoAutomationState): Promise<Partial<DemoAutomationState>> {
    console.log('Validating action result...');
    
    try {
      // Get current DOM state after action
      const currentDomState = await this.puppeteerWorker.getDOMState();
      
      // Validate the action was successful
      const lastAction = state.history[state.history.length - 1];
      const featureDocs: ProductDocs = JSON.parse(state.featureDocs);
      
      const validation = await this.geminiService.validateActionSuccess(
        lastAction,
        state.domState!,
        currentDomState,
        featureDocs.expectedOutcomes[0] || 'Page should have changed'
      );

      return {
        domState: currentDomState,
        // Store validation result
        ...validation
      };
    } catch (error) {
      console.error('Validation failed:', error);
      return {
        error: error instanceof Error ? error.message : 'Validation failed'
      };
    }
  }

  private async completeNode(state: DemoAutomationState): Promise<Partial<DemoAutomationState>> {
    console.log('Completing demo automation workflow...');
    
    const endTime = Date.now();
    const processingTime = endTime - state.startTime;
    
    return {
      endTime,
      isComplete: true
    };
  }

  private async errorNode(state: DemoAutomationState): Promise<Partial<DemoAutomationState>> {
    console.log('Demo automation workflow encountered an error');
    
    return {
      isComplete: true,
      endTime: Date.now()
    };
  }


  async runDemoAutomation(
    config: TourConfig,
    featureDocs: ProductDocs,
    credentials?: { username: string; password: string }
  ): Promise<DemoAutomationResult> {
    console.log('Starting demo automation workflow...');
    
    try {
      // Initialize state
      const initialState: DemoAutomationState = {
        currentStep: 0,
        totalSteps: config.maxSteps,
        history: [],
        domState: null,
        tourSteps: [],
        goal: config.goal,
        featureDocs: JSON.stringify(featureDocs),
        isComplete: false,
        startTime: Date.now()
      };

      // Run the workflow
      const result = await this.workflow.invoke(initialState, {
        configurable: {
          thread_id: `demo-${Date.now()}`
        }
      });

      // Note: Cleanup is handled by the calling service

      // Build result
      const processingTime = result.endTime ? result.endTime - result.startTime : 0;
      const successRate = result.tourSteps.length > 0 
        ? result.tourSteps.filter(step => step.success).length / result.tourSteps.length 
        : 0;

      return {
        success: !result.error && result.tourSteps.length > 0,
        tourSteps: result.tourSteps,
        totalSteps: result.tourSteps.length,
        processingTime,
        finalUrl: this.puppeteerWorker.getCurrentUrl() || '',
        error: result.error,
        summary: {
          featuresCovered: [config.featureName],
          actionsPerformed: result.tourSteps.map(step => step.action.type),
          successRate
        }
      };
    } catch (error) {
      console.error('Demo automation workflow failed:', error);
      
      // Note: Cleanup is handled by the calling service
      
      return {
        success: false,
        tourSteps: [],
        totalSteps: 0,
        processingTime: 0,
        finalUrl: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        summary: {
          featuresCovered: [],
          actionsPerformed: [],
          successRate: 0
        }
      };
    }
  }

  async stopWorkflow(): Promise<void> {
    await this.puppeteerWorker.cleanup();
  }

  private isCriticalAction(action: Action): boolean {
    if (!action) return false;
    
    // Navigation actions are always critical
    if (action.type === 'navigate') {
      return true;
    }
    
    // Actions with specific critical keywords in description
    const criticalKeywords = [
      'login', 'authenticate', 'navigate', 'go to', 'access', 'enter',
      'submit', 'confirm', 'proceed', 'continue', 'next step'
    ];
    
    const description = action.description?.toLowerCase() || '';
    const hasCriticalKeyword = criticalKeywords.some(keyword => 
      description.includes(keyword)
    );
    
    return hasCriticalKeyword;
  }
}
