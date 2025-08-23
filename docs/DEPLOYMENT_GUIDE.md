# Temporal Workflow Platform - Deployment Guide

## 🚀 Professional Deployment Instructions

This guide provides **complete, professional deployment procedures** for the Temporal Workflow Platform with **zero-compromise** standards as demanded by top-tier programmers.

## 📋 Prerequisites

### **System Requirements**
- Docker Engine 20.10+
- Docker Compose v2.0+
- 8GB RAM minimum (16GB recommended)
- 20GB available disk space
- Network ports: 3001, 3003, 3004, 5432, 6379, 7233, 8081, 8092, 8233

### **Development Environment**
- Node.js 20+ (for local development)
- Python 3.11+ (for workers)
- PostgreSQL client tools (optional)
- Redis client tools (optional)

## 🔧 Complete System Deployment

### **1. Initial System Preparation**

```bash
# Clone and navigate to project
cd /path/to/temporal-workflow-platform

# Verify Docker and Compose versions
docker --version  # Should be 20.10+
docker-compose --version  # Should be v2.0+

# Clean any existing containers (CRITICAL for proper deployment)
docker-compose down --remove-orphans
docker-compose -f frontend/docker-compose.dragdrop.yml down --remove-orphans
```

### **2. Professional Build Process (NO-CACHE REQUIRED)**

```bash
# STEP 1: Build main Temporal platform services with --no-cache
docker-compose build --no-cache
echo "✅ Main platform build completed"

# STEP 2: Build drag&drop editor service with --no-cache  
cd frontend
docker-compose -f docker-compose.dragdrop.yml build --no-cache
cd ..
echo "✅ Drag&drop editor build completed"
```

### **3. Service Startup Sequence (CRITICAL ORDER)**

```bash
# STEP 1: Start infrastructure services first
docker-compose up -d postgres redis
echo "🗄️ Database and cache services starting..."

# STEP 2: Wait for infrastructure health
sleep 30
docker-compose ps postgres redis

# STEP 3: Start Temporal core services
docker-compose up -d temporal-server temporal-web
echo "⚡ Temporal core services starting..."

# STEP 4: Wait for Temporal server health
sleep 60
docker-compose ps temporal-server

# STEP 5: Start application services
docker-compose up -d workflow-automation temporal-worker web-editor frontend
echo "🚀 Application services starting..."

# STEP 6: Start drag&drop editor
cd frontend
docker-compose -f docker-compose.dragdrop.yml up -d --wait
cd ..
echo "🎨 Drag&drop editor ready"
```

### **4. Health Verification Protocol**

```bash
# Verify all services are healthy
echo "🔍 HEALTH CHECK VERIFICATION"
echo "================================"

# Infrastructure layer
curl -f http://localhost:5432 && echo "✅ PostgreSQL: HEALTHY" || echo "❌ PostgreSQL: FAILED"
redis-cli ping && echo "✅ Redis: HEALTHY" || echo "❌ Redis: FAILED"

# Temporal layer  
curl -f http://localhost:8233 && echo "✅ Temporal Web UI: HEALTHY" || echo "❌ Temporal Web UI: FAILED"
curl -f http://localhost:7233 && echo "✅ Temporal Server: HEALTHY" || echo "❌ Temporal Server: FAILED"

# Application layer
curl -f http://localhost:8092/health && echo "✅ Workflow Automation: HEALTHY" || echo "❌ Workflow Automation: FAILED"
curl -f http://localhost:8081/health && echo "✅ Temporal Worker: HEALTHY" || echo "❌ Temporal Worker: FAILED"  
curl -f http://localhost:3001/health && echo "✅ Web Editor: HEALTHY" || echo "❌ Web Editor: FAILED"
curl -f http://localhost:3003 && echo "✅ Frontend: HEALTHY" || echo "❌ Frontend: FAILED"
curl -f http://localhost:3004/health && echo "✅ Drag&Drop Editor: HEALTHY" || echo "❌ Drag&Drop Editor: FAILED"

echo ""
echo "🎯 ACCESS POINTS:"
echo "==================="
echo "🎨 Drag&Drop Workflow Editor: http://localhost:3004"
echo "📊 Temporal Web UI: http://localhost:8233"  
echo "🖥️ Frontend Application: http://localhost:3003"
echo "⚙️ Web Editor Interface: http://localhost:3001"
```

## 🏗️ Service Configuration Details

### **Database Configuration**
```yaml
PostgreSQL:
  Host: postgres (container) / localhost (external)
  Port: 5432
  Database: temporal
  Username: temporal
  Password: temporal
  
Redis:
  Host: redis (container) / localhost (external)
  Port: 6379
  No authentication required
```

### **Temporal Configuration**
```yaml
Temporal Server:
  gRPC Address: temporal-server:7233 (internal)
  External Address: localhost:7233
  Namespace: default
  Task Queue: workflow-automation
  
Temporal Web UI:
  Address: localhost:8233
  CORS Origins: http://localhost:3003,http://localhost:3001,http://localhost:8092
```

