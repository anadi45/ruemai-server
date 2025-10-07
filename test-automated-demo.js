// Test script for automated application demo with Puppeteer
const axios = require('axios');

async function testAutomatedDemo() {
    try {
        console.log('🤖 Testing Automated Application Demo...\n');
        console.log('This will:');
        console.log('1. 🚀 Launch Puppeteer and navigate to your application');
        console.log('2. 🔐 Automatically login with demo credentials');
        console.log('3. 🧠 Extract features using LLM from the application');
        console.log('4. 🔍 Explore UI elements with Puppeteer');
        console.log('5. 🤖 Generate WIS scripts for all extracted features');
        console.log('6. 💾 Save WIS scripts to logs/demo/ directory\n');

        console.log('📤 Sending request to /demo/create-automated-demo...');
        console.log('⏳ Processing (this may take 60-120 seconds)...\n');

        // You can customize the target URL and credentials
        const requestBody = {
            targetUrl: 'http://localhost:3001', // Change this to your target application
            credentials: {
                username: 'demo@example.com',
                password: 'demo123'
            }
        };

        const response = await axios.post('http://localhost:3000/demo/create-automated-demo', requestBody, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 180000 // 3 minutes timeout
        });

        console.log('✅ Automated demo completed successfully!\n');
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
            console.log(`\n${index + 1}. ${script.name}`);
            console.log(`   Category: ${script.category}`);
            console.log(`   Description: ${script.description}`);
            console.log(`   Steps: ${script.steps.length}`);
            script.steps.forEach((step, stepIndex) => {
                console.log(`     ${stepIndex + 1}. ${step.action} on ${step.selector}`);
                if (step.tooltip) {
                    console.log(`        Tooltip: ${step.tooltip.text}`);
                }
            });
        });

        console.log('\n🎉 Automated demo creation completed!');
        console.log('📁 Check the logs/demo/ directory for saved WIS files');
        console.log('🚀 You can now use these WIS scripts for interactive demos!');

    } catch (error) {
        console.error('❌ Automated demo failed:', error.response?.data || error.message);
        console.log('\n💡 Make sure:');
        console.log('1. Backend server is running on http://localhost:3000');
        console.log('2. OpenAI API key is configured');
        console.log('3. Puppeteer dependencies are installed');
        console.log('4. Your target application is accessible');
    }
}

// Run the test
testAutomatedDemo();
