-- Migration 004: Create AI Workflow Generator Tables
-- Adds tables for workflow generation, pipeline tracking, and feedback

-- Generated workflows tracking table
CREATE TABLE IF NOT EXISTS generated_workflows (
    execution_id VARCHAR(255) PRIMARY KEY,
    workflow_id VARCHAR(255) NOT NULL,
    plugin_name VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    requirements TEXT NOT NULL,
    business_context TEXT,
    target_language VARCHAR(50) DEFAULT 'python',
    quality_scores JSONB,
    iterations INTEGER DEFAULT 0,
    execution_time INTEGER DEFAULT 0,
    artifacts_generated INTEGER DEFAULT 0,
    pipeline_stages JSONB,
    status VARCHAR(50) DEFAULT 'completed',
    error_details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Pipeline feedback for learning and optimization
CREATE TABLE IF NOT EXISTS pipeline_feedback (
    feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    feedback TEXT NOT NULL,
    quality_score DECIMAL(3,2),
    user_suggestions JSONB,
    sentiment_score DECIMAL(3,2),
    category VARCHAR(100),
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Pipeline performance metrics for analytics
CREATE TABLE IF NOT EXISTS pipeline_metrics (
    metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id VARCHAR(255) NOT NULL,
    stage_type VARCHAR(100) NOT NULL,
    stage_name VARCHAR(255) NOT NULL,
    execution_time INTEGER NOT NULL,
    quality_score DECIMAL(3,2),
    tokens_used INTEGER,
    improvement_delta DECIMAL(3,2),
    resource_utilization DECIMAL(3,2),
    optimization_rounds INTEGER DEFAULT 0,
    model_used VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Workflow generation templates for learning
CREATE TABLE IF NOT EXISTS generation_templates (
    template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    requirements_pattern TEXT NOT NULL,
    success_indicators JSONB,
    optimization_hints JSONB,
    usage_count INTEGER DEFAULT 0,
    avg_quality_score DECIMAL(3,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge base for AI learning and improvement
CREATE TABLE IF NOT EXISTS generation_knowledge (
    knowledge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_type VARCHAR(100) NOT NULL, -- 'pattern', 'optimization', 'best_practice'
    domain VARCHAR(100) NOT NULL,
    content JSONB NOT NULL,
    confidence_score DECIMAL(3,2) DEFAULT 0.5,
    validation_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_generated_workflows_user_id ON generated_workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_workflows_created_at ON generated_workflows(created_at);
CREATE INDEX IF NOT EXISTS idx_generated_workflows_target_language ON generated_workflows(target_language);
CREATE INDEX IF NOT EXISTS idx_generated_workflows_quality_scores ON generated_workflows USING GIN(quality_scores);

CREATE INDEX IF NOT EXISTS idx_pipeline_feedback_pipeline_id ON pipeline_feedback(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_feedback_user_id ON pipeline_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_feedback_created_at ON pipeline_feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_pipeline_feedback_processed ON pipeline_feedback(processed);

CREATE INDEX IF NOT EXISTS idx_pipeline_metrics_execution_id ON pipeline_metrics(execution_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_metrics_stage_type ON pipeline_metrics(stage_type);
CREATE INDEX IF NOT EXISTS idx_pipeline_metrics_created_at ON pipeline_metrics(created_at);

CREATE INDEX IF NOT EXISTS idx_generation_templates_category ON generation_templates(category);
CREATE INDEX IF NOT EXISTS idx_generation_templates_usage_count ON generation_templates(usage_count);

CREATE INDEX IF NOT EXISTS idx_generation_knowledge_type ON generation_knowledge(knowledge_type);
CREATE INDEX IF NOT EXISTS idx_generation_knowledge_domain ON generation_knowledge(domain);
CREATE INDEX IF NOT EXISTS idx_generation_knowledge_confidence ON generation_knowledge(confidence_score);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_generated_workflows_updated_at ON generated_workflows;
CREATE TRIGGER update_generated_workflows_updated_at
    BEFORE UPDATE ON generated_workflows
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_generation_templates_updated_at ON generation_templates;
CREATE TRIGGER update_generation_templates_updated_at
    BEFORE UPDATE ON generation_templates
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_generation_knowledge_updated_at ON generation_knowledge;
CREATE TRIGGER update_generation_knowledge_updated_at
    BEFORE UPDATE ON generation_knowledge
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- Insert some initial generation templates for common patterns
INSERT INTO generation_templates (template_name, category, requirements_pattern, success_indicators, optimization_hints) VALUES
('Data Processing Pipeline', 'data', '%data%|%process%|%transform%|%etl%', 
 '{"quality_threshold": 0.85, "test_coverage": 0.8, "performance_score": 0.7}',
 '{"focus_areas": ["error_handling", "scalability", "monitoring"], "models": ["gpt-4", "codellama:13b-instruct"]}'),
 
('API Integration Workflow', 'integration', '%api%|%rest%|%integration%|%webhook%',
 '{"quality_threshold": 0.9, "test_coverage": 0.85, "security_score": 0.9}',
 '{"focus_areas": ["authentication", "rate_limiting", "error_handling"], "models": ["gpt-4", "claude-3-sonnet"]}'),
 
('Notification System', 'messaging', '%notification%|%alert%|%email%|%sms%|%message%',
 '{"quality_threshold": 0.8, "test_coverage": 0.75, "reliability_score": 0.9}',
 '{"focus_areas": ["delivery_confirmation", "retry_logic", "templating"], "models": ["gpt-4", "gpt-3.5-turbo"]}'),

('Batch Processing Job', 'batch', '%batch%|%job%|%cron%|%schedule%|%periodic%',
 '{"quality_threshold": 0.85, "test_coverage": 0.8, "monitoring_score": 0.85}',
 '{"focus_areas": ["idempotency", "checkpoint_recovery", "monitoring"], "models": ["codellama:13b-instruct", "gpt-4"]}'),

('Machine Learning Pipeline', 'ml', '%model%|%train%|%predict%|%ml%|%ai%|%classification%',
 '{"quality_threshold": 0.9, "test_coverage": 0.85, "performance_score": 0.8}',
 '{"focus_areas": ["data_validation", "model_versioning", "feature_engineering"], "models": ["gpt-4", "claude-3-opus"]}')

ON CONFLICT DO NOTHING;

-- Insert initial knowledge base entries
INSERT INTO generation_knowledge (knowledge_type, domain, content, confidence_score) VALUES
('best_practice', 'temporal', 
 '{"practice": "activity_retries", "description": "Always implement retry policies for activities", "code_pattern": "@activity.defn\\ndef my_activity():\\n    # activity implementation\\n    pass", "confidence": 0.95}',
 0.95),

('optimization', 'python', 
 '{"technique": "async_await", "description": "Use async/await for I/O operations", "impact": "30-50% performance improvement", "applicability": ["api_calls", "database_operations", "file_operations"]}',
 0.9),

('pattern', 'error_handling', 
 '{"pattern": "circuit_breaker", "description": "Implement circuit breaker for external service calls", "use_cases": ["api_integration", "database_connections", "third_party_services"]}',
 0.85),

('best_practice', 'testing', 
 '{"practice": "unit_test_coverage", "description": "Maintain minimum 80% test coverage", "tools": ["pytest", "unittest", "jest"], "patterns": ["arrange_act_assert", "mock_external_dependencies"]}',
 0.9),

('optimization', 'performance', 
 '{"technique": "connection_pooling", "description": "Use connection pooling for database operations", "impact": "20-40% performance improvement", "implementation": ["sqlalchemy", "asyncpg", "redis-py"]}',
 0.88)

ON CONFLICT DO NOTHING;

-- Create a view for workflow generation analytics
CREATE OR REPLACE VIEW workflow_generation_analytics AS
SELECT 
    DATE_TRUNC('day', gw.created_at) as date,
    gw.target_language,
    COUNT(*) as total_generations,
    AVG((gw.quality_scores->>'overall')::float) as avg_quality_score,
    AVG(gw.execution_time) as avg_execution_time,
    AVG(gw.iterations) as avg_iterations,
    COUNT(DISTINCT gw.user_id) as unique_users,
    SUM(gw.artifacts_generated) as total_artifacts
FROM generated_workflows gw
WHERE gw.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', gw.created_at), gw.target_language
ORDER BY date DESC, gw.target_language;

-- Create a view for pipeline performance monitoring
CREATE OR REPLACE VIEW pipeline_performance_summary AS
SELECT 
    pm.stage_type,
    pm.model_used,
    COUNT(*) as execution_count,
    AVG(pm.execution_time) as avg_execution_time,
    AVG(pm.quality_score) as avg_quality_score,
    AVG(pm.tokens_used) as avg_tokens_used,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY pm.execution_time) as p95_execution_time,
    MIN(pm.created_at) as first_execution,
    MAX(pm.created_at) as last_execution
FROM pipeline_metrics pm
WHERE pm.created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY pm.stage_type, pm.model_used
ORDER BY pm.stage_type, avg_execution_time;

COMMENT ON TABLE generated_workflows IS 'Stores metadata and results of AI-generated workflows';
COMMENT ON TABLE pipeline_feedback IS 'User feedback for pipeline optimization and learning';
COMMENT ON TABLE pipeline_metrics IS 'Performance metrics for each pipeline stage';
COMMENT ON TABLE generation_templates IS 'Templates and patterns for workflow generation';
COMMENT ON TABLE generation_knowledge IS 'Knowledge base for AI learning and improvement';