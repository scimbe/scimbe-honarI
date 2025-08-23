# Workflow Automation Service

**Temporal Workflow Code Generation Pipeline** - AI-powered service for creating production-ready Temporal workflows from YAML patterns and natural language requirements.

## Overview

The Workflow Automation Service is a core component of the Temporal AI Workflow Platform that provides:

- **Temporal workflow code generation** from YAML patterns and natural language descriptions
- **AI-driven iterative optimization** with quality validation
- **Template-based workflow patterns** for common use cases  
- **Automatic deployment** to Temporal Worker Services
- **Quality assessment and improvement** using configurable criteria
- **Background job processing** with Redis-based queues
- **Workflow scheduling** with cron-based automation

## Features

### 🔄 Temporal Workflow Generation
- Generate Python and TypeScript Temporal workflow code
- Support for YAML workflow pattern definitions
- Template-based generation for common patterns (ETL, ML pipelines, Saga patterns)
- AI-powered code optimization and quality validation

### 🎯 Quality Control
- Configurable quality criteria (accuracy, completeness, Temporal compliance)
- Iterative improvement with AI feedback
- Code validation and best practices enforcement
- Quality scoring and reporting

### 📋 Workflow Templates
- Pre-built templates for common workflow patterns:
  - **Data Processing**: ETL pipelines with retry policies
  - **ML Pipelines**: Model training, validation, and deployment
  - **Saga Patterns**: Distributed transactions with compensation
  - **API Orchestration**: Service coordination workflows
  - **Batch Jobs**: Scheduled data processing workflows

### ⚡ Background Processing
- Redis-based job queues with Bull
- Multiple queue types: workflow-execution, quality-assessment, data-processing, ai-tasks
- Configurable retry policies and error handling
- Real-time job monitoring and statistics

### 📅 Workflow Scheduling
- Cron-based workflow scheduling
- Timezone support and execution tracking
- Schedule management and monitoring
- Automatic execution with quality validation

## API Endpoints

### Core Generation
- `POST /workflow-automation/api/workflows/generate` - Generate Temporal workflow code
- `POST /workflow-automation/api/workflows/generate-iterative` - Generate with iterative optimization
- `GET /workflow-automation/api/executions/{executionId}` - Get execution status

### Templates & Configuration
- `GET /workflow-automation/api/workflows` - List workflow templates
- `GET /workflow-automation/api/config` - Get system configuration
- `POST /workflow-automation/api/config` - Update configuration

### Quality Management
- `POST /workflow-automation/api/quality/assess` - Perform quality assessment
- `GET /workflow-automation/api/quality/history` - Get assessment history
- `GET /workflow-automation/api/quality/criteria` - Get quality criteria
- `POST /workflow-automation/api/quality/criteria` - Create quality criteria

### Job Management
- `GET /workflow-automation/api/jobs` - List jobs
- `POST /workflow-automation/api/jobs` - Create job
- `GET /workflow-automation/api/queues` - List queues
- `GET /workflow-automation/api/queues/{queueName}/stats` - Queue statistics

### Scheduling
- `GET /workflow-automation/api/schedules` - List schedules
- `POST /workflow-automation/api/schedules` - Create schedule
- `GET /workflow-automation/api/schedules/{scheduleId}` - Get schedule
- `PUT /workflow-automation/api/schedules/{scheduleId}` - Update schedule
- `DELETE /workflow-automation/api/schedules/{scheduleId}` - Delete schedule

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- AI Gateway Service running (Port 8090)
- Temporal Worker Service running (Port 8081)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Build the service
npm run build

# Run database migrations (if needed)
npm run migrate

# Start the service
npm start
```

### Environment Variables

```bash
# Server Configuration
NODE_ENV=development
PORT=8092
HOST=0.0.0.0
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://localhost:5432/platform_db

# Redis
REDIS_URL=redis://localhost:6379

# External Services
AI_GATEWAY_URL=http://localhost:8090
TEMPORAL_WORKER_URL=http://localhost:8081

# Service Configuration
MAX_CONCURRENT_EXECUTIONS=10
DEFAULT_QUALITY_THRESHOLD=0.8
ENABLE_ITERATIVE_MODE=true
DEFAULT_COMPLEXITY=moderate
EXECUTION_TIMEOUT=300000
STEP_TIMEOUT=60000

# CORS
CORS_ORIGIN=http://localhost:3001,http://localhost:8099
```

## Usage Examples

### Generate a Simple Workflow

```bash
curl -X POST http://localhost:8092/workflow-automation/api/workflows/generate \
  -H "Content-Type: application/json" \
  -d '{
    "requirements": "Create a data processing workflow that extracts data from an API, transforms it, and loads it into a database",
    "target_language": "python",
    "auto_activate": true,
    "deploy_environment": "development"
  }'
