-- ═══════════════════════════════════════════════════════════════
-- UNIFIED DATABASE SCHEMA FOR ENHANCED TEMPORAL WORKFLOW PLATFORM
-- ═══════════════════════════════════════════════════════════════
-- Consolidates all services: workflow-automation, enhanced-workflow-editor, frontend
-- Removes hardcoded workflows/activities except dynamic generation capabilities
-- Integrates Revolutionary Dynamic Workflow Wrapper with Chain Executor

-- ═══════════════════════════════════════════════════════════════
-- CORE ACTIVITY LIBRARY TABLE (Shared by all services)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS activity_library (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  description TEXT,
  version VARCHAR(50) DEFAULT '1.0.0',
  category VARCHAR(100),
  
  -- Technical specifications
  inputs JSONB DEFAULT '{}',
  outputs JSONB DEFAULT '{}',
  code TEXT,
  language VARCHAR(50) DEFAULT 'typescript',
  
  -- External integrations
  kafka_config JSONB,
  redis_config JSONB,
  temporal_config JSONB,
  
  -- Reliability
  retry_policy JSONB DEFAULT '{"maxAttempts": 3, "backoffCoefficient": 2}',
  timeout_config JSONB DEFAULT '{"startToCloseTimeout": "10m"}',
  
  -- Metadata and tracking
  metadata JSONB DEFAULT '{}',
  tags TEXT[],
  usage_count INTEGER DEFAULT 0,
  quality_score DECIMAL(3,2) DEFAULT 0.0,
  complexity_score INTEGER DEFAULT 1,
  success_rate DECIMAL(5,2) DEFAULT 0.0,
  
  -- Status and lifecycle
  is_active BOOLEAN DEFAULT true,
  
  -- Versioning and timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'active',
  
  -- Constraints
  CONSTRAINT valid_quality_score CHECK (quality_score >= 0.0 AND quality_score <= 10.0)
);

-- ═══════════════════════════════════════════════════════════════
-- UNIFIED WORKFLOW DEFINITIONS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  description TEXT,
  
  -- Classification
  category VARCHAR(100),
  complexity VARCHAR(50) CHECK (complexity IN ('simple', 'medium', 'complex', 'enterprise')),
  workflow_type VARCHAR(100) DEFAULT 'standard' CHECK (workflow_type IN ('standard', 'dynamic', 'chain', 'template')),
  
  -- Technical definition
  definition JSONB NOT NULL,
  steps JSONB DEFAULT '[]',
  nodes JSONB DEFAULT '[]',
  edges JSONB DEFAULT '[]',
  
  -- Execution characteristics
  estimated_duration INTEGER, -- in seconds
  max_execution_time INTEGER DEFAULT 3600, -- in seconds
  parallel_execution BOOLEAN DEFAULT false,
  
  -- Quality metrics
  usage_count INTEGER DEFAULT 0,
  average_quality_score DECIMAL(3,2) DEFAULT 0.0,
  success_rate DECIMAL(5,2) DEFAULT 0.0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  tags TEXT[],
  
  -- Source and deployment
  code TEXT,
  test_results JSONB,
  deployment_info JSONB,
  
  -- Versioning
  version VARCHAR(50) DEFAULT '1.0.0',
  parent_workflow_id VARCHAR(255) REFERENCES workflow_definitions(id),
  
  -- Timestamps and ownership
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'deprecated', 'archived')),
  
  CONSTRAINT valid_quality_score CHECK (average_quality_score >= 0.0 AND average_quality_score <= 10.0)
);

