# Setup and Installation Guide

## Prerequisites

### System Requirements
- **OS**: Linux, macOS, or Windows with WSL2
- **RAM**: Minimum 8GB (16GB recommended for development)
- **Storage**: 10GB free space
- **Network**: Internet connection for downloading dependencies

### Required Software
- **Docker**: Version 20.10+ with Docker Compose V2
- **Node.js**: Version 18+ (for local development)
- **Python**: Version 3.11+ (for drag-drop editor development)
- **Git**: Version 2.30+

## Quick Start (5 minutes)

### 1. Clone and Navigate
```bash
git clone <repository-url>
cd temporal-workflow-platform
```

### 2. Start the Platform
```bash
# Start all services
docker-compose up -d

# Verify services are running
docker-compose ps
```

### 3. Access the Platform
- **Frontend**: http://localhost:3000 - Main workflow interface
- **Drag-Drop Editor**: http://localhost:3004 - Visual workflow designer
- **API Documentation**: http://localhost:3001/docs - Enhanced editor API
- **Workflow Automation**: http://localhost:8092/docs - Core automation API
- **Temporal Web UI**: http://localhost:8233 - Temporal monitoring

## Detailed Installation

### Docker Installation

#### Ubuntu/Debian
```bash
# Update package index
sudo apt update

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose V2
sudo apt install docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

#### macOS
```bash
# Install Docker Desktop
brew install --cask docker

# Or download from: https://docs.docker.com/desktop/mac/install/
```

#### Windows (WSL2)
```bash
# Install Docker Desktop for Windows with WSL2 backend
# Download from: https://docs.docker.com/desktop/windows/install/

# Verify installation
docker --version
docker-compose --version
```

### Development Environment Setup

#### Node.js Installation
```bash
# Using Node Version Manager (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Install Node.js 18
nvm install 18
nvm use 18
nvm alias default 18

# Verify installation
node --version  # Should show v18.x.x
npm --version   # Should show 9.x.x
```

#### Python Installation
```bash
# Ubuntu/Debian
sudo apt install python3.11 python3.11-pip python3.11-venv

# macOS
brew install python@3.11

# Windows (WSL2)
sudo apt install python3.11 python3.11-pip python3.11-venv

# Verify installation
python3.11 --version  # Should show Python 3.11.x
```

## Configuration

### Environment Variables

Create environment files for each service:

#### Core Platform (.env)
```bash
# Database Configuration
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=temporal_ai_platform
POSTGRES_USER=temporal
POSTGRES_PASSWORD=temporal

# Redis Configuration
REDIS_URL=redis://redis:6379

# Temporal Configuration
TEMPORAL_ADDRESS=temporal-server:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=workflow-automation

# Security Configuration
JWT_SECRET=your-super-secure-jwt-secret-change-in-production
CORS_ORIGIN=*

# Application Settings
LOG_LEVEL=info
MAX_ITERATIONS=25
QUALITY_THRESHOLD=95
```

#### Production Environment (.env.production)
```bash
# Database Configuration (Use external managed database)
DATABASE_URL=postgresql://user:password@your-db-host:5432/production_db

# Redis Configuration (Use external managed Redis)
REDIS_URL=redis://user:password@your-redis-host:6379

# Security (Generate secure secrets)
JWT_SECRET=your-production-jwt-secret-256-bits-minimum
CORS_ORIGIN=https://your-domain.com

# Performance Settings
NODE_ENV=production
MAX_CONCURRENT_WORKFLOWS=100
MAX_CONCURRENT_ACTIVITIES=500

# Monitoring
METRICS_ENABLED=true
HEALTH_CHECK_ENABLED=true
```

### Service Configuration

#### Enhanced Workflow Editor
```javascript
// services/enhanced-workflow-editor/config.js
module.exports = {
  server: {
    host: '0.0.0.0',
    port: 3001,
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    }
  },
  database: {
    url: process.env.DATABASE_URL,
    pool: {
      min: 2,
      max: 20,
      acquireTimeoutMillis: 30000
    }
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET,
    expiresIn: '24h'
  }
};
```

#### Workflow Automation Service
```typescript
// services/workflow-automation/src/config/environment.ts
export const config = {
  server: {
    port: parseInt(process.env.PORT || '8092'),
    host: process.env.HOST || '0.0.0.0'
  },
  temporal: {
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'workflow-automation'
  },
  generation: {
    maxIterations: parseInt(process.env.MAX_ITERATIONS || '25'),
    qualityThreshold: parseInt(process.env.QUALITY_THRESHOLD || '95'),
    llmEndpoint: process.env.OPENAI_API_URL || 'http://dragdrop-workflow-editor:3004/api/openai'
  }
};
```

## Service-by-Service Setup

### Frontend Service (React)
```bash
cd services/frontend

