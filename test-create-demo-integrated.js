const axios = require('axios');

async function testCreateDemoIntegrated() {
    try {
        console.log('🎬 Testing Integrated Create Demo with Crawl functionality...\n');

        // Test with a simple website first
        const testUrl = 'https://httpbin.org'; // Simple test site
        console.log(`🌐 Testing with: ${testUrl}`);

        const response = await axios.post('http://localhost:3000/demo/create-demo', {
            websiteUrl: testUrl,
            credentials: {
                username: 'test', // Dummy credentials for testing
                password: 'test'
            },
            maxPages: 5 // Limit to 5 pages for testing
        }, {
            timeout: 120000 // 2 minute timeout for comprehensive demo
        });

        console.log('✅ Integrated Demo completed successfully!');
        console.log('📊 Results:');
        console.log(`   Demo ID: ${response.data.demoId}`);
        console.log(`   Demo Name: ${response.data.demoName}`);
        console.log(`   Website: ${response.data.websiteUrl}`);
        console.log(`   Login Status: ${response.data.loginStatus}`);
        console.log(`   Processing Time: ${response.data.summary.processingTime}ms`);
        console.log(`   Final URL: ${response.data.summary.finalUrl}`);

        // Feature extraction results
        if (response.data.extractedFeatures) {
            console.log('\n🤖 AI Feature Extraction:');
            console.log(`   Features Found: ${response.data.extractedFeatures.features.length}`);
            console.log(`   Navigation Elements: ${response.data.extractedFeatures.navigation.menus.length} menus, ${response.data.extractedFeatures.navigation.buttons.length} buttons`);
            console.log(`   Interactive Elements: ${response.data.extractedFeatures.pageStructure.interactiveElements}`);
        }

        // Crawl results
        if (response.data.crawlData) {
            console.log('\n🕷️ App Crawl Results:');
            console.log(`   Success: ${response.data.crawlData.success}`);
            console.log(`   Total Pages: ${response.data.crawlData.totalPages}`);
            console.log(`   Crawl Time: ${response.data.crawlData.crawlTime}ms`);
            console.log(`   Dump Path: ${response.data.crawlData.dumpPath}`);

            console.log('\n📄 Crawled Pages:');
            response.data.crawlData.pages.forEach((page, index) => {
                console.log(`   ${index + 1}. ${page.title} (${page.url})`);
            });

            console.log('\n📁 Check the following directory for dumped files:');
            console.log(`   ${response.data.crawlData.dumpPath}`);
            console.log('\n📋 The dump includes:');
            console.log('   - crawl-data.json (main crawl data)');
            console.log('   - summary.txt (crawl summary)');
            console.log('   - pages/ (individual page HTML and metadata)');
        } else {
            console.log('\n⚠️ No crawl data - login may have failed or crawl was skipped');
        }

    } catch (error) {
        console.error('❌ Test failed:');
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        } else {
            console.error('   Error:', error.message);
        }
    }
}

// Run the test
testCreateDemoIntegrated();
