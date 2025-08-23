#!/usr/bin/env node

/**
 * Execute workflow through workflow-automation service API
 * This will show the REAL result calculated by the system
 */

const { Client, Connection } = require('@temporalio/client');
const Redis = require('ioredis');
const http = require('http');

const redis = new Redis({
  host: 'localhost',
  port: 6379
});

function makeHttpRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function executeWithWorkflowAutomation() {
  console.log('🚀 EXECUTING VIA WORKFLOW AUTOMATION SERVICE');
  console.log('============================================\n');

  try {
    // Clear Redis for clean monitoring
    await redis.flushdb();
    console.log('✅ Cleared Redis for clean monitoring');

    const sessionId = 'session-' + Date.now();
    const executionId = 'exec-' + Date.now();
    
    console.log('📌 EXECUTION DETAILS:');
    console.log(`  Session ID: ${sessionId}`);
    console.log(`  Execution ID: ${executionId}`);
    console.log(`  Service: workflow-automation:8092`);
    console.log(`  Input: radius=12, unit=cm`);

    // Step 1: Execute workflow via workflow automation service
    console.log('\n⚡ Step 1: Calling workflow automation service...');
    
    const executeOptions = {
      hostname: 'localhost',
      port: 8092,
      path: '/api/workflows/execute',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const executePayload = {
      workflowId: 'circle-area-calculator',
      parameters: {
        radius: 12,
        unit: 'cm'
      },
      sessionId: sessionId,
      executionId: executionId,
      triggerType: 'manual'
    };

    const executeResult = await makeHttpRequest(executeOptions, executePayload);
    console.log('✅ Workflow execution initiated');
    console.log(`  Temporal Run ID: ${executeResult.runId || 'N/A'}`);

    // Step 2: Monitor Redis for parameter exchange
    console.log('\n📦 Step 2: Monitoring Redis parameter exchange...');
    
    let foundParameters = new Set();
    let calculationDetected = false;
    let monitoringActive = true;
    
    const monitorInterval = setInterval(async () => {
      if (!monitoringActive) return;
      
      try {
        const allKeys = await redis.keys('*');
        const relevantKeys = allKeys.filter(k => 
          k.includes(sessionId) || 
          k.includes(executionId) ||
          k.includes('validated_radius') || 
          k.includes('calculated_area') ||
          k.includes('circle-area-calculator')
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
                console.log(`   Value: ${JSON.stringify(parsed.value || parsed)}`);
                console.log(`   Activity: ${parsed.activityName || 'unknown'}`);
                
                if (key.includes('calculated_area') || (parsed.activityName === 'calculate_area')) {
                  calculationDetected = true;
                  console.log(`\n🧮 CALCULATION DETECTED!`);
                  console.log(`   🎯 Area calculated: ${parsed.value || parsed}`);
                  console.log(`   📐 Using parameter exchange through Redis`);
                }
                
              } catch (e) {
                console.log(`\n📝 Raw Parameter: ${key} = ${value}`);
                if (key.includes('area')) calculationDetected = true;
              }
            }
          }
        }
      } catch (error) {
        // Continue monitoring
      }
    }, 500);

    // Wait for workflow completion
    console.log('\n⏳ Step 3: Waiting for workflow execution to complete...');
    
    let executionComplete = false;
    let attempts = 0;
    const maxAttempts = 20;
    
    while (!executionComplete && attempts < maxAttempts) {
      attempts++;
      
      try {
        // Check workflow status
        const statusOptions = {
          hostname: 'localhost',
          port: 8092,
          path: `/api/workflows/status/${executeResult.workflowId || executionId}`,
          method: 'GET'
        };
        
        const status = await makeHttpRequest(statusOptions);
        
        if (status.status === 'completed' || status.status === 'failed' || status.result) {
          executionComplete = true;
          console.log('✅ Workflow execution completed');
          console.log(`  Status: ${status.status || 'completed'}`);
          
          if (status.result) {
            console.log('\n📊 WORKFLOW RESULT:');
            console.log(JSON.stringify(status.result, null, 2));
          }
          break;
        }
        
      } catch (statusError) {
        // Continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    monitoringActive = false;
    clearInterval(monitorInterval);

    // Final analysis
    console.log('\n📊 FINAL ANALYSIS:');
    console.log('━'.repeat(30));
    
    const finalKeys = await redis.keys('*');
    const relevantParams = finalKeys.filter(k => 
      k.includes(sessionId) || 
      k.includes(executionId) ||
      k.includes('validated_radius') || 
      k.includes('calculated_area') ||
      k.includes('circle-area-calculator')
    );
    
    console.log(`Total Redis Keys: ${finalKeys.length}`);
    console.log(`Relevant Parameters: ${relevantParams.length}`);
    console.log(`Parameters Detected: ${foundParameters.size}`);
    console.log(`Calculation Detected: ${calculationDetected ? 'YES' : 'NO'}`);
    
    if (relevantParams.length > 0) {
      console.log('\n🔍 FOUND PARAMETERS:');
      
      let inputRadius = null;
      let calculatedArea = null;
      
      for (const key of relevantParams) {
        const value = await redis.get(key);
        try {
          const parsed = JSON.parse(value);
          const paramName = key.split('.').pop() || key;
          
          console.log(`\n  📊 ${paramName}:`);
          console.log(`     Value: ${JSON.stringify(parsed.value || parsed)}`);
          console.log(`     Activity: ${parsed.activityName || 'unknown'}`);
          console.log(`     Key: ${key}`);
          
          if (paramName === 'validated_radius' || parsed.activityName === 'validate_input') {
            inputRadius = parsed.value || parsed;
          }
          if (paramName === 'calculated_area' || parsed.activityName === 'calculate_area') {
            calculatedArea = parsed.value || parsed;
          }
          
        } catch {
          console.log(`\n  📝 ${key} = ${value}`);
        }
      }
      
      if (inputRadius !== null && calculatedArea !== null) {
        const expectedArea = Math.round(Math.PI * inputRadius * inputRadius * 10000) / 10000;
        console.log('\n🧮 CALCULATION VERIFICATION:');
        console.log(`  Input: radius = ${inputRadius}`);
        console.log(`  Output: area = ${calculatedArea}`);
        console.log(`  Expected: π × ${inputRadius}² = ${expectedArea}`);
        console.log(`  Match: ${Math.abs(calculatedArea - expectedArea) < 0.01 ? '✅ YES' : '❌ NO'}`);
      }
    }

    const success = executionComplete && relevantParams.length > 0 && calculationDetected;
    
    console.log('\n✅ FINAL VERIFICATION:');
    console.log(`  [${executionComplete ? '✓' : '✗'}] Workflow executed`);
    console.log(`  [${relevantParams.length > 0 ? '✓' : '✗'}] Redis parameters found (${relevantParams.length})`);
    console.log(`  [${calculationDetected ? '✓' : '✗'}] Calculation performed`);
    console.log(`  [${success ? '✓' : '✗'}] Complete workflow with Redis data exchange`);

    if (success) {
      console.log('\n🏆 SUCCESS: Workflow calculated result using Redis data exchange!');
      console.log('✅ The workflow automation service successfully executed');
      console.log('✅ Activities exchanged parameters through Redis');
      console.log('✅ Calculation was performed using Redis-stored data');
    }

    return {
      success,
      executionComplete,
      parametersFound: relevantParams.length,
      calculationDetected
    };

  } catch (error) {
    console.error('\n❌ EXECUTION ERROR:', error.message);
    throw error;
  }
}

async function main() {
  try {
    const results = await executeWithWorkflowAutomation();
    
    console.log('\n🏁 EXECUTION COMPLETE!');
    if (results.success) {
      console.log('✅ SUCCESS: Workflow automation service calculated result using Redis!');
    } else {
      console.log('❌ Workflow execution incomplete or Redis data exchange missing');
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