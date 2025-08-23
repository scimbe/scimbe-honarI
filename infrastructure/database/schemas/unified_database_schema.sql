-- ============================================================================
-- UNIFIED DATABASE SCHEMA FOR COMPLETE WORKFLOW SYSTEM
-- ============================================================================
-- This schema unifies all components:
-- - Temporal Worker (dynamic workflow/activity loading)
-- - Workflow Automation Service (MLOps pipeline)
-- - Drag & Drop Workspace (visual editor)
-- - Advanced Workflow Editor (metadata management)
-- - Failure Handling System (logs and contexts)
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CORE WORKFLOW DEFINITIONS
-- ============================================================================

-- Enhanced workflow definitions table (consolidates workflows + workflow_definitions)
CREATE TABLE IF NOT EXISTS workflow_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    description TEXT,
    category VARCHAR(50) CHECK (category IN ('ai', 'data', 'automation', 'integration', 'monitoring', 'testing')) NOT NULL DEFAULT 'automation',
    
    -- Temporal-specific fields
    workflow_class_name VARCHAR(255) NOT NULL,
    task_queue VARCHAR(255) NOT NULL DEFAULT 'workflow-editor-queue',
    python_workflow_code TEXT NOT NULL,
    
    -- Drag & drop editor fields
    visual_definition JSONB, -- Stores the visual workflow definition (nodes, edges, etc.)
    form_schema JSONB, -- JSON Schema for input form generation
    
    -- MLOps fields
    is_dynamic_loadable BOOLEAN DEFAULT false,
    source_type VARCHAR(50) DEFAULT 'manual', -- 'manual', 'mlops-direct', 'ai-generated'
    quality_score NUMERIC(3,2), -- 0.00 to 1.00 for MLOps quality assessment
    
    -- Lifecycle management
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deprecated', 'draft')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    tags TEXT[] DEFAULT '{}',
    
    -- Execution metadata
    execution_count INTEGER DEFAULT 0,
    last_executed_at TIMESTAMP WITH TIME ZONE,
    average_execution_time_ms INTEGER,
    success_rate NUMERIC(5,2) DEFAULT 100.00
);

-- Enhanced activity definitions table
CREATE TABLE IF NOT EXISTS activity_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    function_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Code and configuration
    python_activity_code TEXT NOT NULL,
    input_schema JSONB, -- JSON Schema for inputs
    output_schema JSONB, -- JSON Schema for outputs
    configuration_schema JSONB, -- JSON Schema for activity configuration
    
    -- Visual editor fields
    visual_config JSONB, -- Position, styling for drag & drop editor
    icon VARCHAR(100), -- Icon identifier for UI
    color VARCHAR(7), -- Hex color for visual representation
    
    -- Execution properties
    timeout_seconds INTEGER DEFAULT 300,
    retry_policy JSONB DEFAULT '{"initial_interval": "1s", "backoff_coefficient": 2, "maximum_attempts": 3}',
    
    -- Lifecycle
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deprecated')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(workflow_id, function_name)
);

-- ============================================================================
-- EXECUTION TRACKING AND MONITORING
-- ============================================================================

-- Enhanced workflow executions table
CREATE TABLE IF NOT EXISTS workflow_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID REFERENCES workflow_definitions(id),
    execution_id VARCHAR(255) UNIQUE NOT NULL, -- Temporal execution ID
    run_id VARCHAR(255), -- Temporal run ID
    
    -- Execution data
    input_data JSONB,
    output_data JSONB,
    configuration JSONB, -- Runtime configuration used
    
    -- Status and timing
    status VARCHAR(50) CHECK (status IN ('running', 'completed', 'failed', 'terminated', 'timed_out', 'cancelled')),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    
    -- Error handling
    error_type VARCHAR(255),
    error_message TEXT,
    failure_context_id UUID, -- Reference to failure_contexts table
    
    -- Metadata
    triggered_by VARCHAR(255), -- User, system, API, etc.
    execution_context JSONB, -- Additional context data
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CONFIGURATION AND FORM SCHEMAS
-- ============================================================================

