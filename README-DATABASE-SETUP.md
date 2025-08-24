# Temporal AI Workflow Platform - Database Setup Guide

## 🚀 Quick Setup for New Projects

This guide shows you how to set up a new Temporal AI Workflow Platform project with a clean, optimized database.

### ✅ What You Get

- **5 Essential Tables** - Clean schema with no bloat
- **10 Production-Ready Activities** - Factorial, Circle Area, Email Processing, CSV Parsing, Validation
- **3 Complete Workflows** - Ready-to-use examples with proper activity references
- **Generic Regex Parser Support** - Stable function extraction and template processing
- **Redis Parameter Validation** - Safe workflow parameter storage
- **Full Foreign Key Relationships** - Data integrity guaranteed
- **Performance Indexes** - Optimized for production workloads

### 📁 Database Initialization

#### Option 1: Quick Setup (Recommended)
```bash
# Run the initialization script
docker exec -i temporal-postgres psql -U temporal -d temporal_ai_platform_clean -f - < scripts/init-project-database.sql
```

#### Option 2: Manual Setup
```bash
# Create new database
docker exec temporal-postgres psql -U temporal -c "CREATE DATABASE temporal_ai_platform_clean;"

# Run initialization script
docker exec -i temporal-postgres psql -U temporal -d temporal_ai_platform_clean -f - < scripts/init-project-database.sql
```

### 🔧 Docker Services Configuration

Ensure all services use the clean database in `docker-compose.yml`:

```yaml
services:
  enhanced-workflow-editor:
    environment:
      POSTGRES_DB: temporal_ai_platform_clean
  
  workflow-automation:
    environment:
      DATABASE_URL: postgresql://temporal:temporal@postgres:5432/temporal_ai_platform_clean
  
  temporal-worker:
    environment:
      DATABASE_URL: postgresql://temporal:temporal@postgres:5432/temporal_ai_platform_clean
```

### 📊 Database Schema Overview

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `activity_library` | Reusable activity definitions | Unique IDs, versioning, quality scores |
| `workflow_definitions` | Workflow templates | Activity references by ID, JSON configuration |
| `workflow_executions` | Runtime workflow tracking | Temporal integration, execution status |
| `activity_executions` | Individual activity tracking | Performance metrics, error handling |
| `execution_logs` | Detailed execution logs | Debugging and monitoring support |

### 🎯 Available Activities

#### Validation Activities
- **`input_validation`** - Generic input validation with error reporting
- **`validate_radius`** - Radius validation for circle calculations  
- **`validate_input`** - Integer validation for factorial calculations

#### Processing Activities
- **`template_loading`** - Email template loading with error handling
- **`csv_parsing`** - CSV parsing with header detection

#### Calculation Activities
- **`calculate_factorial`** - Factorial calculation with step tracking
- **`calculate_circle_area`** - Circle area calculation with formula display

#### Formatting Activities
- **`format_result`** - Generic result formatting
- **`result_formatting`** - Advanced formatting with multiple outputs

#### Data Activities
- **`data_validation`** - Schema-based data validation

### 🚀 Available Workflows

#### 1. Factorial Calculator (`6e77654e-8486-4f91-9573-82520902c572`)
```bash
curl -X POST http://localhost:3001/api/chains/6e77654e-8486-4f91-9573-82520902c572/execute \
  -H "Content-Type: application/json" \
  -d '{"input":{"number":5}}'
```

#### 2. Circle Area Calculator (`e49b69a4-a543-4887-b52a-ce6c9cc44067`) 
```bash
curl -X POST http://localhost:3001/api/chains/e49b69a4-a543-4887-b52a-ce6c9cc44067/execute \
  -H "Content-Type: application/json" \
  -d '{"input":{"radius":10}}'
```

#### 3. Email Processing (`email-template-workflow`)
```bash
curl -X POST http://localhost:3001/api/chains/email-template-workflow/execute \
  -H "Content-Type: application/json" \
  -d '{"input":{"emailTemplate":"welcome-email.html","recipientsList":"sample-recipients.csv"}}'
```

### 🔍 Verification Steps

1. **Check Database Contents:**
```bash
docker exec temporal-postgres psql -U temporal -d temporal_ai_platform_clean -c "
SELECT COUNT(*) as activities FROM activity_library;
SELECT COUNT(*) as workflows FROM workflow_definitions;
"
```

2. **Test Service Connections:**
```bash
# Check temporal-worker logs
docker logs temporal-worker --tail 20

# Check enhanced-workflow-editor health
curl http://localhost:3001/health

# Check workflow-automation health  
curl http://localhost:8092/health
```

3. **Test Workflow Execution:**
```bash
# Test factorial calculation
curl -X POST http://localhost:3001/api/chains/6e77654e-8486-4f91-9573-82520902c572/execute \
  -H "Content-Type: application/json" \
  -d '{"input":{"number":7}}'
```

### 🛠️ Customization

#### Adding New Activities
```sql
INSERT INTO activity_library (id, name, type, description, code, category) VALUES
('my_custom_activity', 'My Custom Activity', 'calculation', 'Description here',
'function myFunction(input) { return { result: input.value * 2 }; }', 'mathematical');
```

#### Creating New Workflows
```sql
INSERT INTO workflow_definitions (id, name, description, activities) VALUES
('my-workflow-id', 'My Custom Workflow', 'Workflow description',
'[{"id": "my_custom_activity", "name": "myFunction", "type": "calculation"}]'::jsonb);
```

### 🚨 Important Notes

- **All services must use `temporal_ai_platform_clean`** - No mixing of databases
- **Activities use unique IDs** - Never reference by name only
- **Generic regex parser** - Function extraction is now safe and stable
- **Redis validation** - Parameter storage includes size and format validation
- **Foreign key constraints** - Data integrity is enforced

### 📋 Migration from Old System

If migrating from the old multi-database system:

1. **Stop all services**
2. **Run the init script** on a fresh database
3. **Update docker-compose.yml** with new database names
4. **Restart services**
5. **Test workflow execution**

The old `temporal_ai_platform` database with 34+ tables is now replaced with this clean 5-table design.

### 🎉 Success!

Your Temporal AI Workflow Platform project is now ready for:
- ✅ Production deployment
- ✅ Custom workflow development  
- ✅ Stable, predictable execution
- ✅ Easy maintenance and scaling

Visit the Enhanced Workflow Editor at http://localhost:3001 to start building workflows!