```

### Generate with Template

```bash
curl -X POST http://localhost:8092/workflow-automation/api/workflows/generate \
  -H "Content-Type: application/json" \
  -d '{
    "requirements": "ML training pipeline for customer churn prediction",
    "template_id": "ml-pipeline-advanced",
    "target_language": "python",
    "business_context": "E-commerce customer retention model",
    "auto_activate": true
  }'
```

### Generate with YAML Pattern

```bash
curl -X POST http://localhost:8092/workflow-automation/api/workflows/generate \
  -H "Content-Type: application/json" \
  -d '{
    "requirements": "Order processing with payment and inventory",
    "workflow_yaml": "workflow:\n  name: OrderProcessingWorkflow\n  activities:\n    - name: reserve_inventory\n      type: service_call\n    - name: process_payment\n      type: service_call",
    "target_language": "python"
  }'
```

### Iterative Generation with Quality Optimization

```bash
curl -X POST http://localhost:8092/workflow-automation/api/workflows/generate-iterative \
  -H "Content-Type: application/json" \
  -d '{
    "requirements": "Complex data pipeline with error handling and monitoring",
    "max_iterations": 5,
    "quality_threshold": 95.0,
    "priority_focus": "temporal_workflow_delivery",
    "target_language": "python",
    "auto_activate": true
  }'
```

## Development

### Project Structure

```
src/
├── automation/
│   ├── engine.ts                 # Legacy automation engine
│   └── temporal-engine.ts        # Temporal workflow automation engine
├── database/
│   └── connection.ts             # Database connection and schema
├── jobs/
│   └── queue.ts                  # Redis job queue management
├── quality/
│   └── controller.ts             # Quality assessment and control
├── routes/
│   ├── automation.ts             # Workflow generation endpoints
│   ├── health.ts                 # Health check endpoints
│   ├── jobs.ts                   # Job management endpoints
│   ├── quality.ts                # Quality management endpoints
│   ├── schedule.ts               # Scheduling endpoints
│   └── workflows.ts              # Template and config endpoints
├── scheduler/
│   └── scheduler.ts              # Workflow scheduling system
├── templates/
│   └── temporal-generator.ts     # Temporal workflow code generator
└── server.ts                     # Main server application
```

### Available Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript to JavaScript
npm run start        # Start production server
npm run test         # Run test suite
npm run test:watch   # Run tests in watch mode
npm run lint         # Run ESLint
npm run typecheck    # Run TypeScript type checking
npm run clean        # Clean build directory
```

### Database Schema

The service manages several key tables:

- **automation_executions** - Workflow execution tracking
- **generated_workflows** - Generated Temporal workflow code and metadata
- **workflow_templates** - Template patterns for workflow generation
- **quality_assessments** - Quality evaluation results
- **workflow_schedules** - Scheduled workflow execution
- **system_configurations** - Service configuration management

### Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- temporal-generator.test.ts

# Run tests in watch mode
npm run test:watch
```

## Architecture

### Core Components

1. **TemporalAutomationEngine** - Main orchestration engine for workflow generation
2. **TemporalWorkflowGenerator** - Code generation with AI integration
3. **QualityController** - Quality assessment and validation
4. **JobQueue** - Background processing system
5. **WorkflowScheduler** - Cron-based scheduling

### Integration Points

- **AI Gateway Service** - AI model access for code generation
- **Temporal Worker Service** - Workflow deployment and execution
- **Web Editor Service** - Template selection and configuration
- **Demo Portal Service** - Workflow showcasing and testing

### Data Flow

1. **Request** → API endpoint receives generation request
2. **Processing** → TemporalAutomationEngine coordinates generation
3. **AI Generation** → TemporalWorkflowGenerator creates code via AI Gateway
4. **Quality Check** → QualityController validates generated code
5. **Optimization** → Iterative improvement based on quality feedback
6. **Deployment** → Automatic deployment to Temporal Worker (if enabled)
7. **Monitoring** → Execution tracking and quality metrics

## Monitoring

### Health Checks

- `GET /health` - Basic health status
- `GET /health/detailed` - Comprehensive health check
- `GET /health/ready` - Kubernetes readiness probe
- `GET /health/live` - Kubernetes liveness probe

### Metrics

The service provides comprehensive metrics for:

- Workflow generation success/failure rates
- Quality scores and improvement trends  
- Job queue performance and backlog
- Schedule execution statistics
- AI Gateway integration performance

### Logging

Structured logging with correlation IDs:

```json
{
  "level": "info",
  "time": "2024-01-15T10:30:00.000Z",
  "service": "workflow-automation",
  "component": "temporal-generator",
  "executionId": "123e4567-e89b-12d3-a456-426614174000",
  "message": "Temporal workflow generation completed",
  "data": {
    "temporalWorkflowClass": "DataProcessingWorkflow",
    "qualityScore": 0.92,
    "duration": 2150
  }
}
```

## Contributing

1. Follow the existing code style and patterns
2. Write comprehensive tests for new features
3. Update documentation for API changes
4. Ensure all quality checks pass
5. Keep files under 300 lines of code

## License

MIT License - see LICENSE file for details