-- ==========================================
-- Temporal AI Workflow Platform Database Schema
-- Migration 001: Core workflow and execution tables
-- ==========================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- ==========================================
-- WORKFLOW DEFINITIONS TABLE
-- ==========================================

CREATE TABLE workflow_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    version VARCHAR(50) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL CHECK (category IN ('ai', 'data', 'automation', 'integration', 'monitoring', 'testing')),
    tags TEXT[] DEFAULT '{}',
    
    -- Temporal configuration
    temporal_workflow_type VARCHAR(255) NOT NULL,
    temporal_task_queue VARCHAR(255) NOT NULL,
    temporal_timeout INTERVAL,
    temporal_retry_policy JSONB,
    
    -- AI interface configuration
    ai_provider VARCHAR(50) CHECK (ai_provider IN ('openai', 'anthropic', 'local', 'azure', 'aws', 'google')),
    ai_model VARCHAR(255),
    ai_config JSONB,
    
    -- Web editor configuration
    web_editor_config JSONB,
    form_schema JSONB,
    ui_schema JSONB,
    validation_rules JSONB,
    
    -- MLOps metadata
    mlops_metadata JSONB,
    
    -- Metrics and metadata
    complexity_score INTEGER CHECK (complexity_score BETWEEN 1 AND 100),
    success_rate DECIMAL(3,2) CHECK (success_rate BETWEEN 0 AND 1),
    usage_count INTEGER DEFAULT 0,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NOT NULL,
    updated_by VARCHAR(255),
    
    -- Version control
    UNIQUE(name, version)
);

-- ==========================================
-- WORKFLOW EXECUTIONS TABLE
-- ==========================================

CREATE TABLE workflow_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflow_definitions(id),
    workflow_name VARCHAR(255) NOT NULL,
    workflow_version VARCHAR(50) NOT NULL,
    
    -- Temporal execution details
    temporal_workflow_id VARCHAR(255) NOT NULL,
    temporal_run_id VARCHAR(255) NOT NULL,
    temporal_namespace VARCHAR(255) NOT NULL DEFAULT 'default',
    temporal_task_queue VARCHAR(255) NOT NULL,
    
    -- Execution status
    status VARCHAR(50) NOT NULL DEFAULT 'RUNNING' 
        CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TERMINATED', 'TIMED_OUT')),
    
    -- Input/Output data
    input_data JSONB,
    output_data JSONB,
    error_message TEXT,
    error_details JSONB,
    
    -- Execution metrics
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    execution_time_ms INTEGER,
    
    -- Correlation and tracing
    correlation_id VARCHAR(255),
    trace_id VARCHAR(255),
    span_id VARCHAR(255),
    parent_span_id VARCHAR(255),
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(temporal_workflow_id, temporal_run_id)
);

-- ==========================================
-- WORKFLOW ACTIVITIES TABLE
-- ==========================================

