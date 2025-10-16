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

  // Click Tool (Updated to use coordinate-based approach with fallback)
  createClickTool(): AgentTool {
    return {
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
    };
  }

  // Type Tool
  createTypeTool(): AgentTool {
    return {
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
            await new Promise(resolve => setTimeout(resolve, duration * 1000));
            return { success: true, result: { duration: duration } };
          }
        } catch (error) {
          console.error(`❌ Wait tool failed:`, error);
          return { success: false, error: error instanceof Error ? error.message : 'Wait failed' };
        }
      }
    };
  }

  // Extract Tool
  createExtractTool(): AgentTool {
    return {
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
    };
  }

  // Evaluate Tool
  createEvaluateTool(): AgentTool {
    return {
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
    };
  }

  // Intelligent Navigation Tool
  createIntelligentNavigateTool(): AgentTool {
    return {
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
          // Use the current URL as fallback since we can't intelligently construct URLs
          await this.puppeteerWorker.navigateToUrl(currentUrl);
          
          return { 
            success: true, 
            result: {
              method: 'url',
              url: currentUrl,
              reasoning: 'Used current URL as fallback navigation'
            }
          };
        } catch (error) {
          console.error('Intelligent navigation failed:', error);
          return { success: false, error: error instanceof Error ? error.message : 'Intelligent navigation failed' };
        }
      }
    };
  }

  // Intelligent Feature Discovery Tool
  createIntelligentDiscoverFeatureTool(): AgentTool {
    return {
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
    };
  }

  // Intelligent Element Discovery Tool
  createDiscoverElementTool(): AgentTool {
    return {
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
    };
  }
}
