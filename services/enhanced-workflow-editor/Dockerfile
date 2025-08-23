FROM node:20-slim

WORKDIR /app

# Install system dependencies for better performance
RUN apt-get update && apt-get install -y \
    tini \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --only=production && npm cache clean --force

# Copy source code
COPY . .

# Create non-root user
RUN useradd -r -u 1001 appuser && chown -R appuser:appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Use tini for proper signal handling
ENTRYPOINT ["tini", "--"]
CMD ["node", "unified-server.js"]