FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built static files from builder
COPY --from=builder /app/dist/ /usr/share/nginx/html/

# Copy nginx configuration for Docker (HTTP only)
COPY nginx.docker.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port only (HTTPS handled by external load balancer)
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
