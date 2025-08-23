# Temporal Workflow Platform - Professional Troubleshooting Guide

## 🚨 Complete Professional Troubleshooting Manual

This guide provides **comprehensive, systematic troubleshooting procedures** for the Temporal Workflow Platform, designed for **top-tier programmers** who demand **zero-compromise solutions**.

## 🔍 Systematic Diagnostic Approach

### **1. Service Health Assessment Matrix**

```bash
#!/bin/bash
# Professional Health Check Script

echo "🔍 TEMPORAL WORKFLOW PLATFORM - HEALTH ASSESSMENT"
echo "=================================================="

# Infrastructure Layer
echo "📊 INFRASTRUCTURE LAYER:"
curl -f http://localhost:5432 >/dev/null 2>&1 && echo "✅ PostgreSQL (5432): HEALTHY" || echo "❌ PostgreSQL (5432): FAILED"
redis-cli ping >/dev/null 2>&1 && echo "✅ Redis (6379): HEALTHY" || echo "❌ Redis (6379): FAILED"

# Temporal Core Layer
echo "⚡ TEMPORAL CORE LAYER:"
curl -f http://localhost:8233 >/dev/null 2>&1 && echo "✅ Temporal Web UI (8233): HEALTHY" || echo "❌ Temporal Web UI (8233): FAILED"
curl -f http://localhost:7233 >/dev/null 2>&1 && echo "✅ Temporal Server (7233): HEALTHY" || echo "❌ Temporal Server (7233): FAILED"

# Application Layer
echo "🚀 APPLICATION LAYER:"
curl -f http://localhost:8092/health >/dev/null 2>&1 && echo "✅ Workflow Automation (8092): HEALTHY" || echo "❌ Workflow Automation (8092): FAILED"
curl -f http://localhost:8081/health >/dev/null 2>&1 && echo "✅ Temporal Worker (8081): HEALTHY" || echo "❌ Temporal Worker (8081): FAILED"
curl -f http://localhost:3001/health >/dev/null 2>&1 && echo "✅ Web Editor (3001): HEALTHY" || echo "❌ Web Editor (3001): FAILED"
curl -f http://localhost:3003 >/dev/null 2>&1 && echo "✅ Frontend (3003): HEALTHY" || echo "❌ Frontend (3003): FAILED"
curl -f http://localhost:3004/health >/dev/null 2>&1 && echo "✅ Drag&Drop Editor (3004): HEALTHY" || echo "❌ Drag&Drop Editor (3004): FAILED"

echo ""
echo "🎯 NEXT STEPS:"
echo "If any service shows FAILED, see detailed troubleshooting sections below."
```

## 🛠️ Detailed Problem Resolution

### **ISSUE 1: Temporal Server Unhealthy**

**Symptoms:**
- Health check failing: `temporal workflow list --namespace default`
- Connection refused on port 7233
- Dependent services unable to start

**Professional Diagnosis:**
```bash
# Check temporal server container status
docker-compose ps temporal-server

# Examine detailed logs
docker-compose logs temporal-server --tail 100

# Verify network connectivity
docker-compose exec temporal-server netstat -tulpn | grep 7233

# Test internal gRPC health
docker-compose exec temporal-server temporal workflow list --namespace default
```

**Professional Solutions:**

**Solution 1A: Health Check Configuration Fix**
```bash
# Update docker-compose.yml temporal-server health check
docker-compose down temporal-server
# Edit health check to use: temporal workflow list --namespace default
docker-compose up -d temporal-server
```

**Solution 1B: Database Connection Issues**
```bash
# Verify PostgreSQL connectivity from temporal-server
docker-compose exec temporal-server pg_isready -h postgres -U temporal -d temporal

# Check environment variables
docker-compose exec temporal-server env | grep -E "POSTGRES|DB"

# Restart with clean state
docker-compose restart postgres temporal-server
sleep 60
```

**Solution 1C: Complete Temporal Reset**
```bash
# Nuclear option - full temporal reset
docker-compose down
docker volume rm temporal-workflow-platform_postgres_data
docker-compose build --no-cache temporal-server
docker-compose up -d postgres
sleep 30
docker-compose up -d temporal-server
sleep 60
```

### **ISSUE 2: Workflow Automation Service Failed**

**Symptoms:**
- Service not responding on port 8092
- "Failed to fetch" errors in drag&drop editor
- Workflows not executing

