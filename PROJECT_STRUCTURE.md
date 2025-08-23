# Project Structure - Temporal AI Workflow Platform

## Overview
Clean and organized project structure with all source files properly categorized into service directories.

## Directory Structure

```
honarī/
├── archive/                           # Archived/removed components
│   └── backup_20250819_012719/       # Timestamped backup
│       ├── configs/                  # Old configuration files
│       ├── deployment/               # Old deployment configs
│       ├── kubernetes/               # K8s manifests
│       ├── monitoring/               # Prometheus/Grafana stack
│       ├── redundant_services/       # Removed services
│       ├── scripts/                  # Old scripts
│       ├── test_files/               # Test and demo files
│       └── unused_workflows/         # Static workflow definitions
│
├── config/                           # Root configuration files
│   ├── lerna.json                   # Monorepo configuration
│   ├── root-package.json             # Root package.json
│   └── root-tsconfig.json            # Root TypeScript config
│
├── doc/                              # Documentation
│   ├── ARCHITECTURE.md
│   ├── IMPLEMENTATION-ROADMAP.md
│   ├── UNIVERSAL-DYNAMIC-EXECUTOR-ARCHITECTURE.md
│   ├── mlops-integration-patterns.md
│   ├── openapi-3.1.0-specification.yaml
│   └── temporal-optimization-guide.md
│
├── frontend/                         # Drag & Drop Workspace (React)
│   ├── src/
│   │   ├── components/              # React components
│   │   ├── services/                # API services
│   │   ├── stores/                  # State management
│   │   └── types/                   # TypeScript types
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.ts
│
├── infrastructure/                   # Core infrastructure
│   ├── database/
│   │   ├── migrations/              # Database migrations
│   │   │   ├── 001_create_workflow_tables.sql
│   │   │   ├── 002_create_ai_gateway_tables.sql
│   │   │   └── 003_add_dynamic_worker_support.sql
│   │   └── schemas/                 # Database schemas
│   │       ├── database_schema.sql
│   │       ├── insert-sample-workflow.sql
│   │       └── unified_database_schema.sql
│   ├── postgres/
│   │   └── init-multiple-dbs.sh    # PostgreSQL initialization
│   └── temporal/
│       ├── config/                  # Temporal configuration
│       │   └── development-sql.yaml
│       └── dynamicconfig/
│           └── development-sql.yaml
│
├── scripts/                          # Shell scripts
│   ├── quick-fix-system.sh
│   ├── start-complete-system.sh
│   └── test-workflow-system.sh
│
├── services/                         # Core services
│   ├── temporal-workers/            # Universal Dynamic Executor
│   │   ├── worker_sandbox_compatible.py  # Main worker (Dynamic Executor)
│   │   ├── deterministic_log_collector.py
│   │   ├── error_context.py
│   │   ├── log_collector.py
│   │   ├── workflow_safe_log_collector.py
│   │   └── README.md
│   │
│   ├── web-editor/                  # Advanced Workflow Editor
│   │   ├── src/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── workflow-automation/         # Workflow Automation Service
│   │   ├── src/
│   │   │   ├── ai/                 # AI generation
│   │   │   ├── automation/         # Automation engine
│   │   │   ├── database/           # Database connections
│   │   │   ├── routes/             # API routes
│   │   │   └── temporal/           # Temporal integration
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── workflow-backend/            # Main Backend API
│   │   ├── main.py                 # Core backend server
│   │   └── README.md
│   │
│   └── workflow-chains/             # Workflow chain management
│
├── shared/                           # Shared utilities
│   ├── src/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── types/
│   │   └── utils/
│   └── package.json
│
├── docker-compose.yml               # Production deployment
├── docker-compose.dev.yaml          # Development deployment
├── docker-compose.complete.yml      # Complete system deployment
├── Dockerfile                        # Backend container
├── Dockerfile.worker                 # Worker container
├── requirements.txt                  # Python dependencies
├── CLAUDE.md                         # Project configuration
├── CLEANUP_REPORT.md                 # Cleanup documentation
└── README.md                         # Main documentation
```

## Service Organization

### Services Directory (`/services`)
All application services are now properly organized:

1. **temporal-workers/** - Universal Dynamic Executor and worker services
2. **web-editor/** - Advanced workflow editor interface
3. **workflow-automation/** - AI-powered workflow generation
4. **workflow-backend/** - Main backend API (formerly root-level main.py)
5. **workflow-chains/** - Workflow chain management

### Infrastructure Directory (`/infrastructure`)
Core infrastructure components:

1. **database/** - All database-related files (migrations, schemas)
2. **postgres/** - PostgreSQL initialization scripts
3. **temporal/** - Temporal server configuration

### Scripts Directory (`/scripts`)
All shell scripts organized in one place

### Config Directory (`/config`)
Root-level configuration files


## Docker Volume Mappings

Updated Docker Compose volume mappings:
```yaml
volumes:
  - ./services/temporal-workers/worker_sandbox_compatible.py:/app/worker_sandbox_compatible.py
  - ./services/workflow-backend/main.py:/app/main.py
```

## Benefits of This Structure

1. **Clear Service Boundaries** - Each service in its own directory
2. **No Root Clutter** - Source files organized into services
3. **Easy Navigation** - Logical grouping of related files
4. **Better Maintenance** - Clear ownership of components
5. **Scalable Architecture** - Easy to add new services
6. **Clean Root Directory** - Only essential files at root level

## Running the System

```bash
# Start all services
docker-compose up --build

# Access points:
# Drag & Drop Workspace: http://localhost:3004
# Workflow Backend API: http://localhost:3001
# Workflow Automation: http://localhost:3002
# Temporal Web UI: http://localhost:8088
```

## Key Files Relocated

| Original Location | New Location |
|------------------|--------------|
| `/main.py` | `/services/workflow-backend/main.py` |
| `/worker_sandbox_compatible.py` | `/services/temporal-workers/worker_sandbox_compatible.py` |
| `/*.sql` | `/infrastructure/database/schemas/` |
| `/*.sh` | `/scripts/` |
| `/temporal-config/` | `/infrastructure/temporal/config/` |
| `/workflow_editor.db` | **REMOVED** (archived - using PostgreSQL only) |
| Root config files | `/config/` |

This organization follows best practices for microservices architecture and makes the project much more maintainable.