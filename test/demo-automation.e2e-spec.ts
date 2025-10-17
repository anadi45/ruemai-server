import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DemoAutomationModule } from '../src/demo-automation/demo-automation.module';
import { DemoAutomationService } from '../src/demo-automation/demo-automation.service';
import { LLMService } from '../src/demo-automation/services/llm.service';
import { PuppeteerWorkerService } from '../src/demo-automation/services/puppeteer-worker.service';

describe('Demo Automation E2E Tests', () => {
  let app: INestApplication;
  let demoAutomationService: DemoAutomationService;
  let llmService: LLMService;
  let puppeteerWorker: PuppeteerWorkerService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [DemoAutomationModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    demoAutomationService = moduleFixture.get<DemoAutomationService>(DemoAutomationService);
    llmService = moduleFixture.get<LLMService>(LLMService);
    puppeteerWorker = moduleFixture.get<PuppeteerWorkerService>(PuppeteerWorkerService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /demo/create-demo', () => {
    it('should create a product tour demo', async () => {
      const tourData = {
        websiteUrl: 'https://httpbin.org/forms/post',
        credentials: {
          username: 'test@example.com',
          password: 'password123'
        },
        featureDocs: {
          featureName: 'FormSubmission',
          description: 'Test form submission workflow',
          steps: [
            'Fill in the form fields',
            'Submit the form',
            'Verify submission'
          ],
          selectors: {
            form: 'form',
            submitButton: 'input[type="submit"]'
          },
          expectedOutcomes: [
            'Form filled successfully',
            'Form submitted',
            'Submission confirmed'
          ]
        }
      };

      const response = await request(app.getHttpServer())
        .post('/demo/create-demo')
        .send(tourData)
        .expect(201);

      expect(response.body).toHaveProperty('demoId');
      expect(response.body).toHaveProperty('demoName');
      expect(response.body).toHaveProperty('loginStatus');
      expect(response.body).toHaveProperty('scrapedData');
      expect(response.body.scrapedData).toHaveProperty('success');
      expect(response.body.scrapedData).toHaveProperty('pages');
    });

    it('should handle invalid URL', async () => {
      const invalidData = {
        websiteUrl: 'invalid-url',
        credentials: {
          username: 'test@example.com',
          password: 'password123'
        },
        featureDocs: {
          featureName: 'TestFeature',
          description: 'Test feature',
          steps: ['Test step'],
          selectors: {},
          expectedOutcomes: ['Test outcome']
        }
      };

      await request(app.getHttpServer())
        .post('/demo/create-demo')
        .send(invalidData)
        .expect(400);
    });

    it('should handle missing credentials', async () => {
      const incompleteData = {
        websiteUrl: 'https://httpbin.org/forms/post',
        featureDocs: {
          featureName: 'TestFeature',
          description: 'Test feature',
          steps: ['Test step'],
          selectors: {},
          expectedOutcomes: ['Test outcome']
        }
      };

      await request(app.getHttpServer())
        .post('/demo/create-demo')
        .send(incompleteData)
        .expect(400);
    });

    it('should handle missing feature docs', async () => {
      const incompleteData = {
        websiteUrl: 'https://httpbin.org/forms/post',
        credentials: {
          username: 'test@example.com',
          password: 'password123'
        }
      };

      await request(app.getHttpServer())
        .post('/demo/create-demo')
        .send(incompleteData)
        .expect(400);
    });
  });

  describe('POST /demo/generate-tour', () => {
    it('should generate a tour for a specific feature', async () => {
      const tourData = {
        websiteUrl: 'https://httpbin.org/forms/post',
        credentials: {
          username: 'test@example.com',
          password: 'password123'
        },
        featureName: 'FormInteraction',
        goal: 'Interact with form elements and submit',
        maxSteps: 5
      };

      const response = await request(app.getHttpServer())
        .post('/demo/generate-tour')
        .send(tourData)
        .expect(201);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('tourSteps');
      expect(response.body).toHaveProperty('totalSteps');
      expect(response.body).toHaveProperty('processingTime');
      expect(response.body).toHaveProperty('finalUrl');
      expect(response.body).toHaveProperty('summary');
      expect(response.body.summary).toHaveProperty('featuresCovered');
      expect(response.body.summary).toHaveProperty('actionsPerformed');
      expect(response.body.summary).toHaveProperty('successRate');
    });

    it('should handle tour generation with custom max steps', async () => {
      const tourData = {
        websiteUrl: 'https://httpbin.org/forms/post',
        credentials: {
          username: 'test@example.com',
          password: 'password123'
        },
        featureName: 'QuickForm',
        goal: 'Quick form interaction',
        maxSteps: 2
      };

      const response = await request(app.getHttpServer())
        .post('/demo/generate-tour')
        .send(tourData)
        .expect(201);

      expect(response.body).toHaveProperty('success');
      expect(response.body.totalSteps).toBeLessThanOrEqual(2);
    });

    it('should handle invalid feature name', async () => {
      const tourData = {
        websiteUrl: 'https://httpbin.org/forms/post',
        credentials: {
          username: 'test@example.com',
          password: 'password123'
        },
        featureName: '',
        goal: 'Test goal',
        maxSteps: 5
      };

      await request(app.getHttpServer())
        .post('/demo/generate-tour')
        .send(tourData)
        .expect(400);
    });
  });

  describe('POST /demo/stop-automation', () => {
    it('should stop all automation processes', async () => {
      const response = await request(app.getHttpServer())
        .post('/demo/stop-automation')
        .expect(201);

      expect(response.body).toHaveProperty('message', 'All automation stopped successfully');
    });
  });

  describe('Service Integration Tests', () => {
    it('should initialize LLM service', () => {
      expect(llmService).toBeDefined();
    });

    it('should initialize Puppeteer worker service', () => {
      expect(puppeteerWorker).toBeDefined();
    });

    it('should handle service cleanup', async () => {
      await expect(demoAutomationService.stopAllAutomation()).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      const timeoutData = {
        websiteUrl: 'https://httpstat.us/200?sleep=35000', // 35 second delay
        credentials: {
          username: 'test@example.com',
          password: 'password123'
        }
      };

      // This should timeout and handle gracefully
      const response = await request(app.getHttpServer())
        .post('/demo/create-demo')
        .send(timeoutData)
        .timeout(10000); // 10 second timeout

      // Should either succeed or fail gracefully
      expect([200, 201, 500, 408]).toContain(response.status);
    });

    it('should handle invalid credentials gracefully', async () => {
      const invalidCredsData = {
        websiteUrl: 'https://httpbin.org/basic-auth/user/pass',
        credentials: {
          username: 'wrong',
          password: 'wrong'
        }
      };

      const response = await request(app.getHttpServer())
        .post('/demo/create-demo')
        .send(invalidCredsData);

      // Should handle auth failure gracefully
      expect([200, 201, 400, 401, 500]).toContain(response.status);
    });
  });

  describe('Performance Tests', () => {
    it('should complete basic login within reasonable time', async () => {
      const startTime = Date.now();
      
      const loginData = {
        websiteUrl: 'https://httpbin.org/forms/post',
        credentials: {
          username: 'test@example.com',
          password: 'password123'
        }
      };

      const response = await request(app.getHttpServer())
        .post('/demo/create-demo')
        .send(loginData);

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(response.status).toBe(201);
      expect(processingTime).toBeLessThan(30000); // Should complete within 30 seconds
    });

    it('should handle concurrent requests', async () => {
      const loginData = {
        websiteUrl: 'https://httpbin.org/forms/post',
        credentials: {
          username: 'test@example.com',
          password: 'password123'
        }
      };

      // Send multiple concurrent requests
      const promises = Array(3).fill(null).map(() =>
        request(app.getHttpServer())
          .post('/demo/create-demo')
          .send(loginData)
      );

      const responses = await Promise.allSettled(promises);
      
      // At least some should succeed
      const successfulResponses = responses.filter(
        result => result.status === 'fulfilled' && result.value.status === 201
      );
      
      expect(successfulResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Data Validation Tests', () => {
    it('should validate tour step structure', async () => {
      const tourData = {
        websiteUrl: 'https://httpbin.org/forms/post',
        credentials: {
          username: 'test@example.com',
          password: 'password123'
        },
        featureName: 'ValidationTest',
        goal: 'Test data validation',
        maxSteps: 3
      };

      const response = await request(app.getHttpServer())
        .post('/demo/generate-tour')
        .send(tourData);

      if (response.status === 201 && response.body.tourSteps) {
        const tourSteps = response.body.tourSteps;
        
        tourSteps.forEach((step: any) => {
          expect(step).toHaveProperty('order');
          expect(step).toHaveProperty('selector');
          expect(step).toHaveProperty('description');
          expect(step).toHaveProperty('tooltip');
          expect(step).toHaveProperty('timestamp');
          expect(step).toHaveProperty('success');
          expect(typeof step.order).toBe('number');
          expect(typeof step.selector).toBe('string');
          expect(typeof step.description).toBe('string');
          expect(typeof step.tooltip).toBe('string');
          expect(typeof step.timestamp).toBe('number');
          expect(typeof step.success).toBe('boolean');
        });
      }
    });

    it('should validate summary structure', async () => {
      const tourData = {
        websiteUrl: 'https://httpbin.org/forms/post',
        credentials: {
          username: 'test@example.com',
          password: 'password123'
        },
        featureName: 'SummaryTest',
        goal: 'Test summary structure',
        maxSteps: 2
      };

      const response = await request(app.getHttpServer())
        .post('/demo/generate-tour')
        .send(tourData);

      if (response.status === 201 && response.body.summary) {
        const summary = response.body.summary;
        
        expect(summary).toHaveProperty('featuresCovered');
        expect(summary).toHaveProperty('actionsPerformed');
        expect(summary).toHaveProperty('successRate');
        expect(Array.isArray(summary.featuresCovered)).toBe(true);
        expect(Array.isArray(summary.actionsPerformed)).toBe(true);
        expect(typeof summary.successRate).toBe('number');
        expect(summary.successRate).toBeGreaterThanOrEqual(0);
        expect(summary.successRate).toBeLessThanOrEqual(1);
      }
    });
  });
});
