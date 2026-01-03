# Multi-stage Dockerfile: Build frontend + backend in single image

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy frontend package files
COPY web/package*.json ./

# Install frontend dependencies
RUN npm install --legacy-peer-deps

# Copy frontend source
COPY web/ ./

# Build frontend
RUN npm run build

# Stage 2: Build Backend
FROM golang:1.24-alpine AS backend-builder

WORKDIR /app

# Copy go mod files
COPY server/go.mod server/go.sum ./
RUN go mod download

# Copy backend source
COPY server/ ./

# Build the relay server
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o relay cmd/relay/main.go

# Stage 3: Production
FROM alpine:latest

RUN apk --no-cache add ca-certificates wget

WORKDIR /root/

# Copy backend binary from builder
COPY --from=backend-builder /app/relay .

# Copy frontend dist from frontend builder
COPY --from=frontend-builder /app/dist ./static

# Expose port
EXPOSE 8080

# Run the server
CMD ["./relay"]
