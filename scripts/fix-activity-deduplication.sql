-- Comprehensive Activity Deduplication Fix
-- Resolves duplicate activity entries in dragdrop-workspace UI

-- Step 1: Create URL decode function (if not exists)
CREATE OR REPLACE FUNCTION url_decode(input text) RETURNS text AS $$
BEGIN
    RETURN replace(replace(replace(replace(replace(
        input, '%20', ' '), '%21', '!'), '%40', '@'), '%2B', '+'), '%2F', '/');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 2: Create comprehensive activity cleanup procedure
CREATE OR REPLACE FUNCTION cleanup_activity_duplicates()
RETURNS void AS $$
DECLARE
    activity_record RECORD;
    url_encoded_name TEXT;
    regular_name TEXT;
BEGIN
    -- Log start of cleanup
    RAISE NOTICE 'Starting activity deduplication cleanup...';
    
    -- Remove URL-encoded duplicates where regular versions exist
    FOR activity_record IN 
        SELECT activity_type 
        FROM activity_configurations 
        WHERE activity_type LIKE '%20%'
    LOOP
        regular_name := url_decode(activity_record.activity_type);
        
        -- Check if regular version exists
        IF EXISTS (SELECT 1 FROM activity_configurations WHERE activity_type = regular_name) THEN
            -- Delete the URL-encoded version
            DELETE FROM activity_configurations WHERE activity_type = activity_record.activity_type;
            RAISE NOTICE 'Removed duplicate: %', activity_record.activity_type;
        END IF;
    END LOOP;
    
    -- Update trigger to be more intelligent
    DROP TRIGGER IF EXISTS activity_url_encoding_trigger ON activity_configurations;
    
    RAISE NOTICE 'Activity deduplication cleanup completed.';
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create intelligent configuration lookup function
CREATE OR REPLACE FUNCTION get_activity_config_smart(input_activity_type text)
RETURNS TABLE(configuration jsonb, description text, category character varying(50)) AS $$
BEGIN
    -- Try exact match first
    RETURN QUERY
    SELECT ac.configuration, ac.description, ac.category
    FROM activity_configurations ac
    WHERE ac.activity_type = input_activity_type
    LIMIT 1;
    
    -- If no exact match and input is URL-encoded, try decoded version
    IF NOT FOUND AND input_activity_type LIKE '%20%' THEN
        RETURN QUERY
        SELECT ac.configuration, ac.description, ac.category
        FROM activity_configurations ac
        WHERE ac.activity_type = url_decode(input_activity_type)
        LIMIT 1;
    END IF;
    
    -- If still not found and input is NOT URL-encoded, try encoded version
    IF NOT FOUND AND input_activity_type NOT LIKE '%20%' AND input_activity_type LIKE '% %' THEN
        RETURN QUERY
        SELECT ac.configuration, ac.description, ac.category
        FROM activity_configurations ac
        WHERE ac.activity_type = replace(input_activity_type, ' ', '%20')
        LIMIT 1;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create smart activity listing function
CREATE OR REPLACE FUNCTION get_activity_types_smart()
RETURNS TABLE(type text, description text, category character varying(50)) AS $$
BEGIN
    RETURN QUERY
    WITH deduplicated_activities AS (
        SELECT DISTINCT ON (COALESCE(url_decode(activity_type), activity_type))
            CASE 
                WHEN activity_type LIKE '%20%' THEN url_decode(activity_type)
                ELSE activity_type
            END as clean_type,
            configuration,
            description,
            category,
            -- Prefer non-URL-encoded versions
            CASE WHEN activity_type LIKE '%20%' THEN 1 ELSE 0 END as priority
        FROM activity_configurations
        ORDER BY COALESCE(url_decode(activity_type), activity_type), priority
    )
    SELECT 
        da.clean_type,
        da.description,
        da.category
    FROM deduplicated_activities da
    ORDER BY da.clean_type;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Execute cleanup
SELECT cleanup_activity_duplicates();

-- Step 6: Verify results
SELECT 'Total activity configurations:' as info, COUNT(*)::text as count 
FROM activity_configurations
UNION ALL
SELECT 'URL-encoded entries:' as info, COUNT(*)::text as count 
FROM activity_configurations WHERE activity_type LIKE '%20%'
UNION ALL
SELECT 'Unique activity types:' as info, COUNT(DISTINCT url_decode(activity_type))::text as count 
FROM activity_configurations;