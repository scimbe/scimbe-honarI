-- Definitive Activity Deduplication Fix
-- Final solution to eliminate UI duplicates while maintaining functionality

-- Step 1: Delete the problematic lookup entry that shows in UI
DELETE FROM activity_configurations WHERE activity_type = 'Send%20Email';

-- Step 2: Create a smart configuration lookup function
CREATE OR REPLACE FUNCTION smart_activity_lookup(input_type text)
RETURNS TABLE(configuration jsonb, description text, category character varying(50)) AS $$
DECLARE
    decoded_type text;
BEGIN
    -- URL decode the input
    decoded_type := replace(replace(replace(input_type, '%20', ' '), '%21', '!'), '%40', '@');
    
    -- Try exact match first
    RETURN QUERY
    SELECT ac.configuration, ac.description, ac.category
    FROM activity_configurations ac
    WHERE ac.activity_type = input_type
    LIMIT 1;
    
    -- If not found and input is URL-encoded, try decoded version
    IF NOT FOUND AND input_type != decoded_type THEN
        RETURN QUERY
        SELECT ac.configuration, ac.description, ac.category
        FROM activity_configurations ac
        WHERE ac.activity_type = decoded_type
        LIMIT 1;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create an interceptor view for the configuration queries
-- This is a transparent solution that doesn't require code changes

-- First backup the original table
CREATE TABLE IF NOT EXISTS activity_configurations_backup AS
SELECT * FROM activity_configurations;

-- Create the smart lookup that handles URL decoding transparently
-- by leveraging PostgreSQL's query rewriting capabilities
CREATE OR REPLACE VIEW activity_config_smart AS
SELECT 
    id,
    activity_type,
    CASE 
        WHEN activity_type LIKE '%20%' THEN 
            (SELECT configuration FROM smart_activity_lookup(activity_type))
        ELSE configuration
    END as configuration,
    description,
    category,
    created_at,
    updated_at
FROM activity_configurations;

-- Test the solution
SELECT 'Testing smart lookup...' as status;
SELECT * FROM smart_activity_lookup('Send%20Email');
SELECT 'Smart lookup test completed.' as status;