# Install dependencies
npm install

# Configure environment
cat > .env.local << EOF
VITE_API_URL=http://localhost:3001
VITE_WORKFLOW_AUTOMATION_URL=http://localhost:8092
VITE_TEMPORAL_WEB_URL=http://localhost:8233
EOF

# Development server
npm run dev

# Production build
npm run build
```

### Drag-Drop Editor Service (Python)
```bash
cd services/dragdrop-workflow-editor

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cat > .env << EOF
PORT=3004
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=temporal_ai_platform
POSTGRES_USER=temporal
POSTGRES_PASSWORD=temporal
OPENAI_API_KEY=your-openai-api-key
EOF

# Development server
python server.py

# Production server (with Gunicorn)
pip install gunicorn
gunicorn -w 4 -k uvicorn.workers.UvicornWorker server:app --bind 0.0.0.0:3004
```

### Workflow Automation Service (TypeScript)
```bash
cd services/workflow-automation

# Install dependencies
npm install

# Build TypeScript
npm run build

# Configure environment
cat > .env << EOF
NODE_ENV=development
PORT=8092
DATABASE_URL=postgresql://temporal:temporal@localhost:5432/temporal_ai_platform
REDIS_URL=redis://localhost:6379
TEMPORAL_ADDRESS=localhost:7233
MAX_ITERATIONS=25
QUALITY_THRESHOLD=95
EOF

# Development server with hot reload
npm run dev

# Production server
npm run start
```

### Temporal Worker Service (TypeScript)
```bash
cd services/temporal-worker

# Install dependencies
npm install

# Build TypeScript
npm run build

# Configure environment
cat > .env << EOF
NODE_ENV=development
PORT=8081
DATABASE_URL=postgresql://temporal:temporal@localhost:5432/temporal_ai_platform
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=workflow-automation
MAX_CONCURRENT_WORKFLOWS=10
MAX_CONCURRENT_ACTIVITIES=20
EOF

# Development server
npm run dev

# Production server
npm run start
```

## Database Setup

### PostgreSQL Initialization
```bash
# Start PostgreSQL container
docker-compose up -d postgres

# Wait for database to be ready
docker-compose exec postgres pg_isready -U temporal

# Create additional databases if needed
docker-compose exec postgres createdb -U temporal workflow_templates
docker-compose exec postgres createdb -U temporal activity_library

# Run migrations
cd infrastructure/database/migrations
for file in *.sql; do
  echo "Running migration: $file"
  docker-compose exec -T postgres psql -U temporal -d temporal_ai_platform -f - < "$file"
done
```

### Database Schema Validation
```bash
# Verify tables were created
docker-compose exec postgres psql -U temporal -d temporal_ai_platform -c "\dt"

# Check sample data
docker-compose exec postgres psql -U temporal -d temporal_ai_platform -c "SELECT COUNT(*) FROM workflows;"
```

## Verification & Health Checks

### Service Health Verification
```bash
# Check all service health endpoints
curl -s http://localhost:3001/health | jq '.'
curl -s http://localhost:3004/health | jq '.'
curl -s http://localhost:8092/health | jq '.'
curl -s http://localhost:8081/health | jq '.'

# Check Temporal server
docker-compose exec temporal-server temporal workflow list --namespace default
```

### System Integration Test
```bash
# Create a test workflow
curl -X POST http://localhost:8092/api/workflows/generate \
  -H "Content-Type: application/json" \
  -d '{
    "requirements": "Create a simple workflow that adds two numbers",
    "parameters": {
      "a": 5,
      "b": 3
    }
  }' | jq '.'

