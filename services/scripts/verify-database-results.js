#!/usr/bin/env node

/**
 * Database Results Verification Script
 * Verifies the successful execution of workflow-database-generator.js
 */

const { Client } = require('pg');

async function verifyDatabaseResults() {
  const client = new Client({
    user: process.env.DB_USER || 'temporal',
    host: process.env.DB_HOST || 'localhost', 
    database: process.env.DB_NAME || 'temporal_ai_platform',
    password: process.env.DB_PASSWORD || 'temporal',
    port: process.env.DB_PORT || 5432,
  });

  try {
    await client.connect();
    console.log('🔍 Verifying Database Results...\n');

    // Check workflow_definitions
    const workflowCount = await client.query('SELECT COUNT(*) as count FROM workflow_definitions');
    console.log(`📊 Workflows in database: ${workflowCount.rows[0].count}`);

    // Check activity_library
    const activityCount = await client.query('SELECT COUNT(*) as count FROM activity_library');
    console.log(`📊 Activities in database: ${activityCount.rows[0].count}`);

    // Check generated_workflows
    const generatedCount = await client.query('SELECT COUNT(*) as count FROM generated_workflows');
    console.log(`📊 Generated workflow instances: ${generatedCount.rows[0].count}`);

    // Check categories distribution
    console.log('\n📋 Workflow Categories:');
    const categories = await client.query(`
      SELECT category, COUNT(*) as count 
      FROM workflow_definitions 
      WHERE category IS NOT NULL 
      GROUP BY category 
      ORDER BY count DESC
    `);
    
    for (const cat of categories.rows) {
      console.log(`  - ${cat.category}: ${cat.count} workflows`);
    }

    // Check activity types
    console.log('\n🔧 Activity Types:');
    const activityTypes = await client.query(`
      SELECT type, COUNT(*) as count 
      FROM activity_library 
      GROUP BY type 
      ORDER BY count DESC
    `);
    
    for (const type of activityTypes.rows) {
      console.log(`  - ${type.type}: ${type.count} activities`);
    }

    // Check Redis integration
    console.log('\n🔄 Redis Integration Check:');
    const redisActivities = await client.query(`
      SELECT COUNT(*) as count 
      FROM activity_library 
      WHERE redis_config IS NOT NULL 
      AND redis_config != '{}'
    `);
    console.log(`  - Activities with Redis config: ${redisActivities.rows[0].count}`);

    // Sample workflow check
    console.log('\n📋 Sample Workflows:');
    const sampleWorkflows = await client.query(`
      SELECT name, display_name, category 
      FROM workflow_definitions 
      LIMIT 5
    `);
    
    for (const workflow of sampleWorkflows.rows) {
      console.log(`  - ${workflow.name} (${workflow.display_name}) - Category: ${workflow.category}`);
    }

    // Sample activities check
    console.log('\n🛠️  Sample Activities:');
    const sampleActivities = await client.query(`
      SELECT name, type, category 
      FROM activity_library 
      LIMIT 5
    `);
    
    for (const activity of sampleActivities.rows) {
      console.log(`  - ${activity.name} - Type: ${activity.type}, Category: ${activity.category}`);
    }

    console.log('\n✅ Database verification complete!');
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  verifyDatabaseResults();
}