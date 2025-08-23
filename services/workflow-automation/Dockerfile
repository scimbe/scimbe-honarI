# Temporal Workflow Automation Service Dockerfile
# Full production build with complete MLOps pipeline

FROM node:20-slim AS builder

# Set working directory
WORKDIR /app

# Copy source files directly from the current service directory
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src/

# Clear npm cache and install dependencies
RUN npm cache clean --force
RUN rm -f package-lock.json
RUN npm install --include=dev

# Skip TypeScript compilation - run directly from source with tsx
# RUN npm run build

# Production stage
FROM node:20-slim AS production

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3002
ENV HOST=0.0.0.0

# Install security updates, Docker, and Python for MLOps pipeline
RUN apt-get update && apt-get upgrade -y && apt-get install -y \
    tini \
    curl \
    ca-certificates \
    gnupg \
    lsb-release \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for MLOps pipeline
RUN pip3 install --no-cache-dir --break-system-packages \
    temporalio \
    grpcio \
    protobuf \
    dataclasses-json

# Add Docker's official GPG key and repository
RUN mkdir -m 0755 -p /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker CLI and docker-compose
RUN apt-get update && apt-get install -y \
    docker-ce-cli \
    docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# Create docker group and non-root user
RUN groupadd -g 999 docker && \
    groupadd -g 1001 automation && \
    useradd -u 1001 -g automation -G docker -d /app -s /bin/bash automation

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev && \
    npm cache clean --force

# Copy source files and node_modules from builder stage
COPY --from=builder /app/src ./src
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Create logs directory and set permissions
RUN mkdir -p /app/logs && chown -R automation:automation /app

# Switch to non-root user
USER automation

# Expose port
EXPOSE 3002

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3002/health || exit 1

# Use tini as entrypoint for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--"]

# Start the application server with tsx (TypeScript execution)
CMD ["npx", "tsx", "src/server.ts"]

# Labels for metadata
LABEL maintainer="platform-team@company.com"
LABEL service="workflow-automation"
LABEL version="2.0.0"
LABEL description="Complete Temporal workflow automation service with MLOps pipeline"