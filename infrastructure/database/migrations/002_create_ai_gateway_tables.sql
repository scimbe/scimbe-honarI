-- ==========================================
-- AI Gateway Database Schema
-- Migration 002: AI Gateway specific tables for request tracking, caching, and analytics
-- ==========================================

-- ==========================================
-- AI PROVIDERS TABLE
-- ==========================================

CREATE TABLE ai_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    provider_type VARCHAR(50) NOT NULL 
        CHECK (provider_type IN ('openai', 'anthropic', 'local', 'azure', 'aws', 'google')),
    
    -- Configuration
    endpoint_url VARCHAR(500),
    api_key_hash VARCHAR(255), -- Hashed API key for security
    model_name VARCHAR(255),
    default_parameters JSONB,
    
    -- Rate limiting and costs
    rate_limit_config JSONB,
    cost_config JSONB,
    
    -- Status and health
    is_active BOOLEAN DEFAULT true,
    is_healthy BOOLEAN DEFAULT true,
    last_health_check TIMESTAMP WITH TIME ZONE,
    health_check_error TEXT,
    
    -- Priority for fallback
    priority INTEGER DEFAULT 100,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NOT NULL,
    updated_by VARCHAR(255)
);

-- ==========================================
-- AI REQUESTS TABLE
-- ==========================================

CREATE TABLE ai_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Request identification
    request_type VARCHAR(50) NOT NULL 
        CHECK (request_type IN ('chat', 'generate', 'code_generation', 'workflow_routing')),
    
    -- Provider and model information
    provider_id UUID REFERENCES ai_providers(id),
    provider_name VARCHAR(100) NOT NULL,
    model_name VARCHAR(255) NOT NULL,
    
    -- Request data (sanitized - no sensitive info)
    input_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of input for caching
    input_size_bytes INTEGER,
    output_size_bytes INTEGER,
    
    -- Request parameters
    temperature DECIMAL(3,2),
    max_tokens INTEGER,
    top_p DECIMAL(3,2),
    other_parameters JSONB,
    
    -- Response metadata
    response_status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (response_status IN ('pending', 'success', 'error', 'timeout', 'rate_limited')),
    
    -- Performance metrics
    total_duration_ms INTEGER,
    queue_duration_ms INTEGER,
    processing_duration_ms INTEGER,
    
    -- Usage metrics
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    
    -- Cost calculation
    estimated_cost_usd DECIMAL(10,6),
    
    -- Error information
    error_code VARCHAR(100),
    error_message TEXT,
    error_details JSONB,
    
    -- Correlation and tracing
    correlation_id VARCHAR(255),
    trace_id VARCHAR(255),
    span_id VARCHAR(255),
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    workflow_execution_id UUID REFERENCES workflow_executions(id),
    
    -- Timestamps
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- AI RESPONSE CACHE TABLE
-- ==========================================

CREATE TABLE ai_response_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Cache key (hash of input + parameters)
    cache_key VARCHAR(64) NOT NULL UNIQUE,
    input_hash VARCHAR(64) NOT NULL,
    
    -- Request parameters for cache validation
    provider_type VARCHAR(50) NOT NULL,
    model_name VARCHAR(255) NOT NULL,
    parameters_hash VARCHAR(64) NOT NULL,
    
    -- Cached response data
    response_data JSONB NOT NULL,
    response_metadata JSONB,
    
    -- Cache metadata
    hit_count INTEGER DEFAULT 0,
    last_hit_at TIMESTAMP WITH TIME ZONE,
    
    -- TTL and expiration
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- AI MODEL REGISTRY TABLE
-- ==========================================

CREATE TABLE ai_model_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Model identification
    model_name VARCHAR(255) NOT NULL,
    provider_type VARCHAR(50) NOT NULL,
    model_version VARCHAR(100),
    
    -- Model capabilities
    capabilities TEXT[] DEFAULT '{}', -- e.g., ['chat', 'code', 'reasoning']
    max_tokens INTEGER,
    context_length INTEGER,
    
    -- Cost information
    cost_per_input_token DECIMAL(12,8),
    cost_per_output_token DECIMAL(12,8),
    
    -- Performance metrics
    average_response_time_ms INTEGER,
    average_quality_score DECIMAL(3,2),
    
    -- Status
    is_available BOOLEAN DEFAULT true,
    is_deprecated BOOLEAN DEFAULT false,
    deprecation_date TIMESTAMP WITH TIME ZONE,
    
    -- Configuration
    default_parameters JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(model_name, provider_type, model_version)
);

-- ==========================================
-- AI USAGE ANALYTICS TABLE (Aggregated)
-- ==========================================

CREATE TABLE ai_usage_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Time bucket (hourly aggregation)
    time_bucket TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Aggregation dimensions
    provider_name VARCHAR(100) NOT NULL,
    model_name VARCHAR(255) NOT NULL,
    request_type VARCHAR(50) NOT NULL,
    user_id VARCHAR(255),
    
    -- Aggregated metrics
    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    
    -- Performance aggregations
    avg_duration_ms DECIMAL(10,2),
    min_duration_ms INTEGER,
    max_duration_ms INTEGER,
    p95_duration_ms INTEGER,
    
    -- Token usage aggregations
    total_input_tokens BIGINT DEFAULT 0,
    total_output_tokens BIGINT DEFAULT 0,
    total_tokens BIGINT DEFAULT 0,
    
    -- Cost aggregations
    total_cost_usd DECIMAL(12,6) DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(time_bucket, provider_name, model_name, request_type, user_id)
);

-- ==========================================
-- RATE LIMITING TABLE
-- ==========================================

