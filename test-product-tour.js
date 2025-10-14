const axios = require('axios');

// Test the new product tour generation endpoint using Puppeteer
async function testProductTourGeneration() {
  try {
    console.log('🧪 Testing AI-powered product tour generation with Puppeteer...');
    
    const testData = {
      websiteUrl: 'https://example.com',
      credentials: {
        username: 'test@example.com',
        password: 'testpassword'
      },
      urlsToScrape: [
        'https://example.com/dashboard',
        'https://example.com/features',
        'https://example.com/settings'
      ],
      targetFeature: 'User Dashboard Navigation'
    };

    const response = await axios.post('http://localhost:3000/demo/create-demo', testData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 120000 // 2 minutes timeout
    });

    console.log('✅ Product tour generation successful!');
    
    if (response.data.productTours) {
      console.log(`🎯 Generated ${response.data.productTours.length} product tours:`);
      response.data.productTours.forEach((tour, index) => {
        console.log(`\n${index + 1}. ${tour.featureName}`);
        console.log(`   Description: ${tour.description}`);
        console.log(`   Steps: ${tour.steps.length}`);
        tour.steps.forEach((step, stepIndex) => {
          console.log(`   ${stepIndex + 1}. ${step.description}`);
        });
      });
    }
    
    console.log('\n📊 Full Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testProductTourGeneration();
