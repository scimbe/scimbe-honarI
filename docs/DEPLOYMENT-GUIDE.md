# Temporal AI Workflow Platform - Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the Temporal AI Workflow Platform in various environments, from local development to production Kubernetes clusters.

## Prerequisites

### System Requirements

#### Development Environment
- **Docker**: Version 20.10+ with Docker Compose V2
- **Node.js**: Version 20+ (for local development)
- **Python**: Version 3.11+ (for frontend build scripts)
- **Memory**: Minimum 8GB RAM, Recommended 16GB+
- **Storage**: Minimum 20GB free space
- **OS**: macOS, Linux, or Windows with WSL2

#### Production Environment
- **Kubernetes**: Version 1.24+ 
- **Helm**: Version 3.8+
- **CPU**: Minimum 8 cores, Recommended 16+ cores
- **Memory**: Minimum 32GB RAM, Recommended 64GB+
- **Storage**: High-performance SSD with 100GB+ available
- **Network**: High-bandwidth, low-latency network connectivity

### Required Software

```bash
# Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Kubernetes tools (for production)
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

## Local Development Deployment

### Quick Start (5 minutes)

1. **Clone the Repository**
```bash
git clone <repository-url>
cd temporal-ai-workflow-platform
```

2. **Build and Start All Services**
```bash
# Build with no cache (as explicitly requested)
docker-compose -f docker-compose.production.yml build --no-cache

# Start all services
docker-compose -f docker-compose.production.yml up -d
```

3. **Verify Deployment**
```bash
# Check service status
docker-compose -f docker-compose.production.yml ps

# View logs
docker-compose -f docker-compose.production.yml logs --tail=100

# Health check all services
curl http://localhost:8092/health  # Workflow Automation
curl http://localhost:3001/health  # Web Editor  
curl http://localhost:8081/health  # Temporal Worker
curl http://localhost:3003/health  # Frontend
```

### Service Access Points

| Service | URL | Description |
|---------|-----|-------------|
| Frontend Application | http://localhost:3003 | Main user interface |
| Workflow Automation API | http://localhost:8092 | Primary workflow API |
| Web Editor | http://localhost:3001 | Visual workflow editor |
| Temporal Worker | http://localhost:8081 | Worker service API |
| Temporal Web UI | http://localhost:8233 | Temporal dashboard |
| PostgreSQL | localhost:5432 | Database (user: temporal, password: temporal) |
| Redis | localhost:6379 | Cache and queues |

### Environment Configuration

Create a `.env` file for local development:

```bash
# Database Configuration
DATABASE_URL=postgresql://temporal:temporal@localhost:5432/temporal_ai_platform
REDIS_URL=redis://localhost:6379

# Temporal Configuration  
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default

# Service URLs
WORKFLOW_AUTOMATION_URL=http://localhost:8092
WEB_EDITOR_URL=http://localhost:3001
TEMPORAL_WORKER_URL=http://localhost:8081
FRONTEND_URL=http://localhost:3003

# AI Provider Configuration (Optional)
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here

# Development Settings
NODE_ENV=development
LOG_LEVEL=debug
```

## Production Deployment

### Docker Compose Production

For production deployment using Docker Compose:

```bash
# Production environment file
cp .env.example .env.production

# Build production images
docker-compose -f docker-compose.production.yml build --no-cache

# Deploy with production settings
docker-compose -f docker-compose.production.yml up -d
```

**Production Environment Variables**:
```bash
# Production Database (Use external managed database)
DATABASE_URL=postgresql://user:password@production-db:5432/temporal_ai_platform

# Redis (Use external managed Redis)
REDIS_URL=redis://production-redis:6379

# Security Settings
JWT_SECRET=your-production-jwt-secret-minimum-32-characters
CORS_ORIGIN=https://your-production-domain.com

# Monitoring
PROMETHEUS_ENDPOINT=http://prometheus:9090
JAEGER_ENDPOINT=http://jaeger:14268

# Performance Settings
MAX_CONCURRENT_ACTIVITIES=50
MAX_CONCURRENT_WORKFLOWS=25
DATABASE_POOL_SIZE=20
```

### Kubernetes Deployment

#### Prerequisites

```bash
# Create namespace
kubectl create namespace temporal-ai-platform

# Create secrets
kubectl create secret generic app-secrets \
  --from-literal=database-url="postgresql://user:password@db:5432/temporal_ai_platform" \
  --from-literal=redis-url="redis://redis:6379" \
  --from-literal=jwt-secret="your-jwt-secret" \
  -n temporal-ai-platform
```

#### Helm Chart Deployment

```bash
# Add Helm repository (when available)
helm repo add temporal-ai-platform https://charts.temporal-ai-platform.com
helm repo update

# Install with custom values
helm install temporal-ai-platform temporal-ai-platform/platform \
  --namespace temporal-ai-platform \
  --values values.production.yaml \
  --wait --timeout=10m
