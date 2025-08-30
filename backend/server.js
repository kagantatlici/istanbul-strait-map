const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
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
    
    // Connect to AISStream.io
    connectToAISStream() {
        if (this.aisConnection && this.aisConnection.readyState === WebSocket.OPEN) {
            return;
        }
        
        console.log('🌊 Connecting to AISStream.io...');
        
        try {
            this.aisConnection = new WebSocket(process.env.AISSTREAM_WS_URL);
            this.setupAISEventHandlers();
        } catch (error) {
            console.error('❌ Failed to connect to AISStream.io:', error);
            this.handleConnectionFailure();
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
            mode: this.isConnected === 'demo' ? 'demo' : (this.isConnected ? 'live' : 'disconnected'),
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
    server,
    path: '/ais'
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
    console.log(`🌐 WebSocket endpoint: ws://localhost:${PORT}/ais`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📈 Stats: http://localhost:${PORT}/stats`);
    
    // Connect to AISStream.io
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