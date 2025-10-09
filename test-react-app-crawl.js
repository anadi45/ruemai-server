const axios = require('axios');

async function testReactAppCrawl() {
    try {
        console.log('⚛️ Testing React App Crawling functionality...\n');

        // Test with a React app (you can replace with your actual React app URL)
        const testUrl = 'https://your-react-app.com'; // Replace with your React app URL
        console.log(`🌐 Testing with React app: ${testUrl}`);

        const response = await axios.post('http://localhost:3000/demo/create-demo', {
            websiteUrl: testUrl,
            credentials: {
                username: 'your-username', // Replace with actual username
                password: 'your-password'  // Replace with actual password
            },
            maxPages: 20 // Increased limit for React apps
        }, {
            timeout: 300000 // 5 minute timeout for comprehensive React app crawling
        });

        console.log('✅ React App Crawl completed successfully!');
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

        // Crawl results - this is the key part for React apps
        if (response.data.crawlData) {
            console.log('\n🕷️ React App Crawl Results:');
            console.log(`   Success: ${response.data.crawlData.success}`);
            console.log(`   Total Pages: ${response.data.crawlData.totalPages}`);
            console.log(`   Crawl Time: ${response.data.crawlData.crawlTime}ms`);
            console.log(`   Dump Path: ${response.data.crawlData.dumpPath}`);

            console.log('\n📄 Crawled Pages:');
            response.data.crawlData.pages.forEach((page, index) => {
                console.log(`   ${index + 1}. ${page.title} (${page.url})`);
                console.log(`      Elements: ${page.pageInfo.totalElements}, Buttons: ${page.pageInfo.buttons}, Links: ${page.pageInfo.links}`);
            });

            console.log('\n📁 Check the following directory for dumped files:');
            console.log(`   ${response.data.crawlData.dumpPath}`);
            console.log('\n📋 The dump includes:');
            console.log('   - crawl-data.json (main crawl data)');
            console.log('   - summary.txt (crawl summary)');
            console.log('   - pages/ (individual page HTML and metadata)');

            // Show improvement over basic crawling
            if (response.data.crawlData.totalPages > 1) {
                console.log('\n🎉 SUCCESS: React app crawling found multiple pages!');
                console.log(`   Found ${response.data.crawlData.totalPages} pages (vs 1 with basic crawling)`);
            } else {
                console.log('\n⚠️ WARNING: Still only found 1 page. The React app might need:');
                console.log('   - Different navigation patterns');
                console.log('   - Authentication for protected routes');
                console.log('   - Specific user interactions to reveal content');
            }
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
testReactAppCrawl();