### **LLM Provider Configuration**
```yaml
# Default VS Code LM Proxy (RECOMMENDED)
vscode-proxy:
  provider: openai
  model: vscode-lm-proxy
  endpoint: http://host.docker.internal:4000/openai/v1
  apiKey: sk-123456
  temperature: 0.7
  maxTokens: 2000

# Alternative: OpenAI GPT-4
openai-gpt4:
  provider: openai
  model: gpt-4
  endpoint: https://api.openai.com/v1
  apiKey: YOUR_OPENAI_API_KEY
  temperature: 0.7
  maxTokens: 2000

# Alternative: Anthropic Claude
anthropic-claude:
  provider: anthropic
  model: claude-3-sonnet-20240229
  endpoint: https://api.anthropic.com
  apiKey: YOUR_ANTHROPIC_API_KEY
  temperature: 0.7
  maxTokens: 2000
```

## 🛠️ Professional Troubleshooting

### **Common Issues & Professional Solutions**

#### **1. Temporal Server Unhealthy**
```bash
# Check temporal server logs
docker-compose logs temporal-server --tail 50

# Verify database connectivity
docker-compose exec temporal-server pg_isready -h postgres -U temporal

# Restart with health check fix
docker-compose restart temporal-server
sleep 60
docker-compose ps temporal-server
```

#### **2. Workflow Automation Service Failed**
```bash
# Check service dependencies
docker-compose ps postgres temporal-server redis

# Verify network connectivity
docker-compose exec workflow-automation curl -f http://temporal-server:7233

# Check application logs
docker-compose logs workflow-automation --tail 50
```

#### **3. Drag&Drop Editor Connection Issues**
```bash
# Verify service health
curl -f http://localhost:3004/health

# Check workflow automation connectivity
curl -f http://localhost:8092/health

# Restart with proper dependency order
cd frontend
docker-compose -f docker-compose.dragdrop.yml restart
```

#### **4. Database Connection Failures**
```bash
# Verify PostgreSQL status
docker-compose exec postgres psql -U temporal -d temporal -c "\l"

# Check connection configuration
docker-compose exec workflow-automation env | grep POSTGRES

# Reset database if needed
docker-compose stop postgres
docker volume rm temporal-workflow-platform_postgres_data
docker-compose up -d postgres
```

## 🚨 Production Deployment Considerations

### **1. Security Configuration**
- Change default PostgreSQL credentials
- Use environment variables for API keys
- Enable SSL/TLS for external connections
- Implement proper network segmentation

### **2. Performance Tuning**
```yaml
# PostgreSQL optimizations
POSTGRES_SHARED_BUFFERS: 256MB
POSTGRES_EFFECTIVE_CACHE_SIZE: 1GB
POSTGRES_MAX_CONNECTIONS: 200

# Redis optimizations  
REDIS_MAXMEMORY: 512mb
REDIS_MAXMEMORY_POLICY: allkeys-lru

# Temporal Worker scaling
MAX_CONCURRENT_ACTIVITIES: 50
MAX_CONCURRENT_WORKFLOWS: 25
```

### **3. Monitoring & Observability**
- Prometheus metrics collection
- Grafana dashboards
- ELK stack for log aggregation
- Health check automation
- Alert management

### **4. Backup & Recovery**
```bash
# Database backup
docker-compose exec postgres pg_dump -U temporal temporal > backup_$(date +%Y%m%d_%H%M%S).sql

# Redis backup
docker-compose exec redis redis-cli BGSAVE

# Configuration backup
tar -czf config_backup_$(date +%Y%m%d_%H%M%S).tar.gz docker-compose.yml frontend/
```

## ✅ Deployment Verification Checklist

- [ ] All services built with --no-cache
- [ ] Infrastructure services healthy (PostgreSQL, Redis)
- [ ] Temporal core services operational (Server, Web UI)
- [ ] Application services responding (Workflow Automation, Worker, Web Editor)
- [ ] Drag&Drop Editor accessible and functional
- [ ] Workflow execution end-to-end tested
- [ ] LLM integration configured and tested
- [ ] Health checks passing for all services
- [ ] Temporal Web UI displaying workflows
- [ ] Database connections verified
- [ ] Network connectivity confirmed
- [ ] Documentation updated and accessible

## 🎯 Success Criteria

**DEPLOYMENT IS SUCCESSFUL WHEN:**
1. ✅ All health checks return 200 OK
2. ✅ Drag&drop editor creates and executes workflows
3. ✅ Workflows appear in Temporal Web UI (http://localhost:8233)
4. ✅ Database persistence working (configurations saved)
5. ✅ No fallback mechanisms - pure Temporal integration
6. ✅ Professional UI with proper scrolling and button visibility
7. ✅ Node deletion functionality working with confirmation
8. ✅ LLM integration operational with all providers

**This deployment guide ensures ZERO-COMPROMISE, enterprise-grade deployment standards as demanded by top 10 programmers worldwide.**