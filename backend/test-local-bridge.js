// Test script to check if local AIS bridge is accessible
const fetch = require('node-fetch').default || require('node-fetch');

async function testLocalBridge() {
    const bridgeURL = 'http://localhost:3002';
    
    console.log('🧪 Testing local AIS data bridge...');
    
    try {
        // Test status endpoint
        console.log('📊 Checking status...');
        const statusResponse = await fetch(`${bridgeURL}/ais/status`);
        
        if (statusResponse.ok) {
            const status = await statusResponse.json();
            console.log('✅ Status:', status);
        } else {
            console.log('❌ Status failed:', statusResponse.status);
            return;
        }
        
        // Test ships endpoint
        console.log('🚢 Checking ships...');
        const shipsResponse = await fetch(`${bridgeURL}/ais/ships`);
        
        if (shipsResponse.ok) {
            const ships = await shipsResponse.json();
            console.log('✅ Ships data:', {
                count: ships.count,
                status: ships.status,
                firstShip: ships.ships[0] || 'No ships'
            });
        } else {
            console.log('❌ Ships failed:', shipsResponse.status);
        }
        
    } catch (error) {
        console.log('❌ Connection failed:', error.message);
    }
}

testLocalBridge();