-- Component configuration schemas (for drag & drop editor)
CREATE TABLE IF NOT EXISTS component_schemas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    component_type VARCHAR(100) NOT NULL, -- 'activity', 'condition', 'loop', etc.
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Schema definitions
    configuration_schema JSONB NOT NULL, -- JSON Schema for component configuration
    input_schema JSONB, -- Expected inputs
    output_schema JSONB, -- Provided outputs
    
    -- Visual properties
    icon VARCHAR(100),
    color VARCHAR(7),
    category VARCHAR(100),
    
    -- Lifecycle
    version VARCHAR(50) DEFAULT '1.0.0',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(component_type, name, version)
);

-- Form configurations for workflow input/output
CREATE TABLE IF NOT EXISTS form_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    form_type VARCHAR(50) CHECK (form_type IN ('input', 'output', 'configuration')) NOT NULL,
    
    -- Form definition
    form_schema JSONB NOT NULL, -- JSON Schema
    ui_schema JSONB, -- UI Schema for rendering hints
    validation_rules JSONB, -- Additional validation rules
    
    -- Metadata
    version VARCHAR(50) DEFAULT '1.0.0',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- FAILURE HANDLING AND LOGGING SYSTEM
-- ============================================================================

-- Centralized logging table (consolidates from architecture)
CREATE TABLE IF NOT EXISTS logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Reference information
    workflow_id UUID REFERENCES workflow_definitions(id),
    execution_id VARCHAR(255),
    activity_name VARCHAR(255),
    
    -- Log data
    level VARCHAR(20) CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL')) NOT NULL,
    message TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    source VARCHAR(255), -- Component/service that generated the log
    
    -- Additional context
    metadata JSONB DEFAULT '{}',
    stack_trace TEXT,
    user_id VARCHAR(255),
    session_id VARCHAR(255)
);

-- Enhanced failure contexts table
CREATE TABLE IF NOT EXISTS failure_contexts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Reference information
    workflow_id UUID REFERENCES workflow_definitions(id),
    execution_id VARCHAR(255),
    activity_name VARCHAR(255),
    
    -- Error details
    error_type VARCHAR(255) NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    
    -- Context data
    input_params JSONB,
    system_state JSONB, -- CPU, memory, disk usage, etc.
    environment_vars JSONB, -- Filtered environment variables
    
    -- Timing and metadata
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    recovery_attempts INTEGER DEFAULT 0,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT
);

-- ============================================================================
-- WORKER MANAGEMENT
-- ============================================================================

-- Enhanced worker configurations
CREATE TABLE IF NOT EXISTS worker_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_name VARCHAR(255) UNIQUE NOT NULL,
    task_queue VARCHAR(255) NOT NULL,
    
    -- Worker capabilities
    enabled_workflows UUID[] DEFAULT '{}', -- References to workflow_definitions.id
    enabled_activities UUID[] DEFAULT '{}', -- References to activity_definitions.id
    max_concurrent_workflows INTEGER DEFAULT 100,
    max_concurrent_activities INTEGER DEFAULT 100,
    
    -- Configuration
    configuration JSONB DEFAULT '{}',
    environment_variables JSONB DEFAULT '{}',
    
    -- Status and health
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    health_status VARCHAR(50) DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'unhealthy', 'unknown')),
    
    -- Lifecycle
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Worker health and metrics
CREATE TABLE IF NOT EXISTS worker_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID REFERENCES worker_configurations(id) ON DELETE CASCADE,
    
    -- Performance metrics
    cpu_usage NUMERIC(5,2),
    memory_usage NUMERIC(5,2),
    active_workflows INTEGER DEFAULT 0,
    active_activities INTEGER DEFAULT 0,
    
    -- Execution statistics
    workflows_completed_hour INTEGER DEFAULT 0,
    activities_completed_hour INTEGER DEFAULT 0,
    average_workflow_duration_ms INTEGER,
    average_activity_duration_ms INTEGER,
    
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- USER MANAGEMENT AND PERMISSIONS
-- ============================================================================

-- User management (for future authentication)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- For future authentication
    
    -- Profile
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'developer', 'user', 'viewer')),
    permissions JSONB DEFAULT '{}',
    
    -- Preferences
    preferences JSONB DEFAULT '{}',
    
    -- Lifecycle
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Workflow definitions indexes
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_name ON workflow_definitions(name);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_category ON workflow_definitions(category);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_status ON workflow_definitions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_source_type ON workflow_definitions(source_type);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_is_dynamic_loadable ON workflow_definitions(is_dynamic_loadable);

