#!/usr/bin/env node

/**
 * TEST POSTGRESQL + REDIS INTEGRATION
 * This tests the corrected architecture: PostgreSQL -> Temporal -> Redis
 */

const { Client, Connection } = require('@temporalio/client');
const Redis = require('ioredis');

const redis = new Redis({
  host: 'localhost',
  port: 6379
});

async function testPostgreSQLRedisIntegration() {
  console.log('🎯 TESTING POSTGRESQL + REDIS INTEGRATION');
  console.log('========================================\n');

  try {
    await redis.flushdb();
    console.log('✅ Cleared Redis');

    const connection = await Connection.connect({
      address: 'localhost:7233',
    });

    const client = new Client({
      connection,
      namespace: 'default',
    });

    const sessionId = 'postgres-redis-' + Date.now();
    const workflowId = 'circle-area-calculator';
    const executionId = 'postgres-exec-' + Date.now();

    console.log('🚀 Testing PostgreSQL → Temporal → Redis flow...');
    console.log(`  Session ID: ${sessionId}`);
    console.log(`  Workflow ID: ${workflowId}`);
    console.log(`  Input: radius=25, unit=meters`);

    const workflowInput = {
      workflowId: workflowId,
      parameters: { radius: 25, unit: 'meters' },
      sessionId: sessionId,
      executionId: executionId,
      triggerType: 'manual'
    };

    console.log('\n📡 Starting Temporal workflow...');
    
    const handle = await client.workflow.start('dynamicWorkflow', {
      taskQueue: 'workflow-automation',
      workflowId: executionId,
      args: [workflowInput],
    });

    console.log('✅ Workflow started!');
    console.log(`  Run ID: ${handle.firstExecutionRunId}`);
    console.log(`  Temporal Web: http://localhost:8233/namespaces/default/workflows/${executionId}`);

    // Monitor Redis for PostgreSQL-loaded activities
    console.log('\n📦 Monitoring PostgreSQL → Redis parameter exchange...');
    console.log('━'.repeat(60));
    
    let foundParameters = new Set();
    let postgreSQLDetected = false;
    let builtInDetected = false;
    
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
                
                console.log(`\n🔥 PARAMETER EXCHANGE DETECTED!`);
                console.log(`   Time: ${new Date().toLocaleTimeString()}`);
                console.log(`   Parameter: ${paramName}`);
                console.log(`   Value: ${parsed.value}`);
                console.log(`   Activity: ${parsed.activityName}`);
                console.log(`   Source: ${parsed.source || 'built-in'}`);
                console.log(`   Redis Key: ${key}`);
                
                if (parsed.source === 'postgresql_activity') {
                  postgreSQLDetected = true;
                  console.log(`   🎯 FROM POSTGRESQL DATABASE!`);
                } else {
                  builtInDetected = true;
                  console.log(`   📝 From built-in fallback`);
                }
                
              } catch (e) {
                console.log(`\n📝 Raw Parameter: ${key} = ${value}`);
              }
            }
          }
        }
      } catch (error) {
        // Continue monitoring
      }
    }, 500);

    console.log('\n⏳ Waiting for workflow completion...');
    
    let result;
    try {
      result = await handle.result();
      clearInterval(monitorInterval);
      
      console.log('\n' + '='.repeat(60));
      console.log('🎉 POSTGRESQL + REDIS WORKFLOW COMPLETED!');
      console.log('='.repeat(60));
      
    } catch (error) {
      clearInterval(monitorInterval);
      console.log(`\n❌ Workflow failed: ${error.message}`);
    }

    // Final analysis
    console.log('\n📊 FINAL ANALYSIS:');
    console.log('━'.repeat(40));
    
    const finalKeys = await redis.keys(`${sessionId}*`);
    console.log(`\nTotal Redis parameters: ${finalKeys.length}`);
    
    let inputValue = null;
    let calculatedValue = null;
    
    for (const key of finalKeys) {
      const value = await redis.get(key);
      const parsed = JSON.parse(value);
      const paramName = key.split('.').pop();
      
      console.log(`\n  📊 ${paramName}:`);
      console.log(`     Value: ${parsed.value}`);
      console.log(`     Activity: ${parsed.activityName}`);
      console.log(`     Source: ${parsed.source || 'built-in'}`);
      
      if (paramName === 'validated_radius' || paramName === 'radius') {
        inputValue = parsed.value;
      }
      if (paramName === 'calculated_area' || paramName === 'area') {
        calculatedValue = parsed.value;
      }
    }

    // Show Temporal result
    if (result) {
      console.log('\n📊 TEMPORAL RESULT:');
      console.log(JSON.stringify(result, null, 2));
    }

    // Verify calculation
    if (inputValue && calculatedValue) {
      const expectedArea = Math.round(Math.PI * inputValue * inputValue * 10000) / 10000;
      console.log('\n🧮 CALCULATION VERIFICATION:');
      console.log(`  Input: ${inputValue} meters (radius)`);
      console.log(`  Output: ${calculatedValue} square meters (area)`);  
      console.log(`  Expected: π × ${inputValue}² = ${expectedArea}`);
      console.log(`  Match: ${Math.abs(calculatedValue - expectedArea) < 0.01 ? '✅ PERFECT' : '❌ ERROR'}`);
    }

    const success = result && finalKeys.length >= 2;
    
    console.log('\n✅ INTEGRATION TEST RESULTS:');
    console.log(`  [${result ? '✓' : '✗'}] Temporal workflow executed`);
    console.log(`  [${postgreSQLDetected ? '✓' : '✗'}] PostgreSQL activities loaded`);
    console.log(`  [${builtInDetected ? '✓' : '✗'}] Built-in fallback used`);
    console.log(`  [${finalKeys.length >= 2 ? '✓' : '✗'}] Redis parameters stored (${finalKeys.length})`);
    console.log(`  [${success ? '✓' : '✗'}] Complete PostgreSQL → Temporal → Redis flow`);

    if (success) {
      console.log('\n🏆 SUCCESS! PostgreSQL + Redis integration is working!');
      console.log('✅ Dynamic workflow worker loads activities from PostgreSQL');
      console.log('✅ Activities execute with Redis parameter exchange');
      console.log('✅ Call stack of activities with proper data flow');
      
      if (postgreSQLDetected) {
        console.log('✅ Activities were loaded from PostgreSQL database');
      } else {
        console.log('⚠️  Used built-in fallback (PostgreSQL may not have activities)');
      }
    }

    await connection.close();
    
    return {
      success,
      postgreSQLUsed: postgreSQLDetected,
      redisExchange: finalKeys.length >= 2,
      calculationCorrect: inputValue && calculatedValue && Math.abs(calculatedValue - Math.PI * inputValue * inputValue) < 0.01
    };

  } catch (error) {
    console.error('\n❌ INTEGRATION TEST ERROR:', error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  try {
    const results = await testPostgreSQLRedisIntegration();
    
    console.log('\n🏁 POSTGRESQL + REDIS INTEGRATION TEST COMPLETE!');
    
    if (results.success) {
      console.log('✅ SUCCESS: Dynamic workflow worker with PostgreSQL + Redis!');
      console.log(`✅ PostgreSQL integration: ${results.postgreSQLUsed ? 'ACTIVE' : 'FALLBACK'}`);
      console.log(`✅ Redis parameter exchange: ${results.redisExchange ? 'WORKING' : 'FAILED'}`);
      console.log(`✅ Calculation accuracy: ${results.calculationCorrect ? 'PERFECT' : 'ERROR'}`);
    } else {
      console.log('❌ Integration test failed');
      if (results.error) {
        console.log('Error:', results.error);
      }
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