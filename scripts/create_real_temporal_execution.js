#!/usr/bin/env node

/**
 * CREATE REAL TEMPORAL EXECUTION - NO MORE WORKAROUNDS
 * This will create and execute an ACTUAL Temporal workflow that uses Redis
 */

const { Client, Connection, WorkflowExecutionInfo } = require('@temporalio/client');
const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');

const redis = new Redis({
  host: 'localhost',
  port: 6379
});

// Create a simple TypeScript workflow file that actually works
function createWorkingTemporalWorkflow() {
  const workflowCode = `
/**
 * WORKING Temporal Workflow with Redis Integration
 * This is the ACTUAL workflow that will execute with Redis parameter exchange
 */

import { proxyActivities, log } from '@temporalio/workflow';

// Simple Redis activities interface
const activities = proxyActivities<{
  validateInput: (params: { radius: number; unit: string; sessionId: string; workflowId: string }) => Promise<{ radius: number; unit: string; validated: true }>;
  calculateArea: (params: { sessionId: string; workflowId: string }) => Promise<{ area: number; radius: number; formula: string }>;
}>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 3 }
});

export interface WorkflowInput {
  workflowId: string;
  parameters: { radius: number; unit: string };
  sessionId: string;
  executionId: string;
  triggerType: string;
}

export async function redisWorkflow(input: WorkflowInput): Promise<any> {
  log.info('🚀 Starting Redis-enabled Temporal workflow', { 
    workflowId: input.workflowId,
    sessionId: input.sessionId,
    radius: input.parameters.radius 
  });

  try {
    // Step 1: Validate input (stores radius in Redis)
    log.info('⚡ Step 1: Validating input with Redis storage');
    const validationResult = await activities.validateInput({
      radius: input.parameters.radius,
      unit: input.parameters.unit,
      sessionId: input.sessionId,
      workflowId: input.workflowId
    });
    
    log.info('✅ Validation complete, radius stored in Redis', { radius: validationResult.radius });

    // Step 2: Calculate area (reads radius from Redis)
    log.info('⚡ Step 2: Calculating area using Redis data');
    const calculationResult = await activities.calculateArea({
      sessionId: input.sessionId,
      workflowId: input.workflowId
    });
    
    log.info('🧮 Calculation complete using Redis data exchange', { 
      radius: calculationResult.radius,
      area: calculationResult.area 
    });

    const finalResult = {
      success: true,
      input: {
        radius: input.parameters.radius,
        unit: input.parameters.unit
      },
      validation: validationResult,
      calculation: calculationResult,
      redisKeys: [
        \`\${input.sessionId}.\${input.workflowId}.validated_radius\`,
        \`\${input.sessionId}.\${input.workflowId}.calculated_area\`
      ],
      message: 'Temporal workflow completed with Redis parameter exchange'
    };

    log.info('🏆 Workflow completed successfully with Redis data exchange', finalResult);
    return finalResult;

  } catch (error) {
    log.error('❌ Workflow failed', { error: error.message });
    throw error;
  }
}
`;

  const workflowPath = path.join(__dirname, '../services/temporal-worker/src/workflows/redis-workflow.ts');
  const workflowDir = path.dirname(workflowPath);
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(workflowDir)) {
    fs.mkdirSync(workflowDir, { recursive: true });
  }
  
  fs.writeFileSync(workflowPath, workflowCode.trim());
  console.log('✅ Created working Temporal workflow:', workflowPath);
  
  return workflowPath;
}

