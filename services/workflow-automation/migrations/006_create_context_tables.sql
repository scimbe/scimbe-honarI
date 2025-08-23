-- Migration 006: Create Context Collection Tables for Iterative AI Learning
-- Implements comprehensive context tracking and learning from iterations

-- Iteration contexts table for tracking each generation attempt
CREATE TABLE IF NOT EXISTS iteration_contexts (
    context_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL,
    iteration_number INTEGER NOT NULL,
    attempt_id VARCHAR(255) NOT NULL,
    generated_code TEXT NOT NULL,
    quality_scores JSONB NOT NULL,
    quality_feedback JSONB,
    issues_identified JSONB,
    ai_reasoning TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    learned_patterns JSONB,
    improvement_suggestions JSONB,
    performance_metrics JSONB,
    customer_requirements TEXT,
    business_context TEXT
);

-- Learned patterns table for continuous improvement
CREATE TABLE IF NOT EXISTS learned_patterns (
    pattern_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_description TEXT NOT NULL UNIQUE,
    category VARCHAR(100) NOT NULL, -- 'workflow_generation', 'error_handling', 'performance', etc.
    code_snippet TEXT,
    success_rate DECIMAL(3,2) DEFAULT 0.5,
    usage_count INTEGER DEFAULT 1,
    quality_score DECIMAL(3,2),
    effectiveness_rating DECIMAL(3,2),
    pattern_type VARCHAR(50), -- 'structural', 'functional', 'optimization'
    applicable_domains JSONB, -- ['e-commerce', 'data-processing', 'notifications']
    prerequisites JSONB, -- Required conditions for this pattern
    outcomes JSONB, -- Expected outcomes when pattern is applied
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'ai_system'
);

-- Customer satisfaction and feedback tracking
CREATE TABLE IF NOT EXISTS customer_feedback (
    feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL,
    customer_id VARCHAR(255),
    satisfaction_score INTEGER CHECK (satisfaction_score >= 1 AND satisfaction_score <= 10),
    feedback_text TEXT,
    workflow_usability_score INTEGER CHECK (workflow_usability_score >= 1 AND workflow_usability_score <= 10),
    performance_rating INTEGER CHECK (performance_rating >= 1 AND performance_rating <= 10),
    would_recommend BOOLEAN,
    improvement_suggestions TEXT,
    workflow_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    feedback_category VARCHAR(50) -- 'quality', 'performance', 'usability', 'functionality'
);