**Professional Diagnosis:**
```bash
# Check service status and dependencies
docker-compose ps workflow-automation temporal-server postgres

# Examine application logs
docker-compose logs workflow-automation --tail 100

# Test internal Temporal connectivity
docker-compose exec workflow-automation curl -f http://temporal-server:7233

# Verify database connection
docker-compose exec workflow-automation psql postgresql://temporal:temporal@postgres:5432/temporal_ai_platform -c "\l"
```

**Professional Solutions:**

**Solution 2A: Dependency Startup Order**
```bash
# Ensure proper startup sequence
docker-compose down workflow-automation
docker-compose ps temporal-server  # Must be healthy first
docker-compose up -d workflow-automation
sleep 30
curl -f http://localhost:8092/health
```

**Solution 2B: Database Connection Fix**
```bash
# Verify and fix database URL
docker-compose exec workflow-automation env | grep DATABASE_URL
# Should be: postgresql://temporal:temporal@postgres:5432/temporal_ai_platform

# Test connection manually
docker-compose exec postgres psql -U temporal -d temporal_ai_platform -c "SELECT 1;"

# Create database if missing
docker-compose exec postgres createdb -U temporal temporal_ai_platform
```

**Solution 2C: Complete Service Rebuild**
```bash
# Professional rebuild approach
docker-compose down workflow-automation
docker-compose build --no-cache workflow-automation
docker-compose up -d workflow-automation
docker-compose logs workflow-automation --follow
```

### **ISSUE 3: Drag&Drop Editor Connection Problems**

**Symptoms:**
- "Failed to fetch" when running workflows
- Editor loads but workflow execution fails
- Scrolling or button visibility issues

**Professional Diagnosis:**
```bash
# Check drag&drop service health
curl -f http://localhost:3004/health

# Verify workflow automation connectivity
curl -f http://localhost:8092/health

# Test workflow submission endpoint
curl -X POST http://localhost:8092/api/workflows/generate \
  -H "Content-Type: application/json" \
  -d '{"requirements": "test workflow", "workflow": {"name": "test"}}'

# Check browser console for JavaScript errors
# Open http://localhost:3004 and check console
```

**Professional Solutions:**

**Solution 3A: Service Communication Fix**
```bash
# Verify network connectivity between services
docker-compose exec dragdrop-workspace curl -f http://workflow-automation:8092/health

# Check CORS configuration
docker-compose logs workflow-automation | grep -i cors

# Restart with proper network
docker-compose -f docker-compose.dragdrop.yml restart
```

**Solution 3B: Frontend Code Issues**
```bash
# Check for JavaScript errors in browser
# Open DevTools → Console when using http://localhost:3004

# Verify drag&drop HTML file integrity
ls -la frontend/dragdrop-complete.html

# Restart with updated code
cd frontend
docker-compose -f docker-compose.dragdrop.yml restart dragdrop-workspace
```

**Solution 3C: UI/UX Fixes Verification**
```bash
# Confirm all UI fixes are applied:
# 1. Scrollable properties panel
# 2. Visible red/blue buttons
# 3. Node deletion functionality
# 4. No fallback mechanism (direct Temporal connection)

# Test each feature manually at http://localhost:3004
```

### **ISSUE 4: Database Connection Failures**

**Symptoms:**
- PostgreSQL connection refused
- Services failing with database errors
- Data persistence not working

**Professional Diagnosis:**
```bash
# Check PostgreSQL container status
docker-compose ps postgres

# Test direct database connection
docker-compose exec postgres psql -U temporal -d temporal -c "\l"

# Verify all required databases exist
docker-compose exec postgres psql -U temporal -c "SELECT datname FROM pg_database;"

# Check connection from application services
docker-compose exec workflow-automation pg_isready -h postgres -U temporal
```

**Professional Solutions:**

**Solution 4A: Database Initialization**
```bash
# Create missing databases
docker-compose exec postgres createdb -U temporal temporal_ai_platform
docker-compose exec postgres createdb -U temporal temporal_development

# Verify database creation
docker-compose exec postgres psql -U temporal -c "\l"
```

**Solution 4B: Connection Configuration**
```bash
# Verify environment variables across services
docker-compose exec workflow-automation env | grep POSTGRES
docker-compose exec web-editor env | grep POSTGRES
docker-compose exec dragdrop-workspace env | grep POSTGRES

# Should match:
# POSTGRES_HOST=postgres
# POSTGRES_PORT=5432
# POSTGRES_DB=temporal
# POSTGRES_USER=temporal
# POSTGRES_PASSWORD=temporal
```