-- Activity definitions indexes
CREATE INDEX IF NOT EXISTS idx_activity_definitions_workflow_id ON activity_definitions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_activity_definitions_function_name ON activity_definitions(function_name);
CREATE INDEX IF NOT EXISTS idx_activity_definitions_status ON activity_definitions(status);

-- Execution tracking indexes
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_execution_id ON workflow_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_started_at ON workflow_executions(started_at);

-- Logging indexes
CREATE INDEX IF NOT EXISTS idx_logs_workflow_id ON logs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_logs_execution_id ON logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source);

-- Failure contexts indexes
CREATE INDEX IF NOT EXISTS idx_failure_contexts_workflow_id ON failure_contexts(workflow_id);
CREATE INDEX IF NOT EXISTS idx_failure_contexts_execution_id ON failure_contexts(execution_id);
CREATE INDEX IF NOT EXISTS idx_failure_contexts_error_type ON failure_contexts(error_type);
CREATE INDEX IF NOT EXISTS idx_failure_contexts_timestamp ON failure_contexts(timestamp);

-- Worker indexes
CREATE INDEX IF NOT EXISTS idx_worker_configurations_status ON worker_configurations(status);
CREATE INDEX IF NOT EXISTS idx_worker_configurations_task_queue ON worker_configurations(task_queue);
CREATE INDEX IF NOT EXISTS idx_worker_metrics_worker_id ON worker_metrics(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_metrics_timestamp ON worker_metrics(timestamp);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get active workflows for a worker
CREATE OR REPLACE FUNCTION get_active_workflows_for_worker(worker_name_param TEXT)
RETURNS TABLE(
    workflow_id UUID,
    name VARCHAR(255),
    workflow_class_name VARCHAR(255),
    python_workflow_code TEXT,
    task_queue VARCHAR(255)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        wd.id,
        wd.name,
        wd.workflow_class_name,
        wd.python_workflow_code,
        wd.task_queue
    FROM workflow_definitions wd
    JOIN worker_configurations wc ON wd.id = ANY(wc.enabled_workflows)
    WHERE wc.worker_name = worker_name_param
    AND wd.status = 'active'
    AND wc.status = 'active';
END;
$$ LANGUAGE plpgsql;

-- Function to get active activities for a workflow
CREATE OR REPLACE FUNCTION get_active_activities_for_workflow(workflow_id_param UUID)
RETURNS TABLE(
    activity_id UUID,
    function_name VARCHAR(255),
    python_activity_code TEXT,
    timeout_seconds INTEGER,
    retry_policy JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ad.id,
        ad.function_name,
        ad.python_activity_code,
        ad.timeout_seconds,
        ad.retry_policy
    FROM activity_definitions ad
    WHERE ad.workflow_id = workflow_id_param
    AND ad.status = 'active';
END;
$$ LANGUAGE plpgsql;

-- Function to update workflow execution statistics
CREATE OR REPLACE FUNCTION update_workflow_execution_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status != NEW.status AND NEW.status = 'completed' THEN
        UPDATE workflow_definitions
        SET 
            execution_count = execution_count + 1,
            last_executed_at = NEW.completed_at,
            average_execution_time_ms = (
                COALESCE(average_execution_time_ms * execution_count, 0) + NEW.duration_ms
            ) / (execution_count + 1)
        WHERE id = NEW.workflow_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for execution statistics
CREATE TRIGGER trigger_update_workflow_stats
    AFTER UPDATE ON workflow_executions
    FOR EACH ROW
    EXECUTE FUNCTION update_workflow_execution_stats();

-- ============================================================================
-- DEFAULT DATA
-- ============================================================================

-- Insert default component schemas for drag & drop editor
INSERT INTO component_schemas (component_type, name, display_name, description, configuration_schema, icon, color, category) VALUES
('activity', 'http_request', 'HTTP Request', 'Make HTTP requests to external APIs', 
 '{"type": "object", "properties": {"url": {"type": "string", "format": "uri"}, "method": {"type": "string", "enum": ["GET", "POST", "PUT", "DELETE"]}, "headers": {"type": "object"}, "body": {"type": "string"}}}',
 'globe', '#3B82F6', 'integration'),
 
('activity', 'data_transform', 'Data Transform', 'Transform data using custom logic',
 '{"type": "object", "properties": {"transformation": {"type": "string", "description": "Python transformation code"}}}',
 'transform', '#10B981', 'data'),
 
('condition', 'if_condition', 'If Condition', 'Conditional execution based on expression',
 '{"type": "object", "properties": {"condition": {"type": "string", "description": "Boolean expression"}}}',
 'decision', '#F59E0B', 'control'),
 
('loop', 'for_each', 'For Each', 'Iterate over collection',
 '{"type": "object", "properties": {"collection": {"type": "string", "description": "Collection to iterate over"}}}',
 'repeat', '#8B5CF6', 'control')
ON CONFLICT (component_type, name, version) DO NOTHING;

-- Insert default worker configuration
INSERT INTO worker_configurations (worker_name, task_queue, configuration) VALUES
('unified-worker', 'workflow-editor-queue', 
 '{"max_concurrent_activities": 100, "max_concurrent_workflows": 50, "enable_dynamic_loading": true}')
ON CONFLICT (worker_name) DO NOTHING;

-- Create default admin user
INSERT INTO users (username, email, full_name, role) VALUES
('admin', 'admin@workflow-system.local', 'System Administrator', 'admin'),
('system', 'system@workflow-system.local', 'System User', 'admin')
ON CONFLICT (username) DO NOTHING;

-- ============================================================================
-- WORKFLOW AUTOMATION AND AI GENERATION
-- ============================================================================

-- Workflow generation executions tracking table for iterative generation
CREATE TABLE IF NOT EXISTS workflow_generation_executions (
    execution_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status VARCHAR(50) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    requirements TEXT NOT NULL,
    target_language VARCHAR(50) NOT NULL,
    max_iterations INTEGER DEFAULT 5,
    current_iteration INTEGER DEFAULT 0,
    quality_threshold NUMERIC(3,2) DEFAULT 0.85,
    progress NUMERIC(3,2) DEFAULT 0.00, -- 0.00 to 1.00
    
    -- Results
    final_quality_scores JSONB,
    total_iterations INTEGER,
    execution_time INTEGER, -- milliseconds
    best_iteration INTEGER,
    
    -- Error tracking
    error_message TEXT,
    errors JSONB DEFAULT '[]'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Additional metadata
    template_id VARCHAR(255),
    business_context TEXT,
    auto_activate BOOLEAN DEFAULT false,
    deploy_environment VARCHAR(50) DEFAULT 'development',
    priority_focus VARCHAR(255),
    acceptable_partial_success BOOLEAN DEFAULT true,
    user_preferences JSONB DEFAULT '{}'::jsonb
);

-- Create index for execution lookups
CREATE INDEX IF NOT EXISTS idx_workflow_generation_executions_status ON workflow_generation_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_generation_executions_created_at ON workflow_generation_executions(created_at);

-- ============================================================================
-- INSERT CRITICAL SAMPLE WORKFLOWS
-- ============================================================================

-- Insert the critical Circle Area Calculator workflow that keeps failing
INSERT INTO workflow_definitions (
    name,
    version,
    description,
    category,
    workflow_class_name,
    task_queue,
    python_workflow_code,
    visual_definition,
    form_schema,
    status,
    quality_score,
    source_type,
    created_by,
    tags,
    created_at,
    updated_at
) VALUES (
    'mlops-advanced-circle-area-calculator',
    '1.0.0',
    'Advanced Circle Area Calculator with MLOps integration',
    'data',
    'advancedcircleareacalculatorWorkflow',
    'workflow-editor-queue',
    '# Advanced Circle Area Calculator Workflow
import math
from temporalio import workflow, activity
from temporalio.common import RetryPolicy
from datetime import timedelta

@workflow.defn(name="advancedcircleareacalculatorWorkflow")
class AdvancedCircleAreaCalculatorWorkflow:
    """Advanced Circle Area Calculator with error handling and validation."""
    
    @workflow.run
    async def run(self, input_data: dict) -> dict:
        """Execute the circle area calculation workflow."""
        
        try:
            # Extract radius from input
            radius = input_data.get("radius", 1.0)
            
            if not isinstance(radius, (int, float)):
                raise ValueError("Radius must be a number")
                
            if radius <= 0:
                raise ValueError("Radius must be positive")
            
            # Calculate area using π * r²
            area = math.pi * radius * radius
            circumference = 2 * math.pi * radius
            diameter = 2 * radius
            
            # Return comprehensive results
            result = {
                "success": True,
                "radius": radius,
                "area": area,
                "circumference": circumference,
                "diameter": diameter,
                "formula": "π × r²",
                "calculation": f"π × {radius}² = {area:.6f}",
                "metadata": {
                    "workflow_name": "advancedcircleareacalculatorWorkflow",
                    "calculation_type": "circle_geometry",
                    "precision": "double",
                    "units": "square_units"
                }
            }
            
            return result
            
        except Exception as error:
            return {
                "success": False,
                "error": str(error),
                "input_data": input_data,
                "error_type": type(error).__name__
            }
',
    '{
        "type": "workflow",
        "name": "Circle Area Calculator",
        "description": "Calculate area, circumference, and diameter of a circle",
        "inputs": [
            {
                "name": "radius",
                "type": "number",
                "required": true,
                "validation": {
                    "min": 0.1,
                    "max": 10000
                }
            }
        ],
        "outputs": [
            {
                "name": "area",
                "type": "number",
                "description": "Area of the circle"
            },
            {
                "name": "circumference", 
                "type": "number",
                "description": "Circumference of the circle"
            },
            {
                "name": "diameter",
                "type": "number", 
                "description": "Diameter of the circle"
            }
        ]
    }',
    '{
        "type": "object",
        "properties": {
            "radius": {
                "type": "number",
                "title": "Circle Radius",
                "description": "Enter the radius of the circle",
                "minimum": 0.1,
                "maximum": 10000,
                "default": 1.0
            }
        },
        "required": ["radius"]
    }',
    'active',
    0.95,
    'mlops-direct',
    'system',
    '{"calculator", "geometry", "math", "mlops", "advanced"}',
    NOW(),
    NOW()
) ON CONFLICT (name) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    python_workflow_code = EXCLUDED.python_workflow_code,
    visual_definition = EXCLUDED.visual_definition,
    form_schema = EXCLUDED.form_schema,
    updated_at = NOW();

-- Insert additional common workflows
INSERT INTO workflow_definitions (
    name,
    version,
    description,
    category,
    workflow_class_name,
    task_queue,
    python_workflow_code,
    visual_definition,
    form_schema,
    status,
    quality_score,
    source_type,
    created_by,
    tags
) VALUES 
(
    'simple-data-processor',
    '1.0.0',
    'Simple data processing workflow for testing',
    'data',
    'SimpleDataProcessorWorkflow',
    'workflow-editor-queue',
    'from temporalio import workflow

@workflow.defn
class SimpleDataProcessorWorkflow:
    @workflow.run
    async def run(self, data: dict) -> dict:
        return {
            "success": True,
            "processed_data": data,
            "record_count": len(data) if isinstance(data, dict) else 1
        }',
    '{"type": "workflow", "name": "Simple Data Processor"}',
    '{"type": "object", "properties": {"data": {"type": "object"}}}',
    'active',
    0.85,
    'manual',
    'system', 
    '{"data", "processing", "simple"}'
),
(
    'ai-text-analyzer',
    '1.0.0', 
    'AI-powered text analysis workflow',
    'ai',
    'AITextAnalyzerWorkflow',
    'workflow-editor-queue',
    'from temporalio import workflow

@workflow.defn
class AITextAnalyzerWorkflow:
    @workflow.run
    async def run(self, text_data: dict) -> dict:
        text = text_data.get("text", "")
        return {
            "success": True,
            "original_text": text,
            "word_count": len(text.split()),
            "character_count": len(text),
            "analysis": "Sample AI analysis results"
        }',
    '{"type": "workflow", "name": "AI Text Analyzer"}',
    '{"type": "object", "properties": {"text": {"type": "string"}}}',
    'active',
    0.90,
    'ai-generated',
    'system',
    '{"ai", "text", "analysis", "nlp"}'
) ON CONFLICT (name) DO NOTHING;