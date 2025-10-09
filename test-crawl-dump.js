const axios = require('axios');

async function testCrawlAndDump() {
    try {
        console.log('🕷️ Testing App Crawl and Dump functionality...\n');

        const response = await axios.post('http://localhost:3000/demo/crawl-and-dump', {
            websiteUrl: 'https://example.com', // Replace with your target website
            credentials: {
                username: 'your-username', // Replace with actual username
                password: 'your-password'  // Replace with actual password
            },
            maxPages: 10 // Limit to 10 pages for testing
        });

        console.log('✅ Crawl and Dump completed successfully!');
        console.log('📊 Results:');
        console.log(`   Demo ID: ${response.data.demoId}`);
        console.log(`   Dump Path: ${response.data.dumpPath}`);
        console.log(`   Total Pages: ${response.data.totalPages}`);
        console.log(`   Crawl Time: ${response.data.crawlTime}ms`);
        console.log(`   Success: ${response.data.success}`);

        console.log('\n📁 Check the following directory for dumped files:');
        console.log(`   ${response.data.dumpPath}`);
        console.log('\n📋 The dump includes:');
        console.log('   - crawl-data.json (main crawl data)');
        console.log('   - summary.txt (crawl summary)');
        console.log('   - pages/ (individual page HTML and metadata)');

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

// Run the test
testCrawlAndDump();
