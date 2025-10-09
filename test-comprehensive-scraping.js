const axios = require('axios');

async function testComprehensiveScraping() {
    try {
        console.log('🕷️ Testing Comprehensive Crawl + Scrape functionality...\n');

        // Test with your React app
        const testUrl = 'https://your-react-app.com'; // Replace with your React app URL
        console.log(`🌐 Testing with React app: ${testUrl}`);

        const response = await axios.post('http://localhost:3000/demo/create-demo', {
            websiteUrl: testUrl,
            credentials: {
                username: 'your-username', // Replace with actual username
                password: 'your-password'  // Replace with actual password
            },
            maxPages: 10 // Limit for testing
        }, {
            timeout: 300000 // 5 minute timeout for comprehensive scraping
        });

        console.log('✅ Comprehensive Crawl + Scrape completed!');
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

        // Comprehensive scraping results
        if (response.data.crawlData) {
            console.log('\n🕷️ Comprehensive Scraping Results:');
            console.log(`   Success: ${response.data.crawlData.success}`);
            console.log(`   Total Pages: ${response.data.crawlData.totalPages}`);
            console.log(`   Crawl Time: ${response.data.crawlData.crawlTime}ms`);
            console.log(`   Dump Path: ${response.data.crawlData.dumpPath}`);

            console.log('\n📄 Scraped Pages with Content Analysis:');
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

                    if (page.scrapedData.headings) {
                        console.log(`      📝 Headings:`);
                        Object.entries(page.scrapedData.headings).forEach(([level, headings]) => {
                            if (headings.length > 0) {
                                console.log(`         ${level.toUpperCase()}: ${headings.slice(0, 3).join(', ')}${headings.length > 3 ? '...' : ''}`);
                            }
                        });
                    }

                    if (page.scrapedData.navigation?.menus?.length > 0) {
                        console.log(`      🧭 Navigation:`);
                        page.scrapedData.navigation.menus.forEach(menu => {
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

            console.log('\n🎯 Scraped Data Includes:');
            console.log('   ✅ Forms (inputs, actions, methods)');
            console.log('   ✅ Buttons (text, types, data attributes)');
            console.log('   ✅ Links (destinations, text, targets)');
            console.log('   ✅ Images (sources, alt text, dimensions)');
            console.log('   ✅ Tables (headers, rows, data)');
            console.log('   ✅ Navigation (menus, breadcrumbs)');
            console.log('   ✅ Meta tags (description, keywords, author)');
            console.log('   ✅ Structured data (JSON-LD, microdata)');
            console.log('   ✅ Headings hierarchy (H1-H6)');
            console.log('   ✅ Lists (ordered, unordered)');
            console.log('   ✅ Content blocks (cards, sections)');
            console.log('   ✅ Framework elements (React, Vue, Angular)');
            console.log('   ✅ Content analysis (word count, features)');

            // Show improvement
            if (response.data.crawlData.totalPages > 1) {
                console.log('\n🎉 SUCCESS: Found multiple pages with comprehensive scraping!');
                console.log(`   Crawled ${response.data.crawlData.totalPages} pages with full content analysis`);
            } else {
                console.log('\n⚠️ Still only found 1 page. Check:');
                console.log('   - React app navigation patterns');
                console.log('   - Authentication requirements');
                console.log('   - Client-side routing configuration');
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
testComprehensiveScraping();
