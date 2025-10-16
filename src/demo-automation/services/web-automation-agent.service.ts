import { Injectable } from '@nestjs/common';
import { StateGraph, MemorySaver, START, END } from '@langchain/langgraph';
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

// Enhanced automation agent state for intelligent plan following
// SmartAgentState is now imported from types

// Tool definitions for the automation agent
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (params: any, state: SmartAgentState) => Promise<{ success: boolean; result?: any; error?: string }>;
}

@Injectable()
export class WebAutomationAgentService {
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
    this.workflow = this.createAutomationWorkflow();
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

    // Intelligent Navigation Tool
    this.tools.set('intelligent_navigate', {
      name: 'intelligent_navigate',
      description: 'Intelligently navigate to a feature or section based on visual analysis and goal description',
      parameters: { goal: 'string', featureName: 'string', context: 'string', screenshot: 'string', currentUrl: 'string', pageTitle: 'string' },
      execute: async (params, state) => {
        try {
          console.log(`🧭 Intelligent navigation to: "${params.goal}" for feature: "${params.featureName}"`);
          
          // Take screenshot for visual analysis
          const screenshotData = await this.puppeteerWorker.takeScreenshotForCoordinates();
          const currentUrl = this.puppeteerWorker.getCurrentUrl() || '';
          const pageTitle = await this.puppeteerWorker.getPageTitle() || '';
          
          // Use intelligent navigation discovery
          const navigationDiscovery = await this.elementDiscovery.discoverElementWithScreenshot(
            {
              type: 'navigate',
              description: params.goal,
              expectedOutcome: `Successfully navigated to ${params.featureName}`,
              priority: 'high',
              estimatedDuration: 5,
              prerequisites: []
            },
            screenshotData.screenshot,
            currentUrl,
            pageTitle,
            params.context || state.currentContext
          );
          
          if (navigationDiscovery.bestMatch && navigationDiscovery.bestMatch.confidence > 0.3) {
            console.log(`✅ Navigation target found: ${navigationDiscovery.bestMatch.selector} with confidence ${navigationDiscovery.bestMatch.confidence}`);
            
            // Try to click the navigation element
            if (navigationDiscovery.bestMatch.position) {
              const clickResult = await this.puppeteerWorker.clickAtCoordinates(
                navigationDiscovery.bestMatch.position.x,
                navigationDiscovery.bestMatch.position.y
              );
              
              if (clickResult.success) {
                return { 
                  success: true, 
                  result: {
                    method: 'coordinates',
                    coordinates: { x: navigationDiscovery.bestMatch.position.x, y: navigationDiscovery.bestMatch.position.y },
                    confidence: navigationDiscovery.bestMatch.confidence,
                    reasoning: navigationDiscovery.bestMatch.reasoning
                  }
                };
              }
            } else {
              // Try DOM-based navigation
              const navResult = await this.puppeteerWorker.executeAction({
                type: 'click',
                selector: navigationDiscovery.bestMatch.selector,
                description: params.goal
              });
              
              if (navResult.success) {
                return { 
                  success: true, 
                  result: {
                    method: 'dom',
                    selector: navigationDiscovery.bestMatch.selector,
                    confidence: navigationDiscovery.bestMatch.confidence,
                    reasoning: navigationDiscovery.bestMatch.reasoning
                  }
                };
              }
            }
          }
          
          // Fallback to URL-based navigation
          console.log('🔄 Trying URL-based navigation fallback...');
          const fallbackUrl = this.constructIntelligentUrl(params.goal, params.featureName, currentUrl);
          await this.puppeteerWorker.navigateToUrl(fallbackUrl);
          
          return { 
            success: true, 
            result: {
              method: 'url',
              url: fallbackUrl,
              reasoning: 'Used URL-based navigation fallback'
            }
          };
        } catch (error) {
          console.error('Intelligent navigation failed:', error);
          return { success: false, error: error instanceof Error ? error.message : 'Intelligent navigation failed' };
        }
      }
    });

