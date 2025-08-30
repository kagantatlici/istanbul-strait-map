const WebSocket = require('ws');

console.log('🧪 Testing WebSocket connection to backend...');

const ws = new WebSocket('ws://localhost:3001/ais');

ws.on('open', () => {
    console.log('✅ Connected to backend WebSocket');
});

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data);
        console.log('📡 Received:', message.type, message.data ? `Ship: ${message.data.shipName}` : message.message);
    } catch (error) {
        console.log('📡 Raw message:', data.toString());
    }
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
});

ws.on('close', () => {
    console.log('🔌 WebSocket connection closed');
    process.exit(0);
});

// Close after 10 seconds
setTimeout(() => {
    console.log('⏰ Test complete, closing connection...');
    ws.close();
}, 10000);