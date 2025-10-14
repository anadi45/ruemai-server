import { DemoAutomationService } from './demo-automation.service';
import { GeminiService } from './services/gemini.service';
import { PuppeteerWorkerService } from './services/puppeteer-worker.service';
import { LangGraphWorkflowService } from './services/langgraph-workflow.service';
import { DocumentParserService } from './services/document-parser.service';
import { TourConfig, ProductDocs } from './types/demo-automation.types';

/**
 * Test script for the Demo Automation system
 * This demonstrates how to use the LangGraphJS + Gemini + Puppeteer system
 */
async function testDemoAutomation() {
  console.log('🚀 Starting Demo Automation Test...');

  // Initialize services
  const geminiService = new GeminiService();
  const puppeteerWorker = new PuppeteerWorkerService();
  const langGraphWorkflow = new LangGraphWorkflowService(
    geminiService,
    puppeteerWorker
  );
  const documentParser = new DocumentParserService(geminiService);
  const demoAutomationService = new DemoAutomationService(
    geminiService,
    puppeteerWorker,
    langGraphWorkflow,
    documentParser
  );

  try {
    // Test 1: Simple login demo
    console.log('\n📝 Test 1: Simple Login Demo');
    const loginResult = await demoAutomationService.loginToWebsite(
      'https://example.com',
      { username: 'test@example.com', password: 'password123' }
    );
    console.log('Login Result:', {
      demoId: loginResult.demoId,
      loginStatus: loginResult.loginStatus,
      processingTime: loginResult.summary?.processingTime
    });

    // Test 2: Generate product tour
    console.log('\n🎯 Test 2: Generate Product Tour');
    
    const tourConfig: TourConfig = {
      goal: 'Navigate to user dashboard and view profile settings',
      featureName: 'UserDashboard',
      maxSteps: 5,
      timeout: 30000,
      includeScreenshots: true
    };

    const featureDocs: ProductDocs = {
      featureName: 'UserDashboard',
      description: 'User dashboard with profile settings and navigation',
      steps: [
        'Click on user profile icon',
        'Navigate to settings page',
        'View profile information',
        'Update profile if needed'
      ],
      selectors: {
        profileIcon: '.user-profile-icon',
        settingsLink: 'a[href*="settings"]',
        profileForm: '#profile-form'
      },
      expectedOutcomes: [
        'Successfully navigate to user dashboard',
        'Access profile settings',
        'View user information'
      ]
    };

    const tourResult = await demoAutomationService.generateTourForFeature(
      'https://example.com',
      { username: 'test@example.com', password: 'password123' },
      'UserDashboard'
    );

    console.log('Tour Result:', {
      success: tourResult.success,
      totalSteps: tourResult.totalSteps,
      processingTime: tourResult.processingTime,
      successRate: tourResult.summary.successRate,
      actionsPerformed: tourResult.summary.actionsPerformed
    });

    // Display tour steps
    if (tourResult.tourSteps.length > 0) {
      console.log('\n📋 Generated Tour Steps:');
      tourResult.tourSteps.forEach((step, index) => {
        console.log(`${index + 1}. ${step.action.type} on "${step.selector}"`);
        console.log(`   Description: ${step.description}`);
        console.log(`   Success: ${step.success}`);
        if (step.errorMessage) {
          console.log(`   Error: ${step.errorMessage}`);
        }
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Cleanup
    await demoAutomationService.stopAllAutomation();
    console.log('🧹 Cleanup completed');
  }
}

// Example usage with different scenarios
async function testDifferentScenarios() {
  console.log('\n🎭 Testing Different Scenarios...');

  const scenarios = [
    {
      name: 'E-commerce Checkout',
      goal: 'Add item to cart and proceed to checkout',
      featureName: 'CheckoutFlow',
      maxSteps: 8
    },
    {
      name: 'User Registration',
      goal: 'Complete user registration form',
      featureName: 'UserRegistration',
      maxSteps: 6
    },
    {
      name: 'Search and Filter',
      goal: 'Search for products and apply filters',
      featureName: 'SearchFilter',
      maxSteps: 4
    }
  ];

  for (const scenario of scenarios) {
    console.log(`\n🔍 Testing: ${scenario.name}`);
    // Implementation would go here
    console.log(`Goal: ${scenario.goal}`);
    console.log(`Max Steps: ${scenario.maxSteps}`);
  }
}

// Run the tests
if (require.main === module) {
  testDemoAutomation()
    .then(() => testDifferentScenarios())
    .then(() => {
      console.log('\n✅ All tests completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}

export { testDemoAutomation, testDifferentScenarios };
