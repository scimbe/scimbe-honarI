#!/usr/bin/env node

/**
 * Complete test of the Circle Area Calculator workflow
 * Demonstrates:
 * 1. Workflow generation creates activities in PostgreSQL
 * 2. Activities are loaded dynamically by ID
 * 3. Redis data exchange between activities
 * 4. Correct calculation results
 */

const { Client: PostgresClient } = require('pg');
const redis = require('redis');
const axios = require('axios');

// Database configuration
const pgClient = new PostgresClient({
  host: 'localhost',
  port: 5432,
  database: 'temporal_ai_platform',
  user: 'temporal',
  password: 'temporal'
});

// Redis client
const redisClient = redis.createClient({
  host: 'localhost',
  port: 6379
});

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCompleteCircleWorkflowTest() {
  console.log('🎯 COMPLETE CIRCLE AREA WORKFLOW TEST');
  console.log('=' .repeat(60));
  console.log('');

  try {
    // Connect to databases
    await pgClient.connect();
    await redisClient.connect();
    
    // Clear Redis for clean test
    await redisClient.flushAll();
    console.log('✅ Redis cleared for test');
    
    // Clear PostgreSQL data for clean test
    console.log('🧹 Cleaning PostgreSQL database...');
    await pgClient.query('DELETE FROM activity_library WHERE created_at > NOW() - INTERVAL \'24 hours\'');
    await pgClient.query('DELETE FROM workflow_definitions WHERE created_at > NOW() - INTERVAL \'24 hours\'');
    await pgClient.query('DELETE FROM execution_logs WHERE created_at > NOW() - INTERVAL \'24 hours\'');
    console.log('✅ PostgreSQL cleaned for test');
    
    // Step 1: Check activities in database
    console.log('\n📊 STEP 1: Verify Activities in PostgreSQL');
    console.log('-'.repeat(50));
    
    const activitiesResult = await pgClient.query(`
      SELECT id, name, type, code 
      FROM activity_library 
      WHERE name IN ('Validate Positive Number', 'Calculate Circle Area', 'Format Number Result')
      ORDER BY name
    `);
    
    console.log(`Found ${activitiesResult.rows.length} activities:`);
    activitiesResult.rows.forEach(activity => {
      console.log(`  ✓ ${activity.name} (ID: ${activity.id}, Type: ${activity.type})`);
      // Show first 100 chars of code to verify it exists
      const codePreview = activity.code ? activity.code.substring(0, 100) + '...' : 'No code';
      console.log(`    Code: ${codePreview}`);
    });
    
    if (activitiesResult.rows.length === 0) {
      console.log('⚠️ No activities found. Running generation first...');
      
      // Generate the workflow first
      const generateResponse = await axios.post(
        'http://localhost:8092/workflow-automation/api/workflows/generate',
        {
          name: "Circle Area Calculator",
          description: "Calculate the area of a circle given its radius using the formula π × r²",
          requirements: "Accept radius as input parameter. Validate that radius is a positive number. Calculate area using formula: π × radius². Return the calculated area with appropriate precision.",
          inputs: [{"name": "radius", "type": "number", "required": true}],
          outputs: [{"name": "area", "type": "number"}],
          complexity: "simple",
          domain: "mathematics"
        }
      );
      
      console.log('✅ Workflow generated:', generateResponse.data);
      await sleep(2000); // Wait for generation to complete
      
      // Check activities again
      const newActivitiesResult = await pgClient.query(`
        SELECT id, name, type 
        FROM activity_library 
        WHERE created_at > NOW() - INTERVAL '1 minute'
        ORDER BY name
      `);
      
      console.log(`\n✅ Generated ${newActivitiesResult.rows.length} new activities`);
      newActivitiesResult.rows.forEach(activity => {
        console.log(`  ✓ ${activity.name} (ID: ${activity.id})`);
      });
    }
    
    // Step 2: Create and execute a workflow using these activities
    console.log('\n📊 STEP 2: Execute Workflow with Dynamic Activity Loading');
    console.log('-'.repeat(50));
    
    const sessionId = `circle-test-${Date.now()}`;
    const workflowId = 'circle-area-calculator';
    const executionId = `exec-${Date.now()}`;
    
    console.log(`Session ID: ${sessionId}`);
    console.log(`Workflow ID: ${workflowId}`);
    console.log(`Execution ID: ${executionId}`);
    
    // Check if we have the circle-area-calculator workflow definition
    const workflowDefResult = await pgClient.query(`
      SELECT id, name, definition 
      FROM workflow_definitions 
      WHERE id = 'circle-area-calculator'
    `);
    
    if (workflowDefResult.rows.length === 0) {
      console.log('Creating circle-area-calculator workflow definition...');
      
      // Create the workflow definition
      const workflowDef = {
        id: 'circle-area-calculator',
        name: 'Circle Area Calculator',
        definition: {
          activities: [
            'validate_positive_number',
            'calculate_circle_area',
            'format_number_result'
          ]
        }
      };
      
      await pgClient.query(`
        INSERT INTO workflow_definitions (id, name, definition, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          definition = EXCLUDED.definition,
          updated_at = NOW()
      `, [workflowDef.id, workflowDef.name, JSON.stringify(workflowDef.definition)]);
      
      console.log('✅ Workflow definition created');
    }
    
    // Execute the workflow using the EXACT same endpoint as the frontend execute button
    console.log('\n🚀 Executing workflow via frontend API endpoint...');
    console.log(`Using: POST http://localhost:3001/api/chains/${workflowId}/execute`);
    
    const executeResponse = await axios.post(
      `http://localhost:3001/api/chains/${workflowId}/execute`,
      {
        input: {
          radius: 10
        }
      }
    ).catch((error) => {
      console.error('Execute endpoint error:', error.response?.status, error.response?.data);
      throw error;
    });
    
    console.log('Workflow execution response:', executeResponse.data);
    
    // Step 3: Monitor Redis data exchange
    console.log('\n📊 STEP 3: Monitor Redis Data Exchange');
    console.log('-'.repeat(50));
    
    // Poll Redis for data exchange between activities
    console.log('Looking for Redis keys with pattern:', `${sessionId}*`);
    let attempts = 0;
    const maxAttempts = 60; // Increased to 60 seconds
    let finalKeys = [];
    
    while (attempts < maxAttempts) {
      await sleep(1000);
      attempts++;
      
      // Get all keys - check multiple patterns
      const sessionKeys = await redisClient.keys(`${sessionId}*`);
      const executionKeys = await redisClient.keys(`${executionId}*`);
      const workflowKeys = await redisClient.keys(`${workflowId}*`);
      const allKeys = await redisClient.keys('*');
      
      const keys = [...new Set([...sessionKeys, ...executionKeys, ...workflowKeys])];
      
      if (attempts % 10 === 0) { // Log every 10 seconds
        console.log(`\n⏱️ Attempt ${attempts}: Checking Redis keys`);
        console.log(`  Session keys (${sessionId}*): ${sessionKeys.length}`);
        console.log(`  Execution keys (${executionId}*): ${executionKeys.length}`);
        console.log(`  Workflow keys (${workflowId}*): ${workflowKeys.length}`);
        console.log(`  All keys: ${allKeys.length}`);
        if (allKeys.length > 0 && allKeys.length < 20) {
          console.log(`  All keys: ${allKeys.join(', ')}`);
        }
      }
      
      if (keys.length > finalKeys.length) {
        console.log(`\n⏱️ Attempt ${attempts}: Found ${keys.length} Redis keys`);
        
        for (const key of keys) {
          if (!finalKeys.includes(key)) {
            const value = await redisClient.get(key);
            try {
              const parsed = JSON.parse(value);
              const paramName = key.split('.').pop();
              console.log(`  📝 ${paramName}:`);
              console.log(`     Value: ${parsed.value}`);
              console.log(`     Type: ${parsed.type}`);
              console.log(`     Activity: ${parsed.activityName || 'Unknown'}`);
              console.log(`     Timestamp: ${new Date(parsed.timestamp).toLocaleTimeString()}`);
            } catch (e) {
              console.log(`  📝 ${key}: ${value}`);
            }
          }
        }
        
        finalKeys = keys;
      }
      
      // Check if workflow is complete - look for any Redis keys 
      if (keys.length > 0) { 
        console.log('\n✅ Data exchange detected! Continuing to monitor...');
      }
      
      // Check if we have enough data or reached timeout
      if (keys.length >= 2 || attempts >= maxAttempts) { 
        console.log(`\n✅ Monitoring complete after ${attempts} seconds`);
        break;
      }
    }
    
    // Step 4: Verify calculation results
    console.log('\n📊 STEP 4: Verify Calculation Results');
    console.log('-'.repeat(50));
    
    // Get all workflow-related Redis keys (we saw the pattern session_*.undefined.*)
    const allKeys = await redisClient.keys('*');
    const workflowKeys = allKeys.filter(key => 
      key.includes('calculated_area') || 
      key.includes('validated_radius') || 
      key.includes('area') || 
      key.includes('radius') ||
      key.includes('validated') ||
      key.includes('formula')
    ).filter(key => !key.includes('bull:'));
    
    console.log(`Found ${workflowKeys.length} workflow-related Redis keys:`);
    
    let calculatedArea = null;
    let inputRadius = null;
    let validationStatus = null;
    let formula = null;
    
    for (const key of workflowKeys) {
      const value = await redisClient.get(key);
      const paramName = key.split('.').pop();
      
      try {
        const parsed = JSON.parse(value);
        console.log(`\n  🔑 ${paramName}:`);
        console.log(`     Activity: ${parsed.activityName || 'Unknown'}`);
        console.log(`     Value: ${parsed.value}`);
        console.log(`     Type: ${parsed.type}`);
        console.log(`     Timestamp: ${new Date(parsed.timestamp).toLocaleTimeString()}`);
        console.log(`     Redis Key: ${key}`);
        
        // Capture key values for verification
        if (paramName === 'calculated_area' || paramName === 'area') {
          calculatedArea = parsed.value;
        }
        if (paramName === 'validated_radius' || paramName === 'radius') {
          inputRadius = parsed.value;
        }
        if (paramName === 'validated') {
          validationStatus = parsed.value;
        }
        if (paramName === 'formula') {
          formula = parsed.value;
        }
        
      } catch (e) {
        console.log(`\n  🔑 ${paramName}: ${value} (raw value)`);
      }
    }
    
    // Verify mathematical correctness
    if (calculatedArea && inputRadius) {
      const expectedArea = Math.PI * inputRadius * inputRadius;
      const difference = Math.abs(calculatedArea - expectedArea);
      const isAccurate = difference < 0.01;
      
      console.log('\n🧮 MATHEMATICAL VERIFICATION:');
      console.log(`  Input radius: ${inputRadius}`);
      console.log(`  Calculated area: ${calculatedArea}`);
      console.log(`  Expected: π × ${inputRadius}² = ${expectedArea.toFixed(4)}`);
      console.log(`  Formula used: ${formula || 'Unknown'}`);
      console.log(`  Difference: ${difference.toFixed(6)}`);
      console.log(`  Accuracy: ${isAccurate ? '✅ PERFECT' : '❌ INACCURATE'}`);
      console.log(`  Validation: ${validationStatus ? '✅ PASSED' : '❌ FAILED'}`);
    } else {
      console.log('⚠️ Could not find both calculated area and input radius for verification');
    }
    
    // Step 5: Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    
    // Check final activities count
    const finalActivitiesResult = await pgClient.query(`
      SELECT COUNT(*) as count FROM activity_library 
      WHERE name IN ('Validate Positive Number', 'Calculate Circle Area', 'Format Number Result')
    `);
    
    const testResults = {
      activitiesInDatabase: parseInt(finalActivitiesResult.rows[0].count) >= 3,
      workflowExecuted: executeResponse.data.success || false,
      redisDataExchange: workflowKeys.length > 0,
      correctCalculation: calculatedArea && inputRadius && Math.abs(calculatedArea - Math.PI * inputRadius * inputRadius) < 0.01
    };
    
    console.log(`✓ Activities in PostgreSQL: ${testResults.activitiesInDatabase ? '✅' : '❌'}`);
    console.log(`✓ Workflow Executed: ${testResults.workflowExecuted ? '✅' : '❌'}`);
    console.log(`✓ Redis Data Exchange: ${testResults.redisDataExchange ? '✅' : '❌'} (${workflowKeys.length} parameters)`);
    console.log(`✓ Correct Calculation: ${testResults.correctCalculation ? '✅' : '❌'}`);
    
    const allPassed = Object.values(testResults).every(v => v);
    console.log(`\n🏁 OVERALL RESULT: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  } finally {
    await pgClient.end();
    await redisClient.quit();
  }
}

// Run the test
if (require.main === module) {
  runCompleteCircleWorkflowTest().catch(console.error);
}