const axios = require('axios');

async function testFeatureExtraction() {
    try {
        console.log('🧪 Testing Feature Extraction API...\n');

        const testData = {
            websiteUrl: 'https://example.com',
            credentials: {
                username: 'test@example.com',
                password: 'testpassword123'
            }
        };

        console.log('📤 Sending request to /demo/create-demo...');
        console.log('URL:', testData.websiteUrl);
        console.log('Username:', testData.credentials.username);
        console.log('Password:', '***hidden***\n');

        const response = await axios.post('http://localhost:3000/demo/create-demo', testData, {
            timeout: 60000, // 60 second timeout for AI processing
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Response received!');
        console.log('Status:', response.status);
        console.log('\n📊 Demo Information:');
        console.log('- Demo ID:', response.data.demoId);
        console.log('- Demo Name:', response.data.demoName);
        console.log('- Website URL:', response.data.websiteUrl);
        console.log('- Login Status:', response.data.loginStatus);
        console.log('- Processing Time:', response.data.summary?.processingTime + 'ms');

        if (response.data.extractedFeatures) {
            console.log('\n🎯 Extracted Features:');
            console.log('- Total Features:', response.data.extractedFeatures.features.length);

            response.data.extractedFeatures.features.forEach((feature, index) => {
                console.log(`\n${index + 1}. ${feature.name}`);
                console.log(`   Description: ${feature.description}`);
                console.log(`   Category: ${feature.category}`);
                console.log(`   Importance: ${feature.importance}`);
                console.log(`   Actions: ${feature.actions.join(', ')}`);
                if (feature.selector) {
                    console.log(`   Selector: ${feature.selector}`);
                }
            });

            console.log('\n🧭 Navigation Elements:');
            console.log('- Menus:', response.data.extractedFeatures.navigation.menus);
            console.log('- Buttons:', response.data.extractedFeatures.navigation.buttons);
            console.log('- Forms:', response.data.extractedFeatures.navigation.forms);

            console.log('\n📄 Page Structure:');
            console.log('- Sections:', response.data.extractedFeatures.pageStructure.sections);
            console.log('- Interactive Elements:', response.data.extractedFeatures.pageStructure.interactiveElements);
        }

        console.log('\n🎉 Feature extraction test completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

// Run the test
testFeatureExtraction();
