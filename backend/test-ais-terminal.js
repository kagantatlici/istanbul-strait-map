const WebSocket = require('ws');

console.log('🌊 Testing AIS data from terminal...');
console.log('🎯 Target: Istanbul Strait');

const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

ws.on('open', function() {
    console.log('✅ Connected to AISStream.io!');
    
    const subscription = {
        APIKey: 'd9f7e48524cd9b6f07f782a19968d1d01fda4274',
        BoundingBoxes: [[[40.85, 28.75], [41.25, 29.30]]], // Istanbul Strait
        FilterMessageTypes: ['PositionReport']
    };
    
    ws.send(JSON.stringify(subscription));
    console.log('📡 Subscription sent for Istanbul Strait (40.85,28.75 to 41.25,29.30)');
    console.log('⏳ Waiting for ship data...\n');
});

let shipCount = 0;

ws.on('message', function(data) {
    try {
        const message = JSON.parse(data);
        
        if (message.MessageType === 'PositionReport') {
            shipCount++;
            const posReport = message.Message.PositionReport;
            const metadata = message.Metadata;
            
            console.log(`🚢 SHIP #${shipCount}:`);
            console.log(`   MMSI: ${posReport.UserID}`);
            console.log(`   Name: ${metadata?.ShipName || 'Unknown'}`);
            console.log(`   Position: ${metadata?.Latitude || posReport.Latitude}, ${metadata?.Longitude || posReport.Longitude}`);
            console.log(`   Speed: ${posReport.SpeedOverGround || 0} knots`);
            console.log(`   Heading: ${posReport.TrueHeading || 0}°`);
            console.log(`   Time: ${new Date().toISOString()}`);
            console.log('');
        }
    } catch (e) {
        console.log('📦 Received data (non-JSON):', data.toString().substring(0, 100));
    }
});

ws.on('error', function(error) {
    console.log('❌ WebSocket Error:', error.message);
});

ws.on('close', function(code, reason) {
    console.log(`🔌 Connection closed: Code ${code}, Reason: ${reason.toString()}`);
    console.log(`📊 Total ships detected: ${shipCount}`);
});

// Auto-stop after 30 seconds
setTimeout(() => {
    console.log('\n⏱️  Test completed - stopping connection...');
    ws.close();
}, 30000);

console.log('💡 This will run for 30 seconds. Press Ctrl+C to stop earlier.');