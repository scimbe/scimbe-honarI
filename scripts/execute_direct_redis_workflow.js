#!/usr/bin/env node

/**
 * Execute DIRECT Temporal workflow with Redis - showing REAL calculation
 * This will demonstrate ACTUAL Temporal execution with Redis data exchange
 */

const { Client, Connection } = require('@temporalio/client');
const Redis = require('ioredis');

const redis = new Redis({
  host: 'localhost',
  port: 6379
});

async function executeDirectRedisWorkflow() {
  console.log('🚀 DIRECT TEMPORAL + REDIS EXECUTION');
  console.log('===================================\n');

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
    console.log('✅ Cleared Redis');

    // Use working activities directly
    const workflowId = 'direct-redis-' + Date.now();
    const sessionId = 'session-' + Date.now();
    
    console.log('\n📌 EXECUTION DETAILS:');
    console.log(`  Workflow ID: ${workflowId}`);
    console.log(`  Session ID: ${sessionId}`);
    console.log(`  Task Queue: workflow-automation`);
    console.log(`  Input: radius=8, unit=meters`);

    // Create workflow input that will use our working activities
    const workflowInput = {
      workflowId: 'circle-area-calculator',
      parameters: {
        radius: 8,
        unit: 'meters'
      },
      sessionId: sessionId,
      executionId: 'exec-' + Date.now(),
      triggerType: 'manual'
    };

    console.log('\n⏳ Starting Temporal workflow with working activities...');
    
    const handle = await client.workflow.start('dynamicWorkflow', {
      taskQueue: 'workflow-automation',
      workflowId: workflowId,
      args: [workflowInput],
    });

    console.log('✅ Workflow started successfully!');
    console.log(`  Run ID: ${handle.firstExecutionRunId}`);
    console.log(`  Temporal URL: http://localhost:8233/namespaces/default/workflows/${workflowId}`);

    // Enhanced Redis monitoring showing REAL parameter exchange
    console.log('\n📦 MONITORING REDIS PARAMETER EXCHANGE:');
    console.log('━'.repeat(50));
    
    let foundParameters = new Set();
    let calculationDetected = false;
    
    const monitorInterval = setInterval(async () => {
      try {
        const allKeys = await redis.keys('*');
        const relevantKeys = allKeys.filter(k => 
          k.includes(sessionId) || 
          k.includes('validated_radius') || 
          k.includes('calculated_area')
        );
        
        for (const key of relevantKeys) {
          if (!foundParameters.has(key)) {
            const value = await redis.get(key);
            if (value) {
              foundParameters.add(key);
              
              try {
                const parsed = JSON.parse(value);
                
                console.log(`\n🔥 REDIS PARAMETER DETECTED!`);
                console.log(`   Time: ${new Date().toLocaleTimeString()}`);
                console.log(`   Key: ${key}`);
                console.log(`   Activity: ${parsed.activityName || 'unknown'}`);
                console.log(`   Value: ${JSON.stringify(parsed.value)}`);
                
                if (key.includes('calculated_area')) {
                  calculationDetected = true;
                  console.log(`\n🧮 CALCULATION DETECTED!`);
                  console.log(`   🎯 Area calculated: ${parsed.value}`);
                  console.log(`   📐 Using radius from Redis parameter exchange`);
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
    }, 300);

    // Wait for workflow completion
    console.log('\n⏳ Waiting for Temporal workflow to complete...');
    
    let result;
    try {
      result = await handle.result();
      clearInterval(monitorInterval);
      
      console.log('\n' + '='.repeat(60));
      console.log('🎉 TEMPORAL WORKFLOW COMPLETED!');
      console.log('='.repeat(60));
      
    } catch (error) {
      clearInterval(monitorInterval);
      console.log(`\n❌ Workflow failed: ${error.message}`);
    }

    // Final Redis state analysis
    console.log('\n📊 FINAL CALCULATION ANALYSIS:');
    console.log('━'.repeat(40));
    
    const finalKeys = await redis.keys('*');
    console.log(`\nTotal Redis Keys: ${finalKeys.length}`);
    
    // Look for calculation evidence
    const radiusKeys = finalKeys.filter(k => k.includes('validated_radius'));
    const areaKeys = finalKeys.filter(k => k.includes('calculated_area'));
    
    console.log(`Radius Parameters: ${radiusKeys.length}`);
    console.log(`Area Calculations: ${areaKeys.length}`);
    
    if (radiusKeys.length > 0 && areaKeys.length > 0) {
      console.log('\n🧮 CALCULATION VERIFICATION:');
      
      for (const radiusKey of radiusKeys) {
        const radiusData = JSON.parse(await redis.get(radiusKey));
        console.log(`\n  📐 Input Radius: ${radiusData.value} (from validate_input)`);
      }
      
      for (const areaKey of areaKeys) {
        const areaData = JSON.parse(await redis.get(areaKey));
        console.log(`\n  🎯 Calculated Area: ${areaData.value} (from calculate_area)`);
        console.log(`  📊 Formula: π × r² = ${areaData.value}`);
      }
      
      // Verify the math
      const radius = JSON.parse(await redis.get(radiusKeys[0])).value;
      const area = JSON.parse(await redis.get(areaKeys[0])).value;
      const expectedArea = Math.round(Math.PI * radius * radius * 10000) / 10000;
      
      console.log(`\n🔍 MATH VERIFICATION:`);
      console.log(`  Expected: π × ${radius}² = ${expectedArea}`);
      console.log(`  Actual: ${area}`);
      console.log(`  Match: ${Math.abs(area - expectedArea) < 0.0001 ? '✅ YES' : '❌ NO'}`);
    }

    // Show Temporal result
    if (result) {
      console.log('\n📊 TEMPORAL WORKFLOW RESULT:');
      console.log('━'.repeat(30));
      console.log(JSON.stringify(result, null, 2));
    }

    console.log('\n✅ FINAL VERIFICATION:');
    console.log(`  [${result ? '✓' : '✗'}] Temporal workflow executed`);
    console.log(`  [${calculationDetected ? '✓' : '✗'}] Calculation performed in Redis`);
    console.log(`  [${radiusKeys.length > 0 ? '✓' : '✗'}] Input parameters stored`);
    console.log(`  [${areaKeys.length > 0 ? '✓' : '✗'}] Calculation results stored`);
    console.log(`  [${result && radiusKeys.length > 0 && areaKeys.length > 0 ? '✓' : '✗'}] Complete Redis data exchange`);

    if (result && radiusKeys.length > 0 && areaKeys.length > 0) {
      console.log('\n🏆 SUCCESS: Temporal calculated the result using Redis data exchange!');
      console.log('🎯 The workflow used Redis to pass parameters between activities');
      console.log('📊 Both input validation and area calculation were stored in Redis');
    }

    console.log(`\n🌐 View execution in Temporal Web: http://localhost:8233/namespaces/default/workflows/${workflowId}`);
    
    await connection.close();
    
    return {
      success: result && radiusKeys.length > 0 && areaKeys.length > 0,
      workflowId,
      sessionId,
      result,
      parametersFound: finalKeys.length,
      calculationPerformed: calculationDetected
    };

  } catch (error) {
    console.error('\n❌ EXECUTION ERROR:', error.message);
    console.log('\nDebugging steps:');
    console.log('- Check Temporal server: docker logs temporal-server');
    console.log('- Check temporal-worker: docker logs temporal-worker');
    console.log('- Verify Redis: redis-cli ping');
    throw error;
  }
}

async function main() {
  try {
    const results = await executeDirectRedisWorkflow();
    
    console.log('\n🏁 EXECUTION COMPLETE!');
    if (results.success) {
      console.log('✅ SUCCESS: Temporal calculated result using Redis data exchange!');
    } else {
      console.log('❌ Temporal workflow execution incomplete or Redis data exchange missing');
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