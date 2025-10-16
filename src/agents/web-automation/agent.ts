import { Injectable } from '@nestjs/common';
import { StateGraph, MemorySaver, START, END } from '@langchain/langgraph';
import { GeminiService } from '../../demo-automation/services/gemini.service';
import { PuppeteerWorkerService } from '../../demo-automation/services/puppeteer-worker.service';
import { IntelligentElementDiscoveryService } from '../../demo-automation/services/intelligent-element-discovery.service';
import { ActionLoggerService } from '../../demo-automation/services/action-logger.service';
import { 
  Action, 
  DOMState, 
  DOMAnalysis,
  SmartAgentState,
  TourStep, 
  TourConfig, 
  ProductDocs,
  DemoAutomationResult,
  ActionPlan,
  PuppeteerAction,
  IntelligentElementDiscovery
} from '../../demo-automation/types/demo-automation.types';
import { WebAutomationTools, AgentTool } from './tools';

// Enhanced automation agent state for intelligent plan following
// SmartAgentState is now imported from types

@Injectable()
export class WebAutomation {
  private workflow: any;
  private memory: MemorySaver;
  private tools: Map<string, AgentTool>;
  private webAutomationTools: WebAutomationTools;

  constructor(
    private geminiService: GeminiService,
    private puppeteerWorker: PuppeteerWorkerService,
    private elementDiscovery: IntelligentElementDiscoveryService,
    private actionLogger: ActionLoggerService
  ) {
    this.memory = new MemorySaver();
    this.tools = new Map();
    this.webAutomationTools = new WebAutomationTools(this.puppeteerWorker, this.elementDiscovery);
    this.initializeTools();
    this.workflow = this.createAutomationWorkflow();
  }

  private initializeTools(): void {
    // Initialize all tools using the WebAutomationTools class
    this.tools.set('navigate', this.webAutomationTools.createNavigateTool());
    this.tools.set('click', this.webAutomationTools.createClickTool());
    this.tools.set('type', this.webAutomationTools.createTypeTool());
    this.tools.set('wait', this.webAutomationTools.createWaitTool());
    this.tools.set('extract', this.webAutomationTools.createExtractTool());
    this.tools.set('evaluate', this.webAutomationTools.createEvaluateTool());
    this.tools.set('intelligent_navigate', this.webAutomationTools.createIntelligentNavigateTool());
    this.tools.set('intelligent_discover_feature', this.webAutomationTools.createIntelligentDiscoverFeatureTool());
    this.tools.set('discover_element', this.webAutomationTools.createDiscoverElementTool());
    this.tools.set('click_coordinates', this.webAutomationTools.createClickCoordinatesTool());
    this.tools.set('type_coordinates', this.webAutomationTools.createTypeCoordinatesTool());
    this.tools.set('scroll_coordinates', this.webAutomationTools.createScrollCoordinatesTool());
    this.tools.set('select_coordinates', this.webAutomationTools.createSelectCoordinatesTool());
  }

