# Temporal Workers Service

## Overview
Universal Dynamic Executor and supporting workers for the Temporal AI Workflow Platform.

## Main Components
- `worker_sandbox_compatible.py` - Universal Dynamic Executor with AI workflow execution
- `deterministic_log_collector.py` - Log collection service
- `error_context.py` - Error context capture
- `log_collector.py` - General log collection
- `workflow_safe_log_collector.py` - Safe workflow log collection

## Features
- **Dynamic Code Execution** - Executes AI-generated Python workflows
- **Function Signature Inspection** - Automatically maps function parameters
- **Template Resolution** - Resolves workflow templates to actual data
- **Activity Extraction** - Dynamically extracts and executes activities
- **Secure Sandbox** - Safe code execution environment

## Universal Dynamic Executor
The core innovation that allows execution of any AI-generated workflow:
- Parses Python workflow code
- Extracts activity definitions
- Maps input parameters dynamically
- Executes in secure namespace
- Returns structured results

## Running
Workers are automatically started via Docker Compose:
```bash
docker-compose up workflow-worker failure-worker
```

## Task Queues
- `workflow-editor-queue` - Main workflow execution
- `failure-handler-queue` - Failure handling workflows

## Dependencies
- Temporal server connection
- PostgreSQL database for workflow definitions