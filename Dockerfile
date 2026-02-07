# Switch to Debian-based image (Slim) for maximum compatibility
# Alpine (musl) often fails with missing libraries for native modules
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
# "npm install" is more robust than "npm ci" across OS boundaries
RUN npm install --only=production --no-audit

# Copy application source code
COPY . .

# Expose port 7070 (matching our server.js defaults)
ENV PORT=7070
EXPOSE 7070

# Start command
CMD ["node", "backend/server.js"]