-- ═══════════════════════════════════════════════════════════════
-- REVOLUTIONARY DYNAMIC WORKFLOW WRAPPER + CHAIN EXECUTOR INTEGRATION
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dynamic_workflow_instances (
  id VARCHAR(255) PRIMARY KEY,
  workflow_definition_id VARCHAR(255) REFERENCES workflow_definitions(id),
  execution_id VARCHAR(255) UNIQUE NOT NULL,
  
  -- Execution context
  trigger_type VARCHAR(50) CHECK (trigger_type IN ('manual', 'scheduled', 'event', 'workflow-chain')),
  parent_workflow_id VARCHAR(255),
  parent_execution_id VARCHAR(255),
  
  -- Input/Output
  input_parameters JSONB DEFAULT '{}',
  output_result JSONB,
  
  -- Execution tracking
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  current_step VARCHAR(255),
  completed_steps JSONB DEFAULT '[]',
  failed_steps JSONB DEFAULT '[]',
  
  -- Performance metrics
  execution_time_ms INTEGER,
  step_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  
  -- Error handling
  error_message TEXT,
  error_details JSONB,
  retry_count INTEGER DEFAULT 0,
  
  -- Temporal integration
  temporal_workflow_id VARCHAR(255),
  temporal_run_id VARCHAR(255),
  
  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════
-- WORKFLOW CHAIN EXECUTION (Inter-Workflow Communication)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS workflow_chains (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Chain configuration
  execution_mode VARCHAR(50) DEFAULT 'sequential' CHECK (execution_mode IN ('sequential', 'parallel', 'conditional')),
  chain_definition JSONB NOT NULL,
  workflows JSONB NOT NULL, -- Array of workflow configurations with dependencies
  
  -- Data flow configuration
  data_mapping JSONB DEFAULT '{}',
  communication_patterns JSONB DEFAULT '{}',
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  tags TEXT[],
  
  -- Quality metrics
  usage_count INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0.0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS workflow_chain_executions (
  id VARCHAR(255) PRIMARY KEY,
  chain_id VARCHAR(255) REFERENCES workflow_chains(id),
  execution_id VARCHAR(255) UNIQUE NOT NULL,
  
  -- Execution context
  initial_data JSONB DEFAULT '{}',
  execution_mode VARCHAR(50),
  
  -- Tracking
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  current_workflow VARCHAR(255),
  completed_workflows JSONB DEFAULT '[]',
  failed_workflows JSONB DEFAULT '[]',
  
  -- Results
  final_result JSONB,
  workflow_results JSONB DEFAULT '{}',
  
  -- Performance
  total_execution_time INTEGER,
  workflow_count INTEGER DEFAULT 0,
  
  -- Error handling
  error_message TEXT,
  error_details JSONB,
  
  -- Temporal integration
  temporal_workflow_id VARCHAR(255),
  temporal_run_id VARCHAR(255),
  
  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════
-- INTER-WORKFLOW COMMUNICATION & DATA EXCHANGE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS workflow_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Communication participants
  source_workflow_id VARCHAR(255),
  source_execution_id VARCHAR(255),
  target_workflow_id VARCHAR(255),
  target_execution_id VARCHAR(255),
  
  -- Communication details
  transfer_type VARCHAR(50) CHECK (transfer_type IN ('direct', 'queue', 'event', 'signal')),
  channel VARCHAR(255),
  data_payload JSONB,
  
  -- Status and timing
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'received', 'failed')),
  sent_at TIMESTAMP WITH TIME ZONE,
  received_at TIMESTAMP WITH TIME ZONE,
  
  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════
-- EXECUTION LOGGING & MONITORING
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Execution context
  workflow_id VARCHAR(255),
  execution_id VARCHAR(255),
  step_id VARCHAR(255),
  chain_id VARCHAR(255),
  
  -- Log details
  log_level VARCHAR(20) CHECK (log_level IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL')),
  message TEXT NOT NULL,
  details JSONB,
  
  -- Performance metrics
  execution_time_ms INTEGER,
  memory_usage_mb INTEGER,
  cpu_usage_percent DECIMAL(5,2),
  
  -- Error information
  error_code VARCHAR(50),
  stack_trace TEXT,
  
  -- Timestamps
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════
-- AI WORKFLOW GENERATION TABLES (Dynamic Content Only)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS generated_workflows (
  execution_id VARCHAR(255) PRIMARY KEY,
  workflow_id VARCHAR(255) REFERENCES workflow_definitions(id),
  
  -- Generation context
  plugin_name VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  requirements TEXT NOT NULL,
  business_context TEXT,
  target_language VARCHAR(50) DEFAULT 'typescript',
  
  -- Quality and performance
  quality_scores JSONB,
  iterations INTEGER DEFAULT 0,
  execution_time INTEGER DEFAULT 0,
  artifacts_generated INTEGER DEFAULT 0,
  pipeline_stages JSONB,
  
  -- Status
  status VARCHAR(50) DEFAULT 'completed' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  error_details TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generation_templates (
  template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  
  -- Pattern matching
  requirements_pattern TEXT NOT NULL,
  success_indicators JSONB,
  optimization_hints JSONB,
  
  -- Usage statistics
  usage_count INTEGER DEFAULT 0,
  avg_quality_score DECIMAL(3,2),
  
  -- Template content
  template_content JSONB NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generation_knowledge (
  knowledge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_type VARCHAR(100) NOT NULL CHECK (knowledge_type IN ('pattern', 'optimization', 'best_practice', 'template')),
  domain VARCHAR(100) NOT NULL,
  
  -- Knowledge content
  content JSONB NOT NULL,
  confidence_score DECIMAL(3,2) DEFAULT 0.5,
  validation_count INTEGER DEFAULT 0,
  
  -- Applicability
  use_cases TEXT[],
  restrictions JSONB,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT valid_confidence CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0)
);

-- ═══════════════════════════════════════════════════════════════
-- CACHING & PERFORMANCE OPTIMIZATION
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS workflow_cache (
  cache_key VARCHAR(255) PRIMARY KEY,
  cache_type VARCHAR(100) NOT NULL,
  
  -- Cache content
  data JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  
  -- Cache management
  ttl_seconds INTEGER DEFAULT 3600,
  access_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Performance metrics
  cache_hit_ratio DECIMAL(5,2),
  avg_retrieval_time_ms INTEGER,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS cache_metrics (
  metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_type VARCHAR(100) NOT NULL,
  
  -- Performance metrics
  cache_hit_count INTEGER DEFAULT 0,
  cache_miss_count INTEGER DEFAULT 0,
  total_requests INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER,
  
  -- Resource usage
  memory_usage_mb INTEGER,
  storage_usage_mb INTEGER,
  
  -- Time period
  measurement_period INTERVAL DEFAULT INTERVAL '1 hour',
  measured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- ═══════════════════════════════════════════════════════════════

-- Activity library indexes
CREATE INDEX IF NOT EXISTS idx_activity_library_type ON activity_library(type);
CREATE INDEX IF NOT EXISTS idx_activity_library_category ON activity_library(category);
CREATE INDEX IF NOT EXISTS idx_activity_library_usage ON activity_library(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_activity_library_quality ON activity_library(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_activity_library_tags ON activity_library USING GIN(tags);

-- Workflow definitions indexes
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_type ON workflow_definitions(workflow_type);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_category ON workflow_definitions(category);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_status ON workflow_definitions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_usage ON workflow_definitions(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_quality ON workflow_definitions(average_quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_tags ON workflow_definitions USING GIN(tags);

-- Dynamic workflow instances indexes
CREATE INDEX IF NOT EXISTS idx_dynamic_workflow_instances_status ON dynamic_workflow_instances(status);
CREATE INDEX IF NOT EXISTS idx_dynamic_workflow_instances_workflow_id ON dynamic_workflow_instances(workflow_definition_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_workflow_instances_temporal ON dynamic_workflow_instances(temporal_workflow_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_workflow_instances_created ON dynamic_workflow_instances(created_at);

-- Workflow chains indexes
CREATE INDEX IF NOT EXISTS idx_workflow_chains_mode ON workflow_chains(execution_mode);
CREATE INDEX IF NOT EXISTS idx_workflow_chains_usage ON workflow_chains(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_chains_tags ON workflow_chains USING GIN(tags);

-- Chain executions indexes
CREATE INDEX IF NOT EXISTS idx_workflow_chain_executions_chain_id ON workflow_chain_executions(chain_id);
CREATE INDEX IF NOT EXISTS idx_workflow_chain_executions_status ON workflow_chain_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_chain_executions_created ON workflow_chain_executions(created_at);

-- Communication indexes
CREATE INDEX IF NOT EXISTS idx_workflow_communications_source ON workflow_communications(source_workflow_id, source_execution_id);
CREATE INDEX IF NOT EXISTS idx_workflow_communications_target ON workflow_communications(target_workflow_id, target_execution_id);
CREATE INDEX IF NOT EXISTS idx_workflow_communications_status ON workflow_communications(status);
CREATE INDEX IF NOT EXISTS idx_workflow_communications_created ON workflow_communications(created_at);

-- Execution logs indexes
CREATE INDEX IF NOT EXISTS idx_execution_logs_workflow ON execution_logs(workflow_id, execution_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_level ON execution_logs(log_level);
CREATE INDEX IF NOT EXISTS idx_execution_logs_timestamp ON execution_logs(timestamp);

-- Generation indexes
CREATE INDEX IF NOT EXISTS idx_generated_workflows_user ON generated_workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_workflows_status ON generated_workflows(status);
CREATE INDEX IF NOT EXISTS idx_generated_workflows_created ON generated_workflows(created_at);

-- Cache indexes
CREATE INDEX IF NOT EXISTS idx_workflow_cache_type ON workflow_cache(cache_type);
CREATE INDEX IF NOT EXISTS idx_workflow_cache_expires ON workflow_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_workflow_cache_accessed ON workflow_cache(last_accessed);

-- ═══════════════════════════════════════════════════════════════
-- TRIGGERS FOR AUTOMATIC MAINTENANCE
-- ═══════════════════════════════════════════════════════════════

-- Update timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all relevant tables
DROP TRIGGER IF EXISTS update_activity_library_updated_at ON activity_library;
CREATE TRIGGER update_activity_library_updated_at
    BEFORE UPDATE ON activity_library
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflow_definitions_updated_at ON workflow_definitions;
CREATE TRIGGER update_workflow_definitions_updated_at
    BEFORE UPDATE ON workflow_definitions
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_dynamic_workflow_instances_updated_at ON dynamic_workflow_instances;
CREATE TRIGGER update_dynamic_workflow_instances_updated_at
    BEFORE UPDATE ON dynamic_workflow_instances
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflow_chains_updated_at ON workflow_chains;
CREATE TRIGGER update_workflow_chains_updated_at
    BEFORE UPDATE ON workflow_chains
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflow_chain_executions_updated_at ON workflow_chain_executions;
CREATE TRIGGER update_workflow_chain_executions_updated_at
    BEFORE UPDATE ON workflow_chain_executions
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_generated_workflows_updated_at ON generated_workflows;
CREATE TRIGGER update_generated_workflows_updated_at
    BEFORE UPDATE ON generated_workflows
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_generation_templates_updated_at ON generation_templates;
CREATE TRIGGER update_generation_templates_updated_at
    BEFORE UPDATE ON generation_templates
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_generation_knowledge_updated_at ON generation_knowledge;
CREATE TRIGGER update_generation_knowledge_updated_at
    BEFORE UPDATE ON generation_knowledge
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- DYNAMIC WORKFLOW WRAPPER TEMPLATES (Revolutionary System)
-- ═══════════════════════════════════════════════════════════════

-- Insert the Revolutionary Dynamic Workflow Wrapper as a core template
INSERT INTO workflow_definitions (
  id, name, display_name, description, category, workflow_type, 
  definition, complexity, metadata, status, version, created_by
) VALUES (
  'revolutionary-dynamic-wrapper',
  'Revolutionary Dynamic Workflow Wrapper',
  'Dynamic Workflow Execution Engine',
  'Revolutionary wrapper that loads workflow logic dynamically from the automation service, bypassing Temporal determinism issues by keeping workflows pure and loading logic at runtime',
  'system',
  'dynamic',
  '{"type": "dynamic_wrapper", "capabilities": ["dynamic_loading", "step_execution", "dependency_resolution", "error_handling", "logging"], "activities": ["loadWorkflowDefinition", "executeWorkflowStep", "exchangeData", "logExecution"]}',
  'enterprise',
  '{"revolutionary": true, "deterministic": true, "dynamic_loading": true, "inter_workflow_communication": true}',
  'active',
  '2.0.0',
  'system'
) ON CONFLICT (id) DO UPDATE SET
  updated_at = CURRENT_TIMESTAMP,
  status = 'active';

-- Insert the Workflow Chain Executor as a core template
INSERT INTO workflow_definitions (
  id, name, display_name, description, category, workflow_type,
  definition, complexity, metadata, status, version, created_by
) VALUES (
  'workflow-chain-executor',
  'Workflow Chain Executor',
  'Inter-Workflow Communication Manager',
  'Handles execution of multiple workflows that interact with each other, managing data flow, dependencies, and communication patterns',
  'system',
  'chain',
  '{"type": "chain_executor", "execution_modes": ["sequential", "parallel", "conditional"], "capabilities": ["inter_workflow_communication", "data_mapping", "dependency_resolution", "parallel_execution"], "activities": ["executeSubWorkflow", "waitForWorkflowResult", "transferDataBetweenWorkflows", "getWorkflowChainDefinition", "logChainExecution"]}',
  'enterprise',
  '{"chain_execution": true, "inter_workflow_communication": true, "data_mapping": true, "parallel_execution": true}',
  'active',
  '2.0.0',
  'system'
) ON CONFLICT (id) DO UPDATE SET
  updated_at = CURRENT_TIMESTAMP,
  status = 'active';

-- ═══════════════════════════════════════════════════════════════
-- GENERATION TEMPLATES FOR DYNAMIC WORKFLOWS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO generation_templates (template_name, category, requirements_pattern, success_indicators, optimization_hints, template_content) VALUES
('Dynamic Workflow Template', 'dynamic', '%dynamic%|%runtime%|%adaptive%|%flexible%', 
 '{"quality_threshold": 0.9, "determinism_score": 1.0, "performance_score": 0.85}',
 '{"focus_areas": ["determinism", "dynamic_loading", "error_handling"], "models": ["gpt-4", "claude-3-opus"]}',
 '{"base_workflow": "revolutionary-dynamic-wrapper", "customization_points": ["step_definitions", "dependencies", "configuration"], "required_activities": ["loadWorkflowDefinition", "executeWorkflowStep"]}'),

('Workflow Chain Template', 'chain', '%chain%|%sequence%|%pipeline%|%multi-workflow%|%orchestration%',
 '{"quality_threshold": 0.9, "communication_score": 0.9, "reliability_score": 0.95}',
 '{"focus_areas": ["data_flow", "error_propagation", "parallel_execution"], "models": ["gpt-4", "claude-3-sonnet"]}',
 '{"base_workflow": "workflow-chain-executor", "execution_modes": ["sequential", "parallel", "conditional"], "required_activities": ["executeSubWorkflow", "transferDataBetweenWorkflows"]}'),

('Inter-Service Communication', 'communication', '%api%|%service%|%integration%|%communication%|%data-exchange%',
 '{"quality_threshold": 0.85, "integration_score": 0.9, "security_score": 0.9}',
 '{"focus_areas": ["security", "retry_logic", "circuit_breakers"], "models": ["gpt-4", "claude-3-sonnet"]}',
 '{"communication_patterns": ["direct", "queue", "event"], "security_features": ["authentication", "encryption", "rate_limiting"], "reliability_features": ["retry", "circuit_breaker", "timeout"]}')

ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- KNOWLEDGE BASE FOR DYNAMIC WORKFLOW GENERATION
-- ═══════════════════════════════════════════════════════════════

INSERT INTO generation_knowledge (knowledge_type, domain, content, confidence_score, use_cases) VALUES
('best_practice', 'temporal_dynamic',
 '{"practice": "deterministic_wrapper", "description": "Use revolutionary dynamic wrapper for deterministic execution with dynamic loading", "pattern": "Load logic at runtime via activities", "benefits": ["determinism", "flexibility", "maintainability"]}',
 0.98, ARRAY['dynamic_workflows', 'runtime_configuration', 'deterministic_execution']),

('pattern', 'workflow_communication',
 '{"pattern": "inter_workflow_data_exchange", "description": "Secure data exchange between workflow instances", "implementation": ["direct_transfer", "queue_based", "event_driven"], "security": ["encryption", "authentication", "audit_trail"]}',
 0.95, ARRAY['multi_workflow_systems', 'data_pipeline', 'service_orchestration']),

('optimization', 'chain_execution',
 '{"technique": "parallel_workflow_execution", "description": "Execute independent workflows in parallel within chains", "impact": "50-80% execution time reduction", "requirements": ["dependency_analysis", "resource_isolation", "error_isolation"]}',
 0.92, ARRAY['workflow_chains', 'performance_optimization', 'parallel_processing']),

('best_practice', 'dynamic_loading',
 '{"practice": "activity_based_logic", "description": "Implement business logic in activities, keep workflows as pure coordinators", "benefits": ["testability", "determinism", "flexibility"], "anti_patterns": ["business_logic_in_workflow", "external_calls_from_workflow"]}',
 0.97, ARRAY['temporal_workflows', 'clean_architecture', 'testing'])

ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- PERFORMANCE VIEWS FOR MONITORING
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW workflow_performance_dashboard AS
SELECT 
    wd.id as workflow_id,
    wd.name,
    wd.category,
    wd.workflow_type,
    COUNT(dwi.id) as total_executions,
    COUNT(CASE WHEN dwi.status = 'completed' THEN 1 END) as successful_executions,
    COUNT(CASE WHEN dwi.status = 'failed' THEN 1 END) as failed_executions,
    ROUND(
        (COUNT(CASE WHEN dwi.status = 'completed' THEN 1 END)::DECIMAL / NULLIF(COUNT(dwi.id), 0)) * 100, 
        2
    ) as success_rate_percent,
    AVG(dwi.execution_time_ms) as avg_execution_time_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY dwi.execution_time_ms) as p95_execution_time_ms,
    AVG(dwi.step_count) as avg_step_count,
    MAX(dwi.created_at) as last_execution
FROM workflow_definitions wd
LEFT JOIN dynamic_workflow_instances dwi ON wd.id = dwi.workflow_definition_id
WHERE wd.status = 'active'
GROUP BY wd.id, wd.name, wd.category, wd.workflow_type
ORDER BY total_executions DESC;

CREATE OR REPLACE VIEW chain_execution_analytics AS
SELECT 
    wc.id as chain_id,
    wc.name,
    wc.execution_mode,
    COUNT(wce.id) as total_executions,
    COUNT(CASE WHEN wce.status = 'completed' THEN 1 END) as successful_executions,
    ROUND(
        (COUNT(CASE WHEN wce.status = 'completed' THEN 1 END)::DECIMAL / NULLIF(COUNT(wce.id), 0)) * 100,
        2
    ) as success_rate_percent,
    AVG(wce.total_execution_time) as avg_total_execution_time,
    AVG(wce.workflow_count) as avg_workflow_count,
    MAX(wce.created_at) as last_execution
FROM workflow_chains wc
LEFT JOIN workflow_chain_executions wce ON wc.id = wce.chain_id
GROUP BY wc.id, wc.name, wc.execution_mode
ORDER BY total_executions DESC;

-- ═══════════════════════════════════════════════════════════════
-- SCHEMA METADATA
-- ═══════════════════════════════════════════════════════════════

COMMENT ON DATABASE temporal_ai_platform IS 'Unified database for Enhanced Temporal Workflow Platform - consolidates workflow-automation, enhanced-workflow-editor, and frontend services';

-- Table comments
COMMENT ON TABLE activity_library IS 'Unified activity library shared by all services - contains both system and user-defined activities';
COMMENT ON TABLE workflow_definitions IS 'Comprehensive workflow definitions supporting standard, dynamic, chain, and template types';
COMMENT ON TABLE dynamic_workflow_instances IS 'Revolutionary dynamic workflow execution instances using the dynamic wrapper pattern';
COMMENT ON TABLE workflow_chains IS 'Workflow chain definitions for orchestrating multiple interacting workflows';
COMMENT ON TABLE workflow_chain_executions IS 'Execution instances of workflow chains with inter-workflow communication tracking';
COMMENT ON TABLE workflow_communications IS 'Inter-workflow communication and data exchange audit trail';
COMMENT ON TABLE execution_logs IS 'Comprehensive execution logging for monitoring and debugging';
COMMENT ON TABLE generated_workflows IS 'AI-generated workflows tracking for dynamic content creation';
COMMENT ON TABLE generation_templates IS 'Templates for AI workflow generation with pattern matching';
COMMENT ON TABLE generation_knowledge IS 'Knowledge base for AI learning and workflow improvement';
COMMENT ON TABLE workflow_cache IS 'Multi-level caching for performance optimization';
COMMENT ON TABLE cache_metrics IS 'Cache performance metrics and monitoring';

-- Schema version and metadata
CREATE TABLE IF NOT EXISTS schema_metadata (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_metadata (key, value) VALUES
('schema_version', '2.0.0'),
('migration_date', CURRENT_TIMESTAMP::TEXT),
('features', 'revolutionary_dynamic_wrapper,workflow_chain_executor,inter_workflow_communication,unified_schema'),
('created_by', 'Enhanced Temporal Workflow Platform v2.0'),
('description', 'Unified schema integrating Revolutionary Dynamic Workflow Wrapper with Workflow Chain Executor')
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value, 
  updated_at = CURRENT_TIMESTAMP;

-- ═══════════════════════════════════════════════════════════════
-- COMPLETION MESSAGE
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
    RAISE NOTICE 'Successfully created unified database schema v2.0.0';
    RAISE NOTICE 'Features: Revolutionary Dynamic Workflow Wrapper + Workflow Chain Executor';
    RAISE NOTICE 'Integration: Consolidated all services into single schema';
    RAISE NOTICE 'Dynamic Generation: AI-powered workflow creation with templates';
    RAISE NOTICE 'Inter-Workflow Communication: Full data exchange and orchestration';
    RAISE NOTICE 'Ready for production deployment';
END $$;