#!/usr/bin/env node

/**
 * Execute REAL Temporal workflow with Redis parameter exchange
 * This will show actual Temporal execution, not simulation
 */

const { Client, Connection } = require('@temporalio/client');
const Redis = require('ioredis');

const redis = new Redis({
  host: 'localhost',
  port: 6379
});

async function executeRealTemporalWorkflow() {
  console.log('🚀 REAL TEMPORAL WORKFLOW EXECUTION');
  console.log('==================================\n');

  try {
    // Connect to Temporal
    console.log('📡 Connecting to Temporal Server...');
    const connection = await Connection.connect({
      address: 'localhost:7233',
    });

    const client = new Client({
      connection,
      namespace: 'default',
    });

    console.log('✅ Connected to Temporal');

    // Clear Redis for clean monitoring
    await redis.flushdb();
    console.log('✅ Cleared Redis for clean monitoring');

    // Generate execution details
    const workflowId = 'real-execution-' + Date.now();
    const sessionId = 'session-' + Date.now();
    
    console.log('\n📌 EXECUTION DETAILS:');
    console.log(`  Workflow ID: ${workflowId}`);
    console.log(`  Session ID: ${sessionId}`);
    console.log(`  Task Queue: workflow-automation`);
    console.log(`  Input: radius=6, unit=meters`);

    // Prepare workflow input that triggers Redis parameter exchange
    const workflowInput = {
      workflowId: 'circle-calculator',
      parameters: {
        radius: 6,
        unit: 'meters'
      },
      sessionId: sessionId,
      executionId: 'exec-' + Date.now(),
      triggerType: 'manual'
    };

    console.log('\n⏳ Starting Temporal workflow...');
    
    // Start the workflow
    const handle = await client.workflow.start('dynamicWorkflow', {
      taskQueue: 'workflow-automation',
      workflowId: workflowId,
      args: [workflowInput],
    });

    console.log('✅ Workflow started successfully!');
    console.log(`  Run ID: ${handle.firstExecutionRunId}`);
    console.log(`  Temporal URL: http://localhost:8233/namespaces/default/workflows/${workflowId}`);

    // Monitor Redis in real-time for parameter exchange
    console.log('\n📦 MONITORING REDIS PARAMETER EXCHANGE:');
    console.log('━'.repeat(50));
    
    let foundParameters = new Set();
    let activityCount = 0;
    
    const monitorInterval = setInterval(async () => {
      try {
        // Look for session keys
        const sessionKeys = await redis.keys(`${sessionId}*`);
        const workflowKeys = await redis.keys(`*${workflowInput.workflowId}*`);
        const allRelevantKeys = [...new Set([...sessionKeys, ...workflowKeys])];
        
        for (const key of allRelevantKeys) {
          if (!foundParameters.has(key)) {
            const value = await redis.get(key);
            if (value) {
              foundParameters.add(key);
              
              try {
                const parsed = JSON.parse(value);
                if (parsed.activityName) {
                  activityCount++;
                  const paramName = key.split('.').pop() || key;
                  
                  console.log(`\n🔥 REAL PARAMETER EXCHANGE DETECTED!`);
                  console.log(`   Time: ${new Date().toLocaleTimeString()}`);
                  console.log(`   Activity: ${parsed.activityName}`);
                  console.log(`   Parameter: ${paramName}`);
                  console.log(`   Value: ${JSON.stringify(parsed.value)}`);
                  console.log(`   Type: ${parsed.type}`);
                  console.log(`   Redis Key: ${key}`);
                }
              } catch (e) {
                // Not JSON, might be different type of key
                console.log(`\n📝 Redis Key Found: ${key}`);
                console.log(`   Value: ${value}`);
              }
            }
          }
        }
      } catch (error) {
        // Continue monitoring even if Redis query fails
      }
    }, 500); // Check every 500ms for real-time monitoring

    // Wait for workflow completion
    console.log('\n⏳ Waiting for Temporal workflow to complete...');
    console.log('   (Monitoring Redis parameters in real-time...)');
    
    let result;
    try {
      result = await handle.result();
      clearInterval(monitorInterval);
      
      console.log('\n' + '='.repeat(60));
      console.log('🎉 TEMPORAL WORKFLOW COMPLETED!');
      console.log('='.repeat(60));
      
    } catch (error) {
      clearInterval(monitorInterval);
      console.log('\n❌ Workflow failed:', error.message);
      
      // Still check what we captured
      console.log('\n📦 Checking captured Redis parameters...');
    }

    // Final Redis state analysis
    console.log('\n📊 FINAL REDIS STATE ANALYSIS:');
    console.log('━'.repeat(40));
    
    const finalKeys = await redis.keys('*');
    console.log(`\nTotal Redis Keys: ${finalKeys.length}`);
    
    const sessionParams = finalKeys.filter(k => k.includes(sessionId));
    const workflowParams = finalKeys.filter(k => k.includes(workflowInput.workflowId));
    const relevantParams = [...new Set([...sessionParams, ...workflowParams])];
    
    console.log(`Session Parameters: ${sessionParams.length}`);
    console.log(`Workflow Parameters: ${workflowParams.length}`);
    console.log(`Relevant Parameters: ${relevantParams.length}`);
    
    if (relevantParams.length > 0) {
      console.log('\n🔍 PARAMETER ANALYSIS:');
      
      for (const key of relevantParams) {
        const value = await redis.get(key);
        try {
          const parsed = JSON.parse(value);
          console.log(`\n  Parameter: ${key.split('.').pop()}`);
          console.log(`  Activity: ${parsed.activityName || 'unknown'}`);
          console.log(`  Value: ${JSON.stringify(parsed.value || parsed)}`);
          console.log(`  Full Key: ${key}`);
        } catch {
          console.log(`\n  Raw Key: ${key}`);
          console.log(`  Raw Value: ${value}`);
        }
      }
    }

    // Show Temporal result if available
    if (result) {
      console.log('\n📊 TEMPORAL WORKFLOW RESULT:');
      console.log('━'.repeat(30));
      console.log(JSON.stringify(result, null, 2));
    }

    console.log('\n✅ VERIFICATION SUMMARY:');
    console.log(`  [${result ? '✓' : '✗'}] Temporal workflow executed`);
    console.log(`  [${activityCount > 0 ? '✓' : '✗'}] Activities detected (${activityCount} total)`);
    console.log(`  [${relevantParams.length > 0 ? '✓' : '✗'}] Redis parameters found (${relevantParams.length} total)`);
    console.log(`  [${result && relevantParams.length > 0 ? '✓' : '✗'}] Data exchange verified`);

    console.log('\n🌐 Access Temporal Web UI:');
    console.log(`  http://localhost:8233/namespaces/default/workflows/${workflowId}`);
    
    await connection.close();
    
    return {
      workflowId,
      sessionId,
      result,
      parametersFound: relevantParams.length,
      activitiesDetected: activityCount
    };

  } catch (error) {
    console.error('\n❌ EXECUTION ERROR:', error.message);
    console.log('\nDebugging info:');
    console.log('- Ensure Temporal server is running: docker-compose ps');
    console.log('- Check temporal-worker logs: docker logs temporal-worker');
    console.log('- Verify workflow registration: Check worker startup logs');
    throw error;
  }
}

async function main() {
  try {
    const results = await executeRealTemporalWorkflow();
    
    console.log('\n🏆 EXECUTION COMPLETE!');
    if (results.result && results.parametersFound > 0) {
      console.log('✅ SUCCESS: Temporal calculated result using Redis data exchange!');
    } else if (results.result) {
      console.log('⚠️  Temporal workflow completed but no Redis parameters detected');
    } else {
      console.log('❌ Workflow execution failed or incomplete');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

if (require.main === module) {
  main();
}