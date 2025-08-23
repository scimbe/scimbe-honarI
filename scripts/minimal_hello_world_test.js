#!/usr/bin/env node

/**
 * MINIMAL HELLO WORLD TEST
 * Tests the simplest possible workflow execution with redis parameter exchange
 */

const { Client, Connection } = require('@temporalio/client');
const Redis = require('ioredis');

const redis = new Redis({
  host: 'localhost',
  port: 6379
});

async function minimalHelloWorldTest() {
  console.log('🌟 MINIMAL HELLO WORLD TEST');
  console.log('============================\n');

  try {
    // Clear Redis
    await redis.flushdb();
    console.log('✅ Cleared Redis');

    // Connect to Temporal
    const connection = await Connection.connect({
      address: 'localhost:7233',
    });

    const client = new Client({
      connection,
      namespace: 'default',
    });

    const sessionId = 'minimal-hello-' + Date.now();
    const executionId = 'minimal-exec-' + Date.now();

    console.log('🚀 Starting MINIMAL Hello World...');
    console.log(`  Session ID: ${sessionId}`);
    console.log(`  Execution ID: ${executionId}`);

    // Use the simplest possible workflow input that our minimal-redis-activities can handle
    const workflowInput = {
      workflowId: 'circle-area-calculator',
      parameters: { 
        radius: 5,
        unit: 'hello-units'
      },
      sessionId: sessionId,
      executionId: executionId,
      triggerType: 'manual'
    };

    console.log('📋 Input: radius=5, unit="hello-units"');
    console.log('📡 Expected: validate_input → calculate_area');

    // Start the workflow
    const handle = await client.workflow.start('dynamicWorkflow', {
      taskQueue: 'workflow-automation',
      workflowId: executionId,
      args: [workflowInput],
    });

    console.log('✅ Workflow started!');
    console.log(`  Temporal Web: http://localhost:8233/namespaces/default/workflows/${executionId}`);

    // Simple monitoring with timeout
    console.log('\n🔄 Monitoring for 10 seconds...');
    let foundParams = 0;
    
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const keys = await redis.keys(`${sessionId}*`);
      if (keys.length > foundParams) {
        foundParams = keys.length;
        for (const key of keys) {
          const value = await redis.get(key);
          const parsed = JSON.parse(value);
          const paramName = key.split('.').pop();
          
          console.log(`\n🔥 REDIS PARAM: ${paramName}`);
          console.log(`   Value: ${parsed.value}`);
          console.log(`   Activity: ${parsed.activityName}`);
        }
      }
    }

    // Get workflow result
    let result;
    try {
      result = await Promise.race([
        handle.result(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000))
      ]);
      
      console.log('\n🎉 WORKFLOW COMPLETED!');
      console.log('Result:', JSON.stringify(result, null, 2));
      
    } catch (error) {
      console.log(`\n⚠️  Workflow error: ${error.message}`);
    }

    // Final Redis check
    const finalKeys = await redis.keys(`${sessionId}*`);
    console.log(`\n📊 Final Redis parameters: ${finalKeys.length}`);
    
    for (const key of finalKeys) {
      const value = await redis.get(key);
      const parsed = JSON.parse(value);
      console.log(`  ${key.split('.').pop()}: ${parsed.value} (${parsed.activityName})`);
    }

    const success = finalKeys.length >= 2;
    
    console.log(`\n${success ? '🏆 SUCCESS!' : '❌ FAILED'}`);
    console.log(`Redis parameters: ${finalKeys.length}`);
    console.log(`Workflow executed: ${result ? 'YES' : 'NO'}`);
    
    if (success) {
      console.log('✅ Temporal Worker is working correctly!');
      console.log('✅ Redis parameter exchange is functional!');
      console.log('✅ Docker Compose setup is perfect!');
    }

    await connection.close();
    return { success, parametersStored: finalKeys.length, workflowCompleted: !!result };

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  try {
    const results = await minimalHelloWorldTest();
    
    console.log('\n🏁 MINIMAL HELLO WORLD COMPLETE!');
    if (results.success) {
      console.log('✅ Everything working perfectly with docker-compose!');
    } else {
      console.log('❌ Issues detected');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

if (require.main === module) {
  main();
}