  private createAutomationWorkflow(): any {
    const self = this;
    
    return {
      async invoke(initialState: SmartAgentState, options?: any): Promise<SmartAgentState> {
        let state = { ...initialState };
        
        try {
          console.log('🤖 Starting Intelligent Web Automation Agent...');
          console.log(`📋 Following flexible plan: ${state.actionPlan.featureName}`);
          console.log(`🎯 Total actions in plan: ${state.actionPlan.actions.length}`);
          console.log(`🧠 Intelligent adaptation enabled - agent will make intelligent decisions based on visual context`);
          
          // Initialize the automation agent
          state = await self.initializeNode(state);
          
          // Main execution loop with intelligent adaptation
          while (!state.isComplete && state.currentActionIndex < state.actionPlan.actions.length) {
            console.log(`\n🔄 Intelligently executing action ${state.currentActionIndex + 1}/${state.actionPlan.actions.length}`);
            console.log(`🎯 Plan guidance: ${state.actionPlan.actions[state.currentActionIndex]?.description || 'No guidance available'}`);
            console.log(`🧠 Feature goal: ${state.featureDocs.featureName}`);
            
            // Intelligently analyze current state and plan
            state = await self.analyzeNode(state);
            
            if (state.isComplete) break;
            
            // Intelligently select and execute the best tool
            state = await self.executeNode(state);
            
            // Check if execution was stopped due to critical failure
            if (state.isComplete && !state.success) {
              console.error('💥 Agent execution stopped due to critical failure');
              break;
            }
            
            // Intelligently validate the action result
            state = await self.validateNode(state);
            
            // Check if validation stopped execution
            if (state.isComplete && !state.success) {
              console.error('💥 Agent execution stopped due to validation failure');
              break;
            }
            
            // Intelligently adapt strategy based on results
            state = await self.adaptNode(state);
            
            // Increment to next action
            state = await self.incrementNode(state);
          }
          
          // Complete the automation workflow
          state = await self.completeNode(state);
          
        } catch (error) {
          console.error('❌ Intelligent Web Automation Agent Error:', error);
          state = await self.errorNode(state);
        }
        
        return state;
      }
    };
  }

