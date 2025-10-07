// Debug script to test UI element detection
const axios = require('axios');

async function testUIDebug() {
    try {
        console.log('🔍 Testing UI Element Detection...\n');

        console.log('📤 Sending request to /demo/create-automated-demo...');
        console.log('⏳ This will help us debug why 0 elements are found...\n');

        const response = await axios.post('http://localhost:3000/demo/create-automated-demo', {
            targetUrl: 'http://localhost:3001', // Make sure this is your target app
            credentials: {
                username: 'demo@example.com',
                password: 'demo123'
            }
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 180000 // 3 minutes timeout
        });

        console.log('✅ Debug test completed!\n');
        console.log('📊 Results:');
        console.log(`  Demo ID: ${response.data.demoId}`);
        console.log(`  Website: ${response.data.websiteUrl}`);
        console.log(`  Generated Scripts: ${response.data.generatedScripts.length}`);
        console.log(`  Total Steps: ${response.data.summary.totalSteps}`);

        if (response.data.generatedScripts.length > 0) {
            console.log('\n📄 Generated Scripts:');
            response.data.generatedScripts.forEach((script, index) => {
                console.log(`\n${index + 1}. ${script.name}`);
                console.log(`   Category: ${script.category}`);
                console.log(`   Steps: ${script.steps.length}`);
            });
        } else {
            console.log('\n⚠️ No scripts generated - this indicates the UI detection failed');
        }

    } catch (error) {
        console.error('❌ Debug test failed:', error.response?.data || error.message);
        console.log('\n💡 Check the logs for detailed debugging information');
    }
}

// Run the debug test
testUIDebug();
