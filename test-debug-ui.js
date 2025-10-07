// Debug script to test UI element detection
const axios = require('axios');

async function testDebugUI() {
    try {
        console.log('🔍 Testing UI Element Detection Debug...\n');

        console.log('📤 Sending request to /demo/debug-ui...');
        console.log('⏳ This will help us understand why 0 elements are found...\n');

        const response = await axios.post('http://localhost:3000/demo/debug-ui', {
            targetUrl: 'http://localhost:3001', // Change this to your target app
            credentials: {
                username: 'demo@example.com',
                password: 'demo123'
            }
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 120000 // 2 minutes timeout
        });

        console.log('✅ Debug test completed!\n');
        console.log('📊 Page Information:');
        console.log(`  Title: ${response.data.pageInfo.title}`);
        console.log(`  URL: ${response.data.pageInfo.url}`);
        console.log(`  Total Elements: ${response.data.pageInfo.totalElements}`);
        console.log(`  Buttons: ${response.data.pageInfo.buttons}`);
        console.log(`  Links: ${response.data.pageInfo.links}`);
        console.log(`  Inputs: ${response.data.pageInfo.inputs}`);
        console.log(`  Divs: ${response.data.pageInfo.divs}`);
        console.log(`  Spans: ${response.data.pageInfo.spans}`);

        console.log('\n📄 Page Content (first 500 chars):');
        console.log(response.data.pageInfo.bodyText);

        console.log('\n🔍 UI Elements Found:');
        console.log(`  Count: ${response.data.elementCount}`);

        if (response.data.uiElements && response.data.uiElements.length > 0) {
            console.log('\n📋 Sample Elements:');
            response.data.uiElements.slice(0, 5).forEach((element, index) => {
                console.log(`  ${index + 1}. ${element.tagName} - "${element.text}" (${element.selector})`);
            });
        } else {
            console.log('\n⚠️ No UI elements detected!');
        }

        console.log(`\n📸 Screenshot saved to: ${response.data.screenshot}`);

    } catch (error) {
        console.error('❌ Debug test failed:', error.response?.data || error.message);
        console.log('\n💡 Check the logs for detailed debugging information');
    }
}

// Run the debug test
testDebugUI();