**Solution 4C: Complete Database Reset**
```bash
# Nuclear database reset (CAUTION: DESTROYS DATA)
docker-compose down
docker volume rm temporal-workflow-platform_postgres_data
docker-compose up -d postgres
sleep 30

# Verify fresh database
docker-compose exec postgres psql -U temporal -d temporal -c "\l"
```

### **ISSUE 5: LLM Integration Failures**

**Symptoms:**
- AI workflow generation not working
- API key authentication errors
- Model endpoint unreachable

**Professional Diagnosis:**
```bash
# Test VS Code LM Proxy (default)
curl -X POST http://host.docker.internal:4000/openai/v1/chat/completions \
  -H "Authorization: Bearer sk-123456" \
  -H "Content-Type: application/json" \
  -d '{"model": "vscode-lm-proxy", "messages": [{"role": "user", "content": "test"}]}'

# Check configuration endpoint
curl -f http://localhost:3004/api/configurations

# Verify LLM provider settings
curl -f http://localhost:3004/api/configurations/vscode-proxy
```

**Professional Solutions:**

**Solution 5A: VS Code Proxy Configuration**
```bash
# Verify VS Code LM proxy is running locally on port 4000
lsof -i :4000

# Test direct connection
curl -f http://localhost:4000/openai/v1/models

# Update configuration if needed
# Edit frontend/server.py - vscode-proxy section
```

**Solution 5B: Alternative Provider Setup**
```bash
# Configure OpenAI as fallback
export OPENAI_API_KEY="your-key-here"

# Test OpenAI connection
curl -X POST https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4", "messages": [{"role": "user", "content": "test"}]}'
```

## 🚨 Emergency Recovery Procedures

### **Complete System Reset (NUCLEAR OPTION)**

**When to use:** All other solutions failed, system completely broken

```bash
#!/bin/bash
# NUCLEAR RESET - USE ONLY WHEN EVERYTHING ELSE FAILS

echo "🚨 PERFORMING NUCLEAR SYSTEM RESET"
echo "=================================="

# 1. Stop all services
docker-compose down --remove-orphans
cd frontend && docker-compose -f docker-compose.dragdrop.yml down --remove-orphans && cd ..

# 2. Remove all volumes (DESTROYS ALL DATA)
docker volume prune -f

# 3. Remove all custom networks
docker network prune -f

# 4. Rebuild everything from scratch with --no-cache
docker-compose build --no-cache
cd frontend && docker-compose -f docker-compose.dragdrop.yml build --no-cache && cd ..

# 5. Start infrastructure first
docker-compose up -d postgres redis
sleep 30

# 6. Start Temporal core
docker-compose up -d temporal-server temporal-web
sleep 60

# 7. Start application services
docker-compose up -d workflow-automation temporal-worker web-editor frontend
sleep 30

# 8. Start drag&drop editor
cd frontend && docker-compose -f docker-compose.dragdrop.yml up -d && cd ..

# 9. Verify complete system health
sleep 30
./health_check.sh  # Run the health check script
```

## 📊 Performance Monitoring & Optimization

### **Real-time Monitoring Commands**
```bash
# Monitor resource usage
docker stats

# Monitor service logs in real-time
docker-compose logs --follow

# Monitor specific service
docker-compose logs workflow-automation --follow

# Monitor database performance
docker-compose exec postgres pg_stat_activity
```

### **Performance Optimization**
```bash
# Increase PostgreSQL performance
docker-compose exec postgres psql -U temporal -c "
  ALTER SYSTEM SET shared_buffers = '256MB';
  ALTER SYSTEM SET effective_cache_size = '1GB';
  SELECT pg_reload_conf();
"

# Optimize Redis memory
docker-compose exec redis redis-cli CONFIG SET maxmemory 512mb
docker-compose exec redis redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

## ✅ Professional Success Verification

**System is FULLY OPERATIONAL when:**

1. ✅ **All health checks pass** (9/9 services healthy)
2. ✅ **Workflow creation works** in drag&drop editor
3. ✅ **Workflow execution succeeds** through real Temporal API
4. ✅ **Workflows appear** in Temporal Web UI (http://localhost:8233)
5. ✅ **Database persistence** working (configs saved/loaded)
6. ✅ **UI/UX perfect** (scrolling, buttons, node deletion)
7. ✅ **LLM integration** functional with all providers
8. ✅ **No fallback mechanisms** - pure Temporal integration
9. ✅ **Professional error handling** throughout system

**This troubleshooting guide ensures ZERO-COMPROMISE problem resolution for enterprise-grade Temporal workflow platforms.**