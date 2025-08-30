const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
// Using built-in fetch available in Node.js 18+
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: [
        'https://kagantatlici.github.io',
        'http://localhost:3000',
        'http://localhost:8080',
        'http://127.0.0.1:8080'
    ],
    credentials: true
}));

app.use(express.json());
app.use(express.static('public'));

// AIS Proxy Server Class
class AISProxyServer {
    constructor() {
        this.aisConnection = null;
        this.clients = new Set();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = parseInt(process.env.MAX_RECONNECT_ATTEMPTS) || 10;
        this.reconnectInterval = parseInt(process.env.RECONNECT_INTERVAL) || 5000;
        this.shipData = new Map();
        this.isConnected = false;
        
        // Istanbul Strait bounding box
        this.boundingBox = [
            parseFloat(process.env.BBOX_SOUTH_WEST_LAT) || 40.85,
            parseFloat(process.env.BBOX_SOUTH_WEST_LNG) || 28.75,
            parseFloat(process.env.BBOX_NORTH_EAST_LAT) || 41.25,
            parseFloat(process.env.BBOX_NORTH_EAST_LNG) || 29.30
        ];
        
        this.startCleanupProcess();
    }
    
    // Connect to AISStream.io or fallback to local data bridge
    connectToAISStream() {
        if (this.aisConnection && this.aisConnection.readyState === WebSocket.OPEN) {
            return;
        }
        
        // Check if we're running on Railway (or other cloud provider)
        if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') {
            console.log('🚂 Detected Railway/cloud environment - AISStream.io blocks cloud IPs');
            console.log('⚡ Skipping AISStream.io and using local bridge directly');
            this.tryLocalDataBridge();
            return;
        }
        
        // Check if required environment variables are available
        if (!process.env.AISSTREAM_WS_URL || !process.env.AISSTREAM_API_KEY) {
            console.log('⚠️  Missing AIS environment variables, checking for local data bridge...');
            this.tryLocalDataBridge();
            return;
        }
        
        console.log('🌊 Connecting to AISStream.io...');
        
