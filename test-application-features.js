const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testApplicationFeatureDemo() {
    console.log('🚀 Testing Application Feature Demo Automation...\n');

    try {
        // Test the new application feature demo endpoint
        console.log('📡 Calling /demo/create-application-demo endpoint...');
        const response = await axios.post(`${BASE_URL}/demo/create-application-demo`);

        console.log('✅ Application Feature Demo Created Successfully!');
        console.log(`📊 Demo ID: ${response.data.demoId}`);
        console.log(`📊 Demo Name: ${response.data.demoName}`);
        console.log(`📊 Website URL: ${response.data.websiteUrl}`);
        console.log(`📊 Total Flows: ${response.data.summary.totalFlows}`);
        console.log(`📊 Total Steps: ${response.data.summary.totalSteps}`);
        console.log(`📊 Processing Time: ${response.data.summary.processingTime}ms`);

        console.log('\n🎯 Generated WIS Scripts:');
        response.data.generatedScripts.forEach((script, index) => {
            console.log(`\n${index + 1}. ${script.name}`);
            console.log(`   Category: ${script.category}`);
            console.log(`   Description: ${script.description}`);
            console.log(`   Steps: ${script.steps.length}`);

            script.steps.forEach((step, stepIndex) => {
                console.log(`     ${stepIndex + 1}. ${step.action} on ${step.selector}`);
                if (step.value) {
                    console.log(`        Value: ${step.value}`);
                }
                console.log(`        Tooltip: ${step.tooltip.text}`);
            });
        });

        console.log('\n📁 File Paths:');
        console.log(`   Demo Folder: ${response.data.filePaths.demoFolder}`);
        console.log(`   Metadata File: ${response.data.filePaths.metadataFile}`);
        console.log(`   WIS Files: ${response.data.filePaths.wisFiles.length} files`);

        return response.data;
    } catch (error) {
        console.error('❌ Error testing application feature demo:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        throw error;
    }
}


async function main() {
    console.log('🎬 Demo Automation Testing Suite');
    console.log('================================\n');

    try {
        // Test application feature demo
        await testApplicationFeatureDemo();

        console.log('\n✅ All tests completed successfully!');
    } catch (error) {
        console.error('\n❌ Test suite failed:', error.message);
        process.exit(1);
    }
}

// Run the tests
if (require.main === module) {
    main();
}

module.exports = {
    testApplicationFeatureDemo
};
