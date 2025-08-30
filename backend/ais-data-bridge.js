const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Store live AIS data with limits
let currentAISData = new Map();
let connectionStatus = 'disconnected';

// Railway-friendly limits
const MAX_SHIPS = 25; // Limit to 25 ships max
const UPDATE_THROTTLE = 30000; // Only update every 30 seconds
const CLEANUP_INTERVAL = 2 * 60 * 1000; // Clean up every 2 minutes
let lastUpdateTime = new Map(); // Track update times per ship

// Ship type filtering - exclude unwanted vessel types
const EXCLUDED_VESSEL_TYPES = [
    // Passenger vessels
    60, 61, 62, 63, 64, 65, 66, 67, 68, 69, // Passenger ships
    70, 71, 72, 73, 74, 75, 76, 77, 78, 79, // Cargo ships are OK
    // Fishing vessels
    30, // Fishing
    // Pleasure craft and small vessels
    36, 37, // Pleasure craft
    // Other unwanted types
    50, 51, 52, 53, 54, 55, 56, 57, 58, 59 // Pilot vessels, SAR, tugs, etc.
];

// Function to check if vessel type should be excluded
function shouldExcludeVessel(vesselType, shipName = '') {
    // Check AIS vessel type code
    if (vesselType && EXCLUDED_VESSEL_TYPES.includes(vesselType)) {
        return true;
    }
    
    // Additional name-based filtering
    const name = (shipName || '').toLowerCase();
    const excludeKeywords = [
        'ferry', 'passenger', 'cruise', 'fishing', 'yacht', 'pleasure',
        'pilot', 'tug', 'rescue', 'coast guard', 'police', 'patrol'
    ];
    
    return excludeKeywords.some(keyword => name.includes(keyword));
}

// Function to get vessel type description
function getVesselTypeDescription(vesselType) {
    if (!vesselType) return 'Unknown';
    
    if (vesselType >= 70 && vesselType <= 79) return 'Cargo';
    if (vesselType >= 80 && vesselType <= 89) return 'Tanker';
    if (vesselType >= 60 && vesselType <= 69) return 'Passenger';
    if (vesselType === 30) return 'Fishing';
    if (vesselType >= 36 && vesselType <= 37) return 'Pleasure';
    
    return `Type-${vesselType}`;
}

// Connect to AISStream.io and capture data
function connectToAIS() {
    console.log('🌊 Starting AIS data bridge...');
    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
    
    ws.on('open', function() {
        console.log('✅ Connected to AISStream.io');
        connectionStatus = 'connected';
        
        const subscription = {
            APIKey: 'd9f7e48524cd9b6f07f782a19968d1d01fda4274',
            BoundingBoxes: [[[40.85, 28.75], [41.25, 29.30]]], // Istanbul Strait
            FilterMessageTypes: ['PositionReport']
        };
        
        ws.send(JSON.stringify(subscription));
        console.log('📡 Subscribed to Istanbul Strait AIS data');
    });
    
    ws.on('message', function(data) {
        try {
            const message = JSON.parse(data);
            
            if (message.MessageType === 'PositionReport') {
                const posReport = message.Message.PositionReport;
                const metadata = message.Metadata;
                
                // Check if vessel should be excluded by type
                const vesselType = metadata?.VesselType;
                const shipName = metadata?.ShipName;
                
                if (shouldExcludeVessel(vesselType, shipName)) {
                    return; // Skip excluded vessel types
                }
                
                const shipData = {
                    mmsi: posReport.UserID?.toString(),
                    shipName: shipName || `Ship ${posReport.UserID}`,
                    latitude: metadata?.Latitude || posReport.Latitude,
                    longitude: metadata?.Longitude || posReport.Longitude,
                    speed: posReport.SpeedOverGround || 0,
                    heading: posReport.TrueHeading || posReport.CourseOverGround || 0,
                    vesselType: vesselType || 0,
                    timestamp: new Date().toISOString(),
                    lastUpdate: Date.now()
                };
                
                // Apply Railway-friendly filtering
                if (shipData.mmsi && shipData.latitude && shipData.longitude) {
                    const now = Date.now();
                    const lastUpdate = lastUpdateTime.get(shipData.mmsi) || 0;
                    
                    // Throttle updates - only update same ship every 30 seconds
                    if (now - lastUpdate < UPDATE_THROTTLE) {
                        return; // Skip this update
                    }
                    
                    // Limit total ships to protect Railway free tier
                    if (currentAISData.size >= MAX_SHIPS && !currentAISData.has(shipData.mmsi)) {
                        return; // Skip new ships if at limit
                    }
                    
                    currentAISData.set(shipData.mmsi, shipData);
                    lastUpdateTime.set(shipData.mmsi, now);
                    
                    // Log with vessel type info
                    const vesselTypeStr = getVesselTypeDescription(shipData.vesselType);
                    console.log(`🚢 Updated: ${shipData.shipName} (${vesselTypeStr}) - ${currentAISData.size}/${MAX_SHIPS}`);
                }
            }
        } catch (error) {
            console.error('❌ Parse error:', error.message);
        }
    });
    
    ws.on('error', function(error) {
        console.log('❌ WebSocket error:', error.message);
        connectionStatus = 'error';
    });
    
    ws.on('close', function(code, reason) {
        console.log(`🔌 Connection closed: ${code}`);
        connectionStatus = 'disconnected';
        
        // Reconnect after 5 seconds
        setTimeout(connectToAIS, 5000);
    });
}

// API endpoints to serve the captured data
app.get('/ais/ships', (req, res) => {
    const ships = Array.from(currentAISData.values());
    res.json({
        ships: ships,
        count: ships.length,
        status: connectionStatus,
        timestamp: new Date().toISOString()
    });
});

app.get('/ais/status', (req, res) => {
    res.json({
        status: connectionStatus,
        shipCount: currentAISData.size,
        timestamp: new Date().toISOString()
    });
});

// Cleanup old ships every 2 minutes (Railway-optimized)
setInterval(() => {
    const now = Date.now();
    const expiredThreshold = CLEANUP_INTERVAL; // 2 minutes
    let removed = 0;
    
    for (const [mmsi, ship] of currentAISData.entries()) {
        if (now - ship.lastUpdate > expiredThreshold) {
            currentAISData.delete(mmsi);
            lastUpdateTime.delete(mmsi);
            removed++;
        }
    }
    
    if (removed > 0) {
        console.log(`🧹 Removed ${removed} old ships. Active: ${currentAISData.size}/${MAX_SHIPS}`);
    }
}, CLEANUP_INTERVAL);

// Start the local bridge server
const PORT = 3002;
app.listen(PORT, () => {
    console.log(`🌐 AIS Data Bridge running on http://localhost:${PORT}`);
    console.log(`📊 Ship data: http://localhost:${PORT}/ais/ships`);
    console.log(`📈 Status: http://localhost:${PORT}/ais/status`);
    
    // Start AIS connection
    connectToAIS();
});