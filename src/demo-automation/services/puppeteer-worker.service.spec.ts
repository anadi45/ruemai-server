import { Test, TestingModule } from '@nestjs/testing';
import { PuppeteerWorkerService } from './puppeteer-worker.service';
import { Action } from '../types/demo-automation.types';

// Mock puppeteer
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setViewport: jest.fn(),
      setUserAgent: jest.fn(),
      setDefaultTimeout: jest.fn(),
      setDefaultNavigationTimeout: jest.fn(),
      goto: jest.fn(),
      click: jest.fn(),
      type: jest.fn(),
      hover: jest.fn(),
      select: jest.fn(),
      waitForTimeout: jest.fn(),
      waitForSelector: jest.fn(),
      waitForNavigation: jest.fn(),
      content: jest.fn().mockResolvedValue('<html><body>Test content</body></html>'),
      title: jest.fn().mockResolvedValue('Test Page'),
      url: jest.fn().mockReturnValue('https://example.com'),
      screenshot: jest.fn().mockResolvedValue('base64screenshot'),
      evaluate: jest.fn().mockImplementation((fn) => {
        if (fn.toString().includes('querySelectorAll')) {
          return Promise.resolve(['#test-btn', '#test-input']);
        }
        if (fn.toString().includes('textContent')) {
          return Promise.resolve(['Test Button', 'Test Input']);
        }
        return Promise.resolve([]);
      }),
      $: jest.fn().mockResolvedValue({
        click: jest.fn(),
        type: jest.fn(),
        boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 100, width: 50, height: 30 })
      }),
      close: jest.fn()
    }),
    close: jest.fn()
  })
}));

