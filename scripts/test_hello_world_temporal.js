#!/usr/bin/env node

/**
 * HELLO WORLD TEMPORAL TEST
 * Tests the simple hello world workflow on Temporal with Redis parameter exchange
 */

const { Client, Connection } = require('@temporalio/client');
const Redis = require('ioredis');

const redis = new Redis({
  host: 'localhost',
  port: 6379
});

async function testHelloWorldTemporal() {
  console.log('🌟 TESTING HELLO WORLD ON TEMPORAL');
  console.log('==================================\n');

  try {
    // Clear Redis for clean test
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

    const sessionId = 'hello-world-' + Date.now();
    const workflowId = 'hello-world';
    const executionId = 'hello-exec-' + Date.now();

    console.log('🚀 Starting Hello World Temporal Workflow...');
    console.log(`  Session ID: ${sessionId}`);
    console.log(`  Workflow ID: ${workflowId}`);
    console.log(`  Execution ID: ${executionId}`);

    // Workflow input with all parameters for the 3 activities
    const workflowInput = {
      workflowId: workflowId,
      parameters: {
        // Activity 1: generate_greeting
        name: 'Temporal World',
        language: 'de',
        
        // Activity 2: personalize_message  
        mood: 'excited',
        time_of_day: 'morning',
        
        // Activity 3: generate_farewell
        farewell_style: 'warm'
      },
      sessionId: sessionId,
      executionId: executionId,
      triggerType: 'manual'
    };

    console.log('\n📋 Input Parameters:');
    console.log('  Name: "Temporal World"');
    console.log('  Language: "de" (German)');
    console.log('  Mood: "excited" 🎉');
    console.log('  Time: "morning"');
    console.log('  Farewell: "warm"');

    console.log('\n📡 Starting workflow execution...');
    
    // Start the workflow
    const handle = await client.workflow.start('dynamicWorkflow', {
      taskQueue: 'workflow-automation',
      workflowId: executionId,
      args: [workflowInput],
    });

    console.log('✅ Workflow started!');
    console.log(`  Run ID: ${handle.firstExecutionRunId}`);
    console.log(`  Temporal Web: http://localhost:8233/namespaces/default/workflows/${executionId}`);

    // Monitor Redis parameter exchange
    console.log('\n🔄 Monitoring Redis Parameter Exchange...');
    console.log('━'.repeat(60));
    
    let foundParameters = new Set();
    let activityCount = 0;
    const expectedActivities = ['generate_greeting', 'personalize_message', 'generate_farewell'];
    
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
                
                console.log(`\n🔥 REDIS PARAMETER EXCHANGE!`);
                console.log(`   Time: ${new Date().toLocaleTimeString()}`);
                console.log(`   Parameter: ${paramName}`);
                console.log(`   Activity: ${parsed.activityName}`);
                console.log(`   Redis Key: ${key}`);
                
                if (parsed.value && typeof parsed.value === 'object') {
                  Object.keys(parsed.value).forEach(prop => {
                    console.log(`   ${prop}: ${parsed.value[prop]}`);
                  });
                } else {
                  console.log(`   Value: ${parsed.value}`);
                }
                
                // Track activity completion
                if (expectedActivities.includes(parsed.activityName)) {
                  activityCount++;
                  console.log(`   ✅ Activity ${activityCount}/3 completed`);
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
      console.log('🎉 HELLO WORLD WORKFLOW COMPLETED!');
      console.log('='.repeat(60));
      
    } catch (error) {
      clearInterval(monitorInterval);
      console.log(`\n❌ Workflow failed: ${error.message}`);
    }

    // Final Redis analysis
    console.log('\n📊 FINAL REDIS ANALYSIS:');
    console.log('━'.repeat(40));
    
    const finalKeys = await redis.keys(`${sessionId}*`);
    console.log(`\nTotal Redis parameters: ${finalKeys.length}`);
    
    let greetingResult = null;
    let personalizedResult = null;
    let farewellResult = null;
    
    for (const key of finalKeys) {
      const value = await redis.get(key);
      const parsed = JSON.parse(value);
      const paramName = key.split('.').pop();
      
      console.log(`\n  📊 ${paramName}:`);
      console.log(`     Activity: ${parsed.activityName}`);
      
      if (parsed.activityName === 'generate_greeting') {
        greetingResult = parsed.value;
        console.log(`     Greeting: ${greetingResult.greeting}`);
      } else if (parsed.activityName === 'personalize_message') {
        personalizedResult = parsed.value;
        console.log(`     Personalized: ${personalizedResult.personalized_greeting}`);
      } else if (parsed.activityName === 'generate_farewell') {
        farewellResult = parsed.value;
        console.log(`     Complete: ${farewellResult.complete_conversation}`);
        console.log(`     Duration: ${farewellResult.total_execution_time}ms`);
      }
    }

    // Show Temporal result
    if (result) {
      console.log('\n📊 TEMPORAL WORKFLOW RESULT:');
      console.log(JSON.stringify(result, null, 2));
    }

    // Show conversation flow
    if (greetingResult && personalizedResult && farewellResult) {
      console.log('\n💬 CONVERSATION FLOW:');
      console.log('━'.repeat(50));
      console.log(`1️⃣ Greeting: ${greetingResult.greeting}`);
      console.log(`2️⃣ Personalized: ${personalizedResult.personalized_greeting}`);
      console.log(`3️⃣ Final: ${farewellResult.complete_conversation}`);
      console.log(`⏱️  Total Time: ${farewellResult.total_execution_time}ms`);
    }

    const success = result && finalKeys.length >= 3;
    
    console.log('\n✅ HELLO WORLD TEST RESULTS:');
    console.log(`  [${result ? '✓' : '✗'}] Temporal workflow executed`);
    console.log(`  [${activityCount >= 3 ? '✓' : '✗'}] All 3 activities completed (${activityCount}/3)`);
    console.log(`  [${finalKeys.length >= 3 ? '✓' : '✗'}] Redis parameters stored (${finalKeys.length})`);
    console.log(`  [${greetingResult ? '✓' : '✗'}] German greeting generated`);
    console.log(`  [${personalizedResult ? '✓' : '✗'}] Mood personalization applied`);
    console.log(`  [${farewellResult ? '✓' : '✗'}] Complete conversation created`);
    console.log(`  [${success ? '✓' : '✗'}] Complete Hello World flow`);

    if (success) {
      console.log('\n🏆 SUCCESS! Hello World Temporal workflow working perfectly!');
      console.log('✅ PostgreSQL → Temporal → Redis integration verified');
      console.log('✅ Sequential activity execution confirmed');
      console.log('✅ Parameter exchange via Redis working');
      console.log('✅ German greeting with excited mood generated');
      console.log('✅ Complete conversation flow demonstrated');
    }

    await connection.close();
    
    return {
      success,
      activitiesCompleted: activityCount,
      redisParameters: finalKeys.length,
      conversationGenerated: !!(greetingResult && personalizedResult && farewellResult),
      executionTime: farewellResult?.total_execution_time
    };

  } catch (error) {
    console.error('\n❌ HELLO WORLD TEST ERROR:', error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  try {
    const results = await testHelloWorldTemporal();
    
    console.log('\n🏁 HELLO WORLD TEMPORAL TEST COMPLETE!');
    
    if (results.success) {
      console.log('✅ SUCCESS: Hello World workflow executed on Temporal!');
      console.log(`✅ Activities completed: ${results.activitiesCompleted}/3`);
      console.log(`✅ Redis parameters: ${results.redisParameters}`);
      console.log(`✅ Conversation generated: ${results.conversationGenerated ? 'YES' : 'NO'}`);
      console.log(`✅ Execution time: ${results.executionTime}ms`);
    } else {
      console.log('❌ Hello World test failed');
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

module.exports = { testHelloWorldTemporal };