# Check workflow execution
WORKFLOW_ID=$(curl -s http://localhost:8092/api/workflows | jq -r '.[0].id')
curl -s "http://localhost:8092/api/executions/$WORKFLOW_ID" | jq '.'
```

### Performance Verification
```bash
# Check resource usage
docker stats --no-stream

# Database connection test
docker-compose exec postgres psql -U temporal -d temporal_ai_platform -c "SELECT version();"

# Redis connectivity test
docker-compose exec redis redis-cli ping
```

## Production Deployment

### Docker Compose Production
```yaml
# docker-compose.production.yml
version: '3.8'
services:
  frontend:
    image: temporal-workflow-frontend:latest
    environment:
      NODE_ENV: production
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/"]
      interval: 30s
      timeout: 10s
      retries: 3
  
  workflow-automation:
    image: temporal-workflow-automation:latest
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8092/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Kubernetes Deployment
```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: workflow-automation
spec:
  replicas: 3
  selector:
    matchLabels:
      app: workflow-automation
  template:
    metadata:
      labels:
        app: workflow-automation
    spec:
      containers:
      - name: workflow-automation
        image: temporal-workflow-automation:latest
        ports:
        - containerPort: 8092
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
        resources:
          requests:
            memory: "512Mi"
            cpu: "0.5"
          limits:
            memory: "1Gi"
            cpu: "1.0"
        livenessProbe:
          httpGet:
            path: /health
            port: 8092
          initialDelaySeconds: 30
          periodSeconds: 10
```

### Monitoring Setup
```bash
# Prometheus configuration
cat > prometheus.yml << EOF
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'workflow-automation'
    static_configs:
      - targets: ['localhost:8092']
    metrics_path: '/metrics'
    
  - job_name: 'temporal-worker'
    static_configs:
      - targets: ['localhost:8081']
    metrics_path: '/metrics'
EOF

# Start monitoring stack
docker run -d \
  --name prometheus \
  -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus
```

## Troubleshooting

### Common Issues

#### Port Conflicts
```bash
# Check port usage
netstat -tlnp | grep :3000
lsof -i :3000

# Kill process using port
kill -9 $(lsof -t -i:3000)
```

#### Database Connection Issues
```bash
# Check PostgreSQL logs
docker-compose logs postgres

# Test database connection
docker-compose exec postgres psql -U temporal -d temporal_ai_platform -c "SELECT 1;"

# Reset database if needed
docker-compose down -v
docker-compose up -d postgres
```

#### Service Startup Issues
```bash
# Check service logs
docker-compose logs workflow-automation
docker-compose logs temporal-worker

# Restart specific service
docker-compose restart workflow-automation

# Rebuild and restart
docker-compose up -d --build workflow-automation
```

#### Memory Issues
```bash
# Check container memory usage
docker stats

# Increase Docker memory limit (Docker Desktop)
# Docker Desktop > Settings > Resources > Memory

# Clean up Docker resources
docker system prune -af
docker volume prune
```

### Service-Specific Troubleshooting

#### Frontend Build Issues
```bash
cd services/frontend

# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check for TypeScript errors
npm run type-check

# Build with verbose logging
npm run build -- --verbose
```

#### Python Service Issues
```bash
cd services/dragdrop-workflow-editor

# Activate virtual environment
source venv/bin/activate

# Check Python path and version
which python
python --version

# Install dependencies with verbose output
pip install -r requirements.txt --verbose

# Check for import errors
python -c "import fastapi, sqlalchemy, pydantic"
```

#### Temporal Connection Issues
```bash
# Check Temporal server status
docker-compose exec temporal-server temporal cluster health

# List Temporal workers
docker-compose exec temporal-server temporal task-queue describe --task-queue workflow-automation

# Check workflow history
docker-compose exec temporal-server temporal workflow show --workflow-id <workflow-id>
```

### Getting Help

1. **Documentation**: Check the `/docs` directory for detailed guides
2. **Logs**: Always check service logs first: `docker-compose logs <service-name>`
3. **Health Checks**: Verify all health endpoints return 200 OK
4. **GitHub Issues**: Create an issue with detailed error information
5. **Community**: Join our Discord/Slack for real-time help

## Development Workflow

### Hot Reload Setup
```bash
# Install nodemon globally
npm install -g nodemon

# Start services in development mode
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Watch for file changes
npm run dev  # In each service directory
```

### Code Quality Tools
```bash
# Install development dependencies
npm install -g eslint prettier husky

# Setup pre-commit hooks
npx husky install
npx husky add .husky/pre-commit "npm run lint"
npx husky add .husky/pre-commit "npm run test"
```

### Testing Setup
```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run end-to-end tests
npm run test:e2e

# Generate coverage report
npm run test:coverage
```

This completes the comprehensive setup guide. Follow these instructions step by step for a successful installation.