        try {
            this.aisConnection = new WebSocket(process.env.AISSTREAM_WS_URL);
            this.setupAISEventHandlers();
        } catch (error) {
            console.error('❌ Failed to connect to AISStream.io:', error);
            this.tryLocalDataBridge();
        }
    }
    
    // Try to fetch from local data bridge
    async tryLocalDataBridge() {
        const localBridgeURL = process.env.LOCAL_AIS_BRIDGE_URL || 'http://localhost:3002';
        
        try {
            console.log('🔍 Trying local AIS data bridge...');
            const response = await fetch(`${localBridgeURL}/ais/status`);
            
            if (response.ok) {
                const status = await response.json();
                console.log('✅ Local AIS bridge found:', status);
                this.startLocalDataPolling(localBridgeURL);
            } else {
                throw new Error(`Bridge responded with ${response.status}`);
            }
        } catch (error) {
            console.log('❌ Local bridge not available:', error.message);
            console.log('🎭 Starting demo mode...');
            this.handleConnectionFailure();
        }
    }
    
    // Poll local data bridge periodically
    startLocalDataPolling(bridgeURL) {
        this.isConnected = 'bridge';
        this.broadcastStatus('connected', 'Connected to local AIS bridge');
        
        // Initial fetch
        this.fetchFromLocalBridge(bridgeURL);
        
        // Set up polling every 2 minutes
        this.bridgePollingInterval = setInterval(() => {
            this.fetchFromLocalBridge(bridgeURL);
        }, 120000); // 2 minutes
        
        console.log('🔄 Started polling local AIS bridge every 2 minutes');
    }
    
    // Fetch ships from local bridge
    async fetchFromLocalBridge(bridgeURL) {
        try {
            const response = await fetch(`${bridgeURL}/ais/ships`);
            
            if (response.ok) {
                const data = await response.json();
                console.log(`📡 Fetched ${data.ships.length} ships from local bridge`);
                
                // Process each ship
                data.ships.forEach(ship => {
                    this.processBridgeShip(ship);
                });
                
                // Clean up old ships not in current data
                this.cleanupMissingShips(data.ships);
                
            } else {
                console.error('❌ Failed to fetch from local bridge:', response.status);
            }
        } catch (error) {
            console.error('❌ Bridge fetch error:', error.message);
        }
    }
    
    // Process ship from bridge data
    processBridgeShip(ship) {
        const shipData = {
            mmsi: ship.mmsi,
            shipName: ship.shipName,
            latitude: ship.latitude,
            longitude: ship.longitude,
            heading: ship.heading,
            speed: ship.speed,
            vesselType: this.categorizeVesselType(ship.vesselType),
            destination: 'Unknown',
            lastUpdate: Date.now(),
            timestamp: new Date().toISOString()
        };
        
        this.shipData.set(ship.mmsi, shipData);
        this.broadcastShipUpdate(shipData);
    }
    
    // Clean up ships not in current bridge data
    cleanupMissingShips(currentShips) {
        const currentMMSIs = new Set(currentShips.map(ship => ship.mmsi));
        
        for (const [mmsi, ship] of this.shipData.entries()) {
            if (!currentMMSIs.has(mmsi)) {
                // Remove ships not in current data after 5 minutes
                if (Date.now() - ship.lastUpdate > 300000) {
                    this.shipData.delete(mmsi);
                }
            }
        }
    }
    
    // Handle connection failure and start demo mode if needed
    handleConnectionFailure() {
        console.log('🎭 AISStream.io connection failed, starting demo mode...');
        this.isConnected = false;
        this.startDemoMode();
    }
    
    // Setup AISStream.io WebSocket event handlers
    setupAISEventHandlers() {
        this.aisConnection.onopen = () => {
            console.log('✅ Connected to AISStream.io');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.sendSubscription();
            this.broadcastStatus('connected', 'Connected to AIS data stream');
        };
        
        this.aisConnection.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.processAISMessage(data);
            } catch (error) {
                console.error('❌ Error parsing AIS message:', error);
            }
        };
        
        this.aisConnection.onerror = (error) => {
            console.error('❌ AISStream.io connection error:', error);
            this.broadcastStatus('error', 'AIS connection error');
        };
        
        this.aisConnection.onclose = (event) => {
            console.log(`🔌 AISStream.io connection closed: ${event.code} - ${event.reason}`);
            this.isConnected = false;
            this.broadcastStatus('disconnected', 'AIS connection closed');
            
            // If we keep getting 1006 errors (CORS/auth issues), switch to demo mode
            if (event.code === 1006 && this.reconnectAttempts >= 3) {
                console.log('🎭 Multiple 1006 errors detected, switching to demo mode...');
                this.handleConnectionFailure();
                return;
            }
            
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.scheduleReconnect();
            }
        };
    }
    
    // Send subscription message to AISStream.io
    sendSubscription() {
        const subscriptionMessage = {
            APIKey: process.env.AISSTREAM_API_KEY,
            BoundingBoxes: [this.boundingBox],
            FiltersShipAndCargo: true,
            FilterMessageTypes: ["PositionReport"]
        };
        
        this.aisConnection.send(JSON.stringify(subscriptionMessage));
        console.log('📡 Subscription sent to AISStream.io:', {
            boundingBox: this.boundingBox,
            filterTypes: ["PositionReport"]
        });
    }
    
    // Process incoming AIS messages
    processAISMessage(data) {
        try {
            if (data.MessageType === 'PositionReport' && data.Message && data.Message.PositionReport) {
                const positionReport = data.Message.PositionReport;
                const metadata = data.Metadata;
                
                // Create standardized ship data
                const shipData = {
                    mmsi: positionReport.UserID?.toString() || 'unknown',
                    shipName: metadata.ShipName || `Ship ${positionReport.UserID}`,
                    latitude: metadata.Latitude || positionReport.Latitude,
                    longitude: metadata.Longitude || positionReport.Longitude,
                    heading: positionReport.TrueHeading || positionReport.CourseOverGround || 0,
                    speed: positionReport.SpeedOverGround || 0,
                    vesselType: this.categorizeVesselType(metadata.VesselType),
                    destination: metadata.Destination || 'Unknown',
                    lastUpdate: Date.now(),
                    timestamp: new Date().toISOString()
                };
                
                // Validate coordinates are within Istanbul Strait
                if (this.isWithinBounds(shipData.latitude, shipData.longitude)) {
                    this.shipData.set(shipData.mmsi, shipData);
                    this.broadcastShipUpdate(shipData);
                    
                    // Log new ships
                    if (!this.shipData.has(shipData.mmsi)) {
                        console.log(`🚢 New ship detected: ${shipData.shipName} (${shipData.mmsi})`);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error processing AIS message:', error);
        }
    }
    
    // Check if coordinates are within Istanbul Strait bounds
    isWithinBounds(lat, lng) {
        return lat >= this.boundingBox[0] && lat <= this.boundingBox[2] &&
               lng >= this.boundingBox[1] && lng <= this.boundingBox[3];
    }
    
    // Categorize vessel type
    categorizeVesselType(vesselType) {
        if (!vesselType) return 'other';
        
        const type = vesselType.toLowerCase();
        if (type.includes('cargo') || type.includes('container')) return 'cargo';
        if (type.includes('tanker') || type.includes('oil')) return 'tanker';
        if (type.includes('passenger') || type.includes('ferry')) return 'passenger';
        if (type.includes('fishing')) return 'fishing';
        if (type.includes('military') || type.includes('naval')) return 'military';
        return 'other';
    }
    
    // Schedule reconnection attempt
    scheduleReconnect() {
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectInterval * this.reconnectAttempts, 30000);
        
        console.log(`🔄 Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        
        setTimeout(() => {
            if (this.reconnectAttempts <= this.maxReconnectAttempts) {
                this.connectToAISStream();
            }
        }, delay);
    }
    
    // Broadcast ship update to all connected clients
    broadcastShipUpdate(shipData) {
        const message = {
            type: 'ship_update',
            data: shipData
        };
        
        this.broadcastToClients(message);
    }
    
    // Broadcast status update to all connected clients
    broadcastStatus(status, message) {
        const statusMessage = {
            type: 'status_update',
            status: status,
            message: message,
            shipCount: this.shipData.size,
            timestamp: new Date().toISOString()
        };
        
        this.broadcastToClients(statusMessage);
    }
    
    // Broadcast message to all connected WebSocket clients
    broadcastToClients(message) {
        const messageStr = JSON.stringify(message);
        
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(messageStr);
                } catch (error) {
                    console.error('❌ Error sending message to client:', error);
                    this.clients.delete(client);
                }
            } else {
                this.clients.delete(client);
            }
        });
    }
    
    // Add new WebSocket client
    addClient(ws) {
        this.clients.add(ws);
        console.log(`👥 Client connected. Total clients: ${this.clients.size}`);
        
        // Send current status to new client
        if (this.isConnected) {
            ws.send(JSON.stringify({
                type: 'status_update',
                status: 'connected',
                message: 'Connected to AIS data stream',
                shipCount: this.shipData.size
            }));
            
            // Send current ships to new client
            this.shipData.forEach(ship => {
                ws.send(JSON.stringify({
                    type: 'ship_update',
                    data: ship
                }));
            });
        }
    }
    
    // Remove WebSocket client
    removeClient(ws) {
        this.clients.delete(ws);
        console.log(`👥 Client disconnected. Total clients: ${this.clients.size}`);
    }
    
    // Start cleanup process for old ships
    startCleanupProcess() {
        setInterval(() => {
            this.cleanupOldShips();
        }, parseInt(process.env.CLEANUP_INTERVAL) || 60000);
    }
    
    // Remove ships that haven't been updated recently
    cleanupOldShips() {
        const now = Date.now();
        const maxAge = parseInt(process.env.CLEANUP_INTERVAL) || 60000;
        let removedCount = 0;
        
        for (const [mmsi, ship] of this.shipData.entries()) {
            if (now - ship.lastUpdate > maxAge) {
                this.shipData.delete(mmsi);
                removedCount++;
                
                // Broadcast ship removal
                this.broadcastToClients({
                    type: 'ship_remove',
                    mmsi: mmsi
                });
            }
        }
        
        if (removedCount > 0) {
            console.log(`🧹 Cleaned up ${removedCount} old ships. Active ships: ${this.shipData.size}`);
        }
    }
    
    // Start demo mode with simulated AIS data
    startDemoMode() {
        console.log('🎭 Starting AIS demo mode with simulated ships...');
        this.isConnected = 'demo';
        this.broadcastStatus('demo', 'AIS Demo Mode - Simulated data active');
        
        // Create realistic demo ships for Istanbul Strait
        const demoShips = [
            {
                mmsi: '271001001',
                shipName: 'BOSPHORUS CARGO',
                latitude: 41.0335,
                longitude: 29.0095,
                heading: 15,
                speed: 8.5,
                vesselType: 'cargo',
                destination: 'Haydarpasa',
                lastUpdate: Date.now(),
                timestamp: new Date().toISOString()
            },
            {
                mmsi: '271001002',
                shipName: 'ISTANBUL TANKER',
                latitude: 41.0285,
                longitude: 29.0145,
                heading: 195,
                speed: 6.2,
                vesselType: 'tanker',
                destination: 'Aliaga',
                lastUpdate: Date.now(),
                timestamp: new Date().toISOString()
            },
            {
                mmsi: '271001003',
                shipName: 'GOLDEN HORN FERRY',
                latitude: 41.0385,
                longitude: 29.0065,
                heading: 135,
                speed: 12.0,
                vesselType: 'passenger',
                destination: 'Kadikoy',
                lastUpdate: Date.now(),
                timestamp: new Date().toISOString()
            },
            {
                mmsi: '271001004',
                shipName: 'MARMARA EXPRESS',
                latitude: 41.0405,
                longitude: 29.0125,
                heading: 325,
                speed: 14.3,
                vesselType: 'passenger',
                destination: 'Eminonu',
                lastUpdate: Date.now(),
                timestamp: new Date().toISOString()
            },
            {
                mmsi: '271001005',
                shipName: 'BLACK SEA TRADER',
                latitude: 41.0455,
                longitude: 29.0185,
                heading: 45,
                speed: 9.8,
                vesselType: 'cargo',
                destination: 'Samsun',
                lastUpdate: Date.now(),
                timestamp: new Date().toISOString()
            }
        ];
        
        // Add demo ships to tracking
        demoShips.forEach(ship => {
            this.shipData.set(ship.mmsi, ship);
            this.broadcastShipUpdate(ship);
        });
        
        // Start demo movement simulation
        this.startDemoMovement();
        
        console.log(`🚢 Demo mode active with ${demoShips.length} simulated ships`);
    }
    
    // Simulate ship movement in demo mode
    startDemoMovement() {
        if (this.demoInterval) clearInterval(this.demoInterval);
        
        this.demoInterval = setInterval(() => {
            if (this.isConnected === 'demo') {
                this.shipData.forEach((ship, mmsi) => {
                    // Simulate realistic movement
                    const speedKnots = ship.speed;
                    const speedMs = speedKnots * 0.514444; // Convert knots to m/s
                    const distanceM = speedMs * 30; // 30 second intervals
                    const distanceDeg = distanceM / 111320; // Rough conversion to degrees
                    
                    // Calculate new position based on heading
                    const headingRad = (ship.heading * Math.PI) / 180;
                    const deltaLat = Math.cos(headingRad) * distanceDeg;
                    const deltaLng = Math.sin(headingRad) * distanceDeg;
                    
                    // Update position
                    ship.latitude += deltaLat;
                    ship.longitude += deltaLng;
                    ship.lastUpdate = Date.now();
                    ship.timestamp = new Date().toISOString();
                    
                    // Keep ships within bounds (simple boundary check)
                    if (ship.latitude < this.boundingBox[0] || ship.latitude > this.boundingBox[2] ||
                        ship.longitude < this.boundingBox[1] || ship.longitude > this.boundingBox[3]) {
                        // Reverse direction if out of bounds
                        ship.heading = (ship.heading + 180) % 360;
                    }
                    
                    // Slight random variation in heading (realistic)
                    ship.heading += (Math.random() - 0.5) * 5;
                    ship.heading = (ship.heading + 360) % 360;
                    
                    // Slight speed variation
                    ship.speed += (Math.random() - 0.5) * 0.5;
                    ship.speed = Math.max(2, Math.min(ship.speed, 15));
                    
                    this.broadcastShipUpdate(ship);
                });
            }
        }, 30000); // Update every 30 seconds
    }
    
    // Get current statistics
    getStats() {
        return {
            connected: this.isConnected,
            mode: this.isConnected === 'bridge' ? 'bridge' : 
                  this.isConnected === 'demo' ? 'demo' : 
                  (this.isConnected ? 'live' : 'disconnected'),
            clientCount: this.clients.size,
            shipCount: this.shipData.size,
            reconnectAttempts: this.reconnectAttempts,
            boundingBox: this.boundingBox
        };
    }
}

// Initialize AIS Proxy Server
const aisProxy = new AISProxyServer();

// HTTP Routes
app.get('/', (req, res) => {
    res.json({
        service: 'Istanbul Strait AIS Proxy Server',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            websocket: '/ais',
            stats: '/stats',
            health: '/health'
        }
    });
});

app.get('/health', (req, res) => {
    const stats = aisProxy.getStats();
    res.json({
        status: stats.connected ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        ...stats
    });
});

app.get('/stats', (req, res) => {
    res.json(aisProxy.getStats());
});

// Create HTTP server
const server = require('http').createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ 
    server
    // No custom path for Railway compatibility
});

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
    aisProxy.addClient(ws);
    
    ws.on('close', () => {
        aisProxy.removeClient(ws);
    });
    
    ws.on('error', (error) => {
        console.error('❌ WebSocket client error:', error);
        aisProxy.removeClient(ws);
    });
});

// Start the server
server.listen(PORT, () => {
    console.log('🚀 Istanbul Strait AIS Proxy Server started');
    console.log(`📍 Server running on port ${PORT}`);
    console.log(`🌐 WebSocket endpoint: ws://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📈 Stats: http://localhost:${PORT}/stats`);
    
    // For testing: Start demo mode immediately
    console.log('🧪 Testing mode: Starting demo immediately...');
    aisProxy.startDemoMode();
    
    // Also try to connect to AISStream.io in parallel
    aisProxy.connectToAISStream();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    
    if (aisProxy.aisConnection) {
        aisProxy.aisConnection.close();
    }
    
    server.close(() => {
        console.log('✅ Server stopped gracefully');
        process.exit(0);
    });
});

module.exports = { app, aisProxy };