```

#### Custom Kubernetes Deployment

Create `k8s/` directory structure:

```bash
k8s/
├── namespace.yaml
├── configmap.yaml
├── secrets.yaml
├── postgresql.yaml
├── redis.yaml
├── temporal-server.yaml
├── workflow-automation.yaml
├── web-editor.yaml
├── temporal-worker.yaml
├── frontend.yaml
├── ingress.yaml
└── monitoring.yaml
```

**Example Deployment Configuration**:

```yaml
# k8s/workflow-automation.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: workflow-automation
  namespace: temporal-ai-platform
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
        image: temporal-ai-platform/workflow-automation:latest
        ports:
        - containerPort: 8092
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: database-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"  
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8092
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8092
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: workflow-automation
  namespace: temporal-ai-platform
spec:
  selector:
    app: workflow-automation
  ports:
  - port: 8092
    targetPort: 8092
  type: ClusterIP
```

**Apply Kubernetes Manifests**:
```bash
kubectl apply -f k8s/
```

### Cloud Provider Deployments

#### AWS EKS Deployment

```bash
# Create EKS cluster
eksctl create cluster --name temporal-ai-platform \
  --region us-west-2 \
  --nodes 3 \
  --nodes-min 3 \
  --nodes-max 10 \
  --node-type m5.xlarge

# Configure kubectl
aws eks update-kubeconfig --region us-west-2 --name temporal-ai-platform

# Install AWS Load Balancer Controller
kubectl apply -k "github.com/aws/eks-charts/stable/aws-load-balancer-controller/crds?ref=master"

# Deploy application
helm install temporal-ai-platform ./helm/charts/temporal-ai-platform \
  --set cloud.provider=aws \
  --set ingress.class=alb \
  --namespace temporal-ai-platform
```

#### Azure AKS Deployment

```bash
# Create resource group
az group create --name temporal-ai-platform --location eastus

# Create AKS cluster
az aks create \
  --resource-group temporal-ai-platform \
  --name temporal-ai-platform \
  --node-count 3 \
  --node-vm-size Standard_D4s_v3 \
  --enable-addons monitoring

# Get credentials
az aks get-credentials --resource-group temporal-ai-platform --name temporal-ai-platform

# Deploy application
helm install temporal-ai-platform ./helm/charts/temporal-ai-platform \
  --set cloud.provider=azure \
  --namespace temporal-ai-platform
```

#### Google GKE Deployment

```bash
# Create GKE cluster
gcloud container clusters create temporal-ai-platform \
  --num-nodes=3 \
  --machine-type=n1-standard-4 \
  --zone=us-central1-a \
  --enable-autoscaling \
  --min-nodes=3 \
  --max-nodes=10

# Get credentials
gcloud container clusters get-credentials temporal-ai-platform --zone=us-central1-a

# Deploy application
helm install temporal-ai-platform ./helm/charts/temporal-ai-platform \
  --set cloud.provider=gcp \
  --namespace temporal-ai-platform
```

## Database Setup

### PostgreSQL Configuration

#### Development Setup
```sql
-- Connect to PostgreSQL
psql -h localhost -U temporal -d temporal

-- Create application database
CREATE DATABASE temporal_ai_platform;

-- Create development database
CREATE DATABASE temporal_development;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE temporal_ai_platform TO temporal;
GRANT ALL PRIVILEGES ON DATABASE temporal_development TO temporal;
```

#### Production Setup
```sql
-- Create dedicated users for each service
CREATE USER workflow_automation WITH ENCRYPTED PASSWORD 'strong_password';
CREATE USER web_editor WITH ENCRYPTED PASSWORD 'strong_password';  
CREATE USER temporal_worker WITH ENCRYPTED PASSWORD 'strong_password';

-- Create databases with proper ownership
CREATE DATABASE temporal_ai_platform OWNER temporal;

-- Grant specific permissions
GRANT CONNECT ON DATABASE temporal_ai_platform TO workflow_automation;
GRANT CONNECT ON DATABASE temporal_ai_platform TO web_editor;
GRANT CONNECT ON DATABASE temporal_ai_platform TO temporal_worker;

-- Create schemas for service isolation
\c temporal_ai_platform;
CREATE SCHEMA workflow_automation AUTHORIZATION workflow_automation;
CREATE SCHEMA web_editor AUTHORIZATION web_editor;
CREATE SCHEMA temporal_worker AUTHORIZATION temporal_worker;
```

### Database Migration

```bash
# Run migrations for each service
docker exec workflow-automation npm run db:migrate
docker exec web-editor npm run db:migrate  
docker exec temporal-worker npm run db:migrate

# Seed development data (development only)
docker exec workflow-automation npm run db:seed
docker exec web-editor npm run db:seed
```

## Monitoring Setup

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'workflow-automation'
    static_configs:
      - targets: ['workflow-automation:8092']
    metrics_path: /metrics
    
  - job_name: 'web-editor'
    static_configs:
      - targets: ['web-editor:3001']
    metrics_path: /metrics
    
  - job_name: 'temporal-worker'
    static_configs:
      - targets: ['temporal-worker:8081'] 
    metrics_path: /metrics
```

