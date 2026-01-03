# Production Deployment Guide

Complete guide for deploying Privacy Messaging to production.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Deployment Options](#deployment-options)
- [VPS Deployment (Recommended)](#vps-deployment-recommended)
- [Docker Deployment](#docker-deployment)
- [SSL/TLS Setup](#ssltls-setup)
- [Environment Variables](#environment-variables)
- [Security Checklist](#security-checklist)
- [Monitoring](#monitoring)
- [Backup & Recovery](#backup--recovery)
- [Troubleshooting](#troubleshooting)

## Quick Start

The fastest way to deploy:

```bash
# 1. Clone repository
git clone https://github.com/lookuply/messages.git
cd messages

# 2. Start with Docker
docker-compose up -d

# 3. Setup reverse proxy (see SSL/TLS Setup section)
```

## Architecture Overview

```
Internet
    │
    ▼
┌─────────────────────┐
│ Reverse Proxy       │  SSL/TLS Termination
│ (nginx/Traefik/CF)  │  Port 443 → 80
└──────────┬──────────┘
           │
    ┌──────▼───────┐
    │  Go Server   │  Unified Container
    │              │  • Static Files (React PWA)
    │  Port 80     │  • REST API
    │              │  • WebSocket
    └──────┬───────┘
           │
    ┌──────▼───────┐
    │    Redis     │  Message Queue
    │  Port 6379   │
    └──────────────┘
```

**Note:** The Go server handles everything (static files + API). SSL/TLS should be handled by an external reverse proxy.

## Deployment Options

### 1. VPS (Recommended)
- Full control
- Cost-effective
- Easy to manage
- **Examples:** DigitalOcean, Linode, Hetzner, Vultr

### 2. Cloud Platforms
- Managed services
- Auto-scaling
- Higher cost
- **Examples:** AWS, GCP, Azure

### 3. Container Platforms
- Easy deployment
- Container-native
- **Examples:** Railway, Render, Fly.io

## VPS Deployment (Recommended)

### Prerequisites

- Ubuntu 22.04+ or Debian 11+ VPS
- 1GB RAM minimum (2GB recommended)
- 10GB storage
- Root or sudo access
- Domain name pointed to VPS IP

### Step 1: Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose -y

# Create app user
sudo useradd -m -s /bin/bash privmsg
sudo usermod -aG docker privmsg
```

### Step 2: Deploy Application

```bash
# Switch to app user
sudo su - privmsg

# Clone repository
git clone https://github.com/lookuply/messages.git
cd messages

# Start services
docker-compose up -d

# Verify services are running
docker-compose ps
```

### Step 3: Setup Nginx Reverse Proxy

```bash
# Install nginx
sudo apt install nginx certbot python3-certbot-nginx -y

# Create nginx config
sudo nano /etc/nginx/sites-available/privmsg
```

**Nginx Configuration:**

```nginx
server {
    server_name yourdomain.com;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Static files and API
    location / {
        proxy_pass http://localhost:80;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint (bypass rate limiting)
    location /health {
        limit_req off;
        proxy_pass http://localhost:80/health;
    }
}
```

**Enable site:**

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/privmsg /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### Step 4: Setup SSL with Let's Encrypt

```bash
# Get SSL certificate
sudo certbot --nginx -d yourdomain.com

# Verify auto-renewal
sudo certbot renew --dry-run
```

### Step 5: Configure Firewall

```bash
# Install ufw
sudo apt install ufw -y

# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
```

## Docker Deployment

### docker-compose.yml

The default `docker-compose.yml` pulls from GitHub Container Registry:

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru

  backend:
    image: ghcr.io/lookuply/messages:main
    restart: unless-stopped
    ports:
      - "80:8080"
    environment:
      - PORT=8080
      - REDIS_ADDR=redis:6379
    depends_on:
      - redis

volumes:
  redis-data:
```

### Update Deployment

```bash
# Pull latest image
docker pull ghcr.io/lookuply/messages:main

# Restart services
docker-compose up -d

# View logs
docker-compose logs -f backend
```

## SSL/TLS Setup

### Option 1: Nginx + Let's Encrypt (Recommended)

See [VPS Deployment](#step-3-setup-nginx-reverse-proxy) above.

### Option 2: Traefik (Docker-native)

**docker-compose.traefik.yml:**

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./traefik:/etc/traefik
      - ./letsencrypt:/letsencrypt
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=your@email.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data

  backend:
    image: ghcr.io/lookuply/messages:main
    restart: unless-stopped
    environment:
      - PORT=8080
      - REDIS_ADDR=redis:6379
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.privmsg.rule=Host(`yourdomain.com`)"
      - "traefik.http.routers.privmsg.entrypoints=websecure"
      - "traefik.http.routers.privmsg.tls.certresolver=letsencrypt"
      - "traefik.http.services.privmsg.loadbalancer.server.port=8080"
    depends_on:
      - redis

volumes:
  redis-data:
```

### Option 3: Cloudflare (Zero Config SSL)

1. Add your domain to Cloudflare
2. Set DNS A record to your VPS IP
3. Enable "Flexible" or "Full" SSL in Cloudflare
4. Done! Cloudflare handles SSL automatically

## Environment Variables

### Go Server

```bash
# Server Configuration
PORT=8080                           # Server port (default: 8080)
REDIS_ADDR=redis:6379              # Redis address
REDIS_PASS=                        # Redis password (optional)
REDIS_DB=0                         # Redis database number

# Production Settings (optional)
LOG_LEVEL=info                     # Log level: debug, info, warn, error
CORS_ORIGINS=https://yourdomain.com # Allowed CORS origins
MAX_MESSAGE_SIZE=10485760          # Max message size in bytes (10MB)
```

### Redis

```bash
# Redis Configuration
REDIS_MAXMEMORY=256mb              # Max memory
REDIS_MAXMEMORY_POLICY=allkeys-lru # Eviction policy
```

### Docker Compose with Environment File

Create `.env` file:

```bash
# .env
DOMAIN=yourdomain.com
ACME_EMAIL=your@email.com
REDIS_PASSWORD=your-secure-password
```

Update `docker-compose.yml`:

```yaml
backend:
  image: ghcr.io/lookuply/messages:main
  environment:
    - PORT=8080
    - REDIS_ADDR=redis:6379
    - REDIS_PASS=${REDIS_PASSWORD}
```

## Security Checklist

### Pre-Deployment

- [ ] Change default passwords
- [ ] Enable firewall (ufw)
- [ ] Setup fail2ban for SSH protection
- [ ] Use strong SSL/TLS configuration
- [ ] Enable HSTS headers
- [ ] Configure rate limiting

### Application Security

- [ ] Review CORS settings
- [ ] Set secure environment variables
- [ ] Use Redis password authentication
- [ ] Enable Redis persistence encryption (if needed)
- [ ] Regular security updates

### Monitoring

- [ ] Setup uptime monitoring (UptimeRobot, Pingdom)
- [ ] Configure log aggregation
- [ ] Setup alerts for errors
- [ ] Monitor resource usage

### fail2ban Configuration

```bash
# Install fail2ban
sudo apt install fail2ban -y

# Configure
sudo nano /etc/fail2ban/jail.local
```

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
```

```bash
# Start fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## Monitoring

### Basic Health Check

```bash
# Check if services are running
docker-compose ps

# Check health endpoint
curl https://yourdomain.com/health

# View logs
docker-compose logs -f backend
```

### Advanced Monitoring (Prometheus + Grafana)

**docker-compose.monitoring.yml:**

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-data:/var/lib/grafana

volumes:
  prometheus-data:
  grafana-data:
```

### Log Management

```bash
# View real-time logs
docker-compose logs -f

# View last 100 lines
docker-compose logs --tail=100

# Save logs to file
docker-compose logs > logs.txt

# Rotate logs (add to crontab)
0 0 * * * docker-compose logs --tail=1000 > /var/log/privmsg-$(date +\%Y\%m\%d).log
```

## Backup & Recovery

### Backup Redis Data

```bash
# Manual backup
docker exec privmsg-redis redis-cli SAVE
docker cp privmsg-redis:/data/dump.rdb ./backup/dump-$(date +%Y%m%d).rdb

# Automated backup script
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/privmsg/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup Redis
docker exec privmsg-redis redis-cli SAVE
docker cp privmsg-redis:/data/dump.rdb $BACKUP_DIR/redis-$DATE.rdb

# Keep only last 7 days
find $BACKUP_DIR -name "redis-*.rdb" -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /home/privmsg/messages/backup.sh
```

### Restore from Backup

```bash
# Stop services
docker-compose down

# Restore Redis data
docker cp backup/dump.rdb privmsg-redis:/data/dump.rdb

# Start services
docker-compose up -d
```

## Troubleshooting

### Application Won't Start

```bash
# Check logs
docker-compose logs backend

# Common issues:
# 1. Port already in use
sudo lsof -i :80

# 2. Redis not accessible
docker-compose exec backend ping redis

# 3. Permission issues
sudo chown -R 1000:1000 /var/lib/docker/volumes/
```

### SSL Certificate Issues

```bash
# Check certificate expiry
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal

# Check nginx config
sudo nginx -t
```

### High Memory Usage

```bash
# Check Redis memory
docker exec privmsg-redis redis-cli INFO memory

# Monitor container stats
docker stats

# Adjust Redis max memory
docker exec privmsg-redis redis-cli CONFIG SET maxmemory 512mb
```

### WebSocket Connection Fails

Check nginx configuration for WebSocket support:

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### Performance Issues

```bash
# Enable Redis persistence
docker exec privmsg-redis redis-cli CONFIG SET appendonly yes

# Optimize nginx
# Add to nginx.conf:
worker_processes auto;
worker_connections 1024;
```

## Maintenance

### Regular Tasks

**Weekly:**
- Check logs for errors
- Monitor disk usage
- Review security alerts

**Monthly:**
- Update Docker images
- Review SSL certificates
- Backup data
- Security audit

**Quarterly:**
- Update system packages
- Review access logs
- Capacity planning

### Update Procedure

```bash
# 1. Backup first
./backup.sh

# 2. Pull latest image
docker pull ghcr.io/lookuply/messages:main

# 3. Update with zero downtime
docker-compose up -d

# 4. Verify health
curl https://yourdomain.com/health

# 5. Check logs
docker-compose logs -f --tail=50 backend
```

## Performance Tuning

### Redis Optimization

```bash
# Increase max clients
docker exec privmsg-redis redis-cli CONFIG SET maxclients 10000

# Enable RDB persistence
docker exec privmsg-redis redis-cli CONFIG SET save "900 1 300 10 60 10000"
```

### Nginx Optimization

```nginx
# Add to /etc/nginx/nginx.conf
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # Connection pooling
    upstream backend {
        server localhost:80;
        keepalive 32;
    }
}
```

## Support & Resources

- **Documentation:** https://github.com/lookuply/messages
- **Issues:** https://github.com/lookuply/messages/issues
- **Docker Image:** https://ghcr.io/lookuply/messages

---

**⚠️ Security Notice:** This application is a prototype. Perform your own security audit before production use.
