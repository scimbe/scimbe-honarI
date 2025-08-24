#!/usr/bin/env node

/**
 * Database Cleanup Script
 * Deletes all existing workflows and activities for clean setup
 */

const { Client } = require('pg');

async function cleanupDatabase() {
  const client = new Client({
    user: process.env.DB_USER || 'temporal',
    host: process.env.DB_HOST || 'localhost', 
    database: process.env.DB_NAME || 'temporal_ai_platform_clean',
    password: process.env.DB_PASSWORD || 'temporal',
    port: process.env.DB_PORT || 5432,
  });

  try {
    await client.connect();
    console.log('🧹 Starting Database Cleanup...\n');

    // Get current counts
    const workflowCount = await client.query('SELECT COUNT(*) as count FROM workflow_definitions');
    const activityCount = await client.query('SELECT COUNT(*) as count FROM activity_library');
    const generatedCount = await client.query('SELECT COUNT(*) as count FROM generated_workflows');
    const chainsCount = await client.query('SELECT COUNT(*) as count FROM workflow_chains');
    const templatesCount = await client.query('SELECT COUNT(*) as count FROM workflow_templates');

    console.log(`📊 Current database state:`);
    console.log(`  - Workflows: ${workflowCount.rows[0].count}`);
    console.log(`  - Activities: ${activityCount.rows[0].count}`);
    console.log(`  - Generated instances: ${generatedCount.rows[0].count}`);
    console.log(`  - Workflow chains: ${chainsCount.rows[0].count}`);
    console.log(`  - Templates: ${templatesCount.rows[0].count}\n`);

    // Delete in correct order (respecting foreign key constraints)
    console.log('🗑️  Deleting workflow_chains...');
    await client.query('DELETE FROM workflow_chains');
    console.log('✅ Workflow chains deleted');

    console.log('🗑️  Deleting workflow_templates...');
    await client.query('DELETE FROM workflow_templates');
    console.log('✅ Workflow templates deleted');

    console.log('🗑️  Deleting generated_workflows...');
    await client.query('DELETE FROM generated_workflows');
    console.log('✅ Generated workflows deleted');

    console.log('🗑️  Deleting workflow_definitions...');
    await client.query('DELETE FROM workflow_definitions');
    console.log('✅ Workflow definitions deleted');

    console.log('🗑️  Deleting activity_library...');
    await client.query('DELETE FROM activity_library');
    console.log('✅ Activities deleted');

    // Reset sequences if they exist
    console.log('🔄 Resetting sequences...');
    try {
      await client.query('ALTER SEQUENCE workflow_definitions_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE activity_library_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE generated_workflows_id_seq RESTART WITH 1');
      console.log('✅ Sequences reset');
    } catch (error) {
      console.log('ℹ️  No sequences to reset (using VARCHAR IDs)');
    }

    // Verify cleanup
    const finalWorkflowCount = await client.query('SELECT COUNT(*) as count FROM workflow_definitions');
    const finalActivityCount = await client.query('SELECT COUNT(*) as count FROM activity_library');
    const finalGeneratedCount = await client.query('SELECT COUNT(*) as count FROM generated_workflows');
    const finalChainsCount = await client.query('SELECT COUNT(*) as count FROM workflow_chains');
    const finalTemplatesCount = await client.query('SELECT COUNT(*) as count FROM workflow_templates');

    console.log(`\n📊 Final database state:`);
    console.log(`  - Workflows: ${finalWorkflowCount.rows[0].count}`);
    console.log(`  - Activities: ${finalActivityCount.rows[0].count}`);
    console.log(`  - Generated instances: ${finalGeneratedCount.rows[0].count}`);
    console.log(`  - Workflow chains: ${finalChainsCount.rows[0].count}`);
    console.log(`  - Templates: ${finalTemplatesCount.rows[0].count}`);

    console.log('\n🎉 Database cleanup complete! Ready for fresh workflow generation.');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  cleanupDatabase();
}
