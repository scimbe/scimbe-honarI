# Workflow Isolation Bug Fix - Migration and Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the workflow isolation fixes to prevent activity cross-contamination between concurrent workflow executions.

## 🚨 Critical Impact Assessment

### The Bug
- **Issue**: Activities from one workflow are bleeding into another workflow's execution
- **Impact**: Data contamination, incorrect results, security violations
- **Severity**: HIGH - Affects data integrity and system reliability
- **Affected Components**: Activity loading, workflow execution, caching layer

### The Fix
- **Solution**: Strict workflow boundary enforcement with execution context isolation
- **Approach**: Database schema changes + application code updates + caching improvements
- **Backward Compatibility**: Maintained with feature flags

## Pre-Deployment Checklist

### 1. Environment Preparation
```bash
# Verify database connectivity
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT version();"

# Verify Redis connectivity  
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping

# Backup current database
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME > workflow_isolation_backup_$(date +%Y%m%d_%H%M%S).sql

# Backup Redis data
redis-cli -h $REDIS_HOST -p $REDIS_PORT --rdb workflow_isolation_backup_$(date +%Y%m%d_%H%M%S).rdb
```

### 2. Code Preparation
```bash
# Create feature flag environment variables
export WORKFLOW_STRICT_ISOLATION=true
export WORKFLOW_CONTEXT_VALIDATION=true
export BLOCK_CROSS_WORKFLOW_ACCESS=true
export ISOLATION_MIGRATION_MODE=true
```

### 3. Testing Environment Setup
```bash
# Set up test database
createdb test_temporal_ai_platform
psql -h $DB_HOST -U $DB_USER -d test_temporal_ai_platform -f infrastructure/database/schemas/unified_database_schema.sql

# Run isolation validation tests
npm test -- workflow-isolation-validation.test.ts
```

## Deployment Steps

### Phase 1: Database Schema Updates (30 minutes)

#### Step 1: Apply Database Migrations
```bash
# Apply isolation schema changes
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f scripts/apply-workflow-isolation-fixes.sql

# Verify schema changes
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    table_name, 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_name IN ('workflow_execution_contexts', 'activity_definitions', 'activity_library') 
    AND column_name LIKE '%isolation%' OR column_name LIKE '%context%' OR column_name LIKE '%scope%'
ORDER BY table_name, column_name;
"
```

#### Step 2: Migrate Existing Data
```sql
-- Update existing activities with isolation metadata
UPDATE activity_library 
SET 
    access_scope = 'workflow_private',
    isolation_metadata = jsonb_build_object(
        'enforced', true,
        'level', 'strict',
        'workflowId', workflow_id,
        'migrated', true,
        'migratedAt', CURRENT_TIMESTAMP
    )
WHERE access_scope IS NULL AND workflow_id IS NOT NULL;

-- Create execution contexts for active workflows
INSERT INTO workflow_execution_contexts (workflow_id, execution_id, session_id, isolation_boundary)
SELECT DISTINCT 
    wd.id,
    'migration-context-' || wd.id,
    'migration-session-' || wd.id,
    jsonb_build_object(
        'strict', true,
        'migrated', true,
        'version', '1.0'
    )
FROM workflow_definitions wd 
WHERE wd.status = 'active'
ON CONFLICT (workflow_id, execution_id, session_id) DO NOTHING;
```

### Phase 2: Application Code Deployment (20 minutes)

#### Step 1: Deploy Isolation Fixes
```bash
# Copy isolation fixes to application
cp src/workflow-isolation-fixes.ts services/temporal-worker/src/
cp src/workflow-isolation-fixes.ts services/workflow-automation/src/

# Update imports in affected files
# Replace imports in:
# - services/temporal-worker/src/working-activities.ts
# - services/workflow-automation/src/routes/activities.ts
```

#### Step 2: Update Service Configuration
```typescript
// services/temporal-worker/src/index.ts
import {
    loadWorkflowDefinitionIsolated as loadWorkflowDefinition,
    executeActivityIsolated as executeActivity,
    IsolatedWorkflowCache
} from './workflow-isolation-fixes';

// Initialize isolated cache
const isolatedCache = new IsolatedWorkflowCache({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    keyPrefix: 'workflow:isolated:'
});
```

