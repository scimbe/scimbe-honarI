-- ==========================================
-- Migration 003: Add Dynamic Worker Support
-- Extends existing workflow system for database-driven workers
-- ==========================================

-- Add Python code storage to existing workflow_definitions table
ALTER TABLE workflow_definitions 
ADD COLUMN IF NOT EXISTS python_workflow_code TEXT,
ADD COLUMN IF NOT EXISTS workflow_class_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS python_imports TEXT[],
ADD COLUMN IF NOT EXISTS is_dynamic_loadable BOOLEAN DEFAULT false;

-- ==========================================
-- ACTIVITY DEFINITIONS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS activity_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    
    -- Activity identification
    name VARCHAR(255) NOT NULL,
    function_name VARCHAR(255) NOT NULL,
    activity_type VARCHAR(100) NOT NULL DEFAULT 'python',
    
    -- Activity code and configuration
    python_activity_code TEXT NOT NULL,
    function_signature JSONB,
    input_schema JSONB,
    output_schema JSONB,
    
    -- Activity metadata
    description TEXT,
    timeout_seconds INTEGER DEFAULT 300,
    retry_policy JSONB,
    
    -- Status and version control
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deprecated')),
    version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NOT NULL,
    updated_by VARCHAR(255),
    
    UNIQUE(workflow_id, function_name)
);

-- ==========================================
-- WORKER REGISTRATIONS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS worker_registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Worker identification
    worker_name VARCHAR(255) NOT NULL,
    worker_instance_id VARCHAR(255) NOT NULL,
    task_queue VARCHAR(255) NOT NULL,
    
    -- Registration details
    registered_workflows UUID[] DEFAULT '{}',
    registered_activities UUID[] DEFAULT '{}',
    worker_config JSONB,
    
    -- Worker status
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Worker capabilities
    max_concurrent_workflows INTEGER DEFAULT 100,
    max_concurrent_activities INTEGER DEFAULT 100,
    supported_activity_types TEXT[] DEFAULT ARRAY['python'],
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(worker_instance_id, task_queue)
);

-- ==========================================
-- WORKFLOW DEPLOYMENT LOG
-- ==========================================

CREATE TABLE IF NOT EXISTS workflow_deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflow_definitions(id),
    
    -- Deployment details
    deployment_id VARCHAR(255) NOT NULL UNIQUE,
    deployment_source VARCHAR(100) NOT NULL, -- 'mlops-pipeline', 'manual', 'editor'
    deployment_trigger VARCHAR(255),
    
    -- Deployment status
    status VARCHAR(50) DEFAULT 'pending' 
        CHECK (status IN ('pending', 'deploying', 'deployed', 'failed', 'rolled_back')),
    
    -- Deployment metadata
    container_image VARCHAR(255),
    worker_instances TEXT[],
    deployment_config JSONB,
    rollback_config JSONB,
    
    -- Error handling
    error_message TEXT,
    error_details JSONB,
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deployed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- INDICES FOR NEW TABLES
-- ==========================================

-- Activity definitions indices
CREATE INDEX idx_activity_definitions_workflow_id ON activity_definitions(workflow_id);
CREATE INDEX idx_activity_definitions_function_name ON activity_definitions(function_name);
CREATE INDEX idx_activity_definitions_status ON activity_definitions(status);
CREATE INDEX idx_activity_definitions_activity_type ON activity_definitions(activity_type);

-- Worker registrations indices
CREATE INDEX idx_worker_registrations_worker_name ON worker_registrations(worker_name);
CREATE INDEX idx_worker_registrations_task_queue ON worker_registrations(task_queue);
CREATE INDEX idx_worker_registrations_status ON worker_registrations(status);
CREATE INDEX idx_worker_registrations_last_heartbeat ON worker_registrations(last_heartbeat);

-- Workflow deployments indices
CREATE INDEX idx_workflow_deployments_workflow_id ON workflow_deployments(workflow_id);
CREATE INDEX idx_workflow_deployments_deployment_id ON workflow_deployments(deployment_id);
CREATE INDEX idx_workflow_deployments_status ON workflow_deployments(status);
CREATE INDEX idx_workflow_deployments_source ON workflow_deployments(deployment_source);

-- Extended workflow definitions indices
CREATE INDEX idx_workflow_definitions_dynamic_loadable ON workflow_definitions(is_dynamic_loadable);
CREATE INDEX idx_workflow_definitions_class_name ON workflow_definitions(workflow_class_name);

-- ==========================================
-- FUNCTIONS AND TRIGGERS
-- ==========================================

-- Trigger for updated_at on new tables
CREATE TRIGGER update_activity_definitions_updated_at BEFORE UPDATE ON activity_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_worker_registrations_updated_at BEFORE UPDATE ON worker_registrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflow_deployments_updated_at BEFORE UPDATE ON workflow_deployments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to get active workflows for worker
CREATE OR REPLACE FUNCTION get_active_workflows_for_worker(task_queue_name VARCHAR)
RETURNS TABLE (
    workflow_id UUID,
    workflow_name VARCHAR,
    workflow_class_name VARCHAR,
    python_workflow_code TEXT,
    temporal_workflow_type VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        wd.id,
        wd.name,
        wd.workflow_class_name,
        wd.python_workflow_code,
        wd.temporal_workflow_type
    FROM workflow_definitions wd
    WHERE wd.temporal_task_queue = task_queue_name
      AND wd.is_dynamic_loadable = true
      AND wd.python_workflow_code IS NOT NULL
      AND wd.workflow_class_name IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to get active activities for workflow
CREATE OR REPLACE FUNCTION get_active_activities_for_workflow(workflow_uuid UUID)
RETURNS TABLE (
    activity_id UUID,
    function_name VARCHAR,
    python_activity_code TEXT,
    input_schema JSONB,
    output_schema JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ad.id,
        ad.function_name,
        ad.python_activity_code,
        ad.input_schema,
        ad.output_schema
    FROM activity_definitions ad
    WHERE ad.workflow_id = workflow_uuid
      AND ad.status = 'active';
END;
$$ LANGUAGE plpgsql;

-- Function to update worker heartbeat
CREATE OR REPLACE FUNCTION update_worker_heartbeat(worker_instance VARCHAR, task_queue_name VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE worker_registrations 
    SET last_heartbeat = CURRENT_TIMESTAMP,
        status = 'active'
    WHERE worker_instance_id = worker_instance 
      AND task_queue = task_queue_name;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;