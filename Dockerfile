# Use lightweight Node.js 20 Alpine image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first to leverage Docker cache
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose port (Cloud Run usually defaults to 8080, but we use PORT env var)
# Our app defaults to 7070, but Cloud Run injects PORT=8080 usually.
# server.js should respect process.env.PORT
ENV PORT=7070
EXPOSE 7070

# Start command
CMD ["node", "backend/server.js"]
