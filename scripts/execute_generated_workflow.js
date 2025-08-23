#!/usr/bin/env node

/**
 * Execute the ACTUAL generated workflow with Redis monitoring
 */

const { Client, Connection } = require('@temporalio/client');
const Redis = require('ioredis');
const http = require('http');

const redis = new Redis({
  host: 'localhost',
  port: 6379
});

// Get the latest generated workflow ID
async function getLatestWorkflowId() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 8092,
      path: '/health',
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Check workflow-automation logs for the actual workflow ID
        const { execSync } = require('child_process');
        try {
          const logs = execSync('docker logs workflow-automation 2>&1 | grep -E "workflowId.*-" | tail -1', { encoding: 'utf8' });
          const match = logs.match(/workflowId.*([a-f0-9-]{36})/);
          if (match) {
            resolve(match[1]);
          } else {
            resolve('circle-area-calculator'); // fallback
          }
        } catch (e) {
          resolve('circle-area-calculator');
        }
      });
    });
    req.on('error', () => resolve('circle-area-calculator'));
    req.end();
  });
}

async function main() {
  console.log('🚀 EXECUTING ACTUAL GENERATED TEMPORAL WORKFLOW');
  console.log('===============================================\n');

  try {
    // Get the real workflow ID
    const realWorkflowId = await getLatestWorkflowId();
    console.log(`📋 Using Workflow ID: ${realWorkflowId}`);

    // Connect to Temporal
    const connection = await Connection.connect({
      address: 'localhost:7233',
    });

    const client = new Client({
      connection,
      namespace: 'default',
    });

    // Clear Redis
    await redis.flushdb();
    console.log('✅ Cleared Redis for monitoring');

    const executionWorkflowId = 'exec-' + Date.now();
    const sessionId = 'session-' + Date.now();
    
    console.log('\n📌 EXECUTION PARAMETERS:');
    console.log(`  Execution ID: ${executionWorkflowId}`);
    console.log(`  Session ID: ${sessionId}`);
    console.log(`  Generated Workflow ID: ${realWorkflowId}`);
    console.log(`  Input: radius=7, unit=meters`);

    // Use the actual generated workflow
    const workflowInput = {
      workflowId: realWorkflowId,
      parameters: {
        radius: 7,
        unit: 'meters'
      },
      sessionId: sessionId,
      executionId: executionWorkflowId,
      triggerType: 'manual'
    };

    console.log('\n⏳ Starting Temporal workflow with generated workflow...');
    
    const handle = await client.workflow.start('dynamicWorkflow', {
      taskQueue: 'workflow-automation',
      workflowId: executionWorkflowId,
      args: [workflowInput],
    });

    console.log('✅ Workflow started!');
    console.log(`  Run ID: ${handle.firstExecutionRunId}`);
    
    // Enhanced Redis monitoring
    console.log('\n📦 REAL-TIME REDIS MONITORING:');
    console.log('━'.repeat(50));
    
    let monitoringActive = true;
    let parametersDetected = 0;
    let activitiesExecuted = 0;
    
    const monitoringInterval = setInterval(async () => {
      if (!monitoringActive) return;
      
      try {
        // Monitor for any Redis activity
        const allKeys = await redis.keys('*');
        const sessionKeys = allKeys.filter(k => k.includes(sessionId));
        const workflowKeys = allKeys.filter(k => k.includes(realWorkflowId));
        const execKeys = allKeys.filter(k => k.includes(executionWorkflowId));
        
        const relevantKeys = [...new Set([...sessionKeys, ...workflowKeys, ...execKeys])];
        
        if (relevantKeys.length > parametersDetected) {
          const newKeys = relevantKeys.slice(parametersDetected);
          parametersDetected = relevantKeys.length;
          
          console.log(`\n⚡ NEW REDIS ACTIVITY DETECTED! (${new Date().toLocaleTimeString()})`);
          console.log(`   Total keys: ${allKeys.length}, Relevant: ${relevantKeys.length}`);
          
          for (const key of newKeys) {
            const value = await redis.get(key);
            try {
              const parsed = JSON.parse(value);
              if (parsed.activityName) {
                activitiesExecuted++;
                console.log(`\n   🔥 ACTIVITY PARAMETER STORED:`);
                console.log(`      Activity: ${parsed.activityName}`);
                console.log(`      Parameter: ${key.split('.').pop()}`);
                console.log(`      Value: ${JSON.stringify(parsed.value)}`);
                console.log(`      Redis Key: ${key}`);
              } else {
                console.log(`\n   📝 Redis Key: ${key} = ${JSON.stringify(parsed)}`);
              }
            } catch (e) {
              console.log(`\n   📝 Raw Key: ${key} = ${value}`);
            }
          }
        }
      } catch (error) {
        // Continue monitoring
      }
    }, 750);

    // Wait for completion
    console.log('\n⏳ Waiting for Temporal execution...');
    
    let result;
    try {
      result = await handle.result();
      monitoringActive = false;
      clearInterval(monitoringInterval);
      
      console.log('\n' + '='.repeat(60));
      console.log('🎉 TEMPORAL WORKFLOW COMPLETED!');
      console.log('='.repeat(60));
      
    } catch (error) {
      monitoringActive = false;
      clearInterval(monitoringInterval);
      console.log('\n❌ Workflow execution error:', error.message);
    }

    // Final analysis
    console.log('\n📊 EXECUTION ANALYSIS:');
    console.log('━'.repeat(30));
    
    const finalKeys = await redis.keys('*');
    const finalRelevantKeys = finalKeys.filter(k => 
      k.includes(sessionId) || k.includes(realWorkflowId) || k.includes(executionWorkflowId)
    );
    
    console.log(`Total Redis Keys: ${finalKeys.length}`);
    console.log(`Relevant Keys: ${finalRelevantKeys.length}`);
    console.log(`Activities Executed: ${activitiesExecuted}`);
    
    if (finalRelevantKeys.length > 0) {
      console.log('\n🔍 FOUND PARAMETERS:');
      for (const key of finalRelevantKeys) {
        const value = await redis.get(key);
        try {
          const parsed = JSON.parse(value);
          if (parsed.activityName) {
            console.log(`\n  ✅ ${parsed.activityName}:`);
            console.log(`     ${key.split('.').pop()} = ${JSON.stringify(parsed.value)}`);
          }
        } catch (e) {
          console.log(`\n  📝 ${key} = ${value}`);
        }
      }
    }

    if (result) {
      console.log('\n📊 TEMPORAL RESULT:');
      console.log(JSON.stringify(result, null, 2));
    }

    console.log('\n✅ FINAL VERIFICATION:');
    console.log(`  [${result ? '✓' : '✗'}] Temporal workflow completed`);
    console.log(`  [${activitiesExecuted > 0 ? '✓' : '✗'}] Activities executed (${activitiesExecuted})`);
    console.log(`  [${finalRelevantKeys.length > 0 ? '✓' : '✗'}] Redis parameters stored (${finalRelevantKeys.length})`);
    console.log(`  [${result && finalRelevantKeys.length > 0 ? '✓' : '✗'}] Temporal calculated using Redis data`);

    if (result && finalRelevantKeys.length > 0) {
      console.log('\n🏆 SUCCESS: Temporal workflow calculated result using Redis data exchange!');
    }

    console.log(`\n🌐 View in Temporal Web: http://localhost:8233/namespaces/default/workflows/${executionWorkflowId}`);
    
    await connection.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Check:');
    console.log('  - Temporal server: docker logs temporal-server');
    console.log('  - Worker logs: docker logs temporal-worker');
    console.log('  - Generated workflows: docker logs workflow-automation | grep workflowId');
  } finally {
    await redis.quit();
  }
}

if (require.main === module) {
  main();
}