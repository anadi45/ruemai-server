// Test script for demo automation with file storage
const axios = require('axios');

async function testDemoAutomation() {
    try {
        console.log('🧪 Testing Demo Automation with File Storage...\n');

        const testData = {
            websiteUrl: 'https://httpbin.org/forms/post',
            credentials: {
                username: 'test@example.com',
                password: 'password123'
            },
            demoName: 'Test Demo for HTTPBin Forms'
        };

        console.log('📤 Sending request to /demo/create-demo...');
        console.log('Request data:', JSON.stringify(testData, null, 2));
        console.log('\n⏳ Processing (this may take 30-60 seconds)...\n');

        const response = await axios.post('http://localhost:3000/demo/create-demo', testData, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 120000 // 2 minutes timeout
        });

        console.log('✅ Demo automation completed successfully!\n');
        console.log('📊 Response Summary:');
        console.log(`  Demo ID: ${response.data.demoId}`);
        console.log(`  Demo Name: ${response.data.demoName}`);
        console.log(`  Website: ${response.data.websiteUrl}`);
        console.log(`  Generated Scripts: ${response.data.generatedScripts.length}`);
        console.log(`  Total Steps: ${response.data.summary.totalSteps}`);
        console.log(`  Processing Time: ${response.data.summary.processingTime}ms\n`);

        console.log('📁 File Storage Information:');
        console.log(`  Demo Folder: ${response.data.filePaths.demoFolder}`);
        console.log(`  Metadata File: ${response.data.filePaths.metadataFile}`);
        console.log(`  WIS Files: ${response.data.filePaths.wisFiles.length} files\n`);

        console.log('📄 Generated WIS Scripts:');
        response.data.generatedScripts.forEach((script, index) => {
            console.log(`  ${index + 1}. ${script.name} (${script.category})`);
            console.log(`     Steps: ${script.steps.length}`);
            console.log(`     File: ${response.data.filePaths.wisFiles[index]}\n`);
        });

        console.log('🎉 Test completed successfully!');
        console.log('📁 Check the logs/demo/ folder for saved files.');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
    }
}

// Run the test
testDemoAutomation();