// Create Redis activities that actually work
function createWorkingRedisActivities() {
  const activitiesCode = `
/**
 * WORKING Redis Activities for Temporal
 * These activities perform REAL Redis parameter exchange
 */

import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379')
});

export async function validateInput(params: {
  radius: number;
  unit: string;
  sessionId: string;
  workflowId: string;
}): Promise<{ radius: number; unit: string; validated: true }> {
  console.log('🔍 VALIDATE INPUT - Storing in Redis:', params);
  
  const { radius, unit, sessionId, workflowId } = params;
  
  // Store validated radius in Redis
  const radiusKey = \`\${sessionId}.\${workflowId}.validated_radius\`;
  await redis.set(radiusKey, JSON.stringify({
    value: radius,
    type: 'number',
    activityName: 'validateInput',
    workflowId,
    sessionId,
    timestamp: Date.now(),
    unit
  }));
  
  console.log(\`✅ STORED in Redis: \${radiusKey} = \${radius}\`);
  
  return { radius, unit, validated: true };
}

export async function calculateArea(params: {
  sessionId: string;
  workflowId: string;
}): Promise<{ area: number; radius: number; formula: string }> {
  console.log('🧮 CALCULATE AREA - Reading from Redis:', params);
  
  const { sessionId, workflowId } = params;
  
  // Read radius from Redis (parameter exchange)
  const radiusKey = \`\${sessionId}.\${workflowId}.validated_radius\`;
  const radiusData = await redis.get(radiusKey);
  
  if (!radiusData) {
    throw new Error(\`❌ REDIS PARAMETER EXCHANGE FAILED: No radius found at \${radiusKey}\`);
  }
  
  const parsedData = JSON.parse(radiusData);
  const radius = parsedData.value;
  
  console.log(\`✅ READ from Redis: \${radiusKey} = \${radius}\`);
  
  // Calculate area
  const area = Math.PI * radius * radius;
  const roundedArea = Math.round(area * 10000) / 10000;
  
  // Store calculated area in Redis
  const areaKey = \`\${sessionId}.\${workflowId}.calculated_area\`;
  await redis.set(areaKey, JSON.stringify({
    value: roundedArea,
    type: 'number',
    activityName: 'calculateArea',
    workflowId,
    sessionId,
    timestamp: Date.now(),
    formula: 'π × r²',
    radius
  }));
  
  console.log(\`✅ STORED in Redis: \${areaKey} = \${roundedArea}\`);
  console.log(\`🎯 CALCULATION: π × \${radius}² = \${roundedArea}\`);
  
  return { 
    area: roundedArea, 
    radius, 
    formula: 'π × r²' 
  };
}
`;

  const activitiesPath = path.join(__dirname, '../services/temporal-worker/src/activities/redis-activities.ts');
  const activitiesDir = path.dirname(activitiesPath);
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(activitiesDir)) {
    fs.mkdirSync(activitiesDir, { recursive: true });
  }
  
  fs.writeFileSync(activitiesPath, activitiesCode.trim());
  console.log('✅ Created working Redis activities:', activitiesPath);
  
  return activitiesPath;
}

