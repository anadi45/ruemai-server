const axios = require('axios');

async function testServer() {
    try {
        console.log('Testing server connection...');
        const response = await axios.get('http://localhost:3000', { timeout: 5000 });
        console.log('Server is running:', response.status);
    } catch (error) {
        console.error('Server test failed:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error('Server is not running on port 3000');
        }
    }
}

testServer();
