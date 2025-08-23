-- Migration 005: Create Multi-Level Cache Tables for Workflow Generation
-- Implements L3 (Database) persistent caching layer

-- Workflow cache table for L3 persistent storage
CREATE TABLE IF NOT EXISTS workflow_cache (
    cache_key VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    ttl_seconds INTEGER NOT NULL DEFAULT 3600,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    hits INTEGER DEFAULT 0,
    cache_type VARCHAR(50) DEFAULT 'general' -- 'workflow', 'ai_response', 'plugin', 'template'
);

-- Cache performance metrics table
CREATE TABLE IF NOT EXISTS cache_metrics (
    metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_level VARCHAR(10) NOT NULL, -- 'L1', 'L2', 'L3'
    operation VARCHAR(20) NOT NULL, -- 'get', 'set', 'delete', 'clear'
    cache_key VARCHAR(255),
    hit BOOLEAN DEFAULT FALSE,
    response_time_ms INTEGER,
    data_size_bytes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- AI model response cache for expensive AI operations
CREATE TABLE IF NOT EXISTS ai_response_cache (
    response_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name VARCHAR(100) NOT NULL,
    prompt_hash VARCHAR(64) NOT NULL, -- MD5 hash of prompt for indexing
    prompt_preview TEXT, -- First 500 chars of prompt for debugging
    temperature DECIMAL(3,2) DEFAULT 0.7,
    max_tokens INTEGER,
    response_data JSONB NOT NULL,
    tokens_used INTEGER,
    response_time_ms INTEGER,
    quality_score DECIMAL(3,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER DEFAULT 0
);

-- Plugin metadata cache for fast plugin discovery
CREATE TABLE IF NOT EXISTS plugin_cache (
    plugin_id VARCHAR(255) PRIMARY KEY,
    plugin_name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    category VARCHAR(100),
    metadata JSONB NOT NULL,
    dependencies JSONB,
    performance_metrics JSONB,
    usage_stats JSONB,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    cache_until TIMESTAMP WITH TIME ZONE
);

-- Workflow template cache for pattern matching
CREATE TABLE IF NOT EXISTS template_cache (
    template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name VARCHAR(255) NOT NULL,
    pattern_hash VARCHAR(64) NOT NULL,
    requirements_pattern TEXT NOT NULL,
    generated_code JSONB,
    success_metrics JSONB,
    optimization_hints JSONB,
    usage_frequency INTEGER DEFAULT 0,
    avg_quality_score DECIMAL(3,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for optimal cache performance
CREATE INDEX IF NOT EXISTS idx_workflow_cache_created_ttl ON workflow_cache(created_at, ttl_seconds);
CREATE INDEX IF NOT EXISTS idx_workflow_cache_type ON workflow_cache(cache_type);
CREATE INDEX IF NOT EXISTS idx_workflow_cache_last_accessed ON workflow_cache(last_accessed);
CREATE INDEX IF NOT EXISTS idx_workflow_cache_hits ON workflow_cache(hits DESC);

CREATE INDEX IF NOT EXISTS idx_cache_metrics_level_operation ON cache_metrics(cache_level, operation);
CREATE INDEX IF NOT EXISTS idx_cache_metrics_created_at ON cache_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_cache_metrics_response_time ON cache_metrics(response_time_ms);

CREATE INDEX IF NOT EXISTS idx_ai_response_cache_model_hash ON ai_response_cache(model_name, prompt_hash);
CREATE INDEX IF NOT EXISTS idx_ai_response_cache_expires ON ai_response_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_response_cache_quality ON ai_response_cache(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_ai_response_cache_usage ON ai_response_cache(usage_count DESC);

CREATE INDEX IF NOT EXISTS idx_plugin_cache_category ON plugin_cache(category);
CREATE INDEX IF NOT EXISTS idx_plugin_cache_cache_until ON plugin_cache(cache_until);
CREATE INDEX IF NOT EXISTS idx_plugin_cache_last_updated ON plugin_cache(last_updated);

CREATE INDEX IF NOT EXISTS idx_template_cache_pattern_hash ON template_cache(pattern_hash);
CREATE INDEX IF NOT EXISTS idx_template_cache_usage_frequency ON template_cache(usage_frequency DESC);
CREATE INDEX IF NOT EXISTS idx_template_cache_quality_score ON template_cache(avg_quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_template_cache_last_used ON template_cache(last_used);

-- Create triggers for automatic cache invalidation
CREATE OR REPLACE FUNCTION invalidate_expired_cache()
RETURNS TRIGGER AS $$
BEGIN
    -- Clean up expired workflow cache entries
    DELETE FROM workflow_cache 
    WHERE (created_at + INTERVAL '1 second' * ttl_seconds) < NOW();
    
    -- Clean up expired AI response cache
    DELETE FROM ai_response_cache 
    WHERE expires_at < NOW();
    
    -- Clean up expired plugin cache
    DELETE FROM plugin_cache 
    WHERE cache_until < NOW();
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create scheduled trigger for cache cleanup (runs every hour)
CREATE OR REPLACE FUNCTION schedule_cache_cleanup()
RETURNS void AS $$
BEGIN
    PERFORM invalidate_expired_cache();
END;
$$ LANGUAGE plpgsql;

-- Insert initial cache warming data with common AI workflows
INSERT INTO template_cache (template_name, pattern_hash, requirements_pattern, generated_code, success_metrics, optimization_hints, usage_frequency, avg_quality_score) VALUES
(
    'Data Processing ETL',
    md5('data|process|etl|transform|load'),
    'data processing, ETL, transform, load, extract',
    '{"workflow_code": "class DataProcessingWorkflow", "activities": ["extract_data", "transform_data", "load_data"], "error_handling": true}',
    '{"avg_execution_time": 450, "success_rate": 0.95, "resource_efficiency": 0.88}',
    '{"focus_areas": ["data_validation", "error_recovery", "performance"], "recommended_models": ["gpt-4", "codellama:13b"]}',
    25,
    0.92
),
(
    'API Integration Workflow',
    md5('api|rest|integration|webhook|service'),
    'API integration, REST, webhook, service communication',
    '{"workflow_code": "class APIIntegrationWorkflow", "activities": ["authenticate", "fetch_data", "process_response"], "retry_logic": true}',
    '{"avg_execution_time": 320, "success_rate": 0.93, "resource_efficiency": 0.85}',
    '{"focus_areas": ["authentication", "rate_limiting", "error_handling"], "recommended_models": ["gpt-4", "claude-3-sonnet"]}',
    18,
    0.89
),
(
    'ML Model Training Pipeline',
    md5('machine|learning|model|train|pipeline'),
    'machine learning, model training, ML pipeline, data science',
    '{"workflow_code": "class MLTrainingWorkflow", "activities": ["prepare_data", "train_model", "validate_model"], "monitoring": true}',
    '{"avg_execution_time": 1200, "success_rate": 0.87, "resource_efficiency": 0.82}',
    '{"focus_areas": ["data_preprocessing", "model_validation", "hyperparameter_tuning"], "recommended_models": ["gpt-4", "claude-3-opus"]}',
    12,
    0.88
),
(
    'Notification System',
    md5('notification|alert|email|sms|message'),
    'notification, alert, email, SMS, messaging, communication',
    '{"workflow_code": "class NotificationWorkflow", "activities": ["format_message", "select_channel", "send_notification"], "delivery_confirmation": true}',
    '{"avg_execution_time": 150, "success_rate": 0.98, "resource_efficiency": 0.94}',
    '{"focus_areas": ["delivery_confirmation", "retry_logic", "templating"], "recommended_models": ["gpt-4", "gpt-3.5-turbo"]}',
    35,
    0.94
),
(
    'File Processing Batch Job',
    md5('file|batch|process|upload|download'),
    'file processing, batch job, upload, download, file management',
    '{"workflow_code": "class FileProcessingWorkflow", "activities": ["validate_file", "process_content", "store_result"], "chunk_processing": true}',
    '{"avg_execution_time": 680, "success_rate": 0.91, "resource_efficiency": 0.86}',
    '{"focus_areas": ["file_validation", "chunk_processing", "error_recovery"], "recommended_models": ["codellama:13b", "gpt-4"]}',
    22,
    0.90
)
ON CONFLICT DO NOTHING;

-- Create views for cache analytics
CREATE OR REPLACE VIEW cache_performance_summary AS
SELECT 
    cache_level,
    operation,
    COUNT(*) as operation_count,
    AVG(response_time_ms) as avg_response_time,
    SUM(CASE WHEN hit THEN 1 ELSE 0 END) as hits,
    SUM(CASE WHEN NOT hit THEN 1 ELSE 0 END) as misses,
    ROUND(
        (SUM(CASE WHEN hit THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2
    ) as hit_rate_percentage,
    DATE_TRUNC('hour', created_at) as hour_bucket
FROM cache_metrics
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY cache_level, operation, DATE_TRUNC('hour', created_at)
ORDER BY hour_bucket DESC, cache_level, operation;

CREATE OR REPLACE VIEW ai_cache_efficiency AS
SELECT 
    model_name,
    COUNT(*) as total_responses,
    AVG(response_time_ms) as avg_response_time,
    AVG(tokens_used) as avg_tokens_used,
    AVG(quality_score) as avg_quality_score,
    SUM(usage_count) as total_usage,
    COUNT(DISTINCT prompt_hash) as unique_prompts,
    ROUND(AVG(usage_count), 2) as avg_reuse_factor
FROM ai_response_cache
WHERE expires_at > NOW()
GROUP BY model_name
ORDER BY total_usage DESC;

CREATE OR REPLACE VIEW template_usage_analytics AS
SELECT 
    template_name,
    usage_frequency,
    avg_quality_score,
    pattern_hash,
    EXTRACT(DAYS FROM (NOW() - last_used)) as days_since_last_use,
    CASE 
        WHEN usage_frequency > 20 THEN 'High'
        WHEN usage_frequency > 10 THEN 'Medium'
        ELSE 'Low'
    END as usage_category
FROM template_cache
ORDER BY usage_frequency DESC, avg_quality_score DESC;

-- Add comments for documentation
COMMENT ON TABLE workflow_cache IS 'L3 persistent cache for workflow generation data';
COMMENT ON TABLE cache_metrics IS 'Performance metrics tracking for all cache levels';
COMMENT ON TABLE ai_response_cache IS 'Cached AI model responses to avoid expensive re-computation';
COMMENT ON TABLE plugin_cache IS 'Plugin metadata cache for fast discovery and loading';
COMMENT ON TABLE template_cache IS 'Workflow template cache with pattern matching capabilities';

COMMENT ON INDEX idx_workflow_cache_created_ttl IS 'Efficient expiration cleanup queries';
COMMENT ON INDEX idx_ai_response_cache_model_hash IS 'Fast AI response lookups by model and prompt hash';
COMMENT ON INDEX idx_template_cache_pattern_hash IS 'Pattern-based template matching for workflow generation';