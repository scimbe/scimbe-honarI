#!/bin/bash
set -e

echo "Initializing temporal_ai_platform database with required tables and indexes..."

# Initialize temporal_ai_platform database specifically
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
    CREATE EXTENSION IF NOT EXISTS "btree_gin";

    -- Activity Library Table
    CREATE TABLE IF NOT EXISTS activity_library (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100),
        description TEXT,
        version VARCHAR(50) DEFAULT '1.0.0',
        category VARCHAR(100),
        inputs JSONB DEFAULT '{}',
        outputs JSONB DEFAULT '{}',
        code TEXT,
        language VARCHAR(50) DEFAULT 'typescript',
        kafka_config JSONB,
        redis_config JSONB,
        temporal_config JSONB,
        retry_policy JSONB DEFAULT '{"maxAttempts": 3, "backoffCoefficient": 2}',
        timeout_config JSONB DEFAULT '{"startToCloseTimeout": "10m"}',
        metadata JSONB DEFAULT '{}',
        tags TEXT[],
        usage_count INTEGER DEFAULT 0,
        quality_score NUMERIC(3,2) DEFAULT 0.0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(255),
        CONSTRAINT valid_quality_score CHECK (quality_score >= 0.0 AND quality_score <= 10.0)
    );

    -- Indexes for activity_library
    CREATE INDEX IF NOT EXISTS idx_activities_type ON activity_library(type);
    CREATE INDEX IF NOT EXISTS idx_activity_library_category ON activity_library(category);
    CREATE INDEX IF NOT EXISTS idx_activity_library_quality ON activity_library(quality_score DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_library_tags ON activity_library USING GIN (tags);
    CREATE INDEX IF NOT EXISTS idx_activity_library_type ON activity_library(type);
    CREATE INDEX IF NOT EXISTS idx_activity_library_usage ON activity_library(usage_count DESC);

    -- Update trigger function
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS \$\$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    \$\$ language 'plpgsql';

    -- Update trigger
    DROP TRIGGER IF EXISTS update_activity_library_updated_at ON activity_library;
    CREATE TRIGGER update_activity_library_updated_at
        BEFORE UPDATE ON activity_library
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

    -- Workflow chains table (compatible with enhanced-workflow-editor)
    CREATE TABLE IF NOT EXISTS workflow_chains (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        execution_mode VARCHAR(50) DEFAULT 'sequential',
        chain_definition JSONB NOT NULL DEFAULT '{}',
        workflows JSONB NOT NULL DEFAULT '[]',
        data_mapping JSONB DEFAULT '{}',
        communication_patterns JSONB DEFAULT '{}',
        metadata JSONB DEFAULT '{}',
        created_by VARCHAR(255),
        deployment_status VARCHAR(50) DEFAULT 'draft',
        last_executed_at TIMESTAMP WITH TIME ZONE,
        execution_count INTEGER DEFAULT 0,
        usage_count INTEGER DEFAULT 0,
        success_rate DECIMAL(5,2) DEFAULT 0.0,
        definition JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Workflow definitions table
    CREATE TABLE IF NOT EXISTS workflow_definitions (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        display_name VARCHAR(255),
        description TEXT,
        category VARCHAR(100),
        type VARCHAR(50) DEFAULT 'standard',
        code TEXT,
        configuration JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Dynamic workflow instances table  
    CREATE TABLE IF NOT EXISTS dynamic_workflow_instances (
        id VARCHAR(255) PRIMARY KEY,
        workflow_definition_id VARCHAR(255),
        execution_id VARCHAR(255) UNIQUE NOT NULL,
        trigger_type VARCHAR(50),
        parent_workflow_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'created',
        result_data JSONB,
        error_info JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP WITH TIME ZONE
    );

    -- Workflow chain executions table
    CREATE TABLE IF NOT EXISTS workflow_chain_executions (
        id VARCHAR(255) PRIMARY KEY,
        chain_id VARCHAR(255),
        execution_id VARCHAR(255) NOT NULL,
        initial_data JSONB,
        execution_mode VARCHAR(50),
        status VARCHAR(50) DEFAULT 'pending',
        workflow_count INTEGER DEFAULT 0,
        current_workflow_index INTEGER DEFAULT 0,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        result_data JSONB,
        error_info JSONB
    );

    -- Generated workflows table (compatible with workflow-automation service)
    CREATE TABLE IF NOT EXISTS generated_workflows (
        workflow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        execution_id UUID,
        requirements TEXT NOT NULL,
        generated_code TEXT NOT NULL,
        supporting_files JSONB DEFAULT '[]',
        template_id VARCHAR(255),
        target_language VARCHAR(50) NOT NULL,
        temporal_workflow_class VARCHAR(255) NOT NULL,
        quality_score DECIMAL(3,2),
        deployment_status VARCHAR(50) DEFAULT 'generated',
        deployment_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        deployed_at TIMESTAMP WITH TIME ZONE
    );

    -- Workflow executions table
    CREATE TABLE IF NOT EXISTS workflow_executions (
        id VARCHAR(255) PRIMARY KEY,
        execution_id VARCHAR(255) NOT NULL,
        workflow_id VARCHAR(255),
        status VARCHAR(100) DEFAULT 'pending',
        input_data JSONB,
        output_data JSONB,
        error_message TEXT,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP WITH TIME ZONE,
        metadata JSONB DEFAULT '{}'
    );

    -- Quality assessments table (compatible with workflow-automation service)
    CREATE TABLE IF NOT EXISTS quality_assessments (
        assessment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        execution_id UUID,
        step_execution_id UUID,
        iteration INTEGER NOT NULL,
        assessment_type VARCHAR(100) NOT NULL,
        criteria JSONB NOT NULL,
        results JSONB NOT NULL,
        overall_score NUMERIC(5,4) NOT NULL,
        passed BOOLEAN NOT NULL,
        feedback_for_improvement TEXT,
        assessor VARCHAR(100) NOT NULL,
        assessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Workflow templates table
    CREATE TABLE IF NOT EXISTS workflow_templates (
        id VARCHAR(255) PRIMARY KEY,
        template_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        tags TEXT[],
        template_data JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \$POSTGRES_USER;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO \$POSTGRES_USER;
EOSQL

    -- Create temporal database for temporal server (different from our app data)
    CREATE DATABASE temporal;
    
EOSQL

# Initialize temporal database for Temporal Server (separate from app data)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "temporal" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
    CREATE EXTENSION IF NOT EXISTS "btree_gin";
EOSQL

echo "temporal_ai_platform database initialized successfully"