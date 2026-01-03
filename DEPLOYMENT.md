# Deployment Setup - HTTPS with Nginx

## Architecture

```
┌─────────────┐     HTTPS      ┌──────────┐     HTTP      ┌──────────────┐
│   Browser   │ ──────────────> │  Nginx   │ ────────────> │ Relay Server │
│ (localhost) │     (443)       │ Container│    (8080)     │   (host)     │
└─────────────┘                 └──────────┘               └──────────────┘
                                     │
                                     │ Serves static files
                                     │ from /dist
                                     ▼
                               ┌──────────┐
                               │  Client  │
                               │  (PWA)   │
                               └──────────┘
```

## Setup

### 1. Build the Client

```bash
cd /home/kodi/messages/web
npm run build
```

This creates production-optimized files in `dist/` directory.

### 2. Start the Nginx Container

```bash
cd /home/kodi/messages
docker-compose up -d nginx
```

This starts:
- **nginx** on ports 80 (HTTP) and 443 (HTTPS)
- **redis** on port 6379 (for relay server)

### 3. Make Sure Relay Server is Running

```bash
cd /home/kodi/messages/server
./relay
```

The relay server should be running on port 8080.

## Access the Application

- **HTTPS (recommended)**: https://localhost
- **HTTP (redirects to HTTPS)**: http://localhost

## How It Works

### Nginx Configuration

Nginx acts as a reverse proxy and HTTPS terminator:

1. **Static Files**: Serves React SPA from `/usr/share/nginx/html/`
2. **API Proxy**: Proxies `/queue/*` to relay server at `http://relay:8080`
3. **WebSocket Proxy**: Proxies `/ws` to relay server with upgrade headers
4. **SSL/TLS**: Terminates HTTPS using self-signed certificates in `.cert/`

### Client Configuration

The client automatically uses `window.location.origin` as the relay URL, which means:
- When accessed via `https://localhost`, it connects to `https://localhost/queue/...`
- Nginx proxies those requests to `http://localhost:8080/queue/...`
- No Mixed Content errors! 🎉

### Network Setup

The nginx container uses `extra_hosts` with `host-gateway` to reach the relay server running on the host machine at `http://relay:8080`.

## Rebuilding After Changes

### Rebuild Client Only

```bash
cd /home/kodi/messages/web
npm run build
docker-compose build --no-cache nginx
docker-compose up -d nginx
```

### View Logs

```bash
# Nginx logs
docker logs -f privmsg-nginx

# All services
docker-compose logs -f
```

### Stop Services

```bash
docker-compose down
```

## Files

- `web/nginx.conf` - Nginx configuration
- `web/Dockerfile` - Nginx container build file
- `docker-compose.yml` - Docker Compose orchestration
- `web/.cert/` - Self-signed SSL certificates
- `web/dist/` - Built client files (generated)

## Notes

- The SSL certificates are self-signed, so browsers will show a warning
- For production, replace with proper SSL certificates (Let's Encrypt)
- The relay server runs on the host, not in Docker
- WebSocket connections are properly proxied with upgrade headers
- HTTP requests are automatically redirected to HTTPS