CREATE TABLE workflow_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
    
    -- Activity details
    activity_name VARCHAR(255) NOT NULL,
    activity_type VARCHAR(255) NOT NULL,
    temporal_activity_id VARCHAR(255),
    
    -- Activity status
    status VARCHAR(50) NOT NULL DEFAULT 'SCHEDULED'
        CHECK (status IN ('SCHEDULED', 'STARTED', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETRYING')),
    
    -- Input/Output data
    input_data JSONB,
    output_data JSONB,
    error_message TEXT,
    error_details JSONB,
    
    -- Timing
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    execution_time_ms INTEGER,
    
    -- Retry information
    attempt_number INTEGER DEFAULT 1,
    max_attempts INTEGER DEFAULT 3,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- WORKFLOW CHAINS TABLE
-- ==========================================

CREATE TABLE workflow_chains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    version VARCHAR(50) NOT NULL,
    description TEXT,
    
    -- Chain definition
    chain_definition JSONB NOT NULL,
    global_settings JSONB,
    
    -- Status and metadata
    status VARCHAR(50) NOT NULL DEFAULT 'draft' 
        CHECK (status IN ('active', 'draft', 'archived')),
    category VARCHAR(100),
    tags TEXT[] DEFAULT '{}',
    
    -- Performance metrics
    total_executions INTEGER DEFAULT 0,
    successful_executions INTEGER DEFAULT 0,
    failed_executions INTEGER DEFAULT 0,
    average_execution_time_ms INTEGER,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NOT NULL,
    updated_by VARCHAR(255),
    
    UNIQUE(name, version)
);

-- ==========================================
-- WORKFLOW CHAIN EXECUTIONS TABLE
-- ==========================================

CREATE TABLE workflow_chain_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chain_id UUID NOT NULL REFERENCES workflow_chains(id),
    chain_name VARCHAR(255) NOT NULL,
    chain_version VARCHAR(50) NOT NULL,
    
    -- Execution status
    status VARCHAR(50) NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    
    -- Input parameters and results
    input_parameters JSONB,
    execution_results JSONB,
    error_message TEXT,
    error_details JSONB,
    
    -- Progress tracking
    current_step INTEGER DEFAULT 0,
    total_steps INTEGER NOT NULL,
    steps_completed INTEGER DEFAULT 0,
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    execution_time_ms INTEGER,
    
    -- Correlation
    correlation_id VARCHAR(255),
    trace_id VARCHAR(255),
    user_id VARCHAR(255),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- INDICES FOR PERFORMANCE
-- ==========================================

-- Workflow definitions indices
CREATE INDEX idx_workflow_definitions_name ON workflow_definitions(name);
CREATE INDEX idx_workflow_definitions_category ON workflow_definitions(category);
CREATE INDEX idx_workflow_definitions_tags ON workflow_definitions USING GIN(tags);
CREATE INDEX idx_workflow_definitions_created_at ON workflow_definitions(created_at);

-- Workflow executions indices
CREATE INDEX idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_workflow_executions_temporal_workflow_id ON workflow_executions(temporal_workflow_id);
CREATE INDEX idx_workflow_executions_correlation_id ON workflow_executions(correlation_id);
CREATE INDEX idx_workflow_executions_trace_id ON workflow_executions(trace_id);
CREATE INDEX idx_workflow_executions_user_id ON workflow_executions(user_id);
CREATE INDEX idx_workflow_executions_started_at ON workflow_executions(started_at);

-- Workflow activities indices
CREATE INDEX idx_workflow_activities_execution_id ON workflow_activities(execution_id);
CREATE INDEX idx_workflow_activities_activity_name ON workflow_activities(activity_name);
CREATE INDEX idx_workflow_activities_status ON workflow_activities(status);
CREATE INDEX idx_workflow_activities_started_at ON workflow_activities(started_at);

-- Workflow chains indices
CREATE INDEX idx_workflow_chains_name ON workflow_chains(name);
CREATE INDEX idx_workflow_chains_status ON workflow_chains(status);
CREATE INDEX idx_workflow_chains_category ON workflow_chains(category);
CREATE INDEX idx_workflow_chains_tags ON workflow_chains USING GIN(tags);

-- Chain executions indices
CREATE INDEX idx_workflow_chain_executions_chain_id ON workflow_chain_executions(chain_id);
CREATE INDEX idx_workflow_chain_executions_status ON workflow_chain_executions(status);
CREATE INDEX idx_workflow_chain_executions_correlation_id ON workflow_chain_executions(correlation_id);
CREATE INDEX idx_workflow_chain_executions_started_at ON workflow_chain_executions(started_at);

-- ==========================================
-- FUNCTIONS AND TRIGGERS
-- ==========================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_workflow_definitions_updated_at BEFORE UPDATE ON workflow_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflow_executions_updated_at BEFORE UPDATE ON workflow_executions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflow_activities_updated_at BEFORE UPDATE ON workflow_activities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflow_chains_updated_at BEFORE UPDATE ON workflow_chains FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflow_chain_executions_updated_at BEFORE UPDATE ON workflow_chain_executions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Success rate calculation function
CREATE OR REPLACE FUNCTION calculate_workflow_success_rate(workflow_def_id UUID)
RETURNS DECIMAL(3,2) AS $$
DECLARE
    total_executions INTEGER;
    successful_executions INTEGER;
    success_rate DECIMAL(3,2);
BEGIN
    SELECT COUNT(*) INTO total_executions
    FROM workflow_executions
    WHERE workflow_id = workflow_def_id;
    
    IF total_executions = 0 THEN
        RETURN 0.0;
    END IF;
    
    SELECT COUNT(*) INTO successful_executions
    FROM workflow_executions
    WHERE workflow_id = workflow_def_id AND status = 'COMPLETED';
    
    success_rate = successful_executions::DECIMAL / total_executions::DECIMAL;
    
    -- Update the workflow definition
    UPDATE workflow_definitions 
    SET success_rate = success_rate,
        usage_count = total_executions
    WHERE id = workflow_def_id;
    
    RETURN success_rate;
END;
$$ LANGUAGE plpgsql;