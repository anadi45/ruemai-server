import { Test, TestingModule } from '@nestjs/testing';
import { LLMService } from './llm.service';
import { DOMState, ProductDocs } from '../types/demo-automation.types';

describe('LLMService', () => {
  let service: LLMService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LLMService],
    }).compile();

    service = module.get<LLMService>(LLMService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('decideNextAction', () => {
    it('should return a valid response structure', async () => {
      const mockDOMState: DOMState = {
        domHtml: '<html><body><button id="test-btn">Click me</button></body></html>',
        visibleText: ['Click me'],
        clickableSelectors: ['#test-btn'],
        inputSelectors: [],
        selectSelectors: [],
        currentUrl: 'https://example.com',
        pageTitle: 'Test Page',
        timestamp: Date.now()
      };

      const mockFeatureDocs: ProductDocs = {
        featureName: 'TestFeature',
        description: 'Test feature description',
        steps: ['Click the button'],
        selectors: { testButton: '#test-btn' },
        expectedOutcomes: ['Button clicked successfully']
      };

      const mockHistory = [];

      // Mock the LLM API call
      jest.spyOn(service as any, 'model', 'get').mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: jest.fn().mockReturnValue(JSON.stringify({
              action: {
                type: 'click',
                selector: '#test-btn',
                description: 'Click the test button'
              },
              reasoning: 'Button is visible and clickable',
              confidence: 0.9,
              nextSteps: ['Verify button click worked']
            })),
          },
        })
      });

      const result = await service.decideNextAction(
        mockDOMState,
        'Click the test button',
        mockFeatureDocs,
        mockHistory,
        5,
        1
      );

      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('reasoning');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('nextSteps');
      expect(result.action).toHaveProperty('type', 'click');
      expect(result.action).toHaveProperty('selector', '#test-btn');
    });

    it('should handle null action when goal is achieved', async () => {
      const mockDOMState: DOMState = {
        domHtml: '<html><body><div>Goal achieved</div></body></html>',
        visibleText: ['Goal achieved'],
        clickableSelectors: [],
        inputSelectors: [],
        selectSelectors: [],
        currentUrl: 'https://example.com',
        pageTitle: 'Success Page',
        timestamp: Date.now()
      };

      const mockFeatureDocs: ProductDocs = {
        featureName: 'TestFeature',
        description: 'Test feature description',
        steps: ['Complete the task'],
        selectors: {},
        expectedOutcomes: ['Task completed successfully']
      };

      jest.spyOn(service as any, 'model', 'get').mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: jest.fn().mockReturnValue(JSON.stringify({
              action: null,
              reasoning: 'Goal has been achieved',
              confidence: 1.0,
              nextSteps: ['Tour complete']
            })),
          },
        })
      });

      const result = await service.decideNextAction(
        mockDOMState,
        'Complete the task',
        mockFeatureDocs,
        [],
        5,
        3
      );

      expect(result.action).toBeNull();
      expect(result.reasoning).toBe('Goal has been achieved');
      expect(result.confidence).toBe(1.0);
    });

    it('should handle API errors gracefully', async () => {
      const mockDOMState: DOMState = {
        domHtml: '<html><body></body></html>',
        visibleText: [],
        clickableSelectors: [],
        inputSelectors: [],
        selectSelectors: [],
        currentUrl: 'https://example.com',
        pageTitle: 'Test Page',
        timestamp: Date.now()
      };

      const mockFeatureDocs: ProductDocs = {
        featureName: 'TestFeature',
        description: 'Test feature description',
        steps: ['Test step'],
        selectors: {},
        expectedOutcomes: ['Test outcome']
      };

      jest.spyOn(service as any, 'model', 'get').mockReturnValue({
        generateContent: jest.fn().mockRejectedValue(new Error('API Error'))
      });

      const result = await service.decideNextAction(
        mockDOMState,
        'Test goal',
        mockFeatureDocs,
        [],
        5,
        1
      );

      expect(result.action).toBeNull();
      expect(result.reasoning).toBe('Error calling LLM API');
      expect(result.confidence).toBe(0);
    });
  });

  describe('generateTooltipText', () => {
    it('should generate tooltip text for an action', async () => {
      const mockAction = {
        type: 'click' as const,
        selector: '#submit-btn',
        description: 'Click the submit button'
      };

      const mockDOMState: DOMState = {
        domHtml: '<html><body><button id="submit-btn">Submit</button></body></html>',
        visibleText: ['Submit'],
        clickableSelectors: ['#submit-btn'],
        inputSelectors: [],
        selectSelectors: [],
        currentUrl: 'https://example.com',
        pageTitle: 'Form Page',
        timestamp: Date.now()
      };

      const mockFeatureDocs: ProductDocs = {
        featureName: 'FormSubmission',
        description: 'Submit form',
        steps: ['Click submit'],
        selectors: { submitButton: '#submit-btn' },
        expectedOutcomes: ['Form submitted']
      };

      jest.spyOn(service as any, 'model', 'get').mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: jest.fn().mockReturnValue('Click to submit the form')
          }
        })
      });

      const result = await service.generateTooltipText(mockAction, mockDOMState, mockFeatureDocs);

      expect(result).toBe('Click to submit the form');
    });

    it('should handle tooltip generation errors', async () => {
      const mockAction = {
        type: 'click' as const,
        selector: '#test-btn',
        description: 'Test action'
      };

      const mockDOMState: DOMState = {
        domHtml: '<html><body></body></html>',
        visibleText: [],
        clickableSelectors: [],
        inputSelectors: [],
        selectSelectors: [],
        currentUrl: 'https://example.com',
        pageTitle: 'Test Page',
        timestamp: Date.now()
      };

      const mockFeatureDocs: ProductDocs = {
        featureName: 'TestFeature',
        description: 'Test feature',
        steps: ['Test step'],
        selectors: {},
        expectedOutcomes: ['Test outcome']
      };

      jest.spyOn(service as any, 'model', 'get').mockReturnValue({
        generateContent: jest.fn().mockRejectedValue(new Error('API Error'))
      });

      const result = await service.generateTooltipText(mockAction, mockDOMState, mockFeatureDocs);

      expect(result).toBe(mockAction.description);
    });
  });

  describe('validateActionSuccess', () => {
    it('should validate successful action', async () => {
      const mockAction = {
        type: 'click' as const,
        selector: '#test-btn',
        description: 'Click test button'
      };

      const previousState: DOMState = {
        domHtml: '<html><body><button id="test-btn">Click me</button></body></html>',
        visibleText: ['Click me'],
        clickableSelectors: ['#test-btn'],
        inputSelectors: [],
        selectSelectors: [],
        currentUrl: 'https://example.com/page1',
        pageTitle: 'Page 1',
        timestamp: Date.now()
      };

      const currentState: DOMState = {
        domHtml: '<html><body><div>Success!</div></body></html>',
        visibleText: ['Success!'],
        clickableSelectors: [],
        inputSelectors: [],
        selectSelectors: [],
        currentUrl: 'https://example.com/page2',
        pageTitle: 'Page 2',
        timestamp: Date.now()
      };

      jest.spyOn(service as any, 'model', 'get').mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: jest.fn().mockReturnValue(JSON.stringify({
              success: true,
              reason: 'Navigation successful, page changed as expected'
            }))
          }
        })
      });

      const result = await service.validateActionSuccess(
        mockAction,
        previousState,
        currentState,
        'Page should change after click'
      );

      expect(result.success).toBe(true);
      expect(result.reasoning).toBe('Navigation successful, page changed as expected');
    });

    it('should validate failed action', async () => {
      const mockAction = {
        type: 'click' as const,
        selector: '#test-btn',
        description: 'Click test button'
      };

      const previousState: DOMState = {
        domHtml: '<html><body><button id="test-btn">Click me</button></body></html>',
        visibleText: ['Click me'],
        clickableSelectors: ['#test-btn'],
        inputSelectors: [],
        selectSelectors: [],
        currentUrl: 'https://example.com/page1',
        pageTitle: 'Page 1',
        timestamp: Date.now()
      };

      const currentState: DOMState = {
        domHtml: '<html><body><button id="test-btn">Click me</button></body></html>',
        visibleText: ['Click me'],
        clickableSelectors: ['#test-btn'],
        inputSelectors: [],
        selectSelectors: [],
        currentUrl: 'https://example.com/page1',
        pageTitle: 'Page 1',
        timestamp: Date.now()
      };

      jest.spyOn(service as any, 'model', 'get').mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: jest.fn().mockReturnValue(JSON.stringify({
              success: false,
              reason: 'No navigation occurred, button click may have failed'
            }))
          }
        })
      });

      const result = await service.validateActionSuccess(
        mockAction,
        previousState,
        currentState,
        'Page should change after click'
      );

      expect(result.success).toBe(false);
      expect(result.reasoning).toBe('No navigation occurred, button click may have failed');
    });
  });
});
