// Setup file for demo automation tests
import { config } from 'dotenv';

// Load environment variables
config();

// Set default environment variables for testing
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
process.env.PORT = '3001'; // Use different port for tests

// Mock console methods to reduce noise during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  // Suppress console output during tests unless DEBUG is set
  if (!process.env.DEBUG) {
    console.log = jest.fn();
    console.error = jest.fn();
  }
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

// Global test timeout
jest.setTimeout(60000);

// Mock external dependencies that might not be available in test environment
jest.mock('puppeteer', () => {
  const mockPage = {
    setViewport: jest.fn(),
    setUserAgent: jest.fn(),
    setDefaultTimeout: jest.fn(),
    setDefaultNavigationTimeout: jest.fn(),
    goto: jest.fn().mockResolvedValue(undefined),
    click: jest.fn().mockResolvedValue(undefined),
    type: jest.fn().mockResolvedValue(undefined),
    hover: jest.fn().mockResolvedValue(undefined),
    select: jest.fn().mockResolvedValue(undefined),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    waitForSelector: jest.fn().mockResolvedValue(undefined),
    waitForNavigation: jest.fn().mockResolvedValue(undefined),
    content: jest.fn().mockResolvedValue('<html><body>Test content</body></html>'),
    title: jest.fn().mockResolvedValue('Test Page'),
    url: jest.fn().mockReturnValue('https://example.com'),
    screenshot: jest.fn().mockResolvedValue('base64screenshot'),
    evaluate: jest.fn().mockImplementation((fn) => {
      if (fn.toString().includes('querySelectorAll')) {
        return Promise.resolve(['#test-btn', '#test-input', 'select']);
      }
      if (fn.toString().includes('textContent')) {
        return Promise.resolve(['Test Button', 'Test Input', 'Test Text']);
      }
      return Promise.resolve([]);
    }),
    $: jest.fn().mockResolvedValue({
      click: jest.fn(),
      type: jest.fn(),
      boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 100, width: 50, height: 30 })
    }),
    close: jest.fn()
  };

  const mockBrowser = {
    newPage: jest.fn().mockResolvedValue(mockPage),
    close: jest.fn()
  };

  return {
    launch: jest.fn().mockResolvedValue(mockBrowser)
  };
});

// Mock Google Generative AI
jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
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
            }))
          }
        })
      })
    }))
  };
});

// Mock LangGraph
jest.mock('@langchain/langgraph', () => {
  return {
    StateGraph: jest.fn().mockImplementation(() => ({
      addNode: jest.fn(),
      addEdge: jest.fn(),
      addConditionalEdges: jest.fn(),
      setEntryPoint: jest.fn(),
      invoke: jest.fn().mockResolvedValue({
        currentStep: 1,
        totalSteps: 3,
        history: [],
        domState: {
          domHtml: '<html><body>Test</body></html>',
          visibleText: ['Test'],
          clickableSelectors: ['#test-btn'],
          inputSelectors: [],
          selectSelectors: [],
          currentUrl: 'https://example.com',
          pageTitle: 'Test Page',
          timestamp: Date.now()
        },
        tourSteps: [],
        goal: 'Test goal',
        featureDocs: '{}',
        isComplete: true,
        startTime: Date.now(),
        endTime: Date.now()
      })
    })),
    MemorySaver: jest.fn().mockImplementation(() => ({}))
  };
});

// Test utilities
export const testUtils = {
  createMockDOMState: () => ({
    domHtml: '<html><body><button id="test-btn">Click me</button></body></html>',
    visibleText: ['Click me'],
    clickableSelectors: ['#test-btn'],
    inputSelectors: [],
    selectSelectors: [],
    currentUrl: 'https://example.com',
    pageTitle: 'Test Page',
    timestamp: Date.now()
  }),

  createMockAction: () => ({
    type: 'click' as const,
    selector: '#test-btn',
    description: 'Click the test button'
  }),

  createMockProductDocs: () => ({
    featureName: 'TestFeature',
    description: 'Test feature description',
    steps: ['Click the button'],
    selectors: { testButton: '#test-btn' },
    expectedOutcomes: ['Button clicked successfully']
  }),

  waitFor: (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
};

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
