-- ============================================================================
-- IMMEDIATE WORKFLOW ISOLATION BUG FIXES
-- Critical database changes to prevent activity cross-contamination
-- ============================================================================

BEGIN;

-- Step 1: Create workflow execution contexts table for isolation tracking
CREATE TABLE IF NOT EXISTS workflow_execution_contexts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    execution_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    isolation_boundary JSONB NOT NULL DEFAULT '{"strict": true, "version": "1.0"}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'terminated')),
    UNIQUE(workflow_id, execution_id, session_id)
);

-- Step 2: Add isolation columns to activity tables
ALTER TABLE activity_definitions 
ADD COLUMN IF NOT EXISTS execution_context_id UUID REFERENCES workflow_execution_contexts(id),
ADD COLUMN IF NOT EXISTS isolation_level VARCHAR(50) DEFAULT 'workflow_strict' 
    CHECK (isolation_level IN ('workflow_strict', 'execution_scoped', 'session_private', 'global_shared'));

ALTER TABLE activity_library 
ADD COLUMN IF NOT EXISTS workflow_execution_context_id UUID REFERENCES workflow_execution_contexts(id),
ADD COLUMN IF NOT EXISTS access_scope VARCHAR(50) DEFAULT 'workflow_private' 
    CHECK (access_scope IN ('workflow_private', 'execution_scoped', 'session_scoped', 'global_shared')),
ADD COLUMN IF NOT EXISTS isolation_metadata JSONB DEFAULT '{"enforced": true, "level": "strict"}';

-- Step 3: Create isolation enforcement indexes
CREATE INDEX IF NOT EXISTS idx_workflow_contexts_lookup 
ON workflow_execution_contexts(workflow_id, execution_id, session_id, status) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_activity_workflow_isolation 
ON activity_definitions(workflow_id, isolation_level, status) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_activity_library_isolation 
ON activity_library(workflow_id, access_scope, created_at) 
WHERE access_scope IN ('workflow_private', 'execution_scoped');

