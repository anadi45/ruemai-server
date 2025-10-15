import { Injectable } from '@nestjs/common';
import { StateGraph, MemorySaver } from '@langchain/langgraph';
import { GeminiService } from './gemini.service';
import { PuppeteerWorkerService } from './puppeteer-worker.service';
import { IntelligentElementDiscoveryService } from './intelligent-element-discovery.service';
import { ActionLoggerService } from './action-logger.service';
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
} from '../types/demo-automation.types';

// Enhanced agent state for intelligent plan following
// SmartAgentState is now imported from types

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
    private puppeteerWorker: PuppeteerWorkerService,
    private elementDiscovery: IntelligentElementDiscoveryService,
    private actionLogger: ActionLoggerService
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
          console.log(`🧭 Navigation tool called with params:`, JSON.stringify(params, null, 2));
          console.log(`🧭 Navigating to: ${params.url}`);
          
          if (!params.url || params.url === 'undefined') {
            throw new Error(`Navigation URL is required but not provided. Received: "${params.url}"`);
          }
          
          await this.puppeteerWorker.navigateToUrl(params.url);
          
          if (params.waitFor) {
            console.log(`⏳ Waiting for element: ${params.waitFor}`);
            await this.puppeteerWorker.waitForElement(params.waitFor);
          }
          
          console.log(`✅ Navigation successful to: ${params.url}`);
          return { success: true, result: { url: params.url } };
        } catch (error) {
          console.error(`❌ Navigation failed:`, error);
          return { success: false, error: error instanceof Error ? error.message : 'Navigation failed' };
        }
      }
    });

    // Click Tool (Updated to use coordinate-based approach with fallback)
    this.tools.set('click', {
      name: 'click',
      description: 'Click on an element using coordinate-based detection with DOM fallback',
      parameters: { selector: 'string', fallbackAction: 'object', waitAfter: 'number', useCoordinates: 'boolean' },
      execute: async (params, state) => {
        try {
          let success = false;
          let selector = params.selector;
          let usedFallback = false;
          let usedCoordinates = false;
          
          // NEW: Try coordinate-based approach first if enabled
          if (params.useCoordinates !== false) {
            try {
              console.log('🎯 Attempting coordinate-based click...');
              
              // Take screenshot for coordinate detection
              const screenshotData = await this.puppeteerWorker.takeScreenshotForCoordinates();
              const currentUrl = this.puppeteerWorker.getCurrentUrl() || '';
              const pageTitle = await this.puppeteerWorker.getPageTitle() || '';
              
              // Use intelligent coordinate discovery
              const coordinateDiscovery = await this.elementDiscovery.discoverCoordinatesWithScreenshot(
                {
                  type: 'click_coordinates',
                  description: params.description || `Click on ${params.selector}`,
                  expectedOutcome: 'Element clicked successfully',
                  priority: 'high',
                  estimatedDuration: 2,
                  prerequisites: []
                },
                screenshotData.screenshot,
                currentUrl,
                pageTitle,
                screenshotData.viewport,
                state.currentContext
              );
              
              if (coordinateDiscovery.bestMatch && coordinateDiscovery.bestMatch.confidence > 0.3) {
                console.log(`✅ Coordinate-based click: (${coordinateDiscovery.bestMatch.x}, ${coordinateDiscovery.bestMatch.y})`);
                
                const clickResult = await this.puppeteerWorker.clickAtCoordinates(
                  coordinateDiscovery.bestMatch.x,
                  coordinateDiscovery.bestMatch.y
                );
                
                if (clickResult.success) {
                  success = true;
                  usedCoordinates = true;
                  console.log('✅ Coordinate-based click successful');
                }
              }
            } catch (coordinateError) {
              console.warn('Coordinate-based click failed, falling back to DOM approach:', coordinateError);
            }
          }
          
          // Fallback to DOM-based approach if coordinate approach failed
          if (!success) {
            try {
              console.log('🔄 Falling back to DOM-based click...');
              await this.puppeteerWorker.executeAction({
                type: 'click',
                selector: params.selector,
                description: `Click on ${params.selector}`
              });
              success = true;
            } catch (error) {
              // Try fallback action if provided
              if (params.fallbackAction) {
                try {
                  await this.puppeteerWorker.executeAction({
                    type: params.fallbackAction.type,
                    selector: params.fallbackAction.selector,
                    inputText: params.fallbackAction.inputText,
                    description: params.fallbackAction.description
                  });
                  success = true;
                  selector = params.fallbackAction.selector;
                  usedFallback = true;
                } catch (fallbackActionError) {
                  // Fallback action failed
                }
              }
            }
          }
          
          if (params.waitAfter) {
            await new Promise(resolve => setTimeout(resolve, params.waitAfter));
          }
          
          return { 
            success, 
            result: { 
              selector, 
              usedFallback, 
              usedCoordinates,
              method: usedCoordinates ? 'coordinates' : (usedFallback ? 'fallback' : 'dom')
            } 
          };
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
          console.log(`⏳ Wait tool params:`, JSON.stringify(params, null, 2));
          
          if (params.condition === 'element' && params.selector) {
            console.log(`⏳ Waiting for element: ${params.selector}`);
            const found = await this.puppeteerWorker.waitForElement(params.selector, params.duration * 1000);
            return { success: found, result: { condition: params.condition, selector: params.selector } };
          } else if (params.condition === 'navigation') {
            console.log(`⏳ Waiting for navigation`);
            const navigated = await this.puppeteerWorker.waitForNavigation(params.duration * 1000);
            return { success: navigated, result: { condition: params.condition } };
          } else {
            // Simple time-based wait
            const duration = params.duration || 1; // Default to 1 second if not specified
            console.log(`⏳ Waiting for ${duration} seconds`);
            await new Promise(resolve => setTimeout(resolve, duration * 1000));
            return { success: true, result: { duration: duration } };
          }
        } catch (error) {
          console.error(`❌ Wait tool failed:`, error);
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

    // Intelligent Element Discovery Tool
    this.tools.set('discover_element', {
      name: 'discover_element',
      description: 'Intelligently discover and correlate elements on the page based on action description using visual analysis',
      parameters: { actionDescription: 'string', actionType: 'string', context: 'string', screenshot: 'string', currentUrl: 'string', pageTitle: 'string', viewportDimensions: 'object' },
      execute: async (params, state) => {
        try {
          console.log(`🔍 Intelligent element discovery for: "${params.actionDescription}"`);
          
          // Create a mock action for discovery
          const mockAction: PuppeteerAction = {
            type: params.actionType as any,
            description: params.actionDescription,
            expectedOutcome: 'Element found and ready for interaction',
            priority: 'high',
            estimatedDuration: 5,
            prerequisites: []
          };
          
          // Try coordinate-based discovery first if viewport dimensions are available
          let coordinateDiscovery = null;
          if (params.viewportDimensions) {
            try {
              console.log(`🎯 Attempting coordinate-based discovery with viewport: ${params.viewportDimensions.width}x${params.viewportDimensions.height}`);
              coordinateDiscovery = await this.elementDiscovery.discoverCoordinatesWithScreenshot(
                mockAction,
                params.screenshot,
                params.currentUrl,
                params.pageTitle,
                params.viewportDimensions,
                params.context
              );
              
              if (coordinateDiscovery.bestMatch && coordinateDiscovery.bestMatch.confidence > 0.3) {
                console.log(`✅ Coordinate discovery successful: (${coordinateDiscovery.bestMatch.x}, ${coordinateDiscovery.bestMatch.y}) with confidence ${coordinateDiscovery.bestMatch.confidence}`);
                
                return { 
                  success: true, 
                  result: {
                    discovery: coordinateDiscovery,
                    recommendedSelector: `coordinates:${coordinateDiscovery.bestMatch.x},${coordinateDiscovery.bestMatch.y}`,
                    confidence: coordinateDiscovery.bestMatch.confidence,
                    reasoning: coordinateDiscovery.bestMatch.reasoning,
                    coordinates: {
                      x: coordinateDiscovery.bestMatch.x,
                      y: coordinateDiscovery.bestMatch.y,
                      confidence: coordinateDiscovery.bestMatch.confidence,
                      reasoning: coordinateDiscovery.bestMatch.reasoning
                    },
                    method: 'coordinates'
                  }
                };
              }
            } catch (coordinateError) {
              console.warn('Coordinate discovery failed, falling back to element discovery:', coordinateError);
            }
          }
          
          // Fallback to traditional element discovery
          const discovery = await this.elementDiscovery.discoverElementWithScreenshot(
            mockAction,
            params.screenshot,
            params.currentUrl,
            params.pageTitle,
            params.context
          );
          
          console.log(`🎯 Discovery result:`, {
            strategy: discovery.searchStrategy,
            foundElements: discovery.foundElements.length,
            bestMatch: discovery.bestMatch?.selector,
            confidence: discovery.bestMatch?.confidence
          });
          
          return { 
            success: discovery.bestMatch !== null, 
            result: {
              discovery,
              recommendedSelector: discovery.bestMatch?.selector,
              confidence: discovery.bestMatch?.confidence,
              reasoning: discovery.bestMatch?.reasoning,
              method: 'element'
            }
          };
        } catch (error) {
          console.error('Element discovery failed:', error);
          return { success: false, error: error instanceof Error ? error.message : 'Element discovery failed' };
        }
      }
    });

    // NEW: Coordinate-based Click Tool
    this.tools.set('click_coordinates', {
      name: 'click_coordinates',
      description: 'Click at specific coordinates using screenshot-based coordinate detection',
      parameters: { actionDescription: 'string', context: 'string', fallbackAction: 'object', waitAfter: 'number' },
      execute: async (params, state) => {
        try {
          console.log(`🎯 Coordinate-based click for: "${params.actionDescription}"`);
          
          // Take screenshot for coordinate detection
          const screenshotData = await this.puppeteerWorker.takeScreenshotForCoordinates();
          const currentUrl = this.puppeteerWorker.getCurrentUrl() || '';
          const pageTitle = await this.puppeteerWorker.getPageTitle() || '';
          
          // Use intelligent coordinate discovery
          const coordinateDiscovery = await this.elementDiscovery.discoverCoordinatesWithScreenshot(
            {
              type: 'click_coordinates',
              description: params.actionDescription,
              expectedOutcome: 'Element clicked successfully',
              priority: 'high',
              estimatedDuration: 2,
              prerequisites: []
            },
            screenshotData.screenshot,
            currentUrl,
            pageTitle,
            screenshotData.viewport,
            params.context || state.currentContext
          );
          
          if (coordinateDiscovery.bestMatch && coordinateDiscovery.bestMatch.confidence > 0.3) {
            console.log(`✅ Coordinates found: (${coordinateDiscovery.bestMatch.x}, ${coordinateDiscovery.bestMatch.y}) with confidence ${coordinateDiscovery.bestMatch.confidence}`);
            
            const clickResult = await this.puppeteerWorker.clickAtCoordinates(
              coordinateDiscovery.bestMatch.x,
              coordinateDiscovery.bestMatch.y
            );
            
            if (clickResult.success) {
              console.log('✅ Coordinate-based click successful');
              
              if (params.waitAfter) {
                await new Promise(resolve => setTimeout(resolve, params.waitAfter));
              }
              
              return { 
                success: true, 
                result: {
                  coordinates: { x: coordinateDiscovery.bestMatch.x, y: coordinateDiscovery.bestMatch.y },
                  confidence: coordinateDiscovery.bestMatch.confidence,
                  reasoning: coordinateDiscovery.bestMatch.reasoning,
                  method: 'coordinates'
                }
              };
            } else {
              console.error('❌ Coordinate click failed:', clickResult.error);
              
              // Try fallback action if provided
              if (params.fallbackAction) {
                console.log('🔄 Trying fallback action...');
                try {
                  await this.puppeteerWorker.executeAction({
                    type: params.fallbackAction.type,
                    selector: params.fallbackAction.selector,
                    inputText: params.fallbackAction.inputText,
                    description: params.fallbackAction.description
                  });
                  
                  return { 
                    success: true, 
                    result: {
                      method: 'fallback',
                      fallbackAction: params.fallbackAction
                    }
                  };
                } catch (fallbackError) {
                  console.error('❌ Fallback action also failed:', fallbackError);
                }
              }
            }
          } else {
            console.warn('⚠️  No suitable coordinates found or confidence too low');
            
            // Try fallback action if provided
            if (params.fallbackAction) {
              console.log('🔄 Trying fallback action...');
              try {
                await this.puppeteerWorker.executeAction({
                  type: params.fallbackAction.type,
                  selector: params.fallbackAction.selector,
                  inputText: params.fallbackAction.inputText,
                  description: params.fallbackAction.description
                });
                
                return { 
                  success: true, 
                  result: {
                    method: 'fallback',
                    fallbackAction: params.fallbackAction
                  }
                };
              } catch (fallbackError) {
                console.error('❌ Fallback action failed:', fallbackError);
              }
            }
          }
          
          return { 
            success: false, 
            error: 'No suitable coordinates found and no fallback available' 
          };
        } catch (error) {
          console.error('Coordinate-based click failed:', error);
          return { success: false, error: error instanceof Error ? error.message : 'Coordinate-based click failed' };
        }
      }
    });

    // Coordinate-based Type Tool
    this.tools.set('type_coordinates', {
      name: 'type_coordinates',
      description: 'Type text at specific coordinates using screenshot-based coordinate detection',
      parameters: { actionDescription: 'string', inputText: 'string', context: 'string', fallbackAction: 'object', waitAfter: 'number' },
      execute: async (params, state) => {
        try {
          console.log(`🎯 Coordinate-based type for: "${params.actionDescription}" with text: "${params.inputText}"`);
          
          // Take screenshot for coordinate detection
          const screenshotData = await this.puppeteerWorker.takeScreenshotForCoordinates();
          const currentUrl = this.puppeteerWorker.getCurrentUrl() || '';
          const pageTitle = await this.puppeteerWorker.getPageTitle() || '';
          
          // Use intelligent coordinate discovery
          const coordinateDiscovery = await this.elementDiscovery.discoverCoordinatesWithScreenshot(
            {
              type: 'type_coordinates',
              description: params.actionDescription,
              inputText: params.inputText,
              expectedOutcome: 'Text typed successfully',
              priority: 'high',
              estimatedDuration: 3,
              prerequisites: []
            },
            screenshotData.screenshot,
            currentUrl,
            pageTitle,
            screenshotData.viewport,
            params.context || state.currentContext
          );
          
          if (coordinateDiscovery.bestMatch && coordinateDiscovery.bestMatch.confidence > 0.3) {
            console.log(`✅ Coordinates found: (${coordinateDiscovery.bestMatch.x}, ${coordinateDiscovery.bestMatch.y}) with confidence ${coordinateDiscovery.bestMatch.confidence}`);
            
            const typeResult = await this.puppeteerWorker.executeAction({
              type: 'type_coordinates',
              coordinates: {
                x: coordinateDiscovery.bestMatch.x,
                y: coordinateDiscovery.bestMatch.y,
                confidence: coordinateDiscovery.bestMatch.confidence,
                reasoning: coordinateDiscovery.bestMatch.reasoning
              },
              inputText: params.inputText,
              description: params.actionDescription
            });
            
            if (typeResult.success) {
              console.log('✅ Coordinate-based type successful');
              
              if (params.waitAfter) {
                await new Promise(resolve => setTimeout(resolve, params.waitAfter));
              }
              
              return { 
                success: true, 
                result: {
                  coordinates: { x: coordinateDiscovery.bestMatch.x, y: coordinateDiscovery.bestMatch.y },
                  confidence: coordinateDiscovery.bestMatch.confidence,
                  reasoning: coordinateDiscovery.bestMatch.reasoning,
                  method: 'coordinates'
                }
              };
            }
          }
          
          return { 
            success: false, 
            error: 'No suitable coordinates found for typing' 
          };
        } catch (error) {
          console.error('Coordinate-based type failed:', error);
          return { success: false, error: error instanceof Error ? error.message : 'Coordinate-based type failed' };
        }
      }
    });

    // Coordinate-based Scroll Tool
    this.tools.set('scroll_coordinates', {
      name: 'scroll_coordinates',
      description: 'Scroll at specific coordinates using screenshot-based coordinate detection',
      parameters: { actionDescription: 'string', context: 'string', fallbackAction: 'object', waitAfter: 'number' },
      execute: async (params, state) => {
        try {
          console.log(`🎯 Coordinate-based scroll for: "${params.actionDescription}"`);
          
          // Take screenshot for coordinate detection
          const screenshotData = await this.puppeteerWorker.takeScreenshotForCoordinates();
          const currentUrl = this.puppeteerWorker.getCurrentUrl() || '';
          const pageTitle = await this.puppeteerWorker.getPageTitle() || '';
          
          // Use intelligent coordinate discovery
          const coordinateDiscovery = await this.elementDiscovery.discoverCoordinatesWithScreenshot(
            {
              type: 'scroll_coordinates',
              description: params.actionDescription,
              expectedOutcome: 'Page scrolled successfully',
              priority: 'medium',
              estimatedDuration: 2,
              prerequisites: []
            },
            screenshotData.screenshot,
            currentUrl,
            pageTitle,
            screenshotData.viewport,
            params.context || state.currentContext
          );
          
          if (coordinateDiscovery.bestMatch && coordinateDiscovery.bestMatch.confidence > 0.3) {
            console.log(`✅ Coordinates found: (${coordinateDiscovery.bestMatch.x}, ${coordinateDiscovery.bestMatch.y}) with confidence ${coordinateDiscovery.bestMatch.confidence}`);
            
            const scrollResult = await this.puppeteerWorker.executeAction({
              type: 'scroll_coordinates',
              coordinates: {
                x: coordinateDiscovery.bestMatch.x,
                y: coordinateDiscovery.bestMatch.y,
                confidence: coordinateDiscovery.bestMatch.confidence,
                reasoning: coordinateDiscovery.bestMatch.reasoning
              },
              description: params.actionDescription
            });
            
            if (scrollResult.success) {
              console.log('✅ Coordinate-based scroll successful');
              
              if (params.waitAfter) {
                await new Promise(resolve => setTimeout(resolve, params.waitAfter));
              }
              
              return { 
                success: true, 
                result: {
                  coordinates: { x: coordinateDiscovery.bestMatch.x, y: coordinateDiscovery.bestMatch.y },
                  confidence: coordinateDiscovery.bestMatch.confidence,
                  reasoning: coordinateDiscovery.bestMatch.reasoning,
                  method: 'coordinates'
                }
              };
            }
          }
          
          return { 
            success: false, 
            error: 'No suitable coordinates found for scrolling' 
          };
        } catch (error) {
          console.error('Coordinate-based scroll failed:', error);
          return { success: false, error: error instanceof Error ? error.message : 'Coordinate-based scroll failed' };
        }
      }
    });

    // Coordinate-based Select Tool
    this.tools.set('select_coordinates', {
      name: 'select_coordinates',
      description: 'Select option at specific coordinates using screenshot-based coordinate detection',
      parameters: { actionDescription: 'string', inputText: 'string', context: 'string', fallbackAction: 'object', waitAfter: 'number' },
      execute: async (params, state) => {
        try {
          console.log(`🎯 Coordinate-based select for: "${params.actionDescription}" with option: "${params.inputText}"`);
          
          // Take screenshot for coordinate detection
          const screenshotData = await this.puppeteerWorker.takeScreenshotForCoordinates();
          const currentUrl = this.puppeteerWorker.getCurrentUrl() || '';
          const pageTitle = await this.puppeteerWorker.getPageTitle() || '';
          
          // Use intelligent coordinate discovery
          const coordinateDiscovery = await this.elementDiscovery.discoverCoordinatesWithScreenshot(
            {
              type: 'select_coordinates',
              description: params.actionDescription,
              inputText: params.inputText,
              expectedOutcome: 'Option selected successfully',
              priority: 'high',
              estimatedDuration: 3,
              prerequisites: []
            },
            screenshotData.screenshot,
            currentUrl,
            pageTitle,
            screenshotData.viewport,
            params.context || state.currentContext
          );
          
          if (coordinateDiscovery.bestMatch && coordinateDiscovery.bestMatch.confidence > 0.3) {
            console.log(`✅ Coordinates found: (${coordinateDiscovery.bestMatch.x}, ${coordinateDiscovery.bestMatch.y}) with confidence ${coordinateDiscovery.bestMatch.confidence}`);
            
            const selectResult = await this.puppeteerWorker.executeAction({
              type: 'select_coordinates',
              coordinates: {
                x: coordinateDiscovery.bestMatch.x,
                y: coordinateDiscovery.bestMatch.y,
                confidence: coordinateDiscovery.bestMatch.confidence,
                reasoning: coordinateDiscovery.bestMatch.reasoning
              },
              inputText: params.inputText,
              description: params.actionDescription
            });
            
            if (selectResult.success) {
              console.log('✅ Coordinate-based select successful');
              
              if (params.waitAfter) {
                await new Promise(resolve => setTimeout(resolve, params.waitAfter));
              }
              
              return { 
                success: true, 
                result: {
                  coordinates: { x: coordinateDiscovery.bestMatch.x, y: coordinateDiscovery.bestMatch.y },
                  confidence: coordinateDiscovery.bestMatch.confidence,
                  reasoning: coordinateDiscovery.bestMatch.reasoning,
                  method: 'coordinates'
                }
              };
            }
          }
          
          return { 
            success: false, 
            error: 'No suitable coordinates found for selection' 
          };
        } catch (error) {
          console.error('Coordinate-based select failed:', error);
          return { success: false, error: error instanceof Error ? error.message : 'Coordinate-based select failed' };
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
            
            // Check if execution was stopped due to critical failure
            if (state.isComplete && !state.success) {
              console.error('💥 Agent execution stopped due to critical failure');
              break;
            }
            
            // Validate the action result
            state = await self.validateAction(state);
            
            // Check if validation stopped execution
            if (state.isComplete && !state.success) {
              console.error('💥 Agent execution stopped due to validation failure');
              break;
            }
            
            // Adapt if necessary
            state = await self.adaptStrategy(state);
            
            // Only increment if we're continuing (not stopped)
            if (!state.isComplete) {
              state.currentActionIndex++;
            }
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

  private async analyzeAndPlan(state: SmartAgentState): Promise<SmartAgentState> {
    console.log('🧠 Analyzing current state and planning next action...');
    
    try {
      // Take screenshot instead of getting DOM state
      const screenshot = await this.puppeteerWorker.takeScreenshot();
      const currentUrl = this.puppeteerWorker.getCurrentUrl() || '';
      const pageTitle = await this.puppeteerWorker.getPageTitle() || '';
      
      // Get the next action from the plan
      const nextAction = state.actionPlan.actions[state.currentActionIndex];
      
      if (!nextAction) {
        return {
          ...state,
          isComplete: true,
          reasoning: 'All actions in plan completed'
        };
      }
      
      // Build enhanced context with screenshot analysis
      let enhancedContext = state.currentContext;
      enhancedContext += `\n\nCurrent Page State:\n`;
      enhancedContext += `- URL: ${currentUrl}\n`;
      enhancedContext += `- Title: ${pageTitle}\n`;
      enhancedContext += `- Screenshot captured for visual analysis\n`;
      
      // Use Gemini to analyze the screenshot and determine if we should proceed
      const analysis = await this.geminiService.analyzeCurrentStateWithScreenshot(
        screenshot,
        currentUrl,
        pageTitle,
        nextAction,
        state.featureDocs,
        state.history,
        enhancedContext
      );
      
      return {
        ...state,
        currentContext: enhancedContext,
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
      
      // INTELLIGENT ELEMENT DISCOVERY - First try to discover the element intelligently using screenshot
      console.log(`🧠 Using intelligent element discovery for: "${nextAction.description}"`);
      
      // Take screenshot for visual analysis with coordinate detection
      const screenshotData = await this.puppeteerWorker.takeScreenshotForCoordinates();
      const currentUrl = this.puppeteerWorker.getCurrentUrl() || '';
      const pageTitle = await this.puppeteerWorker.getPageTitle() || '';
      
      console.log(`📸 Screenshot captured with dimensions: ${screenshotData.dimensions.width}x${screenshotData.dimensions.height}`);
      
      const discoveryResult = await this.tools.get('discover_element')!.execute({
        actionDescription: nextAction.description,
        actionType: nextAction.type,
        context: state.currentContext,
        screenshot: screenshotData.screenshot,
        currentUrl: currentUrl,
        pageTitle: pageTitle,
        viewportDimensions: screenshotData.dimensions
      }, state);
      
      let enhancedAction = { ...nextAction };
      
      if (discoveryResult.success && discoveryResult.result?.recommendedSelector) {
        console.log(`✅ Intelligent discovery found element: ${discoveryResult.result.recommendedSelector}`);
        console.log(`🎯 Confidence: ${discoveryResult.result.confidence}`);
        console.log(`💭 Reasoning: ${discoveryResult.result.reasoning}`);
        
        // Check if coordinates were discovered
        if (discoveryResult.result.method === 'coordinates' && discoveryResult.result.coordinates) {
          console.log(`🎯 Coordinate-based action detected: (${discoveryResult.result.coordinates.x}, ${discoveryResult.result.coordinates.y})`);
          
          // Update the action to use coordinate-based execution
          enhancedAction = {
            ...nextAction,
            type: `${nextAction.type}_coordinates` as any,
            coordinates: discoveryResult.result.coordinates,
            selector: discoveryResult.result.recommendedSelector
          };
        } else {
          // Update the action with the discovered selector
          enhancedAction = {
            ...nextAction,
            selector: discoveryResult.result.recommendedSelector
          };
        }
        
        // Store the discovery result for later use
        state.extractedData = {
          ...state.extractedData,
          lastElementDiscovery: discoveryResult.result
        };
      } else {
        console.log(`⚠️  Intelligent discovery failed, using original selector: ${nextAction.selector}`);
        
        // If no selector is available, try to generate one from the description
        if (!enhancedAction.selector) {
          console.log(`🔧 No selector available, generating from description: "${nextAction.description}"`);
          enhancedAction.selector = this.generateSelectorFromDescription(nextAction.description);
        }
      }
      
      // Map action type to tool
      const toolName = this.mapActionToTool(enhancedAction.type);
      const tool = this.tools.get(toolName);
      
      if (!tool) {
        throw new Error(`No tool available for action type: ${enhancedAction.type}`);
      }
      
      // Prepare tool parameters with the enhanced action
      const toolParams = this.prepareToolParameters(enhancedAction, state);
      
      console.log(`🛠️  Executing tool: ${toolName}`);
      console.log(`📋 Action: ${enhancedAction.type} - ${enhancedAction.description}`);
      console.log(`🎯 Using selector: ${enhancedAction.selector}`);
      console.log(`🔧 Tool params:`, JSON.stringify(toolParams, null, 2));
      
      // Log action start
      const actionId = this.actionLogger.logActionStart(
        enhancedAction,
        {
          currentUrl,
          pageTitle,
          domState: state.domState
        },
        {
          workflowType: 'smart-agent',
          retryCount: state.retryCount,
          maxRetries: state.maxRetries
        }
      );
      
      // Execute the tool with fallback handling
      let result = await tool.execute(toolParams, state);
      
      // If primary action fails, try fallback or create intelligent fallback
      if (!result.success) {
        let fallbackAction = nextAction.fallbackAction;
        
        // If no fallback exists, create an intelligent one
        if (!fallbackAction) {
          console.log('🧠 No fallback action provided, creating intelligent fallback...');
          fallbackAction = this.createIntelligentFallback(nextAction, state);
        }
        
        if (fallbackAction) {
          console.log(`🔄 Primary action failed, trying fallback: ${fallbackAction.type}`);
          console.log(`📋 Fallback action: ${fallbackAction.description}`);
          
          // If fallback is navigate and no URL provided, construct intelligent URL
          if (fallbackAction.type === 'navigate' && !fallbackAction.inputText) {
            const currentUrl = this.puppeteerWorker.getCurrentUrl() || state.goal;
            const intelligentUrl = this.constructFallbackUrl(nextAction, currentUrl);
            fallbackAction.inputText = intelligentUrl;
            console.log(`🔗 Constructed intelligent fallback URL: ${intelligentUrl}`);
          }
          
          // Prepare fallback tool parameters
          const fallbackParams = this.prepareToolParameters(fallbackAction, state);
          console.log(`🔧 Fallback params:`, JSON.stringify(fallbackParams, null, 2));
        
          // Map fallback action type to tool
          const fallbackToolName = this.mapActionToTool(fallbackAction.type);
          const fallbackTool = this.tools.get(fallbackToolName);
          
          if (fallbackTool) {
            console.log(`🛠️  Executing fallback tool: ${fallbackToolName}`);
            result = await fallbackTool.execute(fallbackParams, state);
            
            // Log fallback usage
            this.actionLogger.logFallbackUsed(
              actionId,
              fallbackAction,
              result.success,
              result.error
            );
            
            if (result.success) {
              console.log('✅ Fallback action successful');
            } else {
              console.log('❌ Fallback action also failed:', result.error);
            }
          } else {
            console.log(`❌ No fallback tool available for: ${fallbackAction.type}`);
          }
        }
      }
      
      if (result.success) {
        console.log('✅ Tool execution successful');
        
        // Take screenshot after successful tool execution for visual analysis
        console.log('📸 Taking screenshot for visual analysis...');
        const screenshot = await this.puppeteerWorker.takeScreenshot();
        const currentUrl = this.puppeteerWorker.getCurrentUrl() || '';
        const pageTitle = await this.puppeteerWorker.getPageTitle() || '';
        
        // Log action completion
        this.actionLogger.logActionComplete(actionId, true);
        
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
        
        // Log action failure
        this.actionLogger.logActionComplete(actionId, false, result.error);
        
        // Check if this is a critical action that should stop the agent
        const isCriticalAction = this.isCriticalAction(nextAction, state);
        
        if (isCriticalAction) {
          console.log(`🚨 CRITICAL ACTION DETECTED: ${nextAction.type} - ${nextAction.description}`);
          console.error('💥 CRITICAL ACTION FAILED - STOPPING AGENT EXECUTION');
          console.error(`Critical action: ${nextAction.type} - ${nextAction.description}`);
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
            tooltip: 'Critical action failed - stopping execution',
            timestamp: Date.now(),
            success: false,
            errorMessage: `CRITICAL FAILURE (STOPPING): ${result.error}`
          };
          
          return {
            ...state,
            failedActions: [...state.failedActions, state.currentActionIndex],
            tourSteps: [...state.tourSteps, tourStep],
            isComplete: true,
            success: false,
            error: `Critical action failed: ${nextAction.type} - ${result.error}`,
            endTime: Date.now()
          };
        }
        
        // For non-critical actions, continue but mark as failed
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
          tooltip: 'Action failed - continuing',
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
      
      // Check if this is a critical action
      const nextAction = state.actionPlan.actions[state.currentActionIndex];
      const isCriticalAction = this.isCriticalAction(nextAction, state);
      
      if (isCriticalAction) {
        console.error('💥 CRITICAL ACTION EXCEPTION - STOPPING AGENT EXECUTION');
        console.error(`Critical action exception: ${error instanceof Error ? error.message : 'Critical tool execution failed'}`);
        
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
          tooltip: 'Critical action exception - stopping execution',
          timestamp: Date.now(),
          success: false,
          errorMessage: `CRITICAL EXCEPTION (STOPPING): ${error instanceof Error ? error.message : 'Critical tool execution failed'}`
        };
        
        return {
          ...state,
          failedActions: [...state.failedActions, state.currentActionIndex],
          tourSteps: [...state.tourSteps, tourStep],
          isComplete: true,
          success: false,
          error: `Critical action exception: ${error instanceof Error ? error.message : 'Critical tool execution failed'}`,
          endTime: Date.now()
        };
      }
      
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
        nextAction.expectedOutcome
      );
      
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
          console.error('💥 CRITICAL ACTION VALIDATION FAILED - STOPPING AGENT EXECUTION');
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
            tooltip: 'Critical action validation failed - stopping execution',
            timestamp: Date.now(),
            success: false,
            errorMessage: `CRITICAL VALIDATION FAILURE (STOPPING): ${validationReasoning}`
          };
          
          return {
            ...state,
            failedActions: [...state.failedActions, state.currentActionIndex],
            tourSteps: [...state.tourSteps, tourStep],
            isComplete: true,
            success: false,
            error: `Critical action validation failed: ${nextAction.type} - ${validation.reasoning}`,
            endTime: Date.now()
          };
        }
        
        // For non-critical actions, check retry count
        if (state.retryCount < state.maxRetries) {
          console.log('🔄 Action validation failed, will retry...');
          return {
            ...state,
            retryCount: state.retryCount + 1,
            currentActionIndex: state.currentActionIndex - 1 // Retry the same action
          };
        } else {
          console.log('⚠️  Non-critical action validation failed, continuing...');
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
    
    // Check if we have any critical failures that should fail the entire process
    const hasCriticalFailures = state.failedActions.some(actionIndex => {
      const action = state.actionPlan.actions[actionIndex];
      return this.isCriticalAction(action, state);
    });
    
    if (hasCriticalFailures) {
      console.error('💥 Workflow completed with critical failures - marking as failed');
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
      'click': 'click', // Uses coordinate-based approach with DOM fallback
      'click_coordinates': 'click_coordinates', // Pure coordinate-based approach
      'type': 'type',
      'type_coordinates': 'type_coordinates', // Pure coordinate-based typing
      'navigate': 'navigate',
      'wait': 'wait',
      'scroll': 'scroll_coordinates', // Use coordinate-based scrolling
      'scroll_coordinates': 'scroll_coordinates', // Pure coordinate-based scrolling
      'select': 'select_coordinates', // Use coordinate-based selection
      'select_coordinates': 'select_coordinates', // Pure coordinate-based selection
      'hover': 'click', // Map hover to click (coordinate-based)
      'hover_coordinates': 'click_coordinates', // Pure coordinate-based hover
      'extract': 'extract',
      'evaluate': 'evaluate'
    };
    
    return mapping[actionType] || 'click';
  }

  private validateStepExecution(state: SmartAgentState): boolean {
    // Check if we're executing steps in the correct order
    const expectedIndex = state.completedActions.length + state.failedActions.length;
    
    if (state.currentActionIndex !== expectedIndex) {
      console.error(`❌ Step execution order violation detected:`);
      console.error(`   Expected action index: ${expectedIndex}`);
      console.error(`   Current action index: ${state.currentActionIndex}`);
      console.error(`   Completed actions: ${state.completedActions.length}`);
      console.error(`   Failed actions: ${state.failedActions.length}`);
      return false;
    }
    
    // Check for gaps in completed actions
    const allProcessedActions = [...state.completedActions, ...state.failedActions].sort((a, b) => a - b);
    for (let i = 0; i < allProcessedActions.length; i++) {
      if (allProcessedActions[i] !== i) {
        console.error(`❌ Gap detected in action execution:`);
        console.error(`   Missing action at index: ${i}`);
        console.error(`   Found action at index: ${allProcessedActions[i]}`);
        return false;
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

  private prepareToolParameters(action: PuppeteerAction, state: SmartAgentState): any {
    const baseParams = {
      selector: action.selector,
      fallbackAction: action.fallbackAction,
      inputText: action.inputText,
      description: action.description
    };
    
    switch (action.type) {
      case 'navigate':
        // For navigation, use the goal URL from state, action inputText, or action selector
        let url = action.inputText || action.selector || state.goal;
        
        // If still no URL, try to extract from the action description or use a default
        if (!url) {
          // Try to extract URL from description (e.g., "Navigate to https://example.com")
          const urlMatch = action.description.match(/https?:\/\/[^\s]+/);
          if (urlMatch) {
            url = urlMatch[0];
          } else {
            // Use a default URL based on the goal or feature
            url = state.goal || 'https://app.gorattle.com';
          }
        }
        
        // Ensure URL has proper protocol
        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
          // If it looks like a domain, add https://
          if (url.includes('.') && !url.includes(' ')) {
            url = `https://${url}`;
          }
        }
        
        console.log(`🧭 Navigation URL resolution:`);
        console.log(`   Action inputText: "${action.inputText}"`);
        console.log(`   Action selector: "${action.selector}"`);
        console.log(`   State goal: "${state.goal}"`);
        console.log(`   Resolved URL: "${url}"`);
        console.log(`   Action description: "${action.description}"`);
        console.log(`   Action type: "${action.type}"`);
        
        if (!url) {
          throw new Error('No URL available for navigation action');
        }
        
        return {
          url: url,
          waitFor: action.waitCondition
        };
      
      case 'click':
        return {
          selector: action.selector,
          fallbackAction: action.fallbackAction,
          waitAfter: action.estimatedDuration * 1000,
          useCoordinates: true, // Enable coordinate-based approach by default
          description: action.description
        };
      
      case 'click_coordinates':
        return {
          actionDescription: action.description,
          context: state.currentContext,
          fallbackAction: action.fallbackAction,
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

  private createIntelligentFallback(action: PuppeteerAction, state: SmartAgentState): PuppeteerAction | null {
    console.log('🧠 Creating intelligent fallback action...');
    
    // Determine fallback type based on action type
    let fallbackType: 'navigate' | 'click' | 'wait' | 'type' | 'retry' = 'navigate';
    let fallbackDescription = '';
    let fallbackSelector = '';
    let fallbackInputText = '';
    
    switch (action.type) {
      case 'click':
        // If clicking a navigation element, fallback to direct navigation
        if (action.description.toLowerCase().includes('workflow') || 
            action.description.toLowerCase().includes('dashboard') ||
            action.description.toLowerCase().includes('setting') ||
            action.description.toLowerCase().includes('profile') ||
            action.description.toLowerCase().includes('help') ||
            action.description.toLowerCase().includes('home') ||
            action.description.toLowerCase().includes('login')) {
          fallbackType = 'navigate';
          const currentUrl = this.puppeteerWorker.getCurrentUrl() || state.goal;
          fallbackInputText = this.constructFallbackUrl(action, currentUrl);
          fallbackDescription = `Navigate directly to ${fallbackInputText}`;
        } else {
          // For other clicks, try alternative selector
          fallbackType = 'click';
          fallbackSelector = action.selector?.replace(/\[.*?\]/, '') || action.selector || '';
          fallbackDescription = `Try alternative selector for ${action.description}`;
        }
        break;
        
      case 'navigate':
        // If navigation fails, try alternative URL
        fallbackType = 'navigate';
        const currentUrl = this.puppeteerWorker.getCurrentUrl() || state.goal;
        fallbackInputText = this.constructFallbackUrl(action, currentUrl);
        fallbackDescription = `Try alternative URL: ${fallbackInputText}`;
        break;
        
      case 'wait':
        // If waiting fails, try shorter wait or different element
        fallbackType = 'wait';
        fallbackSelector = action.selector || 'body';
        fallbackDescription = `Wait for alternative element: ${fallbackSelector}`;
        break;
        
      case 'type':
        // If typing fails, try alternative input field
        fallbackType = 'type';
        fallbackSelector = action.selector?.replace(/\[.*?\]/, '') || action.selector || '';
        fallbackInputText = action.inputText || '';
        fallbackDescription = `Try alternative input field for ${action.description}`;
        break;
        
      default:
        // Default to retry
        fallbackType = 'retry';
        fallbackDescription = `Retry ${action.type} action`;
        break;
    }
    
    if (fallbackType === 'retry') {
      return null; // No meaningful fallback for retry
    }
    
    return {
      type: fallbackType,
      selector: fallbackSelector || undefined,
      inputText: fallbackInputText || undefined,
      description: fallbackDescription,
      expectedOutcome: `Fallback: ${action.expectedOutcome}`,
      priority: 'medium',
      estimatedDuration: action.estimatedDuration,
      prerequisites: []
    };
  }

  private constructFallbackUrl(action: PuppeteerAction, currentUrl: string): string {
    console.log('🔗 Constructing intelligent fallback URL...');
    
    let baseUrl: string;
    
    try {
      // Extract base URL from current URL
      const url = new URL(currentUrl);
      baseUrl = `${url.protocol}//${url.host}`;
    } catch (error) {
      // If current URL is invalid, use a default base URL
      console.warn('Invalid current URL, using default base URL:', currentUrl);
      baseUrl = 'https://app.gorattle.com';
    }
    
    // Intelligent URL construction based on action description and common patterns
    const description = action.description.toLowerCase();
    
    // Navigation patterns
    if (description.includes('workflow') || description.includes('workflows')) {
      return `${baseUrl}/workflows`;
    } else if (description.includes('dashboard')) {
      return `${baseUrl}/dashboard`;
    } else if (description.includes('setting') || description.includes('settings')) {
      return `${baseUrl}/settings`;
    } else if (description.includes('profile') || description.includes('account')) {
      return `${baseUrl}/profile`;
    } else if (description.includes('help') || description.includes('support')) {
      return `${baseUrl}/help`;
    } else if (description.includes('home')) {
      return `${baseUrl}/home`;
    } else if (description.includes('login') || description.includes('sign in')) {
      return `${baseUrl}/login`;
    } else if (description.includes('create') || description.includes('new')) {
      return `${baseUrl}/create`;
    } else if (description.includes('edit') || description.includes('modify')) {
      return `${baseUrl}/edit`;
    } else if (description.includes('view') || description.includes('show')) {
      return `${baseUrl}/view`;
    } else if (description.includes('search') || description.includes('find')) {
      return `${baseUrl}/search`;
    } else if (description.includes('export') || description.includes('download')) {
      return `${baseUrl}/export`;
    } else if (description.includes('import') || description.includes('upload')) {
      return `${baseUrl}/import`;
    } else if (description.includes('save') || description.includes('submit')) {
      return `${baseUrl}/save`;
    } else if (description.includes('cancel')) {
      return `${baseUrl}/cancel`;
    } else if (description.includes('delete') || description.includes('remove')) {
      return `${baseUrl}/delete`;
    } else if (description.includes('filter') || description.includes('sort')) {
      return `${baseUrl}/filter`;
    } else if (description.includes('back') || description.includes('previous')) {
      // Try to go back to parent directory
      try {
        const currentUrlObj = new URL(currentUrl);
        const pathParts = currentUrlObj.pathname.split('/').filter(part => part);
        if (pathParts.length > 1) {
          pathParts.pop(); // Remove last segment
          return `${baseUrl}/${pathParts.join('/')}`;
        }
      } catch (error) {
        // If URL parsing fails, just go to root
      }
      return `${baseUrl}/`;
    } else if (description.includes('next') || description.includes('continue')) {
      // Try to increment or go to next page
      return `${baseUrl}/next`;
    }
    
    // Default fallback - try to construct from action description
    const words = description.split(' ').filter(word => 
      word.length > 2 && 
      !['the', 'and', 'or', 'but', 'for', 'with', 'from', 'to', 'in', 'on', 'at', 'by'].includes(word)
    );
    
    if (words.length > 0) {
      const primaryWord = words[0];
      return `${baseUrl}/${primaryWord}`;
    }
    
    // Ultimate fallback
    return `${baseUrl}/`;
  }

  private async analyzeDOMChanges(
    previousState: DOMState | undefined,
    currentState: DOMState,
    action: PuppeteerAction
  ): Promise<DOMAnalysis> {
    console.log('🔍 Analyzing DOM changes after action execution...');
    
    const analysis: DOMAnalysis = {
      urlChanged: false,
      titleChanged: false,
      newElements: [],
      removedElements: [],
      newClickableElements: [],
      newInputElements: [],
      pageLoadComplete: true,
      hasErrors: false,
      errorMessages: [],
      newContent: [],
      actionImpact: '',
      nextActionRecommendations: []
    };

    if (!previousState) {
      analysis.actionImpact = 'Initial page load';
      analysis.nextActionRecommendations = ['Wait for page to fully load', 'Identify main navigation elements'];
      return analysis;
    }

    // Check URL changes
    analysis.urlChanged = previousState.currentUrl !== currentState.currentUrl;
    analysis.titleChanged = previousState.pageTitle !== currentState.pageTitle;

    // Analyze new and removed elements
    const previousClickable = new Set(previousState.clickableSelectors);
    const currentClickable = new Set(currentState.clickableSelectors);
    
    const previousInput = new Set(previousState.inputSelectors);
    const currentInput = new Set(currentState.inputSelectors);

    // Find new clickable elements
    for (const selector of currentClickable) {
      if (!previousClickable.has(selector)) {
        analysis.newClickableElements.push(selector);
      }
    }

    // Find new input elements
    for (const selector of currentInput) {
      if (!previousInput.has(selector)) {
        analysis.newInputElements.push(selector);
      }
    }

    // Find removed elements
    for (const selector of previousClickable) {
      if (!currentClickable.has(selector)) {
        analysis.removedElements.push(selector);
      }
    }

    // Analyze new content
    const previousText = new Set(previousState.visibleText);
    const currentText = new Set(currentState.visibleText);
    
    for (const text of currentText) {
      if (!previousText.has(text)) {
        analysis.newContent.push(text);
      }
    }

    // Check for error messages
    const errorIndicators = [
      'error', 'Error', 'ERROR',
      'failed', 'Failed', 'FAILED',
      'invalid', 'Invalid', 'INVALID',
      'not found', 'Not Found', 'NOT FOUND',
      'unauthorized', 'Unauthorized', 'UNAUTHORIZED',
      'forbidden', 'Forbidden', 'FORBIDDEN',
      'timeout', 'Timeout', 'TIMEOUT'
    ];

    for (const text of currentState.visibleText) {
      for (const indicator of errorIndicators) {
        if (text.includes(indicator)) {
          analysis.hasErrors = true;
          analysis.errorMessages.push(text);
          break;
        }
      }
    }

    // Determine action impact
    if (analysis.urlChanged) {
      analysis.actionImpact = `Navigation successful - moved from ${previousState.currentUrl} to ${currentState.currentUrl}`;
    } else if (action.type === 'click' && analysis.newClickableElements.length > 0) {
      analysis.actionImpact = 'Click action revealed new interactive elements';
    } else if (action.type === 'type' && analysis.newInputElements.length > 0) {
      analysis.actionImpact = 'Type action revealed new input fields';
    } else if (analysis.newContent.length > 0) {
      analysis.actionImpact = 'Action revealed new content on the page';
    } else {
      analysis.actionImpact = 'Action completed but no significant changes detected';
    }

    // Generate next action recommendations
    if (analysis.hasErrors) {
      analysis.nextActionRecommendations.push('Handle error messages before proceeding');
    }
    
    if (analysis.urlChanged) {
      analysis.nextActionRecommendations.push('Wait for new page to load completely');
    }
    
    if (analysis.newClickableElements.length > 0) {
      analysis.nextActionRecommendations.push('Consider clicking on newly available elements');
    }
    
    if (analysis.newInputElements.length > 0) {
      analysis.nextActionRecommendations.push('Consider filling newly available input fields');
    }

    console.log('📊 DOM Analysis completed:', {
      urlChanged: analysis.urlChanged,
      newClickableElements: analysis.newClickableElements.length,
      newInputElements: analysis.newInputElements.length,
      hasErrors: analysis.hasErrors,
      actionImpact: analysis.actionImpact
    });

    return analysis;
  }

  async stopAgent(): Promise<void> {
    await this.puppeteerWorker.cleanup();
  }

  /**
   * Generate a selector from action description as a fallback
   */
  private generateSelectorFromDescription(description: string): string {
    console.log(`🔧 Generating selector from description: "${description}"`);
    
    const desc = description.toLowerCase();
    
    // Extract key terms
    const words = desc.split(/\s+/).filter(word => 
      word.length > 2 && 
      !['click', 'on', 'the', 'button', 'link', 'element', 'in', 'left', 'right', 'top', 'bottom'].includes(word)
    );
    
    if (words.length === 0) {
      return 'button'; // Fallback to generic button
    }
    
    const primaryWord = words[0];
    
    // Generate selectors based on common patterns
    const selectors = [
      `button:contains("${primaryWord}")`,
      `a:contains("${primaryWord}")`,
      `[role="button"]:contains("${primaryWord}")`,
      `*:contains("${primaryWord}")`
    ];
    
    // If it's a navigation element, try more specific patterns
    if (desc.includes('workflow') || desc.includes('workflows')) {
      selectors.unshift('a[href*="workflow"]', 'button:contains("Workflow")');
    } else if (desc.includes('dashboard')) {
      selectors.unshift('a[href*="dashboard"]', 'button:contains("Dashboard")');
    } else if (desc.includes('setting') || desc.includes('settings')) {
      selectors.unshift('a[href*="setting"]', 'button:contains("Setting")');
    }
    
    // If it's a sidebar/navigation element
    if (desc.includes('left') || desc.includes('sidebar') || desc.includes('nav')) {
      selectors.unshift('nav a', '.sidebar a', '.nav a');
    }
    
    console.log(`🔧 Generated selectors: ${selectors.join(', ')}`);
    return selectors[0]; // Return the first (most specific) selector
  }
}
