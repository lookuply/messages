# Privacy Messaging

End-to-end encrypted messaging application with complete privacy. No phone numbers, no emails, no personal data collection.

## Features

- **🔐 End-to-End Encryption** - Messages encrypted with TweetNaCl (NaCl Box)
- **🚫 Zero Personal Data** - No registration, no phone numbers, no emails
- **💬 Real-time Messaging** - WebSocket-based instant delivery
- **🔔 Push Notifications** - Background message notifications
- **📱 Progressive Web App** - Install on any device
- **⚡ Ephemeral Messages** - Server stores messages temporarily only
- **🌐 Self-Hostable** - Deploy on your own infrastructure
- **🔓 Open Source** - Fully transparent codebase

## Tech Stack

### Frontend
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite 7** - Build tool & dev server
- **Zustand** - State management
- **Dexie** - IndexedDB wrapper
- **TweetNaCl** - E2E encryption (NaCl Box)
- **TanStack Query** - Async state management
- **PWA** - Service Workers, Web Manifest

### Backend
- **Go 1.24** - Server runtime
- **Chi Router** - HTTP routing
- **Gorilla WebSocket** - Real-time connections
- **Redis 7** - Message queue storage

### Infrastructure
- **Nginx** - Reverse proxy & SSL termination
- **Docker Compose** - Container orchestration
- **Playwright** - E2E testing

## Architecture

```
┌─────────────────┐
│   React PWA     │  (Client A)
│  TweetNaCl E2E  │
└────────┬────────┘
         │ HTTPS/WSS
         │
    ┌────▼─────┐
    │  Nginx   │  (Reverse Proxy)
    └────┬─────┘
         │
    ┌────▼─────┐
    │ Go Relay │  (Message Queue Server)
    │  Server  │
    └────┬─────┘
         │
    ┌────▼─────┐
    │  Redis   │  (Ephemeral Storage)
    └──────────┘
         │
         │ HTTPS/WSS
         │
┌────────▼────────┐
│   React PWA     │  (Client B)
│  TweetNaCl E2E  │
└─────────────────┘
```

### Message Flow

1. **Key Exchange**: Users exchange public keys via QR code/invite link
2. **Encryption**: Messages encrypted with recipient's public key (NaCl Box)
3. **Queue**: Encrypted payload stored in Redis queue (256-bit queue ID)
4. **Transport**: WebSocket notifies recipient of new message
5. **Decryption**: Only recipient can decrypt with their private key
6. **Privacy**: Server never sees plaintext, keys stored only in browser

## Installation

### Prerequisites

- **Node.js** 20.19+ or 22.12+
- **Go** 1.24+
- **Redis** 7+
- **Docker & Docker Compose** (optional)

### Quick Start (Docker)

```bash
# Clone repository
git clone https://github.com/lookuply/messages.git
cd messages

# Start services
docker-compose up -d

# Access app
open https://localhost
```

### Development Setup

#### 1. Install Dependencies

```bash
# Frontend
cd web
npm install

# Backend
cd ../server
go mod download
```

#### 2. Start Services

**Terminal 1 - Redis:**
```bash
docker-compose up redis
```

**Terminal 2 - Go Relay Server:**
```bash
cd server
go run cmd/relay/main.go
```

**Terminal 3 - Vite Dev Server:**
```bash
cd web
npm run dev
```

**Access:** https://localhost:5173

#### 3. Generate SSL Certificates (for HTTPS)

```bash
cd web
mkdir .cert
openssl req -x509 -newkey rsa:4096 -keyout .cert/key.pem -out .cert/cert.pem -days 365 -nodes -subj "/CN=localhost"
```

## Environment Variables

### Go Relay Server

```bash
PORT=8080                    # Server port
REDIS_ADDR=localhost:6379    # Redis address
REDIS_PASS=                  # Redis password (optional)
REDIS_DB=0                   # Redis database number
```

### React App

```bash
VITE_RELAY_URL=http://localhost:8080  # Relay server URL
```

## Testing

### E2E Tests (Playwright)

```bash
cd web

# Run all tests
npm run test:e2e

# Run specific test
npx playwright test tests/e2e-messaging.spec.ts

# Run in headed mode
npm run test:e2e:headed

# Debug mode
npm run test:e2e:debug
```

### Test Coverage

- ✅ E2E messaging flow (encryption/decryption)
- ✅ Real-time WebSocket notifications
- ✅ PWA notifications (background messages)
- ✅ Nginx HTTPS proxy
- ✅ Multiple concurrent conversations

## Security

### Encryption

- **Algorithm**: NaCl Box (X25519 + XSalsa20-Poly1305)
- **Key Exchange**: Manual (QR code / invite link)
- **Key Storage**: Browser IndexedDB (never leaves device)
- **Message Storage**: Server stores encrypted payload only
- **Perfect Forward Secrecy**: Each message independently encrypted

### Privacy

- ❌ No user accounts
- ❌ No phone numbers
- ❌ No email addresses
- ❌ No personal data collection
- ❌ No message content logging
- ✅ Ephemeral queue storage (TTL-based)
- ✅ Self-destructing queues

### Security Considerations

⚠️ **This is a prototype** - Not audited for production use

- Manual key exchange (no automatic verification)
- No message authentication beyond encryption
- No contact verification
- Redis stores encrypted messages temporarily
- SSL certificates should be properly managed in production

## Deployment

### Docker Production Deploy

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Nginx Configuration

The app uses Nginx for:
- HTTPS/TLS termination
- Static file serving
- Reverse proxy to Go server
- WebSocket upgrade handling

See `web/nginx.conf` for configuration.

## API Endpoints

### Relay Server (Go)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/queue/create` | POST | Create new message queue |
| `/queue/{id}/send` | POST | Send message to queue |
| `/queue/{id}/receive` | GET | Poll messages from queue |
| `/queue/{id}` | DELETE | Delete queue |
| `/ws` | WebSocket | Real-time message notifications |
| `/health` | GET | Health check |

## Project Structure

```
messages/
├── server/              # Go relay server
│   ├── cmd/relay/      # Main entry point
│   ├── internal/
│   │   ├── config/     # Configuration
│   │   ├── queue/      # Message queue logic
│   │   └── relay/      # HTTP/WebSocket server
│   └── go.mod
├── web/                 # React PWA
│   ├── src/
│   │   ├── crypto/     # Encryption (TweetNaCl, identity)
│   │   ├── messaging/  # Message handling
│   │   ├── network/    # API & WebSocket
│   │   ├── storage/    # IndexedDB (Dexie)
│   │   └── utils/      # Helpers
│   ├── tests/          # Playwright E2E tests
│   ├── public/         # Static assets & PWA manifest
│   └── package.json
└── docker-compose.yml   # Container orchestration
```

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built with [Claude Code](https://claude.com/claude-code)
- Encryption: [TweetNaCl.js](https://github.com/dchest/tweetnacl-js)
- Inspired by Signal Protocol principles

---

**⚠️ Disclaimer**: This is a prototype for educational purposes. Not audited for production security. Use at your own risk.