  // Automation Workflow Node Implementations
  private async initializeNode(state: SmartAgentState): Promise<SmartAgentState> {
    console.log('🚀 Initializing Web Automation Agent...');
    
    try {
      // Ensure Puppeteer is initialized
      if (!this.puppeteerWorker.isInitialized()) {
        await this.puppeteerWorker.initialize();
      }
      
      // Take initial screenshot for visual analysis
      const initialScreenshot = await this.puppeteerWorker.takeScreenshot();
      const currentUrl = this.puppeteerWorker.getCurrentUrl() || '';
      const pageTitle = await this.puppeteerWorker.getPageTitle() || '';
      
      console.log('📸 Initial screenshot captured for visual analysis');
      
      return {
        ...state,
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

  private async analyzeNode(state: SmartAgentState): Promise<SmartAgentState> {
    console.log('🧠 Intelligently analyzing current state and planning next action...');
    
    try {
      // Take screenshot for intelligent visual analysis
      const screenshot = await this.puppeteerWorker.takeScreenshot();
      const currentUrl = this.puppeteerWorker.getCurrentUrl() || '';
      const pageTitle = await this.puppeteerWorker.getPageTitle() || '';
      
      // Get the next action from the plan (as guidance only)
      const nextAction = state.actionPlan.actions[state.currentActionIndex];
      
      if (!nextAction) {
        return {
          ...state,
          isComplete: true,
          reasoning: 'All actions in plan completed'
        };
      }
      
      // Build enhanced context with intelligent analysis
      let enhancedContext = state.currentContext;
      enhancedContext += `\n\nIntelligent Page Analysis:\n`;
      enhancedContext += `- URL: ${currentUrl}\n`;
      enhancedContext += `- Title: ${pageTitle}\n`;
      enhancedContext += `- Screenshot captured for intelligent visual analysis\n`;
      enhancedContext += `- Plan guidance: ${nextAction.description}\n`;
      enhancedContext += `- Feature goal: ${state.featureDocs.featureName}\n`;
      
      // Use Gemini to intelligently analyze the screenshot and determine the best course of action
      const analysis = await this.geminiService.analyzeCurrentStateWithScreenshot(
        screenshot,
        currentUrl,
        pageTitle,
        nextAction,
        state.featureDocs,
        state.history || [],
        enhancedContext
      );
      
      // Enhanced reasoning with intelligent analysis
      const intelligentReasoning = [
        analysis.reasoning,
        `Plan guidance: ${nextAction.description}`,
        `Feature goal: ${state.featureDocs.featureName}`,
        `Current step: ${state.currentActionIndex + 1}/${state.actionPlan.actions.length}`
      ].filter(Boolean).join('\n');
      
      return {
        ...state,
        currentContext: enhancedContext,
        reasoning: intelligentReasoning,
        // Store the analysis results for intelligent execution
        ...analysis
      };
    } catch (error) {
      console.error('Intelligent analysis failed:', error);
      return {
        ...state,
        error: error instanceof Error ? error.message : 'Intelligent analysis failed',
        isComplete: true
      };
    }
  }

  private async executeNode(state: SmartAgentState): Promise<SmartAgentState> {
    console.log('🔧 Intelligently selecting and executing tool based on roadmap goals...');
    
    try {
      const nextAction = state.actionPlan.actions[state.currentActionIndex];
      
      // Validate that we're not skipping any steps
      if (!this.validateStepExecution(state)) {
        console.error('💥 STEP VALIDATION FAILED - STOPPING AGENT EXECUTION');
        console.error(`Expected action index: ${state.currentActionIndex}, but found gaps in execution`);
        
        return {
          ...state,
          isComplete: true,
          success: false,
          error: 'Step validation failed: Steps were skipped during execution',
          endTime: Date.now()
        };
      }
      
      // INTELLIGENT GOAL-BASED EXECUTION - Use roadmap goals to determine the best approach
      console.log(`🧠 Using intelligent goal-based execution for: "${nextAction.description}"`);
      console.log(`🎯 Roadmap goal: ${nextAction.description}`);
      console.log(`🎯 Feature: ${state.featureDocs.featureName}`);
      
      // Take screenshot for intelligent visual analysis
      const screenshotData = await this.puppeteerWorker.takeScreenshotForCoordinates();
      const currentUrl = this.puppeteerWorker.getCurrentUrl() || '';
      const pageTitle = await this.puppeteerWorker.getPageTitle() || '';
      
      console.log(`📸 Screenshot captured with dimensions: ${screenshotData.dimensions.width}x${screenshotData.dimensions.height}`);
      
      // Determine the best tool based on the goal type
      let toolName: string;
      let toolParams: any;
      
      if (nextAction.description.toLowerCase().includes('navigate') || 
          nextAction.description.toLowerCase().includes('go to') ||
          nextAction.description.toLowerCase().includes('reach')) {
        // Use intelligent navigation
        toolName = 'intelligent_navigate';
        toolParams = {
          goal: nextAction.description,
          featureName: state.featureDocs.featureName,
          context: state.currentContext,
          screenshot: screenshotData.screenshot,
          currentUrl: currentUrl,
          pageTitle: pageTitle
        };
      } else if (nextAction.description.toLowerCase().includes('access') ||
                 nextAction.description.toLowerCase().includes('use') ||
                 nextAction.description.toLowerCase().includes('demonstrate')) {
        // Use intelligent feature discovery
        toolName = 'intelligent_discover_feature';
        toolParams = {
          featureName: state.featureDocs.featureName,
          goal: nextAction.description,
          context: state.currentContext,
          screenshot: screenshotData.screenshot,
          currentUrl: currentUrl,
          pageTitle: pageTitle
        };
      } else {
        // Use intelligent element discovery for other goals
        toolName = 'discover_element';
        toolParams = {
          actionDescription: nextAction.description,
          actionType: nextAction.type,
          context: state.currentContext,
          screenshot: screenshotData.screenshot,
          screenshotData: screenshotData.screenshotData,
          screenshotPath: screenshotData.screenshotPath,
          currentUrl: currentUrl,
          pageTitle: pageTitle,
          viewportDimensions: screenshotData.dimensions
        };
      }
      
      console.log(`🛠️  Selected intelligent tool: ${toolName}`);
      console.log(`🎯 Goal: ${nextAction.description}`);
      
      const tool = this.tools.get(toolName);
      if (!tool) {
        throw new Error(`No intelligent tool available for: ${toolName}`);
      }
      
      // Execute the intelligent tool
      const result = await tool.execute(toolParams, state);
      
      console.log(`📊 Goal-Based Execution Output:`, {
        success: result.success,
        method: result.result?.method,
        reasoning: result.result?.reasoning,
        error: result.error
      });
      
      // Clean up screenshot file after execution
      if (screenshotData.screenshotPath) {
        try {
          await this.puppeteerWorker.cleanupScreenshot(screenshotData.screenshotPath);
        } catch (error) {
          console.warn('Failed to cleanup screenshot after execution:', error);
        }
      }
      
      if (result.success) {
        console.log('✅ Intelligent goal execution successful');
        
        // Log action completion
        this.actionLogger.logActionComplete(`goal-${state.currentActionIndex}-${Date.now()}`, true);
        
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
        console.log('❌ Intelligent goal execution failed:', result.error);
        
        // Log action failure
        this.actionLogger.logActionComplete(`goal-${state.currentActionIndex}-${Date.now()}`, false, result.error);
        
        // Check if this is a critical goal that should stop the agent
        const isCriticalGoal = this.isCriticalAction(nextAction, state);
        
        if (isCriticalGoal) {
          console.log(`🚨 CRITICAL GOAL DETECTED: ${nextAction.description}`);
          console.error('💥 CRITICAL GOAL FAILED - STOPPING AGENT EXECUTION');
          console.error(`Critical goal: ${nextAction.description}`);
          console.error(`Error: ${result.error}`);
          
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
            tooltip: 'Critical goal failed - stopping execution',
            timestamp: Date.now(),
            success: false,
            errorMessage: `CRITICAL GOAL FAILURE (STOPPING): ${result.error}`
          };
          
          return {
            ...state,
            failedActions: [...state.failedActions, state.currentActionIndex],
            tourSteps: [...state.tourSteps, tourStep],
            isComplete: true,
            success: false,
            error: `Critical goal failed: ${nextAction.description} - ${result.error}`,
            endTime: Date.now()
          };
        }
        
        // For non-critical goals, continue but mark as failed
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
          tooltip: 'Goal failed - continuing',
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
      console.error('Intelligent goal execution failed:', error);
      
      // Check if this is a critical goal
      const nextAction = state.actionPlan.actions[state.currentActionIndex];
      const isCriticalGoal = this.isCriticalAction(nextAction, state);
      
      if (isCriticalGoal) {
        console.error('💥 CRITICAL GOAL EXCEPTION - STOPPING AGENT EXECUTION');
        console.error(`Critical goal exception: ${error instanceof Error ? error.message : 'Critical goal execution failed'}`);
        
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
          tooltip: 'Critical goal exception - stopping execution',
          timestamp: Date.now(),
          success: false,
          errorMessage: `CRITICAL GOAL EXCEPTION (STOPPING): ${error instanceof Error ? error.message : 'Critical goal execution failed'}`
        };
        
        return {
          ...state,
          failedActions: [...state.failedActions, state.currentActionIndex],
          tourSteps: [...state.tourSteps, tourStep],
          isComplete: true,
          success: false,
          error: `Critical goal exception: ${error instanceof Error ? error.message : 'Critical goal execution failed'}`,
          endTime: Date.now()
        };
      }
      
      return {
        ...state,
        error: error instanceof Error ? error.message : 'Intelligent goal execution failed',
        failedActions: [...state.failedActions, state.currentActionIndex]
      };
    }
  }

  private async validateNode(state: SmartAgentState): Promise<SmartAgentState> {
    console.log('✅ Validating action result...');
    
    try {
      const nextAction = state.actionPlan.actions[state.currentActionIndex];
      
      // Take screenshot for visual validation with coordinate data
      const screenshotData = await this.puppeteerWorker.takeScreenshotForCoordinates();
      const currentUrl = this.puppeteerWorker.getCurrentUrl() || '';
      const pageTitle = await this.puppeteerWorker.getPageTitle() || '';
      
      console.log('📸 Screenshot captured for validation analysis with dimensions:', screenshotData.dimensions);
      
      // Use Gemini to validate the action was successful using screenshot
      const validation = await this.geminiService.validateActionSuccessWithScreenshot(
        {
          type: nextAction.type,
          selector: nextAction.selector,
          inputText: nextAction.inputText,
          description: nextAction.description,
          coordinates: nextAction.coordinates
        },
        screenshotData.screenshot,
        currentUrl,
        pageTitle,
        nextAction.expectedOutcome,
        screenshotData.screenshotData,
        screenshotData.screenshotPath
      );
      
      console.log(`📊 Validation Analysis Output:`, {
        success: validation.success,
        reasoning: validation.reasoning
      });
      
      // Clean up screenshot file after processing
      if (screenshotData.screenshotPath) {
        try {
          await this.puppeteerWorker.cleanupScreenshot(screenshotData.screenshotPath);
        } catch (error) {
          console.warn('Failed to cleanup screenshot:', error);
        }
      }
      
      // Enhanced validation logic using screenshot analysis
      let validationSuccess = validation.success;
      let validationReasoning = validation.reasoning;
      
      // For navigation actions, check if URL changed
      if (nextAction.type === 'navigate') {
        const targetUrl = nextAction.inputText || nextAction.selector;
        
        console.log(`🔍 Navigation validation details:`);
        console.log(`   Target URL: "${targetUrl}"`);
        console.log(`   Current URL: "${currentUrl}"`);
        
        if (targetUrl && currentUrl && currentUrl.includes(targetUrl.split('/')[2])) {
          // We're on the same domain, navigation might be successful
          validationSuccess = true;
          validationReasoning = 'Navigation successful - reached target domain';
          console.log(`✅ Navigation validation: Target domain reached`);
        } else if (targetUrl && currentUrl && currentUrl !== targetUrl) {
          validationSuccess = false;
          validationReasoning = 'Navigation action did not result in expected URL change';
          console.log(`❌ Navigation validation: URL change required but not detected`);
        }
      }
      
      if (!validationSuccess) {
        console.log('❌ Action validation failed');
        console.log(`📊 Validation reasoning: ${validationReasoning}`);
        
        // Log validation failure
        this.actionLogger.logValidation(
          `action-${state.currentActionIndex}-${Date.now()}`,
          false,
          validationReasoning,
          this.isCriticalAction(nextAction, state)
        );
        
        // Check if this is a critical action
        const isCriticalAction = this.isCriticalAction(nextAction, state);
        
        if (isCriticalAction) {
          console.log(`🚨 CRITICAL ACTION VALIDATION DETECTED: ${nextAction.type} - ${nextAction.description}`);
          
          // For critical actions, also use intelligent retry but with stricter limits
          if (state.retryCount < state.maxRetries) {
            console.log(`🔄 Critical action validation failed, attempting intelligent retry (${state.retryCount + 1}/${state.maxRetries})...`);
            
            try {
              // Use LLM to analyze failure and regenerate improved action
              const retryAnalysis = await this.geminiService.analyzeFailureAndRegenerateAction(
                nextAction,
                validationReasoning,
                state.domState!,
                state.goal,
                state.retryCount + 1
              );
              
              console.log(`🧠 Critical action intelligent retry analysis:`, {
                analysis: retryAnalysis.analysis,
                improvedAction: retryAnalysis.improvedAction,
                recommendations: retryAnalysis.recommendations
              });
              
              // Update the action plan with the improved action
              const updatedActionPlan = {
                ...state.actionPlan,
                actions: state.actionPlan.actions.map((action, index) => 
                  index === state.currentActionIndex ? {
                    ...retryAnalysis.improvedAction,
                    expectedOutcome: action.expectedOutcome || retryAnalysis.improvedAction.description,
                    priority: action.priority || 'medium',
                    estimatedDuration: action.estimatedDuration || 5
                  } : action
                )
              };
              
              return {
                ...state,
                retryCount: state.retryCount + 1,
                actionPlan: updatedActionPlan,
                currentActionIndex: state.currentActionIndex - 1, // Retry the same action index
                reasoning: `Critical action intelligent retry ${state.retryCount + 1}: ${retryAnalysis.analysis}`
              };
            } catch (error) {
              console.error('Critical action intelligent retry failed:', error);
              console.log('🔄 Critical action falling back to simple retry...');
              
              return {
                ...state,
                retryCount: state.retryCount + 1,
                currentActionIndex: state.currentActionIndex - 1 // Simple retry fallback
              };
            }
          } else {
            // After max retries for critical action, stop execution
            console.error('💥 CRITICAL ACTION VALIDATION FAILED AFTER MAX RETRIES - STOPPING AGENT EXECUTION');
            console.error(`Critical action validation failed: ${nextAction.type} - ${nextAction.description}`);
            console.error(`Validation reason: ${validationReasoning}`);
            
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
              tooltip: 'Critical action validation failed after max retries - stopping execution',
              timestamp: Date.now(),
              success: false,
              errorMessage: `CRITICAL VALIDATION FAILURE AFTER MAX RETRIES: ${validationReasoning}`
            };
            
            return {
              ...state,
              failedActions: [...state.failedActions, state.currentActionIndex],
              tourSteps: [...state.tourSteps, tourStep],
              isComplete: true,
              success: false,
              error: `Critical action validation failed after max retries: ${nextAction.type} - ${validation.reasoning}`,
              endTime: Date.now()
            };
          }
        }
        
        // For non-critical actions, check retry count and use intelligent retry
        if (state.retryCount < state.maxRetries) {
          console.log(`🔄 Action validation failed, attempting intelligent retry (${state.retryCount + 1}/${state.maxRetries})...`);
          
          try {
            // Use LLM to analyze failure and regenerate improved action
            const retryAnalysis = await this.geminiService.analyzeFailureAndRegenerateAction(
              nextAction,
              validationReasoning,
              state.domState!,
              state.goal,
              state.retryCount + 1
            );
            
            console.log(`🧠 Intelligent retry analysis:`, {
              analysis: retryAnalysis.analysis,
              improvedAction: retryAnalysis.improvedAction,
              recommendations: retryAnalysis.recommendations
            });
            
            // Update the action plan with the improved action
            const updatedActionPlan = {
              ...state.actionPlan,
              actions: state.actionPlan.actions.map((action, index) => 
                index === state.currentActionIndex ? {
                  ...retryAnalysis.improvedAction,
                  expectedOutcome: action.expectedOutcome || retryAnalysis.improvedAction.description,
                  priority: action.priority || 'medium',
                  estimatedDuration: action.estimatedDuration || 5
                } : action
              )
            };
            
            return {
              ...state,
              retryCount: state.retryCount + 1,
              actionPlan: updatedActionPlan,
              currentActionIndex: state.currentActionIndex - 1, // Retry the same action index
              reasoning: `Intelligent retry ${state.retryCount + 1}: ${retryAnalysis.analysis}`
            };
          } catch (error) {
            console.error('Intelligent retry failed:', error);
            console.log('🔄 Falling back to simple retry...');
            
            return {
              ...state,
              retryCount: state.retryCount + 1,
              currentActionIndex: state.currentActionIndex - 1 // Simple retry fallback
            };
          }
        } else {
          console.log('⚠️  Non-critical action validation failed after max retries, continuing...');
        }
      } else {
        // Log successful validation
        this.actionLogger.logValidation(
          `action-${state.currentActionIndex}-${Date.now()}`,
          true,
          validationReasoning,
          this.isCriticalAction(nextAction, state)
        );
      }
      
      return {
        ...state,
        reasoning: validationReasoning
      };
    } catch (error) {
      console.error('Validation failed:', error);
      
      // Check if this is a critical action
      const nextAction = state.actionPlan.actions[state.currentActionIndex];
      const isCriticalAction = this.isCriticalAction(nextAction, state);
      
      if (isCriticalAction) {
        console.error('💥 CRITICAL ACTION VALIDATION EXCEPTION - STOPPING AGENT EXECUTION');
        console.error(`Critical action validation exception: ${error instanceof Error ? error.message : 'Unknown validation error'}`);
        
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
          tooltip: 'Critical action validation exception - stopping execution',
          timestamp: Date.now(),
          success: false,
          errorMessage: `CRITICAL VALIDATION EXCEPTION (STOPPING): ${error instanceof Error ? error.message : 'Unknown validation error'}`
        };
        
        return {
          ...state,
          failedActions: [...state.failedActions, state.currentActionIndex],
          tourSteps: [...state.tourSteps, tourStep],
          isComplete: true,
          success: false,
          error: `Critical action validation exception: ${error instanceof Error ? error.message : 'Unknown validation error'}`,
          endTime: Date.now()
        };
      }
      
      return state; // Continue with the next action for non-critical failures
    }
  }