### Grafana Dashboard

```bash
# Import predefined dashboards
curl -X POST http://admin:admin@localhost:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @dashboards/temporal-ai-platform-overview.json
```

### Alerting Rules

```yaml
# alerting-rules.yml
groups:
- name: temporal-ai-platform
  rules:
  - alert: ServiceDown
    expr: up == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Service {{ $labels.job }} is down"
      
  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
    for: 2m
    labels:
      severity: warning
    annotations:
      summary: "High error rate on {{ $labels.job }}"
```

## SSL/TLS Configuration

### Development (Self-signed certificates)

```bash
# Generate self-signed certificates
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout tls.key -out tls.crt \
  -subj "/CN=localhost"

# Create Kubernetes secret
kubectl create secret tls temporal-ai-platform-tls \
  --key tls.key --cert tls.crt \
  -n temporal-ai-platform
```

### Production (Let's Encrypt)

```yaml
# cert-manager issuer
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@your-domain.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
```

## Backup and Recovery

### Automated Backup Script

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR

# Database backup
pg_dump -h localhost -U temporal -d temporal_ai_platform > $BACKUP_DIR/database.sql

# Redis backup  
redis-cli --rdb $BACKUP_DIR/redis.rdb

# Application configuration
kubectl get configmap -n temporal-ai-platform -o yaml > $BACKUP_DIR/configmaps.yaml
kubectl get secret -n temporal-ai-platform -o yaml > $BACKUP_DIR/secrets.yaml

# Compress backup
tar -czf $BACKUP_DIR.tar.gz $BACKUP_DIR
rm -rf $BACKUP_DIR

echo "Backup completed: $BACKUP_DIR.tar.gz"
```

### Recovery Procedure

```bash
#!/bin/bash
# restore.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file.tar.gz>"
  exit 1
fi

# Extract backup
tar -xzf $BACKUP_FILE
BACKUP_DIR=$(basename $BACKUP_FILE .tar.gz)

# Restore database
psql -h localhost -U temporal -d temporal_ai_platform < $BACKUP_DIR/database.sql

# Restore Redis
redis-cli --rdb < $BACKUP_DIR/redis.rdb

# Restore Kubernetes resources
kubectl apply -f $BACKUP_DIR/configmaps.yaml
kubectl apply -f $BACKUP_DIR/secrets.yaml

echo "Recovery completed from $BACKUP_FILE"
```

## Troubleshooting

### Common Issues

#### Service Won't Start
```bash
# Check service logs
docker-compose logs service-name

# Check resource usage
docker stats

# Verify network connectivity
docker network inspect temporal-network
```

#### Database Connection Issues
```bash
# Test database connectivity
docker exec -it postgres psql -U temporal -d temporal -c "SELECT 1;"

# Check connection pool status
curl http://localhost:8092/api/meta/status | jq '.database'
```

#### Temporal Server Issues
```bash
# Check Temporal server health
curl http://localhost:8233/api/v1/cluster/health

# Verify worker registration
tctl --address localhost:7233 task-queue describe --task-queue workflow-automation
```

### Performance Optimization

#### Database Performance
```sql
-- Check slow queries
SELECT query, mean_time, total_time, calls
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM workflows WHERE status = 'active';
```

#### Memory Usage Optimization
```bash
# Check container memory usage
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"

# Optimize Node.js heap size
export NODE_OPTIONS="--max-old-space-size=2048"
```

### Log Analysis

```bash
# Centralized logging with ELK stack
docker-compose logs | grep ERROR

# JSON log parsing
docker-compose logs workflow-automation | jq '.level, .msg, .time'

# Monitor specific metrics
curl http://localhost:8092/metrics | grep http_requests_total
```

## Security Considerations

### Network Security
- Use private subnets for database and cache layers
- Implement Web Application Firewall (WAF)
- Configure VPC/VNET peering for multi-region deployment
- Enable DDoS protection for public endpoints

### Application Security
- Regular dependency vulnerability scanning
- Implement API rate limiting
- Use secure headers (HSTS, CSP, etc.)
- Regular security audits and penetration testing

### Data Security
- Encrypt sensitive data at rest and in transit
- Implement proper secret management
- Regular backup testing and validation
- Compliance with data protection regulations (GDPR, HIPAA)

## Maintenance

### Regular Maintenance Tasks

1. **Weekly**:
   - Check service health and performance metrics
   - Review error logs and alerts
   - Validate backup integrity
   - Update security patches

2. **Monthly**:
   - Review and optimize database performance
   - Analyze resource usage and scaling needs
   - Update dependencies and security patches
   - Review and update documentation

3. **Quarterly**:
   - Disaster recovery testing
   - Comprehensive security audit
   - Performance benchmarking
   - Capacity planning review

This deployment guide provides comprehensive instructions for successfully deploying the Temporal AI Workflow Platform in any environment, from development to production-scale Kubernetes clusters.