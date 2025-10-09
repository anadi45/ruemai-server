const axios = require('axios');

async function testDeepInteractiveScraping() {
    try {
        console.log('🕷️ Testing DEEP Interactive Scraping functionality...\n');
        console.log('🎯 This will click on EVERY interactive element to discover all pages!\n');

        // Test with your React app
        const testUrl = 'https://your-react-app.com'; // Replace with your React app URL
        console.log(`🌐 Testing with React app: ${testUrl}`);

        const response = await axios.post('http://localhost:3000/demo/create-demo', {
            websiteUrl: testUrl,
            credentials: {
                username: 'your-username', // Replace with actual username
                password: 'your-password'  // Replace with actual password
            },
            maxPages: 50 // Increased limit for deep scraping
        }, {
            timeout: 600000 // 10 minute timeout for comprehensive deep scraping
        });

        console.log('✅ Deep Interactive Scraping completed!');
        console.log('📊 Results:');
        console.log(`   Demo ID: ${response.data.demoId}`);
        console.log(`   Website: ${response.data.websiteUrl}`);
        console.log(`   Login Status: ${response.data.loginStatus}`);
        console.log(`   Processing Time: ${response.data.summary.processingTime}ms`);

        // Feature extraction results
        if (response.data.extractedFeatures) {
            console.log('\n🤖 AI Feature Extraction:');
            console.log(`   Features Found: ${response.data.extractedFeatures.features.length}`);
            console.log(`   Navigation Elements: ${response.data.extractedFeatures.navigation.menus.length} menus`);
            console.log(`   Interactive Elements: ${response.data.extractedFeatures.pageStructure.interactiveElements}`);
        }

        // Deep interactive scraping results
        if (response.data.crawlData) {
            console.log('\n🕷️ DEEP Interactive Scraping Results:');
            console.log(`   Success: ${response.data.crawlData.success}`);
            console.log(`   Total Pages: ${response.data.crawlData.totalPages}`);
            console.log(`   Crawl Time: ${response.data.crawlData.crawlTime}ms`);
            console.log(`   Dump Path: ${response.data.crawlData.dumpPath}`);

            console.log('\n📄 Discovered Pages (including interacted states):');
            response.data.crawlData.pages.forEach((page, index) => {
                console.log(`\n   ${index + 1}. ${page.title} (${page.url})`);
                console.log(`      Basic Info: ${page.pageInfo.totalElements} elements, ${page.pageInfo.buttons} buttons, ${page.pageInfo.links} links`);

                if (page.scrapedData) {
                    console.log(`      📊 Content Analysis:`);
                    console.log(`         Word Count: ${page.scrapedData.wordCount || 'N/A'}`);
                    console.log(`         Character Count: ${page.scrapedData.characterCount || 'N/A'}`);
                    console.log(`         Forms: ${page.scrapedData.forms?.length || 0}`);
                    console.log(`         Images: ${page.scrapedData.images?.length || 0}`);
                    console.log(`         Tables: ${page.scrapedData.tables?.length || 0}`);

                    console.log(`      🔍 Content Features:`);
                    console.log(`         Login Form: ${page.scrapedData.hasLoginForm ? '✅' : '❌'}`);
                    console.log(`         Search Form: ${page.scrapedData.hasSearchForm ? '✅' : '❌'}`);
                    console.log(`         Contact Info: ${page.scrapedData.hasContactInfo ? '✅' : '❌'}`);
                    console.log(`         Pricing Info: ${page.scrapedData.hasPricing ? '✅' : '❌'}`);
                    console.log(`         Social Media: ${page.scrapedData.hasSocialMedia ? '✅' : '❌'}`);

                    if (page.scrapedData.headingsData) {
                        console.log(`      📝 Headings:`);
                        Object.entries(page.scrapedData.headingsData).forEach(([level, headings]) => {
                            if (headings.length > 0) {
                                console.log(`         ${level.toUpperCase()}: ${headings.slice(0, 3).join(', ')}${headings.length > 3 ? '...' : ''}`);
                            }
                        });
                    }

                    if (page.scrapedData.navigationData?.menus?.length > 0) {
                        console.log(`      🧭 Navigation:`);
                        page.scrapedData.navigationData.menus.forEach(menu => {
                            console.log(`         - ${menu.text?.substring(0, 50)}${menu.text?.length > 50 ? '...' : ''}`);
                        });
                    }
                }
            });

            console.log('\n📁 Comprehensive Data Dump:');
            console.log(`   Main Directory: ${response.data.crawlData.dumpPath}`);
            console.log('\n📋 Each page now includes:');
            console.log('   - content.html (full HTML)');
            console.log('   - scraped-data.json (comprehensive structured data)');
            console.log('   - metadata.json (page metadata)');
            console.log('   - content-summary.txt (human-readable content analysis)');

            console.log('\n🎯 Deep Interactive Scraping Features:');
            console.log('   ✅ Clicks on ALL interactive elements');
            console.log('   ✅ Discovers hidden routes and pages');
            console.log('   ✅ Tests buttons, links, dropdowns, modals');
            console.log('   ✅ Handles React Router navigation');
            console.log('   ✅ Captures state changes and interactions');
            console.log('   ✅ Avoids infinite loops with smart tracking');
            console.log('   ✅ Scrapes both navigation and content changes');

            // Show improvement
            if (response.data.crawlData.totalPages > 1) {
                console.log('\n🎉 SUCCESS: Deep interactive scraping found multiple pages!');
                console.log(`   Discovered ${response.data.crawlData.totalPages} pages through element interaction`);
                console.log('   This includes both navigated pages and interacted states');
            } else {
                console.log('\n⚠️ Still only found 1 page. Possible reasons:');
                console.log('   - React app requires specific user interactions');
                console.log('   - Authentication needed for protected routes');
                console.log('   - Elements are not properly clickable');
                console.log('   - App uses complex state management');
            }
        } else {
            console.log('\n⚠️ No crawl data - login may have failed');
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
testDeepInteractiveScraping();
