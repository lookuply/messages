FROM nginx:alpine

# Copy built static files
COPY dist/ /usr/share/nginx/html/

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy SSL certificates
COPY .cert/cert.pem /etc/nginx/ssl/cert.pem
COPY .cert/key.pem /etc/nginx/ssl/key.pem

# Expose ports
EXPOSE 80 443

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