describe('PuppeteerWorkerService', () => {
  let service: PuppeteerWorkerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PuppeteerWorkerService],
    }).compile();

    service = module.get<PuppeteerWorkerService>(PuppeteerWorkerService);
  });

  afterEach(async () => {
    await service.cleanup();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialize', () => {
    it('should initialize browser and page', async () => {
      await service.initialize();
      expect(service.isInitialized()).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      await service.initialize();
      await service.initialize(); // Should not throw error
      expect(service.isInitialized()).toBe(true);
    });
  });

  describe('navigateToUrl', () => {
    it('should navigate to the specified URL', async () => {
      await service.initialize();
      await service.navigateToUrl('https://example.com');
      expect(service.getCurrentUrl()).toBe('https://example.com');
    });

    it('should throw error if not initialized', async () => {
      await expect(service.navigateToUrl('https://example.com')).rejects.toThrow('Page not initialized');
    });
  });

  describe('login', () => {
    it('should attempt login with credentials', async () => {
      await service.initialize();
      const result = await service.login({
        username: 'test@example.com',
        password: 'password123'
      });
      expect(typeof result).toBe('boolean');
    });

    it('should throw error if not initialized', async () => {
      await expect(service.login({
        username: 'test@example.com',
        password: 'password123'
      })).rejects.toThrow('Page not initialized');
    });
  });

  describe('executeAction', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should execute click action', async () => {
      const action: Action = {
        type: 'click',
        selector: '#test-btn',
        description: 'Click test button'
      };

      const result = await service.executeAction(action);
      expect(result.success).toBe(true);
    });

    it('should execute type action', async () => {
      const action: Action = {
        type: 'type',
        selector: '#test-input',
        inputText: 'test text',
        description: 'Type test text'
      };

      const result = await service.executeAction(action);
      expect(result.success).toBe(true);
    });

    it('should execute hover action', async () => {
      const action: Action = {
        type: 'hover',
        selector: '#test-btn',
        description: 'Hover over test button'
      };

      const result = await service.executeAction(action);
      expect(result.success).toBe(true);
    });

    it('should execute select action', async () => {
      const action: Action = {
        type: 'select',
        selector: '#test-select',
        inputText: 'option1',
        description: 'Select option1'
      };

      const result = await service.executeAction(action);
      expect(result.success).toBe(true);
    });

    it('should execute navigate action', async () => {
      const action: Action = {
        type: 'navigate',
        inputText: 'https://example.com/page2',
        description: 'Navigate to page2'
      };

      const result = await service.executeAction(action);
      expect(result.success).toBe(true);
    });

    it('should execute wait action', async () => {
      const action: Action = {
        type: 'wait',
        inputText: '1000',
        description: 'Wait 1 second'
      };

      const result = await service.executeAction(action);
      expect(result.success).toBe(true);
    });

    it('should handle unknown action type', async () => {
      const action = {
        type: 'unknown' as any,
        selector: '#test-btn',
        description: 'Unknown action'
      };

      const result = await service.executeAction(action);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action type');
    });

    it('should throw error if not initialized', async () => {
      const action: Action = {
        type: 'click',
        selector: '#test-btn',
        description: 'Click test button'
      };

      await service.cleanup();
      await expect(service.executeAction(action)).rejects.toThrow('Page not initialized');
    });
  });

  describe('getDOMState', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return DOM state without screenshot', async () => {
      const domState = await service.getDOMState();
      
      expect(domState).toHaveProperty('domHtml');
      expect(domState).toHaveProperty('visibleText');
      expect(domState).toHaveProperty('clickableSelectors');
      expect(domState).toHaveProperty('inputSelectors');
      expect(domState).toHaveProperty('selectSelectors');
      expect(domState).toHaveProperty('currentUrl');
      expect(domState).toHaveProperty('pageTitle');
      expect(domState).toHaveProperty('timestamp');
      expect(domState.screenshot).toBeUndefined();
    });

    it('should return DOM state with screenshot', async () => {
      const domState = await service.getDOMState(true);
      
      expect(domState).toHaveProperty('screenshot');
      expect(domState.screenshot).toBe('base64screenshot');
    });

    it('should throw error if not initialized', async () => {
      await service.cleanup();
      await expect(service.getDOMState()).rejects.toThrow('Page not initialized');
    });
  });

  describe('takeScreenshot', () => {
    it('should take and return screenshot', async () => {
      await service.initialize();
      const screenshot = await service.takeScreenshot();
      expect(screenshot).toBe('base64screenshot');
    });

    it('should throw error if not initialized', async () => {
      await expect(service.takeScreenshot()).rejects.toThrow('Page not initialized');
    });
  });

  describe('waitForElement', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should wait for element and return true', async () => {
      const result = await service.waitForElement('#test-btn');
      expect(result).toBe(true);
    });

    it('should return false if element not found within timeout', async () => {
      // Mock waitForSelector to reject
      const mockPage = (service as any).page;
      mockPage.waitForSelector = jest.fn().mockRejectedValue(new Error('Timeout'));
      
      const result = await service.waitForElement('#non-existent');
      expect(result).toBe(false);
    });

    it('should throw error if not initialized', async () => {
      await service.cleanup();
      await expect(service.waitForElement('#test-btn')).rejects.toThrow('Page not initialized');
    });
  });

  describe('waitForNavigation', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should wait for navigation and return true', async () => {
      const result = await service.waitForNavigation();
      expect(result).toBe(true);
    });

    it('should return false if navigation timeout', async () => {
      const mockPage = (service as any).page;
      mockPage.waitForNavigation = jest.fn().mockRejectedValue(new Error('Timeout'));
      
      const result = await service.waitForNavigation();
      expect(result).toBe(false);
    });

    it('should throw error if not initialized', async () => {
      await service.cleanup();
      await expect(service.waitForNavigation()).rejects.toThrow('Page not initialized');
    });
  });

  describe('getElementPosition', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return element position', async () => {
      const position = await service.getElementPosition('#test-btn');
      expect(position).toEqual({ x: 125, y: 115 }); // x + width/2, y + height/2
    });

    it('should return null if element not found', async () => {
      const mockPage = (service as any).page;
      mockPage.$ = jest.fn().mockResolvedValue(null);
      
      const position = await service.getElementPosition('#non-existent');
      expect(position).toBeNull();
    });

    it('should return null if bounding box not available', async () => {
      const mockPage = (service as any).page;
      const mockElement = {
        boundingBox: jest.fn().mockResolvedValue(null)
      };
      mockPage.$ = jest.fn().mockResolvedValue(mockElement);
      
      const position = await service.getElementPosition('#test-btn');
      expect(position).toBeNull();
    });

    it('should throw error if not initialized', async () => {
      await service.cleanup();
      await expect(service.getElementPosition('#test-btn')).rejects.toThrow('Page not initialized');
    });
  });

  describe('cleanup', () => {
    it('should cleanup browser and page', async () => {
      await service.initialize();
      expect(service.isInitialized()).toBe(true);
      
      await service.cleanup();
      expect(service.isInitialized()).toBe(false);
    });

    it('should handle cleanup when not initialized', async () => {
      await expect(service.cleanup()).resolves.not.toThrow();
    });
  });

  describe('utility methods', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return current URL', () => {
      const url = service.getCurrentUrl();
      expect(url).toBe('https://example.com');
    });

    it('should return page title', () => {
      const title = service.getPageTitle();
      expect(title).toBe('Test Page');
    });

    it('should check if initialized', () => {
      expect(service.isInitialized()).toBe(true);
    });
  });
});
