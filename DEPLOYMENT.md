# 🚀 AIS Backend Deployment Guide

This guide covers deploying the Istanbul Strait AIS Proxy Server to various cloud platforms.

## 📋 Pre-deployment Checklist

- [ ] ✅ Backend tested locally (`npm start` in backend/)
- [ ] ✅ End-to-end tests passed (`node test-e2e.js`)
- [ ] ✅ Environment variables configured
- [ ] ✅ AISStream.io API key obtained
- [ ] ✅ Production domain configured

## 🌐 Deployment Options

### 1. Railway (Recommended - Easiest)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Deploy from backend directory
cd backend
railway up

# Set environment variables
railway variables set AISSTREAM_API_KEY=your_api_key_here
railway variables set NODE_ENV=production
railway variables set FRONTEND_URL=https://kagantatlici.github.io
```

**Railway Features:**
- ✅ Automatic HTTPS
- ✅ Custom domains
- ✅ Auto-scaling
- ✅ Zero-config deployment

### 2. Heroku

```bash
# Install Heroku CLI
# Create Heroku app
heroku create istanbul-strait-ais

# Set environment variables
heroku config:set AISSTREAM_API_KEY=your_api_key_here
heroku config:set NODE_ENV=production
heroku config:set FRONTEND_URL=https://kagantatlici.github.io

# Deploy
git subtree push --prefix=backend heroku main
```

### 3. DigitalOcean App Platform

1. Connect GitHub repository
2. Select `backend/` as source directory
3. Set environment variables in dashboard
4. Deploy with one click

### 4. Docker Deployment

```bash
# Build Docker image
docker build -t istanbul-ais-proxy .

# Run locally for testing
docker run -p 3001:3001 --env-file backend/.env.production istanbul-ais-proxy

# Deploy to any Docker-compatible platform
```

## 🔧 Environment Variables

| Variable | Description | Production Value |
|----------|-------------|------------------|
| `AISSTREAM_API_KEY` | AISStream.io API key | Your actual key |
| `NODE_ENV` | Environment | `production` |
| `PORT` | Server port | `3001` (or platform default) |
| `FRONTEND_URL` | CORS origin | `https://kagantatlici.github.io` |
| `MAX_RECONNECT_ATTEMPTS` | Reconnection limit | `5` |
| `ENABLE_DEMO_MODE` | Demo fallback | `true` |

## 🎯 Post-Deployment Steps

### 1. Update Frontend Configuration

Edit `istanbul_strait_nautical_map.html`:

```javascript
const AIS_CONFIG = {
    // Update with your deployed URL
    BACKEND_WS_URL: 'wss://your-app-name.railway.app/ais',
    BACKEND_AVAILABLE: true,
    // ... rest of config
};
```

### 2. Test Deployment

```bash
# Health check
curl https://your-deployed-url.com/health

# Stats check
curl https://your-deployed-url.com/stats

# WebSocket test (use wscat or similar)
wscat -c wss://your-deployed-url.com/ais
```

### 3. Update GitHub Pages

```bash
# Commit frontend changes
git add istanbul_strait_nautical_map.html index.html
git commit -m "Update frontend to use production backend"
git push origin main
```

## 📊 Monitoring

### Health Endpoints

- `GET /health` - Health status with metrics
- `GET /stats` - Detailed statistics
- `GET /` - Service information

### Logs to Monitor

- ✅ WebSocket connections from frontend
- ✅ Ship data updates (demo mode)
- ✅ Connection status changes
- ⚠️ AISStream.io connection issues

## 🔒 Security Considerations

- ✅ API keys stored as environment variables
- ✅ CORS configured for production domain
- ✅ No sensitive data in logs
- ✅ Rate limiting via AISStream.io

## 🚨 Troubleshooting

### Common Issues

**Backend not starting:**
- Check environment variables
- Verify Node.js version (18+)
- Check port availability

**WebSocket connection fails:**
- Verify WSS (not WS) for HTTPS sites
- Check CORS configuration
- Test with browser dev tools

**No ships visible:**
- Backend should fall back to demo mode
- Check `/stats` endpoint for ship count
- Verify frontend WebSocket URL

### Quick Fixes

```bash
# Restart service (Railway)
railway restart

# View logs (Railway)  
railway logs

# Check status
curl https://your-url.com/health
```

## 💡 Optimization Tips

1. **Use Demo Mode**: Always enable for fallback
2. **Monitor Resources**: Track memory and CPU usage
3. **Log Rotation**: Configure appropriate log levels
4. **Auto-scaling**: Enable based on traffic
5. **Health Checks**: Set up monitoring alerts

## 📈 Scaling

For high traffic:
- Enable auto-scaling (Railway/Heroku)
- Use CDN for static assets
- Consider Redis for ship data caching
- Load balancer for multiple instances

## ✅ Production Checklist

- [ ] Backend deployed and accessible
- [ ] Health endpoint responding
- [ ] WebSocket endpoint working
- [ ] Demo ships broadcasting
- [ ] Frontend updated with production URL
- [ ] CORS configured correctly
- [ ] Monitoring/alerts set up
- [ ] SSL/TLS certificate valid

## 🎉 Success!

Your AIS proxy server is now live! Test the complete flow:

1. Open: https://kagantatlici.github.io/istanbul-strait-map/
2. Enable AIS toggle
3. Verify ships appear on map
4. Check console for backend connection

The system will automatically fall back to demo mode if needed, ensuring users always see ship data!