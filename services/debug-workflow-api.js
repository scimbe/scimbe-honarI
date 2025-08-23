/**
 * Debug Workflow API Issues
 */

const { Pool } = require('pg');

const dbPool = new Pool({
  host: process.env.DB_HOST || 'temporal-postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'temporal',
  user: process.env.DB_USER || 'temporal',
  password: process.env.DB_PASSWORD || 'temporal',
  ssl: false
});

async function debugWorkflowAPI() {
  console.log('🔍 DEBUGGING WORKFLOW API ISSUES');
  console.log('═══════════════════════════════════════════════════════════════');
  
  try {
    // Test 1: Direct database query 
    console.log('📊 Test 1: Direct database query');
    const allWorkflows = await dbPool.query(`
      SELECT id, name, status, created_by, created_at 
      FROM workflow_definitions 
      ORDER BY created_at DESC
    `);
    console.log(`   Found ${allWorkflows.rows.length} workflows in database:`);
    allWorkflows.rows.forEach((w, i) => {
      console.log(`   ${i + 1}. ${w.name} (${w.status}) by ${w.created_by}`);
    });

    // Test 2: API default filter (status = 'active')
    console.log('\n📊 Test 2: API default filter (status = active)');
    const activeWorkflows = await dbPool.query(`
      SELECT COUNT(*) as total FROM workflow_definitions WHERE status = $1
    `, ['active']);
    console.log(`   Active workflows count: ${activeWorkflows.rows[0].total}`);

    // Test 3: Simulate exact API query
    console.log('\n📊 Test 3: Simulate exact API query');
    const page = 1;
    const limit = 50;
    const status = 'active';
    const sort = 'usage_count';
    const order = 'DESC';
    const offset = (page - 1) * limit;
    
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 1;
    
    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    
    console.log(`   WHERE clause: ${whereClause}`);
    console.log(`   Parameters: ${JSON.stringify(params)}`);
    console.log(`   Sort: ${sort} ${order}`);
    
    const countResult = await dbPool.query(`
      SELECT COUNT(*) as total FROM workflow_definitions WHERE ${whereClause}
    `, params);
    console.log(`   Count result: ${countResult.rows[0].total}`);
    
    const result = await dbPool.query(`
      SELECT id, name, status, created_by, usage_count
      FROM workflow_definitions 
      WHERE ${whereClause}
      ORDER BY ${sort} ${order}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);
    
    console.log(`   Query returned ${result.rows.length} workflows:`);
    result.rows.forEach((w, i) => {
      console.log(`   ${i + 1}. ${w.name} (usage_count: ${w.usage_count})`);
    });

    // Test 4: Check specific workflow
    console.log('\n📊 Test 4: Check specific demo workflow');
    const demoWorkflow = await dbPool.query(`
      SELECT id, name, status, usage_count, created_by
      FROM workflow_definitions 
      WHERE id = 'multiply-subtract-workflow-1755776139743'
    `);
    
    if (demoWorkflow.rows.length > 0) {
      const w = demoWorkflow.rows[0];
      console.log(`   Demo workflow found: ${w.name}`);
      console.log(`   Status: ${w.status}`);
      console.log(`   Usage count: ${w.usage_count}`);
      console.log(`   Created by: ${w.created_by}`);
    } else {
      console.log('   Demo workflow NOT found!');
    }

    // Test 5: Check sorting issue
    console.log('\n📊 Test 5: Check if sorting by usage_count is the issue');
    const sortedByCreated = await dbPool.query(`
      SELECT id, name, status, usage_count, created_at
      FROM workflow_definitions 
      WHERE status = 'active'
      ORDER BY created_at DESC
    `);
    
    console.log(`   Sorted by created_at: ${sortedByCreated.rows.length} workflows`);
    sortedByCreated.rows.forEach((w, i) => {
      console.log(`   ${i + 1}. ${w.name} (${w.created_at})`);
    });

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await dbPool.end();
  }
}

// Run debug
debugWorkflowAPI();