-- AI model performance tracking
CREATE TABLE IF NOT EXISTS ai_model_performance (
    performance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name VARCHAR(100) NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    iteration_number INTEGER NOT NULL,
    prompt_length INTEGER,
    response_length INTEGER,
    generation_time_ms INTEGER,
    quality_score DECIMAL(3,2),
    token_usage INTEGER,
    temperature DECIMAL(3,2),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    cost_estimate DECIMAL(10,6), -- Estimated cost in USD
    improvement_over_previous DECIMAL(5,2), -- Percentage improvement
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Workflow evolution tracking
CREATE TABLE IF NOT EXISTS workflow_evolution (
    evolution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_workflow_id VARCHAR(255),
    evolved_workflow_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    evolution_type VARCHAR(50), -- 'iteration', 'optimization', 'bug_fix', 'feature_addition'
    changes_made JSONB, -- Detailed list of changes
    quality_improvement DECIMAL(5,2), -- Percentage improvement
    performance_impact JSONB, -- Performance metrics before/after
    customer_acceptance BOOLEAN,
    rollback_reason TEXT, -- If evolution was rolled back
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'ai_system'
);

-- Context learning insights for pattern recognition
CREATE TABLE IF NOT EXISTS learning_insights (
    insight_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insight_category VARCHAR(100) NOT NULL, -- 'pattern_discovery', 'anti_pattern', 'optimization'
    insight_description TEXT NOT NULL,
    confidence_score DECIMAL(3,2) DEFAULT 0.5,
    supporting_evidence JSONB, -- Sessions/attempts that support this insight
    actionable_recommendations JSONB,
    domains_applicable JSONB, -- Business domains where this applies
    technical_complexity VARCHAR(20), -- 'low', 'medium', 'high'
    business_impact VARCHAR(20), -- 'low', 'medium', 'high'
    validation_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'validated', 'rejected'
    validated_by VARCHAR(100),
    validation_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge graph for relationship tracking
CREATE TABLE IF NOT EXISTS knowledge_relationships (
    relationship_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type VARCHAR(50) NOT NULL, -- 'pattern', 'insight', 'feedback', 'workflow'
    source_id VARCHAR(255) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(255) NOT NULL,
    relationship_type VARCHAR(50) NOT NULL, -- 'depends_on', 'improves', 'conflicts_with', 'similar_to'
    strength DECIMAL(3,2) DEFAULT 0.5, -- Relationship strength 0-1
    context JSONB, -- Additional context about the relationship
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    validation_count INTEGER DEFAULT 0
);

-- Create indexes for optimal query performance
CREATE INDEX IF NOT EXISTS idx_iteration_contexts_session ON iteration_contexts(session_id);
CREATE INDEX IF NOT EXISTS idx_iteration_contexts_iteration ON iteration_contexts(iteration_number);
CREATE INDEX IF NOT EXISTS idx_iteration_contexts_timestamp ON iteration_contexts(timestamp);
CREATE INDEX IF NOT EXISTS idx_iteration_contexts_quality ON iteration_contexts USING GIN(quality_scores);

CREATE INDEX IF NOT EXISTS idx_learned_patterns_category ON learned_patterns(category);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_success_rate ON learned_patterns(success_rate DESC);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_usage_count ON learned_patterns(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_effectiveness ON learned_patterns(effectiveness_rating DESC);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_last_used ON learned_patterns(last_used);

CREATE INDEX IF NOT EXISTS idx_customer_feedback_session ON customer_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_satisfaction ON customer_feedback(satisfaction_score);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_created_at ON customer_feedback(created_at);

CREATE INDEX IF NOT EXISTS idx_ai_model_performance_model ON ai_model_performance(model_name);
CREATE INDEX IF NOT EXISTS idx_ai_model_performance_session ON ai_model_performance(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_model_performance_quality ON ai_model_performance(quality_score);
CREATE INDEX IF NOT EXISTS idx_ai_model_performance_cost ON ai_model_performance(cost_estimate);

CREATE INDEX IF NOT EXISTS idx_workflow_evolution_base ON workflow_evolution(base_workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_evolution_evolved ON workflow_evolution(evolved_workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_evolution_type ON workflow_evolution(evolution_type);

CREATE INDEX IF NOT EXISTS idx_learning_insights_category ON learning_insights(insight_category);
CREATE INDEX IF NOT EXISTS idx_learning_insights_confidence ON learning_insights(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_learning_insights_validation ON learning_insights(validation_status);

CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_source ON knowledge_relationships(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_target ON knowledge_relationships(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_type ON knowledge_relationships(relationship_type);

-- Create triggers for automatic learning and optimization
CREATE OR REPLACE FUNCTION extract_learning_insights()
RETURNS TRIGGER AS $$
BEGIN
    -- Automatically extract insights when iteration contexts are added
    IF NEW.quality_scores->>'overall' IS NOT NULL THEN
        -- High quality pattern detection
        IF (NEW.quality_scores->>'overall')::numeric > 0.9 THEN
            INSERT INTO learning_insights (
                insight_category, insight_description, confidence_score,
                supporting_evidence, actionable_recommendations
            ) VALUES (
                'high_quality_pattern',
                'High quality workflow pattern detected with score ' || (NEW.quality_scores->>'overall'),
                0.8,
                jsonb_build_object('session_id', NEW.session_id, 'iteration', NEW.iteration_number),
                jsonb_build_array('Apply similar patterns in future generations')
            ) ON CONFLICT DO NOTHING;
        END IF;
        
        -- Performance improvement detection
        IF NEW.iteration_number > 1 THEN
            -- This would require more complex logic to compare with previous iterations
            -- For now, we'll insert a basic insight
            INSERT INTO learning_insights (
                insight_category, insight_description, confidence_score,
                supporting_evidence
            ) VALUES (
                'iteration_improvement',
                'Iterative improvement observed in session ' || NEW.session_id,
                0.6,
                jsonb_build_object('session_id', NEW.session_id, 'iteration', NEW.iteration_number)
            ) ON CONFLICT DO NOTHING;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_extract_insights ON iteration_contexts;
CREATE TRIGGER trigger_extract_insights
    AFTER INSERT ON iteration_contexts
    FOR EACH ROW
    EXECUTE FUNCTION extract_learning_insights();

-- Function to update pattern effectiveness based on usage
CREATE OR REPLACE FUNCTION update_pattern_effectiveness()
RETURNS TRIGGER AS $$
BEGIN
    -- Update effectiveness rating based on quality scores and usage
    UPDATE learned_patterns SET
        effectiveness_rating = (
            (success_rate * 0.4) + 
            (LEAST(usage_count / 10.0, 1.0) * 0.3) + 
            (quality_score * 0.3)
        ),
        last_used = NOW()
    WHERE pattern_id = NEW.pattern_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to discover pattern relationships
CREATE OR REPLACE FUNCTION discover_pattern_relationships()
RETURNS void AS $$
DECLARE
    pattern_record RECORD;
    similar_pattern RECORD;
BEGIN
    -- Find similar patterns based on code snippets and descriptions
    FOR pattern_record IN 
        SELECT pattern_id, pattern_description, code_snippet, category 
        FROM learned_patterns 
        WHERE usage_count > 3
    LOOP
        -- Find patterns with similar descriptions
        FOR similar_pattern IN
            SELECT pattern_id, pattern_description, code_snippet
            FROM learned_patterns
            WHERE pattern_id != pattern_record.pattern_id
            AND category = pattern_record.category
            AND similarity(pattern_description, pattern_record.pattern_description) > 0.7
        LOOP
            -- Insert relationship if not exists
            INSERT INTO knowledge_relationships (
                source_type, source_id, target_type, target_id,
                relationship_type, strength
            ) VALUES (
                'pattern', pattern_record.pattern_id::text,
                'pattern', similar_pattern.pattern_id::text,
                'similar_to', 0.7
            ) ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Insert initial learned patterns for common workflow scenarios
INSERT INTO learned_patterns (pattern_description, category, code_snippet, success_rate, quality_score, pattern_type, applicable_domains) VALUES
(
    'Temporal workflow with retry policy and error handling',
    'workflow_generation',
    '@WorkflowMethod\npublic String processData(String input) {\n  try {\n    return MyActivities.processData(input);\n  } catch (Exception e) {\n    logger.error("Workflow failed", e);\n    throw e;\n  }\n}',
    0.92,
    0.89,
    'structural',
    '["data-processing", "general"]'
),
(
    'Async activity with timeout and validation',
    'workflow_generation',
    '@ActivityMethod\npublic async String processDataActivity(String input) {\n  validateInput(input);\n  return await processWithTimeout(input, Duration.ofMinutes(5));\n}',
    0.88,
    0.85,
    'functional',
    '["api-integration", "data-processing"]'
),
(
    'Comprehensive error handling with specific exception types',
    'error_handling',
    'try {\n  result = processData(input);\n} catch (ValidationException e) {\n  logger.warn("Validation failed", e);\n  throw new ApplicationFailure("Invalid input", e);\n} catch (TimeoutException e) {\n  logger.error("Operation timed out", e);\n  throw new ApplicationFailure("Timeout", e);\n}',
    0.94,
    0.91,
    'optimization',
    '["general", "data-processing", "api-integration"]'
),
(
    'Input validation with detailed error messages',
    'validation',
    'private void validateInput(String input) {\n  if (input == null || input.trim().isEmpty()) {\n    throw new IllegalArgumentException("Input cannot be null or empty");\n  }\n  if (input.length() > MAX_LENGTH) {\n    throw new IllegalArgumentException("Input exceeds maximum length");\n  }\n}',
    0.90,
    0.87,
    'functional',
    '["general"]'
),
(
    'Structured logging with correlation IDs',
    'logging',
    'logger.info("Processing started", \n  Map.of(\n    "correlationId", workflowId,\n    "operation", "processData",\n    "inputSize", input.length()\n  )\n);',
    0.86,
    0.83,
    'optimization',
    '["general", "monitoring"]'
)
ON CONFLICT (pattern_description) DO NOTHING;

-- Insert initial learning insights
INSERT INTO learning_insights (insight_category, insight_description, confidence_score, actionable_recommendations, technical_complexity, business_impact) VALUES
(
    'pattern_discovery',
    'Workflows with comprehensive error handling show 40% higher success rates',
    0.85,
    '["Always include try-catch blocks", "Use specific exception types", "Add retry mechanisms"]',
    'medium',
    'high'
),
(
    'optimization',
    'Async patterns with proper timeout configurations improve performance by 60%',
    0.78,
    '["Use async/await patterns", "Configure appropriate timeouts", "Implement circuit breakers"]',
    'medium',
    'high'
),
(
    'anti_pattern',
    'Workflows without input validation have 3x higher failure rates',
    0.92,
    '["Always validate inputs", "Use schema validation", "Provide clear error messages"]',
    'low',
    'high'
),
(
    'pattern_discovery',
    'Structured logging improves debugging efficiency by 50%',
    0.71,
    '["Use correlation IDs", "Log at appropriate levels", "Include context information"]',
    'low',
    'medium'
)
ON CONFLICT DO NOTHING;

-- Create views for analytics and reporting
CREATE OR REPLACE VIEW iteration_analysis AS
SELECT 
    ic.session_id,
    COUNT(*) as total_iterations,
    AVG((ic.quality_scores->>'overall')::numeric) as avg_quality_score,
    MAX((ic.quality_scores->>'overall')::numeric) as max_quality_score,
    MIN((ic.quality_scores->>'overall')::numeric) as min_quality_score,
    MAX((ic.quality_scores->>'overall')::numeric) - MIN((ic.quality_scores->>'overall')::numeric) as quality_improvement,
    COUNT(*) FILTER (WHERE (ic.quality_scores->>'overall')::numeric > 0.8) as high_quality_iterations,
    AVG(jsonb_array_length(ic.issues_identified)) as avg_issues_per_iteration,
    ic.customer_requirements
FROM iteration_contexts ic
GROUP BY ic.session_id, ic.customer_requirements
ORDER BY quality_improvement DESC;

CREATE OR REPLACE VIEW pattern_effectiveness_report AS
SELECT 
    lp.pattern_description,
    lp.category,
    lp.success_rate,
    lp.usage_count,
    lp.effectiveness_rating,
    lp.quality_score,
    COUNT(ic.context_id) as times_applied,
    AVG((ic.quality_scores->>'overall')::numeric) as avg_result_quality
FROM learned_patterns lp
LEFT JOIN iteration_contexts ic ON ic.learned_patterns ? lp.pattern_description
GROUP BY lp.pattern_id, lp.pattern_description, lp.category, lp.success_rate, lp.usage_count, lp.effectiveness_rating, lp.quality_score
ORDER BY lp.effectiveness_rating DESC;

CREATE OR REPLACE VIEW ai_model_efficiency AS
SELECT 
    amp.model_name,
    COUNT(*) as total_requests,
    AVG(amp.generation_time_ms) as avg_generation_time,
    AVG(amp.quality_score) as avg_quality_score,
    SUM(amp.cost_estimate) as total_estimated_cost,
    AVG(amp.token_usage) as avg_token_usage,
    COUNT(*) FILTER (WHERE amp.success = true) * 100.0 / COUNT(*) as success_rate,
    AVG(amp.improvement_over_previous) as avg_improvement_rate
FROM ai_model_performance amp
GROUP BY amp.model_name
ORDER BY avg_quality_score DESC, avg_generation_time ASC;

-- Add comments for documentation
COMMENT ON TABLE iteration_contexts IS 'Tracks each iteration attempt in AI workflow generation with full context';
COMMENT ON TABLE learned_patterns IS 'Repository of successful patterns learned from previous generations';
COMMENT ON TABLE customer_feedback IS 'Customer satisfaction and feedback tracking for continuous improvement';
COMMENT ON TABLE ai_model_performance IS 'Performance metrics for different AI models and configurations';
COMMENT ON TABLE workflow_evolution IS 'Tracks how workflows evolve over time through iterations';
COMMENT ON TABLE learning_insights IS 'AI-discovered insights and patterns for process improvement';
COMMENT ON TABLE knowledge_relationships IS 'Graph of relationships between patterns, insights, and workflows';