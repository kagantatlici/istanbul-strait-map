# Frontend Production Configuration

## Backend URL Configuration

To connect the frontend to your deployed backend:

1. **Update AIS Configuration** in `istanbul_strait_nautical_map.html`:

```javascript
// Replace this configuration:
const AIS_CONFIG = {
    // Production backend URL (replace with your deployed URL)
    BACKEND_WS_URL: 'wss://your-app-name.railway.app/ais',
    BACKEND_AVAILABLE: true,
    
    // Local development fallback
    LOCAL_WS_URL: 'ws://localhost:3001/ais',
    
    // ... rest of configuration
};
```

## Common Deployment URLs

### Railway
```
wss://your-app-name.railway.app/ais
```

### Heroku  
```
wss://your-app-name.herokuapp.com/ais
```

### Custom Domain
```
wss://ais.yourdomain.com/ais
```

## Environment Detection

The frontend can auto-detect the environment:

```javascript
const AIS_CONFIG = {
    BACKEND_WS_URL: window.location.hostname === 'localhost' 
        ? 'ws://localhost:3001/ais'
        : 'wss://your-production-backend.com/ais',
    BACKEND_AVAILABLE: true,
    // ... rest of config
};
```

## Testing Checklist

After updating the configuration:

- [ ] Local testing: `python3 -m http.server 8080`
- [ ] Production testing: Deploy to GitHub Pages
- [ ] WebSocket connection: Check browser console
- [ ] Ship visibility: Verify demo ships appear
- [ ] Mobile testing: Test on actual mobile devices