# Debian-based (slim) image for maximum compatibility.
# Alpine (musl) can fail with missing libraries for some native modules.
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package manifests first for better layer caching.
COPY package*.json ./

# Install production dependencies only.
# `npm install --omit=dev` is robust across environments (does not require a
# perfectly in-sync lockfile the way `npm ci` does). `--only=production` is deprecated.
RUN npm install --omit=dev --no-audit

# Copy application source code.
# Secrets (backend/.env) are kept out of the image via .dockerignore.
COPY . .

# Default to production; a local dev compose/`docker run` can still override this.
ENV NODE_ENV=production
ENV PORT=7070
EXPOSE 7070

# Container health check against the app's own health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:7070/api/health',function(r){process.exit(r.statusCode < 500 ? 0 : 1)}).on('error',function(){process.exit(1)})"

# Run as the built-in non-root 'node' user (the app needs no root and writes no local files).
USER node

# Start command
CMD ["node", "backend/server.js"]