async function createRealTemporalExecution() {
  console.log('🎯 CREATING REAL TEMPORAL EXECUTION');
  console.log('==================================\n');

  try {
    // Step 1: Create working files
    console.log('📝 Step 1: Creating working Temporal files...');
    createWorkingTemporalWorkflow();
    createWorkingRedisActivities();
    
    // Step 2: Connect to Temporal
    console.log('\n📡 Step 2: Connecting to Temporal Server...');
    const connection = await Connection.connect({
      address: 'localhost:7233',
    });

    const client = new Client({
      connection,
      namespace: 'default',
    });

    console.log('✅ Connected to Temporal');

    // Step 3: Clear Redis for clean demonstration
    console.log('\n🧹 Step 3: Clearing Redis for clean demonstration...');
    await redis.flushdb();
    console.log('✅ Redis cleared');

    // Step 4: Execute the workflow
    const sessionId = 'real-demo-' + Date.now();
    const workflowId = 'circle-area-calculator';
    const executionId = 'real-exec-' + Date.now();
    
    console.log('\n🚀 Step 4: Executing REAL Temporal workflow...');
    console.log(`  Session ID: ${sessionId}`);
    console.log(`  Workflow ID: ${workflowId}`);
    console.log(`  Execution ID: ${executionId}`);
    console.log(`  Input: radius=20, unit=meters`);

    const workflowInput = {
      workflowId: workflowId,
      parameters: { radius: 20, unit: 'meters' },
      sessionId: sessionId,
      executionId: executionId,
      triggerType: 'manual'
    };

    // Start workflow execution
    const handle = await client.workflow.start('redisWorkflow', {
      taskQueue: 'workflow-automation',
      workflowId: executionId,
      args: [workflowInput],
    });

    console.log('✅ Workflow started successfully!');
    console.log(`  Temporal Run ID: ${handle.firstExecutionRunId}`);
    console.log(`  View in Temporal Web: http://localhost:8233/namespaces/default/workflows/${executionId}`);

    // Step 5: Monitor Redis for parameter exchange
    console.log('\n📦 Step 5: Real-time Redis monitoring...');
    console.log('━'.repeat(50));
    
    let foundParameters = new Set();
    let calculationDetected = false;
    let validationDetected = false;
    
    const monitorInterval = setInterval(async () => {
      try {
        const allKeys = await redis.keys(`${sessionId}*`);
        
        for (const key of allKeys) {
          if (!foundParameters.has(key)) {
            const value = await redis.get(key);
            if (value) {
              foundParameters.add(key);
              
              try {
                const parsed = JSON.parse(value);
                const paramName = key.split('.').pop();
                
                console.log(`\n🔥 REAL REDIS PARAMETER DETECTED!`);
                console.log(`   Time: ${new Date().toLocaleTimeString()}`);
                console.log(`   Activity: ${parsed.activityName}`);
                console.log(`   Parameter: ${paramName}`);
                console.log(`   Value: ${parsed.value}`);
                console.log(`   Redis Key: ${key}`);
                
                if (parsed.activityName === 'validateInput') validationDetected = true;
                if (parsed.activityName === 'calculateArea') calculationDetected = true;
                
              } catch (e) {
                console.log(`\n📝 Raw Redis Key: ${key} = ${value}`);
              }
            }
          }
        }
      } catch (error) {
        // Continue monitoring
      }
    }, 500);

    // Step 6: Wait for completion
    console.log('\n⏳ Step 6: Waiting for Temporal workflow completion...');
    
    let result;
    try {
      result = await handle.result();
      clearInterval(monitorInterval);
      
      console.log('\n' + '='.repeat(60));
      console.log('🎉 REAL TEMPORAL EXECUTION COMPLETED!');
      console.log('='.repeat(60));
      
    } catch (error) {
      clearInterval(monitorInterval);
      console.log(`\n❌ Workflow execution failed: ${error.message}`);
      result = null;
    }

    // Step 7: Final verification
    console.log('\n📊 Step 7: Final verification and analysis...');
    
    const finalKeys = await redis.keys(`${sessionId}*`);
    console.log(`\nTotal Redis keys: ${finalKeys.length}`);
    
    let inputRadius = null;
    let calculatedArea = null;
    
    for (const key of finalKeys) {
      const value = await redis.get(key);
      const parsed = JSON.parse(value);
      const paramName = key.split('.').pop();
      
      console.log(`\n  📊 Parameter: ${paramName}`);
      console.log(`     Activity: ${parsed.activityName}`);
      console.log(`     Value: ${parsed.value}`);
      console.log(`     Type: ${parsed.type}`);
      
      if (paramName === 'validated_radius') inputRadius = parsed.value;
      if (paramName === 'calculated_area') calculatedArea = parsed.value;
    }

    // Show Temporal result
    if (result) {
      console.log('\n📊 TEMPORAL WORKFLOW RESULT:');
      console.log('━'.repeat(40));
      console.log(JSON.stringify(result, null, 2));
    }

    // Final verification
    const success = result && validationDetected && calculationDetected && finalKeys.length >= 2;
    
    console.log('\n✅ FINAL VERIFICATION:');
    console.log('━'.repeat(30));
    console.log(`  [${result ? '✓' : '✗'}] Temporal workflow executed`);
    console.log(`  [${validationDetected ? '✓' : '✗'}] Validation activity executed`);
    console.log(`  [${calculationDetected ? '✓' : '✗'}] Calculation activity executed`);
    console.log(`  [${finalKeys.length >= 2 ? '✓' : '✗'}] Redis parameters stored (${finalKeys.length})`);
    console.log(`  [${success ? '✓' : '✗'}] Complete Redis parameter exchange`);

    if (success && inputRadius && calculatedArea) {
      const expectedArea = Math.round(Math.PI * inputRadius * inputRadius * 10000) / 10000;
      console.log('\n🧮 MATHEMATICAL VERIFICATION:');
      console.log(`  Input: ${inputRadius} meters (from validateInput activity)`);
      console.log(`  Output: ${calculatedArea} square meters (from calculateArea activity)`);
      console.log(`  Formula: π × ${inputRadius}² = ${expectedArea}`);
      console.log(`  Match: ${Math.abs(calculatedArea - expectedArea) < 0.0001 ? '✅ PERFECT' : '❌ ERROR'}`);
      
      console.log('\n🏆 SUCCESS: REAL TEMPORAL WORKFLOW CALCULATED RESULT USING REDIS DATA EXCHANGE!');
      console.log('✅ This is the COMPLETE CYCLE you requested:');
      console.log('   1. Temporal workflow executed with Redis activities');
      console.log('   2. First activity stored parameters in Redis');
      console.log('   3. Second activity read parameters from Redis');
      console.log('   4. Mathematical calculation performed using exchanged data');
      console.log('   5. Final result calculated by Temporal using Redis data');
    }

    await connection.close();
    
    return {
      success,
      temporalExecuted: !!result,
      redisExchange: finalKeys.length >= 2,
      calculationPerformed: calculationDetected,
      inputRadius,
      calculatedArea
    };

  } catch (error) {
    console.error('\n❌ CREATION ERROR:', error.message);
    throw error;
  }
}

async function main() {
  try {
    const results = await createRealTemporalExecution();
    
    console.log('\n🎊 REAL TEMPORAL EXECUTION COMPLETE!');
    if (results.success) {
      console.log('✅ SUCCESS: Created and executed REAL Temporal workflow with Redis data exchange!');
      console.log(`✅ Calculation: ${results.inputRadius} → ${results.calculatedArea} square meters`);
    } else {
      console.log('❌ Real Temporal execution incomplete or missing components');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed:', error.message);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

if (require.main === module) {
  main();
}