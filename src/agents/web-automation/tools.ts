import { 
  SmartAgentState,
  PuppeteerAction
} from '../../demo-automation/types/demo-automation.types';
import { PuppeteerWorkerService } from '../../demo-automation/services/puppeteer-worker.service';
import { IntelligentElementDiscoveryService } from '../../demo-automation/services/intelligent-element-discovery.service';

// Tool definitions for the automation agent
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (params: any, state: SmartAgentState) => Promise<{ success: boolean; result?: any; error?: string }>;
}

export class WebAutomationTools {
  constructor(
    private puppeteerWorker: PuppeteerWorkerService,
    private elementDiscovery: IntelligentElementDiscoveryService
  ) {}

  // Navigation Tool
  createNavigateTool(): AgentTool {
    return {
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
    };
  }

  // Wait Tool
  createWaitTool(): AgentTool {
    return {
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
            // Note: setTimeout removed - using networkidle instead
            return { success: true, result: { duration: duration } };
          }
        } catch (error) {
          console.error(`❌ Wait tool failed:`, error);
          return { success: false, error: error instanceof Error ? error.message : 'Wait failed' };
        }
      }
    };
  }






  // Coordinate-based Click Tool
  createClickCoordinatesTool(): AgentTool {
    return {
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
          
          if (coordinateDiscovery.bestMatch && coordinateDiscovery.bestMatch.confidence > 0.1) {
            console.log(`✅ Coordinates found: (${coordinateDiscovery.bestMatch.x}, ${coordinateDiscovery.bestMatch.y}) with confidence ${coordinateDiscovery.bestMatch.confidence}`);
            
            const clickResult = await this.puppeteerWorker.clickAtCoordinates(
              coordinateDiscovery.bestMatch.x,
              coordinateDiscovery.bestMatch.y
            );
            
            if (clickResult.success) {
              console.log('✅ Coordinate-based click successful');
              
              // Note: waitAfter timeout removed - using networkidle instead
              
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
          
          // Try a fallback approach - use center of screen as last resort
          console.log('🔄 No coordinates found, trying center of screen fallback...');
          const centerX = Math.floor(screenshotData.viewport.width / 2);
          const centerY = Math.floor(screenshotData.viewport.height / 2);
          
          console.log(`🎯 Using center coordinates: (${centerX}, ${centerY})`);
          
          const fallbackResult = await this.puppeteerWorker.clickAtCoordinates(centerX, centerY);
          
          if (fallbackResult.success) {
            console.log('✅ Fallback center click successful');
            return { 
              success: true, 
              result: {
                coordinates: { x: centerX, y: centerY },
                confidence: 0.1,
                reasoning: 'Fallback center click',
                method: 'fallback'
              }
            };
          }
          
          return { 
            success: false, 
            error: 'No suitable coordinates found and fallback also failed' 
          };
        } catch (error) {
          console.error('Coordinate-based click failed:', error);
          return { success: false, error: error instanceof Error ? error.message : 'Coordinate-based click failed' };
        }
      }
    };
  }

  // Coordinate-based Type Tool
  createTypeCoordinatesTool(): AgentTool {
    return {
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
          
          if (coordinateDiscovery.bestMatch && coordinateDiscovery.bestMatch.confidence > 0.1) {
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
              
              // Note: waitAfter timeout removed - using networkidle instead
              
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
    };
  }

  // Coordinate-based Scroll Tool
  createScrollCoordinatesTool(): AgentTool {
    return {
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
          
          if (coordinateDiscovery.bestMatch && coordinateDiscovery.bestMatch.confidence > 0.1) {
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
              
              // Note: waitAfter timeout removed - using networkidle instead
              
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
    };
  }

  // Coordinate-based Select Tool
  createSelectCoordinatesTool(): AgentTool {
    return {
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
          
          if (coordinateDiscovery.bestMatch && coordinateDiscovery.bestMatch.confidence > 0.1) {
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
              
              // Note: waitAfter timeout removed - using networkidle instead
              
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
    };
  }

  // Go Back Tool
  createGoBackTool(): AgentTool {
    return {
      name: 'go_back',
      description: 'Navigate back to the previous page using browser back button',
      parameters: { waitAfter: 'number' },
      execute: async (params, state) => {
        try {
          console.log(`🔙 Going back to previous page...`);
          
          // Get current URL before going back
          const currentUrl = this.puppeteerWorker.getCurrentUrl() || '';
          console.log(`📍 Current URL before going back: ${currentUrl}`);
          
          // Navigate back using browser history
          await this.puppeteerWorker.goBack();
          
          // Wait for navigation to complete
          await this.puppeteerWorker.waitForNavigation(3000);
          
          // Get the new URL after going back
          const newUrl = this.puppeteerWorker.getCurrentUrl() || '';
          console.log(`📍 New URL after going back: ${newUrl}`);
          
          // Note: waitAfter timeout removed - using networkidle instead
          
          console.log(`✅ Successfully navigated back`);
          return { 
            success: true, 
            result: { 
              previousUrl: currentUrl,
              currentUrl: newUrl,
              method: 'browser_back'
            } 
          };
        } catch (error) {
          console.error(`❌ Go back failed:`, error);
          return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Go back failed' 
          };
        }
      }
    };
  }
}