#### Step 3: Update Route Handlers
```typescript
// services/workflow-automation/src/routes/activities.ts
import { createIsolatedActivityRoutes } from './workflow-isolation-fixes';

// Replace existing routes with isolated versions
export async function activityRoutes(fastify: FastifyInstance): Promise<void> {
    // Apply isolation-aware routes
    createIsolatedActivityRoutes(fastify, dbPool);
}
```

### Phase 3: Service Restart and Validation (15 minutes)

#### Step 1: Graceful Service Restart
```bash
# Restart temporal worker with isolation support
docker-compose restart temporal-worker

# Restart workflow automation service
docker-compose restart workflow-automation

# Verify services are healthy
curl -f http://localhost:3000/api/activities/health
curl -f http://localhost:3001/health
```

#### Step 2: Validation Tests
```bash
# Run isolation validation suite
npm test -- --testNamePattern="Workflow Isolation"

# Run integration tests
npm run test:integration

# Monitor application logs for isolation violations
docker-compose logs -f temporal-worker | grep -i "isolation"
docker-compose logs -f workflow-automation | grep -i "isolation"
```

#### Step 3: Performance Verification
```bash
# Check database performance
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    schemaname,
    tablename,
    attname as column_name,
    n_distinct,
    correlation
FROM pg_stats 
WHERE tablename IN ('activity_library', 'workflow_execution_contexts', 'activity_definitions')
    AND attname LIKE '%workflow%' OR attname LIKE '%isolation%';
"

# Monitor Redis performance
redis-cli -h $REDIS_HOST -p $REDIS_PORT info stats | grep -E "(keyspace_hits|keyspace_misses|used_memory)"
```

### Phase 4: Feature Flag Gradual Rollout (Variable timing)

#### Step 1: Enable Progressive Isolation (Day 1)
```bash
# Start with validation only
export WORKFLOW_STRICT_ISOLATION=false
export WORKFLOW_CONTEXT_VALIDATION=true
export BLOCK_CROSS_WORKFLOW_ACCESS=false

# Restart services
docker-compose restart temporal-worker workflow-automation
```

#### Step 2: Enable Cross-Workflow Blocking (Day 2)
```bash
# Add cross-workflow blocking
export WORKFLOW_STRICT_ISOLATION=false
export WORKFLOW_CONTEXT_VALIDATION=true
export BLOCK_CROSS_WORKFLOW_ACCESS=true

# Restart services
docker-compose restart temporal-worker workflow-automation
```

#### Step 3: Full Strict Isolation (Day 3+)
```bash
# Enable full isolation
export WORKFLOW_STRICT_ISOLATION=true
export WORKFLOW_CONTEXT_VALIDATION=true
export BLOCK_CROSS_WORKFLOW_ACCESS=true

# Restart services  
docker-compose restart temporal-worker workflow-automation
```

## Monitoring and Verification

### 1. Key Metrics to Monitor
```sql
-- Check isolation violations
SELECT 
    violation_type,
    COUNT(*) as violation_count,
    MAX(detected_at) as latest_violation
FROM workflow_isolation_violations 
WHERE detected_at > NOW() - INTERVAL '24 hours'
GROUP BY violation_type
ORDER BY violation_count DESC;

-- Monitor active execution contexts
SELECT 
    COUNT(*) as active_contexts,
    COUNT(DISTINCT workflow_id) as unique_workflows,
    COUNT(DISTINCT execution_id) as unique_executions
FROM workflow_execution_contexts 
WHERE status = 'active';

-- Check activity isolation compliance
SELECT 
    access_scope,
    COUNT(*) as activity_count,
    COUNT(DISTINCT workflow_id) as workflow_count
FROM activity_library 
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY access_scope;
```

### 2. Application Health Checks
```bash
# Workflow isolation health endpoint
curl "http://localhost:3000/api/health/isolation"

# Activity isolation status
curl "http://localhost:3000/api/activities/isolation-status"

# Cache isolation metrics  
curl "http://localhost:3000/api/cache/isolation-metrics"
```

### 3. Performance Impact Assessment
```bash
# Before/after query performance comparison
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
EXPLAIN ANALYZE 
SELECT * FROM get_workflow_activities_isolated('test-workflow-id');
"

# Redis cache efficiency
redis-cli -h $REDIS_HOST -p $REDIS_PORT info stats | grep -E "(hit_rate|memory_usage|key_count)"
```