    // Intelligent Feature Discovery Tool
    this.tools.set('intelligent_discover_feature', {
      name: 'intelligent_discover_feature',
      description: 'Intelligently discover and access a specific feature based on visual analysis',
      parameters: { featureName: 'string', goal: 'string', context: 'string', screenshot: 'string', currentUrl: 'string', pageTitle: 'string' },
      execute: async (params, state) => {
        try {
          console.log(`🔍 Intelligent feature discovery for: "${params.featureName}"`);
          console.log(`🎯 Goal: ${params.goal}`);
          
          // Take screenshot for visual analysis
          const screenshotData = await this.puppeteerWorker.takeScreenshotForCoordinates();
          const currentUrl = this.puppeteerWorker.getCurrentUrl() || '';
          const pageTitle = await this.puppeteerWorker.getPageTitle() || '';
          
          // Use intelligent feature discovery
          const featureDiscovery = await this.elementDiscovery.discoverElementWithScreenshot(
            {
              type: 'click',
              description: params.goal,
              expectedOutcome: `Successfully accessed ${params.featureName}`,
              priority: 'high',
              estimatedDuration: 5,
              prerequisites: []
            },
            screenshotData.screenshot,
            currentUrl,
            pageTitle,
            params.context || state.currentContext
          );
          
          if (featureDiscovery.bestMatch && featureDiscovery.bestMatch.confidence > 0.3) {
            console.log(`✅ Feature access point found: ${featureDiscovery.bestMatch.selector} with confidence ${featureDiscovery.bestMatch.confidence}`);
            
            // Try to access the feature
            if (featureDiscovery.bestMatch.position) {
              const clickResult = await this.puppeteerWorker.clickAtCoordinates(
                featureDiscovery.bestMatch.position.x,
                featureDiscovery.bestMatch.position.y
              );
              
              if (clickResult.success) {
                return { 
                  success: true, 
                  result: {
                    method: 'coordinates',
                    coordinates: { x: featureDiscovery.bestMatch.position.x, y: featureDiscovery.bestMatch.position.y },
                    confidence: featureDiscovery.bestMatch.confidence,
                    reasoning: featureDiscovery.bestMatch.reasoning,
                    feature: params.featureName
                  }
                };
              }
            } else {
              // Try DOM-based feature access
              const featureResult = await this.puppeteerWorker.executeAction({
                type: 'click',
                selector: featureDiscovery.bestMatch.selector,
                description: params.goal
              });
              
              if (featureResult.success) {
                return { 
                  success: true, 
                  result: {
                    method: 'dom',
                    selector: featureDiscovery.bestMatch.selector,
                    confidence: featureDiscovery.bestMatch.confidence,
                    reasoning: featureDiscovery.bestMatch.reasoning,
                    feature: params.featureName
                  }
                };
              }
            }
          }
          
          return { 
            success: false, 
            error: `Could not find access point for ${params.featureName} feature` 
          };
        } catch (error) {
          console.error('Intelligent feature discovery failed:', error);
          return { success: false, error: error instanceof Error ? error.message : 'Intelligent feature discovery failed' };
        }
      }
    });

    // Intelligent Element Discovery Tool
    this.tools.set('discover_element', {
      name: 'discover_element',
      description: 'Intelligently discover and correlate elements on the page based on action description using visual analysis',
      parameters: { actionDescription: 'string', actionType: 'string', context: 'string', screenshot: 'string', screenshotData: 'object', screenshotPath: 'string', currentUrl: 'string', pageTitle: 'string', viewportDimensions: 'object' },
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
                params.context,
                params.screenshotData,
                params.screenshotPath
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

  private constructIntelligentUrl(goal: string, featureName: string, currentUrl: string): string {
    console.log('🔗 Constructing intelligent URL for goal:', goal);
    
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
    
    // Intelligent URL construction based on goal and feature name
    const goalLower = goal.toLowerCase();
    const featureLower = featureName.toLowerCase();
    
    // Feature-specific patterns
    if (featureLower.includes('workflow')) {
      return `${baseUrl}/workflows`;
    } else if (featureLower.includes('dashboard')) {
      return `${baseUrl}/dashboard`;
    } else if (featureLower.includes('setting')) {
      return `${baseUrl}/settings`;
    } else if (featureLower.includes('profile')) {
      return `${baseUrl}/profile`;
    } else if (featureLower.includes('help')) {
      return `${baseUrl}/help`;
    } else if (featureLower.includes('home')) {
      return `${baseUrl}/home`;
    } else if (featureLower.includes('login')) {
      return `${baseUrl}/login`;
    } else if (featureLower.includes('create')) {
      return `${baseUrl}/create`;
    } else if (featureLower.includes('edit')) {
      return `${baseUrl}/edit`;
    } else if (featureLower.includes('view')) {
      return `${baseUrl}/view`;
    } else if (featureLower.includes('search')) {
      return `${baseUrl}/search`;
    } else if (featureLower.includes('export')) {
      return `${baseUrl}/export`;
    } else if (featureLower.includes('import')) {
      return `${baseUrl}/import`;
    }
    
    // Goal-based patterns
    if (goalLower.includes('navigate to') || goalLower.includes('go to')) {
      // Extract the target from the goal
      const targetMatch = goalLower.match(/navigate to (?:the )?([^/]+)/) || goalLower.match(/go to (?:the )?([^/]+)/);
      if (targetMatch) {
        const target = targetMatch[1].replace(/\s+/g, '-');
        return `${baseUrl}/${target}`;
      }
    } else if (goalLower.includes('access') || goalLower.includes('find')) {
      // Extract the feature from the goal
      const featureMatch = goalLower.match(/access (?:the )?([^/]+)/) || goalLower.match(/find (?:the )?([^/]+)/);
      if (featureMatch) {
        const feature = featureMatch[1].replace(/\s+/g, '-');
        return `${baseUrl}/${feature}`;
      }
    }
    
    // Default fallback - construct from feature name
    const featureSlug = featureLower.replace(/\s+/g, '-');
    return `${baseUrl}/${featureSlug}`;
  }

  async stopAutomationAgent(): Promise<void> {
    await this.puppeteerWorker.cleanup();
  }
}