  private async adaptNode(state: SmartAgentState): Promise<SmartAgentState> {
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

  private async incrementNode(state: SmartAgentState): Promise<SmartAgentState> {
    console.log('📈 Incrementing to next action...');
    
    // Increment the action index to move to the next action
    const nextActionIndex = state.currentActionIndex + 1;
    
    // Check if we've completed all actions
    if (nextActionIndex >= state.actionPlan.actions.length) {
      console.log('✅ All actions completed');
      return {
        ...state,
        isComplete: true,
        reasoning: 'All actions in plan completed'
      };
    }
    
    console.log(`🔄 Moving to action ${nextActionIndex + 1}/${state.actionPlan.actions.length}`);
    
    return {
      ...state,
      currentActionIndex: nextActionIndex
    };
  }

  private async completeNode(state: SmartAgentState): Promise<SmartAgentState> {
    console.log('🏁 Completing automation workflow...');
    
    const endTime = Date.now();
    const processingTime = endTime - state.startTime;
    const successRate = state.completedActions.length / state.actionPlan.actions.length;
    
    console.log(`📊 Automation workflow completed:`);
    console.log(`   ✅ Successful actions: ${state.completedActions.length}`);
    console.log(`   ❌ Failed actions: ${state.failedActions.length}`);
    console.log(`   📈 Success rate: ${(successRate * 100).toFixed(1)}%`);
    console.log(`   ⏱️  Processing time: ${processingTime}ms`);
    
    // Check if we have any critical failures that should fail the entire process
    const hasCriticalFailures = state.failedActions.some(actionIndex => {
      const action = state.actionPlan.actions[actionIndex];
      return this.isCriticalAction(action, state);
    });
    
    if (hasCriticalFailures) {
      console.error('💥 Automation workflow completed with critical failures - marking as failed');
      return {
        ...state,
        endTime,
        isComplete: true,
        success: false,
        error: 'Critical actions failed during execution',
        reasoning: `Failed due to critical action failures. Completed ${state.completedActions.length}/${state.actionPlan.actions.length} actions with ${(successRate * 100).toFixed(1)}% success rate`
      };
    }
    
    return {
      ...state,
      endTime,
      isComplete: true,
      success: successRate > 0.5, // Consider successful if more than 50% actions succeeded
      reasoning: `Completed ${state.completedActions.length}/${state.actionPlan.actions.length} actions with ${(successRate * 100).toFixed(1)}% success rate`
    };
  }

  private async errorNode(state: SmartAgentState): Promise<SmartAgentState> {
    console.error('💥 Handling error:', state.error);
    
    return {
      ...state,
      isComplete: true,
      success: false,
      endTime: Date.now()
    };
  }

  private validateStepExecution(state: SmartAgentState): boolean {
    // Flexible step validation - allow intelligent adaptation
    const expectedIndex = state.completedActions.length + state.failedActions.length;
    
    // Allow some flexibility in step execution for intelligent adaptation
    const maxAllowedGap = 1; // Allow up to 1 step gap for intelligent adaptation
    const indexDifference = Math.abs(state.currentActionIndex - expectedIndex);
    
    if (indexDifference > maxAllowedGap) {
      console.warn(`⚠️  Step execution order deviation detected (${indexDifference} steps):`);
      console.warn(`   Expected action index: ${expectedIndex}`);
      console.warn(`   Current action index: ${state.currentActionIndex}`);
      console.warn(`   Completed actions: ${state.completedActions.length}`);
      console.warn(`   Failed actions: ${state.failedActions.length}`);
      console.warn(`   Allowing intelligent adaptation within ${maxAllowedGap} step gap`);
      
      // For small gaps, allow intelligent adaptation
      if (indexDifference <= maxAllowedGap) {
        console.log(`✅ Allowing intelligent adaptation within acceptable range`);
        return true;
      }
      
      return false;
    }
    
    // Check for significant gaps in completed actions (allow some flexibility)
    const allProcessedActions = [...state.completedActions, ...state.failedActions].sort((a, b) => a - b);
    let gapCount = 0;
    
    for (let i = 0; i < allProcessedActions.length; i++) {
      if (allProcessedActions[i] !== i) {
        gapCount++;
        if (gapCount > 1) { // Allow up to 1 gap for intelligent adaptation
          console.warn(`⚠️  Multiple gaps detected in action execution (${gapCount} gaps):`);
          console.warn(`   Missing action at index: ${i}`);
          console.warn(`   Found action at index: ${allProcessedActions[i]}`);
          console.warn(`   Allowing intelligent adaptation with ${gapCount} gaps`);
          return true; // Allow intelligent adaptation
        }
      }
    }
    
    return true;
  }

  private isCriticalAction(action: PuppeteerAction, state: SmartAgentState): boolean {
    // Navigation actions are always critical - if we can't navigate, we can't proceed
    if (action.type === 'navigate') {
      return true;
    }
    
    // First action in the plan is usually critical (often navigation)
    if (state.currentActionIndex === 0) {
      return true;
    }
    
    // High priority actions are critical
    if (action.priority === 'high') {
      return true;
    }
    
    // Actions that are prerequisites for subsequent actions
    if (action.prerequisites && action.prerequisites.length > 0) {
      return true;
    }
    
    // Actions with specific critical keywords in description
    const criticalKeywords = [
      'login', 'authenticate', 'navigate', 'go to', 'access', 'enter',
      'submit', 'confirm', 'proceed', 'continue', 'next step'
    ];
    
    const description = action.description.toLowerCase();
    const hasCriticalKeyword = criticalKeywords.some(keyword => 
      description.includes(keyword)
    );
    
    if (hasCriticalKeyword) {
      return true;
    }
    
    // If we've had too many failures already, subsequent actions become critical
    const failureRate = state.failedActions.length / (state.currentActionIndex + 1);
    if (failureRate > 0.5) {
      return true;
    }
    
    // Actions that are essential for the feature being demonstrated
    const featureKeywords = state.featureDocs.featureName.toLowerCase();
    if (description.includes(featureKeywords)) {
      return true;
    }
    
    return false;
  }

  // Public method to run the web automation agent
  async runWebAutomationAgent(
    actionPlan: ActionPlan,
    tourConfig: TourConfig,
    featureDocs: ProductDocs,
    credentials?: { username: string; password: string }
  ): Promise<DemoAutomationResult> {
    console.log('🤖 Starting Web Automation Agent...');
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
      
      // Run the LangGraph workflow
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
      console.error('Web Automation Agent failed:', error);
      
      return {
        success: false,
        tourSteps: [],
        totalSteps: 0,
        processingTime: 0,
        finalUrl: '',
        error: error instanceof Error ? error.message : 'Web Automation Agent failed',
        summary: {
          featuresCovered: [],
          actionsPerformed: [],
          successRate: 0
        }
      };
    }
  }


  async stopAutomationAgent(): Promise<void> {
    await this.puppeteerWorker.cleanup();
  }
}
