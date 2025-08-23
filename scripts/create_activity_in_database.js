#!/usr/bin/env node

/**
 * CREATE ACTIVITIES IN DATABASE
 * Creates sample activities in PostgreSQL for dynamic loading
 */

const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'temporal_ai_platform',
  user: 'temporal',
  password: 'temporal'
});

async function createActivitiesInDatabase() {
  console.log('🎯 CREATING ACTIVITIES IN POSTGRESQL DATABASE');
  console.log('==============================================\n');

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Create workflow first
    const workflowId = 'circle-area-calculator';
    await client.query(`
      INSERT INTO workflow_definitions (id, name, description, definition, steps) 
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        name = $2,
        description = $3,
        definition = $4,
        steps = $5
    `, [
      workflowId,
      'Circle Area Calculator',
      'Dynamically loaded circle area calculation workflow',
      JSON.stringify({ type: 'sequential', pattern: 'input-processing-calculation' }),
      JSON.stringify([
        { id: 'validate_input', order: 1 },
        { id: 'calculate_area', order: 2 }
      ])
    ]);

    console.log('✅ Created/updated workflow definition');

    // Check if activity_library table exists and has the right structure
    const tableCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'activity_library'
      ORDER BY ordinal_position
    `);

    if (tableCheck.rows.length === 0) {
      console.log('🔨 Creating activity_library table...');
      await client.query(`
        CREATE TABLE activity_library (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(100),
          code TEXT,
          input_schema JSONB,
          output_schema JSONB,
          execution_order INTEGER DEFAULT 0,
          workflow_id VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('✅ Created activity_library table');
    } else {
      console.log('✅ Activity_library table exists');
    }

    // Create validate_input activity
    await client.query(`
      INSERT INTO activity_library (id, name, type, code, input_schema, output_schema, execution_order, workflow_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        name = $2,
        type = $3,
        code = $4,
        input_schema = $5,
        output_schema = $6,
        execution_order = $7,
        workflow_id = $8
    `, [
      'validate_input',
      'validate_input', 
      'validation',
      `
// Dynamic Activity: validate_input
function validateInput(input) {
  const radius = input.parameters?.radius || input.radius || 5;
  const unit = input.parameters?.unit || input.unit || 'units';
  
  if (typeof radius !== 'number' || radius <= 0) {
    throw new Error('Invalid radius: must be positive number');
  }
  
  return {
    radius: radius,
    unit: unit,
    validated: true,
    timestamp: Date.now()
  };
}
`,
      JSON.stringify({
        type: 'object',
        properties: {
          radius: { type: 'number' },
          unit: { type: 'string' }
        }
      }),
      JSON.stringify({
        type: 'object', 
        properties: {
          radius: { type: 'number' },
          unit: { type: 'string' },
          validated: { type: 'boolean' }
        }
      }),
      1,
      workflowId
    ]);

    // Create calculate_area activity
    await client.query(`
      INSERT INTO activity_library (id, name, type, code, input_schema, output_schema, execution_order, workflow_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        name = $2,
        type = $3,
        code = $4,
        input_schema = $5,
        output_schema = $6,
        execution_order = $7,
        workflow_id = $8
    `, [
      'calculate_area',
      'calculate_area',
      'calculation', 
      `
// Dynamic Activity: calculate_area  
function calculateArea(input, previousData) {
  const radius = previousData?.validated_radius?.value || input.radius || 5;
  
  if (typeof radius !== 'number' || radius <= 0) {
    throw new Error('Invalid radius for area calculation');
  }
  
  const area = Math.PI * radius * radius;
  const roundedArea = Math.round(area * 10000) / 10000;
  
  return {
    area: roundedArea,
    radius: radius,
    formula: 'π × r²',
    calculation: \`π × \${radius}² = \${roundedArea}\`,
    timestamp: Date.now()
  };
}
`,
      JSON.stringify({
        type: 'object',
        properties: {
          radius: { type: 'number' }
        }
      }),
      JSON.stringify({
        type: 'object',
        properties: {
          area: { type: 'number' },
          radius: { type: 'number' },
          formula: { type: 'string' }
        }
      }),
      2,
      workflowId
    ]);

    console.log('✅ Created/updated activities in database:');
    console.log('   1. validate_input (validation, order: 1)');
    console.log('   2. calculate_area (calculation, order: 2)');

    // Verify creation
    const activities = await client.query(`
      SELECT id, name, type, execution_order, workflow_id
      FROM activity_library 
      WHERE workflow_id = $1
      ORDER BY execution_order
    `, [workflowId]);

    console.log('\n📊 VERIFICATION - Activities in database:');
    console.log('==========================================');
    activities.rows.forEach(activity => {
      console.log(`  ${activity.execution_order}. ${activity.name} (${activity.type})`);
      console.log(`     ID: ${activity.id}`);
      console.log(`     Workflow: ${activity.workflow_id}`);
    });

    console.log('\n🎯 DATABASE SETUP COMPLETE!');
    console.log('Activities are now available for dynamic loading by Temporal worker');
    console.log('Workflow ID: circle-area-calculator');

  } catch (error) {
    console.error('❌ Error creating activities:', error);
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  createActivitiesInDatabase()
    .then(() => {
      console.log('\n✅ Activities successfully created in PostgreSQL!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed to create activities:', error.message);
      process.exit(1);
    });
}

module.exports = { createActivitiesInDatabase };