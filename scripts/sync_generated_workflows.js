#!/usr/bin/env node

/**
 * Script to sync generated workflows from temporal_ai_platform.generated_workflows
 * to temporal.workflow_chains so they appear in the editors
 */

const { Client } = require('pg');

// Database configurations
const sourceDb = {
  host: 'localhost',
  port: 5432,
  database: 'temporal_ai_platform',
  user: 'temporal',
  password: 'temporal'
};

const targetDb = {
  host: 'localhost',
  port: 5432,
  database: 'temporal',
  user: 'temporal',
  password: 'temporal'
};

async function syncWorkflows() {
  const sourceClient = new Client(sourceDb);
  const targetClient = new Client(targetDb);
  
  try {
    // Connect to both databases
    await sourceClient.connect();
    await targetClient.connect();
    
    console.log('📊 Connected to databases');
    
    // Get the latest generated workflow
    const result = await sourceClient.query(`
      SELECT 
        workflow_id,
        requirements,
        temporal_workflow_class,
        quality_score,
        target_language,
        created_at
      FROM generated_workflows 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ No generated workflows found');
      return;
    }
    
    const workflow = result.rows[0];
    console.log(`✅ Found workflow: ${workflow.workflow_id}`);
    console.log(`   Requirements: ${workflow.requirements.substring(0, 100)}...`);
    
    // Check if already imported
    const existingCheck = await targetClient.query(`
      SELECT id FROM workflow_chains 
      WHERE metadata->>'sourceWorkflowId' = $1
    `, [workflow.workflow_id]);
    
    if (existingCheck.rows.length > 0) {
      console.log('⚠️  Workflow already imported');
      return;
    }
    
    // Create workflow chain
    const chainId = `chain_${Date.now()}_generated`;
    const nodes = [
      {
        id: 'start_node',
        type: 'start',
        position: { x: 100, y: 200 },
        data: {
          label: 'Start',
          description: 'Workflow start'
        }
      },
      {
        id: 'circle_calc',
        type: 'activity',
        position: { x: 300, y: 200 },
        data: {
          label: workflow.temporal_workflow_class || 'Circle Area Calculator',
          description: workflow.requirements,
          activityType: 'custom',
          config: {
            generated: true,
            qualityScore: workflow.quality_score,
            language: workflow.target_language
          }
        }
      },
      {
        id: 'end_node',
        type: 'end',
        position: { x: 500, y: 200 },
        data: {
          label: 'End',
          description: 'Workflow end'
        }
      }
    ];
    
    const edges = [
      {
        id: 'edge1',
        source: 'start_node',
        target: 'circle_calc',
        type: 'default'
      },
      {
        id: 'edge2',
        source: 'circle_calc',
        target: 'end_node',
        type: 'default'
      }
    ];
    
    // Insert into workflow_chains
    await targetClient.query(`
      INSERT INTO workflow_chains (
        id, name, description, execution_mode,
        chain_definition, workflows, data_mapping,
        communication_patterns, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      chainId,
      'Circle Area Calculator (Generated)',
      `Generated workflow: ${workflow.requirements}`,
      'sequential',
      JSON.stringify({ nodes, edges }),
      JSON.stringify([]),
      JSON.stringify({}),
      JSON.stringify({}),
      JSON.stringify({
        sourceWorkflowId: workflow.workflow_id,
        qualityScore: workflow.quality_score,
        targetLanguage: workflow.target_language,
        imported: true,
        importedAt: new Date().toISOString()
      }),
      'sync_script'
    ]);
    
    console.log(`✅ Workflow imported successfully!`);
    console.log(`   Chain ID: ${chainId}`);
    console.log(`   View at: http://localhost:3000`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

// Run the sync
if (require.main === module) {
  syncWorkflows();
}

module.exports = { syncWorkflows };