CREATE TABLE ai_rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Rate limit identification
    limit_key VARCHAR(255) NOT NULL, -- e.g., "user:123:openai" or "global:anthropic"
    limit_type VARCHAR(50) NOT NULL 
        CHECK (limit_type IN ('user', 'global', 'provider', 'model')),
    
    -- Rate limit configuration
    requests_per_minute INTEGER,
    requests_per_hour INTEGER,
    requests_per_day INTEGER,
    tokens_per_minute BIGINT,
    cost_per_day DECIMAL(10,2),
    
    -- Current usage counters
    current_minute_requests INTEGER DEFAULT 0,
    current_hour_requests INTEGER DEFAULT 0,
    current_day_requests INTEGER DEFAULT 0,
    current_minute_tokens BIGINT DEFAULT 0,
    current_day_cost DECIMAL(10,2) DEFAULT 0,
    
    -- Reset timestamps
    minute_reset_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    hour_reset_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    day_reset_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Status
    is_blocked BOOLEAN DEFAULT false,
    blocked_until TIMESTAMP WITH TIME ZONE,
    block_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(limit_key)
);

-- ==========================================
-- INDICES FOR PERFORMANCE
-- ==========================================

-- AI Providers indices
CREATE INDEX idx_ai_providers_provider_type ON ai_providers(provider_type);
CREATE INDEX idx_ai_providers_is_active ON ai_providers(is_active);
CREATE INDEX idx_ai_providers_priority ON ai_providers(priority);

-- AI Requests indices
CREATE INDEX idx_ai_requests_provider_id ON ai_requests(provider_id);
CREATE INDEX idx_ai_requests_request_type ON ai_requests(request_type);
CREATE INDEX idx_ai_requests_response_status ON ai_requests(response_status);
CREATE INDEX idx_ai_requests_input_hash ON ai_requests(input_hash);
CREATE INDEX idx_ai_requests_correlation_id ON ai_requests(correlation_id);
CREATE INDEX idx_ai_requests_user_id ON ai_requests(user_id);
CREATE INDEX idx_ai_requests_requested_at ON ai_requests(requested_at);
CREATE INDEX idx_ai_requests_workflow_execution_id ON ai_requests(workflow_execution_id);

-- AI Response Cache indices
CREATE INDEX idx_ai_response_cache_input_hash ON ai_response_cache(input_hash);
CREATE INDEX idx_ai_response_cache_provider_model ON ai_response_cache(provider_type, model_name);
CREATE INDEX idx_ai_response_cache_expires_at ON ai_response_cache(expires_at);
CREATE INDEX idx_ai_response_cache_hit_count ON ai_response_cache(hit_count DESC);

-- AI Model Registry indices
CREATE INDEX idx_ai_model_registry_provider_type ON ai_model_registry(provider_type);
CREATE INDEX idx_ai_model_registry_is_available ON ai_model_registry(is_available);
CREATE INDEX idx_ai_model_registry_capabilities ON ai_model_registry USING GIN(capabilities);

-- AI Usage Analytics indices
CREATE INDEX idx_ai_usage_analytics_time_bucket ON ai_usage_analytics(time_bucket);
CREATE INDEX idx_ai_usage_analytics_provider_model ON ai_usage_analytics(provider_name, model_name);
CREATE INDEX idx_ai_usage_analytics_user_id ON ai_usage_analytics(user_id);

-- Rate Limits indices
CREATE INDEX idx_ai_rate_limits_limit_key ON ai_rate_limits(limit_key);
CREATE INDEX idx_ai_rate_limits_limit_type ON ai_rate_limits(limit_type);
CREATE INDEX idx_ai_rate_limits_is_blocked ON ai_rate_limits(is_blocked);

-- ==========================================
-- FUNCTIONS AND TRIGGERS
-- ==========================================

-- Trigger for updated_at
CREATE TRIGGER update_ai_providers_updated_at BEFORE UPDATE ON ai_providers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_model_registry_updated_at BEFORE UPDATE ON ai_model_registry FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_usage_analytics_updated_at BEFORE UPDATE ON ai_usage_analytics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_rate_limits_updated_at BEFORE UPDATE ON ai_rate_limits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to clean expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM ai_response_cache WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update cache hit count
CREATE OR REPLACE FUNCTION increment_cache_hit(cache_key_param VARCHAR(64))
RETURNS VOID AS $$
BEGIN
    UPDATE ai_response_cache 
    SET hit_count = hit_count + 1,
        last_hit_at = CURRENT_TIMESTAMP
    WHERE cache_key = cache_key_param;
END;
$$ LANGUAGE plpgsql;

-- Function to reset rate limit counters
CREATE OR REPLACE FUNCTION reset_rate_limit_counters()
RETURNS INTEGER AS $$
DECLARE
    reset_count INTEGER := 0;
BEGIN
    -- Reset minute counters
    UPDATE ai_rate_limits 
    SET current_minute_requests = 0,
        current_minute_tokens = 0,
        minute_reset_at = CURRENT_TIMESTAMP
    WHERE minute_reset_at <= CURRENT_TIMESTAMP - INTERVAL '1 minute';
    
    GET DIAGNOSTICS reset_count = ROW_COUNT;
    
    -- Reset hour counters
    UPDATE ai_rate_limits 
    SET current_hour_requests = 0,
        hour_reset_at = CURRENT_TIMESTAMP
    WHERE hour_reset_at <= CURRENT_TIMESTAMP - INTERVAL '1 hour';
    
    -- Reset day counters
    UPDATE ai_rate_limits 
    SET current_day_requests = 0,
        current_day_cost = 0,
        day_reset_at = CURRENT_TIMESTAMP
    WHERE day_reset_at <= CURRENT_TIMESTAMP - INTERVAL '1 day';
    
    RETURN reset_count;
END;
$$ LANGUAGE plpgsql;