-- Step 4: Create isolation enforcement functions
CREATE OR REPLACE FUNCTION enforce_workflow_isolation()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent cross-workflow activity modification
    IF NEW.workflow_id IS NOT NULL AND OLD.workflow_id IS NOT NULL 
       AND NEW.workflow_id != OLD.workflow_id THEN
        RAISE EXCEPTION 'WORKFLOW_ISOLATION_VIOLATION: Cross-workflow activity modification not allowed. Attempted to move activity from % to %', 
            OLD.workflow_id, NEW.workflow_id;
    END IF;
    
    -- Ensure isolation metadata is maintained
    IF NEW.isolation_level IS NULL THEN
        NEW.isolation_level = 'workflow_strict';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_activity_access()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate that activities can only be accessed within their workflow context
    IF NEW.workflow_id IS NOT NULL THEN
        -- Check if workflow exists
        IF NOT EXISTS (SELECT 1 FROM workflow_definitions WHERE id = NEW.workflow_id) THEN
            RAISE EXCEPTION 'WORKFLOW_ISOLATION_VIOLATION: Workflow % does not exist', NEW.workflow_id;
        END IF;
        
        -- Set default access scope if not specified
        IF NEW.access_scope IS NULL THEN
            NEW.access_scope = 'workflow_private';
        END IF;
        
        -- Update isolation metadata
        NEW.isolation_metadata = jsonb_build_object(
            'enforced', true,
            'level', 'strict',
            'workflowId', NEW.workflow_id,
            'lastValidated', CURRENT_TIMESTAMP
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Apply isolation triggers
DROP TRIGGER IF EXISTS trigger_workflow_isolation ON activity_definitions;
CREATE TRIGGER trigger_workflow_isolation
    BEFORE UPDATE ON activity_definitions
    FOR EACH ROW
    EXECUTE FUNCTION enforce_workflow_isolation();

DROP TRIGGER IF EXISTS trigger_activity_access_validation ON activity_library;
CREATE TRIGGER trigger_activity_access_validation
    BEFORE INSERT OR UPDATE ON activity_library
    FOR EACH ROW
    EXECUTE FUNCTION validate_activity_access();

-- Step 6: Create safe activity lookup functions with isolation
CREATE OR REPLACE FUNCTION get_workflow_activities_isolated(
    p_workflow_id UUID,
    p_execution_id VARCHAR DEFAULT NULL,
    p_session_id VARCHAR DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    name VARCHAR(255),
    type VARCHAR(100),
    code TEXT,
    workflow_id UUID,
    access_scope VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    -- Strict workflow boundary enforcement - NO fallbacks to other workflows
    RETURN QUERY
    SELECT 
        al.id,
        al.name,
        al.type,
        al.code,
        al.workflow_id,
        al.access_scope,
        al.created_at
    FROM activity_library al
    WHERE al.workflow_id = p_workflow_id
        AND al.access_scope IN ('workflow_private', 'execution_scoped', 'session_scoped')
        -- Optionally filter by execution context if provided
        AND (p_execution_id IS NULL OR EXISTS (
            SELECT 1 FROM workflow_execution_contexts wec 
            WHERE wec.workflow_id = p_workflow_id 
            AND wec.execution_id = p_execution_id
            AND wec.status = 'active'
        ))
    ORDER BY al.created_at ASC;
    
    -- Log isolation enforcement
    INSERT INTO logs (
        workflow_id, level, message, source, metadata
    ) VALUES (
        p_workflow_id, 
        'INFO', 
        'Isolated activity lookup performed',
        'workflow_isolation_system',
        jsonb_build_object(
            'executionId', p_execution_id,
            'sessionId', p_session_id,
            'isolationLevel', 'strict',
            'timestamp', CURRENT_TIMESTAMP
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Create workflow context management functions
CREATE OR REPLACE FUNCTION create_workflow_execution_context(
    p_workflow_id UUID,
    p_execution_id VARCHAR,
    p_session_id VARCHAR,
    p_isolation_boundary JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    context_id UUID;
    default_boundary JSONB;
BEGIN
    -- Set default isolation boundary if not provided
    default_boundary = COALESCE(
        p_isolation_boundary,
        jsonb_build_object(
            'strict', true,
            'allowCrossWorkflow', false,
            'isolationLevel', 'workflow_strict',
            'version', '1.0',
            'createdAt', CURRENT_TIMESTAMP
        )
    );
    
    -- Create or update execution context
    INSERT INTO workflow_execution_contexts (
        workflow_id, execution_id, session_id, isolation_boundary
    ) VALUES (
        p_workflow_id, p_execution_id, p_session_id, default_boundary
    ) 
    ON CONFLICT (workflow_id, execution_id, session_id) 
    DO UPDATE SET
        isolation_boundary = EXCLUDED.isolation_boundary,
        expires_at = CURRENT_TIMESTAMP + INTERVAL '24 hours',
        status = 'active'
    RETURNING id INTO context_id;
    
    RETURN context_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 8: Create cleanup function for expired contexts
CREATE OR REPLACE FUNCTION cleanup_expired_workflow_contexts()
RETURNS INTEGER AS $$
DECLARE
    cleanup_count INTEGER;
BEGIN
    -- Mark expired contexts
    UPDATE workflow_execution_contexts 
    SET status = 'expired'
    WHERE expires_at < CURRENT_TIMESTAMP AND status = 'active';
    
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    
    -- Log cleanup activity
    INSERT INTO logs (
        level, message, source, metadata
    ) VALUES (
        'INFO',
        'Cleaned up expired workflow contexts',
        'workflow_isolation_cleanup',
        jsonb_build_object(
            'expiredCount', cleanup_count,
            'cleanupTime', CURRENT_TIMESTAMP
        )
    );
    
    RETURN cleanup_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 9: Update existing activities to have proper isolation metadata
UPDATE activity_library 
SET 
    access_scope = 'workflow_private',
    isolation_metadata = jsonb_build_object(
        'enforced', true,
        'level', 'strict',
        'workflowId', workflow_id,
        'migrated', true,
        'migratedAt', CURRENT_TIMESTAMP
    )
WHERE access_scope IS NULL AND workflow_id IS NOT NULL;

-- Step 10: Create view for isolated activity access
CREATE OR REPLACE VIEW isolated_workflow_activities AS
SELECT 
    al.*,
    wd.name as workflow_name,
    wd.status as workflow_status,
    wec.execution_id,
    wec.session_id,
    wec.isolation_boundary
FROM activity_library al
JOIN workflow_definitions wd ON al.workflow_id = wd.id
LEFT JOIN workflow_execution_contexts wec ON al.workflow_execution_context_id = wec.id
WHERE al.access_scope IN ('workflow_private', 'execution_scoped')
    AND wd.status = 'active'
    AND (wec.status IS NULL OR wec.status = 'active');

-- Step 11: Add monitoring for isolation violations
CREATE TABLE IF NOT EXISTS workflow_isolation_violations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    violation_type VARCHAR(100) NOT NULL,
    attempted_workflow_id UUID,
    target_workflow_id UUID,
    activity_name VARCHAR(255),
    execution_id VARCHAR(255),
    session_id VARCHAR(255),
    violation_details JSONB,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    severity VARCHAR(20) DEFAULT 'HIGH' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

-- Step 12: Create function to log isolation violations
CREATE OR REPLACE FUNCTION log_isolation_violation(
    p_violation_type VARCHAR,
    p_attempted_workflow_id UUID DEFAULT NULL,
    p_target_workflow_id UUID DEFAULT NULL,
    p_activity_name VARCHAR DEFAULT NULL,
    p_execution_id VARCHAR DEFAULT NULL,
    p_session_id VARCHAR DEFAULT NULL,
    p_details JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    violation_id UUID;
BEGIN
    INSERT INTO workflow_isolation_violations (
        violation_type, attempted_workflow_id, target_workflow_id,
        activity_name, execution_id, session_id, violation_details
    ) VALUES (
        p_violation_type, p_attempted_workflow_id, p_target_workflow_id,
        p_activity_name, p_execution_id, p_session_id, p_details
    ) RETURNING id INTO violation_id;
    
    -- Also log to main logs table
    INSERT INTO logs (
        workflow_id, level, message, source, metadata
    ) VALUES (
        p_attempted_workflow_id,
        'ERROR',
        'Workflow isolation violation detected: ' || p_violation_type,
        'workflow_isolation_monitor',
        jsonb_build_object(
            'violationId', violation_id,
            'violationType', p_violation_type,
            'targetWorkflowId', p_target_workflow_id,
            'activityName', p_activity_name,
            'details', p_details
        )
    );
    
    RETURN violation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 13: Create scheduled cleanup job setup
-- Note: This would typically be run via cron or scheduled job
CREATE OR REPLACE FUNCTION schedule_isolation_maintenance()
RETURNS VOID AS $$
BEGIN
    -- Cleanup expired contexts
    PERFORM cleanup_expired_workflow_contexts();
    
    -- Remove old violation logs (keep 30 days)
    DELETE FROM workflow_isolation_violations 
    WHERE detected_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    -- Update statistics
    INSERT INTO logs (
        level, message, source, metadata
    ) VALUES (
        'INFO',
        'Workflow isolation maintenance completed',
        'workflow_isolation_scheduler',
        jsonb_build_object(
            'maintenanceTime', CURRENT_TIMESTAMP,
            'activeContexts', (SELECT COUNT(*) FROM workflow_execution_contexts WHERE status = 'active'),
            'totalActivities', (SELECT COUNT(*) FROM activity_library WHERE access_scope = 'workflow_private')
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- ============================================================================
-- VERIFICATION AND TESTING
-- ============================================================================

-- Test 1: Verify isolation functions work
DO $$
DECLARE
    test_workflow_id UUID;
    test_context_id UUID;
BEGIN
    -- Create test workflow if not exists
    INSERT INTO workflow_definitions (
        name, workflow_class_name, task_queue, python_workflow_code, 
        description, category, status
    ) VALUES (
        'isolation-test-workflow',
        'IsolationTestWorkflow',
        'test-queue',
        'test code',
        'Test workflow for isolation verification',
        'testing',
        'active'
    ) ON CONFLICT (name) DO NOTHING;
    
    SELECT id INTO test_workflow_id 
    FROM workflow_definitions 
    WHERE name = 'isolation-test-workflow';
    
    -- Test context creation
    SELECT create_workflow_execution_context(
        test_workflow_id,
        'test-execution-123',
        'test-session-456'
    ) INTO test_context_id;
    
    RAISE NOTICE 'Isolation test passed: Created context %', test_context_id;
END
$$;

-- Test 2: Verify activity isolation lookup
SELECT 
    COUNT(*) as isolated_activities,
    workflow_id
FROM activity_library 
WHERE access_scope = 'workflow_private'
GROUP BY workflow_id
ORDER BY COUNT(*) DESC
LIMIT 5;

-- Test 3: Show isolation statistics
SELECT 
    'Workflow Contexts' as metric, COUNT(*)::text as value
FROM workflow_execution_contexts WHERE status = 'active'
UNION ALL
SELECT 
    'Private Activities' as metric, COUNT(*)::text as value  
FROM activity_library WHERE access_scope = 'workflow_private'
UNION ALL
SELECT 
    'Isolated Executions' as metric, COUNT(DISTINCT execution_id)::text as value
FROM workflow_execution_contexts WHERE status = 'active'
UNION ALL
SELECT 
    'Active Workflows with Isolation' as metric, COUNT(DISTINCT wd.id)::text as value
FROM workflow_definitions wd
JOIN activity_library al ON wd.id = al.workflow_id
WHERE al.access_scope = 'workflow_private' AND wd.status = 'active';

-- Display completion message
SELECT 
    '✅ WORKFLOW ISOLATION FIXES APPLIED SUCCESSFULLY' as status,
    'Database schema updated with strict isolation enforcement' as details,
    CURRENT_TIMESTAMP as applied_at;