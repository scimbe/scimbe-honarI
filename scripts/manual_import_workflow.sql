-- Import the latest generated workflow into workflow_chains table
-- This script manually creates a workflow chain from the generated workflow

INSERT INTO workflow_chains (
  id,
  name,
  description,
  execution_mode,
  chain_definition,
  workflows,
  data_mapping,
  communication_patterns,
  metadata,
  created_by
) 
SELECT 
  'chain_' || EXTRACT(EPOCH FROM NOW()) || '_' || LEFT(MD5(RANDOM()::TEXT), 9) as id,
  'Circle Area Calculator (Generated)' as name,
  'Imported from generated workflow: ' || requirements as description,
  'sequential' as execution_mode,
  JSON_BUILD_OBJECT(
    'nodes', JSON_BUILD_ARRAY(
      JSON_BUILD_OBJECT(
        'id', 'start_node',
        'type', 'start',
        'position', JSON_BUILD_OBJECT('x', 100, 'y', 200),
        'data', JSON_BUILD_OBJECT(
          'label', 'Start',
          'description', 'Workflow start'
        )
      ),
      JSON_BUILD_OBJECT(
        'id', 'circle_calc_node', 
        'type', 'activity',
        'position', JSON_BUILD_OBJECT('x', 300, 'y', 200),
        'data', JSON_BUILD_OBJECT(
          'label', COALESCE(temporal_workflow_class, 'Circle Area Calculator'),
          'description', requirements,
          'activityType', 'custom',
          'config', JSON_BUILD_OBJECT(
            'generated', true,
            'sourceWorkflowId', workflow_id,
            'qualityScore', quality_score,
            'language', target_language
          )
        )
      ),
      JSON_BUILD_OBJECT(
        'id', 'end_node',
        'type', 'end', 
        'position', JSON_BUILD_OBJECT('x', 500, 'y', 200),
        'data', JSON_BUILD_OBJECT(
          'label', 'End',
          'description', 'Workflow end'
        )
      )
    ),
    'edges', JSON_BUILD_ARRAY(
      JSON_BUILD_OBJECT(
        'id', 'edge_start_calc',
        'source', 'start_node',
        'target', 'circle_calc_node',
        'type', 'default'
      ),
      JSON_BUILD_OBJECT(
        'id', 'edge_calc_end',
        'source', 'circle_calc_node',
        'target', 'end_node', 
        'type', 'default'
      )
    )
  ) as chain_definition,
  '[]'::jsonb as workflows,
  '{}'::jsonb as data_mapping,
  '{}'::jsonb as communication_patterns,
  JSON_BUILD_OBJECT(
    'version', '1.0',
    'author', 'Workflow Automation',
    'tags', ARRAY['generated', 'circle', 'area', 'math'],
    'sourceWorkflowId', workflow_id,
    'qualityScore', quality_score,
    'imported', true,
    'importedAt', NOW()
  ) as metadata,
  'import_script' as created_by
FROM generated_workflows 
ORDER BY created_at DESC 
LIMIT 1;

-- Show the result
SELECT 
  id,
  name,
  description,
  created_at,
  JSON_EXTRACT_PATH_TEXT(metadata, 'sourceWorkflowId') as source_workflow_id,
  JSON_EXTRACT_PATH_TEXT(metadata, 'qualityScore') as quality_score
FROM workflow_chains 
WHERE created_by = 'import_script'
ORDER BY created_at DESC 
LIMIT 1;