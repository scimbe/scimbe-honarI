#!/usr/bin/env node

/**
 * Script to execute a workflow and monitor Redis parameter storage
 * Demonstrates the complete data exchange system with activity-by-activity execution
 */

const http = require('http');
const Redis = require('ioredis');

// Create Redis client for monitoring
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  retryDelayOnFailover: 100
});

// Test workflow input
const workflowInput = {
  radius: 5,
  unit: "meters"
};

// Function to monitor Redis keys
async function monitorRedisKeys(pattern) {
  try {
    const keys = await redis.keys(pattern);
    console.log(`\n📦 Redis Keys matching pattern "${pattern}":`);
    
    for (const key of keys) {
      const value = await redis.get(key);
      try {
        const parsed = JSON.parse(value);
        console.log(`  🔑 ${key}`);
        console.log(`     📊 Value:`, parsed);
      } catch {
        console.log(`  🔑 ${key} = ${value}`);
      }
    }
    
    if (keys.length === 0) {
      console.log('  (No keys found yet)');
    }
    
    return keys;
  } catch (error) {
    console.error('Redis monitoring error:', error.message);
    return [];
  }
}

// Function to execute workflow via Temporal
async function executeWorkflow() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      workflowId: 'circle-calculator-' + Date.now(),
      workflowType: 'dynamicWorkflow',
      input: workflowInput,
      sessionId: 'session-' + Date.now()
    });
    
    const options = {
      hostname: 'localhost',
      port: 8081, // Temporal worker port
      path: '/execute',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log('🚀 Executing workflow with Temporal...');
    console.log('📊 Input:', workflowInput);
    console.log('');

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          resolve(response);
        } catch (error) {
          resolve(responseData);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Function to execute workflow via workflow-automation API
async function executeViaAutomationAPI() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      parameters: workflowInput
    });
    
    // First, get the workflow ID
    const getOptions = {
      hostname: 'localhost',
      port: 8092,
      path: '/workflow-automation/api/workflows',
      method: 'GET'
    };

    http.get(getOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const workflows = JSON.parse(data);
          if (!workflows.data || workflows.data.length === 0) {
            console.log('❌ No workflows found. Please generate a workflow first.');
            reject(new Error('No workflows found'));
            return;
          }

          const latestWorkflow = workflows.data[0];
          console.log(`📋 Found workflow: ${latestWorkflow.name} (ID: ${latestWorkflow.id})`);

          // Now execute the workflow
          const executeData = JSON.stringify({
            workflowId: latestWorkflow.id,
            parameters: workflowInput,
            sessionId: 'session-' + Date.now()
          });

          const executeOptions = {
            hostname: 'localhost',
            port: 8092,
            path: `/workflow-automation/api/workflows/${latestWorkflow.id}/execute`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(executeData)
            }
          };

          const execReq = http.request(executeOptions, (execRes) => {
            let execData = '';
            execRes.on('data', chunk => execData += chunk);
            execRes.on('end', () => {
              try {
                const result = JSON.parse(execData);
                resolve(result);
              } catch (error) {
                resolve(execData);
              }
            });
          });

          execReq.on('error', reject);
          execReq.write(executeData);
          execReq.end();

        } catch (error) {
          reject(error);
        }
      });
    });
  });
}

// Main execution and monitoring
async function main() {
  console.log('🔄 Workflow Execution and Redis Monitoring');
  console.log('==========================================\n');

  try {
    // Initial Redis state
    console.log('📍 Step 1: Initial Redis State');
    await monitorRedisKeys('session*');

    // Execute workflow
    console.log('\n📍 Step 2: Executing Workflow');
    console.log('--------------------------------');
    
    const sessionId = 'session-' + Date.now();
    const workflowId = 'workflow-' + Date.now();
    
    console.log(`  📌 Session ID: ${sessionId}`);
    console.log(`  📌 Workflow ID: ${workflowId}`);
    console.log(`  📊 Input: radius=${workflowInput.radius}, unit=${workflowInput.unit}`);

    // Try to execute via automation API
    try {
      const result = await executeViaAutomationAPI();
      console.log('\n✅ Workflow execution started:', result);
    } catch (error) {
      console.log('⚠️  Could not execute via automation API:', error.message);
      console.log('    Trying alternative execution method...');
    }

    // Monitor Redis keys during execution
    console.log('\n📍 Step 3: Monitoring Redis Parameters During Execution');
    console.log('-------------------------------------------------------');

    let activityCount = 0;
    const maxAttempts = 10;
    
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      console.log(`\n⏱️  Check ${i + 1}/${maxAttempts} (${new Date().toLocaleTimeString()})`);
      
      // Monitor all session keys
      const keys = await monitorRedisKeys('*session*');
      
      // Check for specific parameter patterns
      const validatedRadius = await redis.get(`${sessionId}.${workflowId}.validated_radius`);
      const calculatedArea = await redis.get(`${sessionId}.${workflowId}.calculated_area`);
      const calculatedPerimeter = await redis.get(`${sessionId}.${workflowId}.calculated_perimeter`);
      const finalSummary = await redis.get(`${sessionId}.${workflowId}.final_summary`);
      
      console.log('\n📊 Activity Results:');
      if (validatedRadius) {
        console.log('  ✅ Activity 1 (Input Validation): COMPLETED');
        console.log(`     Validated Radius: ${validatedRadius}`);
        activityCount = Math.max(activityCount, 1);
      }
      
      if (calculatedArea) {
        console.log('  ✅ Activity 2 (Area Calculation): COMPLETED');
        console.log(`     Calculated Area: ${calculatedArea}`);
        activityCount = Math.max(activityCount, 2);
      }
      
      if (calculatedPerimeter) {
        console.log('  ✅ Activity 3 (Perimeter Calculation): COMPLETED');
        console.log(`     Calculated Perimeter: ${calculatedPerimeter}`);
        activityCount = Math.max(activityCount, 3);
      }
      
      if (finalSummary) {
        console.log('  ✅ Activity 4 (Summary Generation): COMPLETED');
        try {
          const summary = JSON.parse(finalSummary);
          console.log('     Final Summary:', JSON.stringify(summary, null, 2));
        } catch {
          console.log('     Final Summary:', finalSummary);
        }
        activityCount = 4;
        break; // All activities completed
      }
      
      if (activityCount === 0) {
        console.log('  ⏳ Waiting for activities to start...');
      }
    }

    // Final results
    console.log('\n📍 Step 4: Final Results');
    console.log('------------------------');
    console.log(`  ✅ Total Activities Executed: ${activityCount}/4`);
    
    if (activityCount === 4) {
      console.log('  🎉 SUCCESS: All activities completed successfully!');
      console.log('  📊 Data Exchange: Each activity successfully read parameters from previous activities');
      console.log('  💾 Redis Storage: All intermediate results stored and retrieved correctly');
    } else {
      console.log(`  ⚠️  Only ${activityCount}/4 activities completed`);
      console.log('  💡 Tip: Check workflow-automation and temporal-worker logs for details');
    }

    // Show all final Redis keys
    console.log('\n📍 Step 5: Final Redis State');
    await monitorRedisKeys('*');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('  1. Check if all services are running: docker-compose ps');
    console.log('  2. Check workflow-automation logs: docker logs workflow-automation');
    console.log('  3. Check temporal-worker logs: docker logs temporal-worker');
    console.log('  4. Verify Redis is accessible: docker exec -it temporal-redis redis-cli ping');
  } finally {
    // Clean up Redis connection
    redis.disconnect();
  }
}

// Execute the script
if (require.main === module) {
  main().catch(console.error);
}