## Rollback Procedures

### Emergency Rollback (If critical issues occur)

#### Step 1: Disable Isolation Features
```bash
# Disable all isolation enforcement
export WORKFLOW_STRICT_ISOLATION=false
export WORKFLOW_CONTEXT_VALIDATION=false
export BLOCK_CROSS_WORKFLOW_ACCESS=false

# Restart services immediately
docker-compose restart temporal-worker workflow-automation
```

#### Step 2: Restore Previous Code (If needed)
```bash
# Restore from git
git checkout HEAD~1 -- services/temporal-worker/src/working-activities.ts
git checkout HEAD~1 -- services/workflow-automation/src/routes/activities.ts

# Restart services
docker-compose restart temporal-worker workflow-automation
```

#### Step 3: Database Rollback (Last resort)
```sql
-- Remove isolation constraints (only if absolutely necessary)
DROP TRIGGER IF EXISTS trigger_workflow_isolation ON activity_definitions;
DROP TRIGGER IF EXISTS trigger_activity_access_validation ON activity_library;

-- Restore from backup if needed
-- psql -h $DB_HOST -U $DB_USER -d $DB_NAME < workflow_isolation_backup_YYYYMMDD_HHMMSS.sql
```

## Post-Deployment Tasks

### 1. Documentation Updates
- [ ] Update API documentation with isolation parameters
- [ ] Create developer guidelines for workflow isolation
- [ ] Update monitoring dashboards with isolation metrics

### 2. Training and Communication
- [ ] Notify development teams about isolation requirements
- [ ] Provide examples of isolated workflow development
- [ ] Update troubleshooting guides

### 3. Ongoing Maintenance
```bash
# Set up automated cleanup job
echo "0 2 * * * /usr/local/bin/psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c 'SELECT schedule_isolation_maintenance();'" | crontab -

# Set up monitoring alerts
# Configure alerts for:
# - Isolation violations > 0 per hour
# - Context creation failures > 5% 
# - Cache isolation breaches > 0
```

## Success Criteria

### Technical Validation
- [ ] No isolation violations detected in logs
- [ ] All workflow executions complete successfully
- [ ] Cross-workflow activity access blocked
- [ ] Cache isolation enforced
- [ ] Database constraints working
- [ ] Performance impact < 15ms per query

### Business Validation  
- [ ] Workflow results are accurate and isolated
- [ ] No data contamination between workflows
- [ ] Concurrent executions work correctly
- [ ] System reliability maintained
- [ ] User experience unchanged

## Support and Troubleshooting

### Common Issues and Solutions

#### Issue: Isolation violations detected
```bash
# Check violation logs
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT * FROM workflow_isolation_violations 
ORDER BY detected_at DESC LIMIT 10;
"

# Solution: Review and fix violating code paths
```

#### Issue: Performance degradation
```bash
# Check slow queries
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT query, mean_time, calls 
FROM pg_stat_statements 
WHERE query LIKE '%activity%' 
ORDER BY mean_time DESC LIMIT 5;
"

# Solution: Add indexes or optimize queries
```

#### Issue: Cache isolation failures
```bash
# Check Redis key patterns
redis-cli -h $REDIS_HOST -p $REDIS_PORT keys "workflow:isolated:*" | head -20

# Solution: Verify cache key generation logic
```

### Emergency Contacts
- **Database Issues**: DBA Team (dba@company.com)
- **Application Issues**: Backend Team (backend@company.com)  
- **Infrastructure Issues**: DevOps Team (devops@company.com)
- **Escalation**: Engineering Manager (manager@company.com)

## Conclusion

This migration guide ensures a safe, controlled deployment of the workflow isolation fixes. The phased approach with feature flags allows for gradual rollout while maintaining system stability and providing quick rollback options if issues arise.

Key success factors:
1. **Thorough Testing**: Validate all scenarios in test environment
2. **Monitoring**: Watch key metrics during and after deployment
3. **Gradual Rollout**: Use feature flags for controlled enablement
4. **Quick Response**: Have rollback procedures ready
5. **Communication**: Keep stakeholders informed of progress

The isolation fixes will prevent the critical bug of activity cross-contamination while maintaining system performance and reliability.