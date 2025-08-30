# Istanbul Strait AIS Proxy Server

A Node.js backend proxy server that connects to AISStream.io and provides real-time AIS data to the Istanbul Strait nautical map frontend application.

## Features

🌊 **Real-time AIS Data**: Connects to AISStream.io WebSocket API  
🚢 **Ship Tracking**: Filters ships within Istanbul Strait boundaries  
🔒 **Secure**: API keys stored in environment variables  
📡 **WebSocket Proxy**: Broadcasts AIS data to multiple frontend clients  
🧹 **Auto Cleanup**: Removes inactive ships automatically  
📊 **Monitoring**: Health checks and statistics endpoints  

## Quick Start

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Environment Setup
Copy `.env` file and update your AISStream.io API key:
```bash
cp .env.example .env
# Edit .env with your API key
```

### 3. Start Development Server
```bash
npm run dev
```

### 4. Start Production Server
```bash
npm start
```

## API Endpoints

### WebSocket
- **`ws://localhost:3001/ais`** - Real-time AIS data stream

### HTTP Endpoints
- **`GET /`** - Server information
- **`GET /health`** - Health check with connection status
- **`GET /stats`** - Current statistics (ships, clients, etc.)

## WebSocket Messages

### Incoming (from clients)
No incoming messages required - server automatically streams data.

### Outgoing (to clients)

#### Ship Update
```json
{
  "type": "ship_update",
  "data": {
    "mmsi": "271002099",
    "shipName": "VESSEL NAME",
    "latitude": 41.0335,
    "longitude": 29.0095,
    "heading": 45,
    "speed": 8.5,
    "vesselType": "cargo",
    "destination": "Istanbul",
    "lastUpdate": 1640995200000,
    "timestamp": "2021-12-31T12:00:00.000Z"
  }
}
```

#### Status Update
```json
{
  "type": "status_update",
  "status": "connected",
  "message": "Connected to AIS data stream",
  "shipCount": 12,
  "timestamp": "2021-12-31T12:00:00.000Z"
}
```

#### Ship Removal
```json
{
  "type": "ship_remove",
  "mmsi": "271002099"
}
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AISSTREAM_API_KEY` | Your AISStream.io API key | Required |
| `PORT` | Server port | 3001 |
| `NODE_ENV` | Environment (development/production) | development |
| `MAX_RECONNECT_ATTEMPTS` | Max WebSocket reconnect attempts | 10 |
| `RECONNECT_INTERVAL` | Reconnect delay (ms) | 5000 |
| `CLEANUP_INTERVAL` | Ship cleanup interval (ms) | 60000 |
| `MAX_SHIPS` | Maximum ships to track | 50 |

### Istanbul Strait Bounding Box
- **Southwest**: 40.85°N, 28.75°E
- **Northeast**: 41.25°N, 29.30°E

## Ship Categories

| Category | Vessel Types |
|----------|--------------|
| `cargo` | Cargo, Container ships |
| `tanker` | Tankers, Oil vessels |
| `passenger` | Passenger ships, Ferries |
| `fishing` | Fishing vessels |
| `military` | Naval, Military vessels |
| `other` | All other vessel types |

## Monitoring

### Health Check
```bash
curl http://localhost:3001/health
```

### Statistics
```bash
curl http://localhost:3001/stats
```

### Logs
Server provides detailed console logging:
- 🌊 Connection events
- 🚢 Ship detection
- 👥 Client connections
- 🧹 Cleanup operations
- ❌ Errors and warnings

## Development

### Scripts
- `npm start` - Start production server
- `npm run dev` - Start development server with auto-reload
- `npm test` - Run tests (placeholder)

### Dependencies
- **express** - HTTP server framework
- **ws** - WebSocket library
- **cors** - Cross-origin resource sharing
- **dotenv** - Environment configuration

## Deployment

### Local Development
1. Start backend: `npm run dev`
2. Update frontend WebSocket URL to `ws://localhost:3001/ais`
3. Open frontend in browser

### Production Deployment
Deploy to cloud services like:
- **Heroku**: Easy deployment with git
- **Railway**: Modern deployment platform  
- **DigitalOcean**: VPS deployment
- **AWS**: EC2 or Lambda deployment

## Security

- ✅ API keys stored in environment variables
- ✅ CORS protection for frontend domains
- ✅ No API key exposure to clients
- ✅ Rate limiting via AISStream.io
- ✅ Input validation and error handling

## Troubleshooting

### Common Issues

**WebSocket Connection Failed**
- Check AISStream.io API key
- Verify internet connection
- Check firewall settings

**No Ships Visible**
- Confirm ships are in Istanbul Strait area
- Check bounding box configuration
- Verify AISStream.io subscription

**High Memory Usage**
- Adjust `CLEANUP_INTERVAL` for more frequent cleanup
- Reduce `MAX_SHIPS` limit
- Monitor ship data size

## License

MIT License - See LICENSE file for details.