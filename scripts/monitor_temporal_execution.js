#!/usr/bin/env node

/**
 * Monitor real Temporal workflow execution and Redis parameter exchange
 */

const http = require('http');
const Redis = require('ioredis');
const fs = require('fs');

const redis = new Redis({
  host: 'localhost',
  port: 6379
});

// Monitor Temporal workflow status
async function getTemporalWorkflowStatus(workflowId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8233,
      path: '/api/v1/namespaces/default/workflows',
      method: 'GET'
    };

    http.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          const workflow = result.executions?.find(e => 
            e.execution.workflowId.includes(workflowId)
          );
          resolve(workflow);
        } catch (error) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Get execution logs from frontend
async function getExecutionLogs(chainId, executionId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: `/api/chains/${chainId}/logs?execution_id=${executionId}`,
      method: 'GET'
    };

    http.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.data || []);
        } catch (error) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

async function main() {
  console.log('🔍 MONITORING TEMPORAL WORKFLOW EXECUTION');
  console.log('==========================================\n');

  const chainId = '3bfa650b-c799-4412-a7f2-81dde5fd3b93';
  const executionId = 'exec_3bfa650b-c799-4412-a7f2-81dde5fd3b93_1755858223953';
  
  console.log(`📌 Chain ID: ${chainId}`);
  console.log(`📌 Execution ID: ${executionId}`);
  console.log(`📌 Session ID: Extracting from execution...\n`);

  // Step 1: Check Temporal status
  console.log('📊 TEMPORAL WORKFLOW STATUS:');
  console.log('----------------------------');
  
  const temporalWorkflow = await getTemporalWorkflowStatus(chainId);
  if (temporalWorkflow) {
    console.log(`✅ Workflow found in Temporal!`);
    console.log(`  Run ID: ${temporalWorkflow.execution.runId}`);
    console.log(`  Status: ${temporalWorkflow.status}`);
    console.log(`  Start Time: ${temporalWorkflow.startTime}`);
    console.log(`  Task Queue: ${temporalWorkflow.taskQueue}`);
    if (temporalWorkflow.closeTime) {
      console.log(`  Close Time: ${temporalWorkflow.closeTime}`);
    }
  } else {
    console.log('⏳ Workflow not yet visible in Temporal...');
  }

  // Step 2: Monitor Redis Parameters
  console.log('\n📦 REDIS PARAMETER EXCHANGE:');
  console.log('----------------------------');
  
  let totalActivities = 0;
  let parametersFound = {};
  
  // Monitor for 30 seconds
  for (let i = 0; i < 15; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Search for all session keys
    const allKeys = await redis.keys('*session*');
    const execKeys = await redis.keys(`*${executionId}*`);
    const workflowKeys = await redis.keys(`*${chainId}*`);
    
    const relevantKeys = [...new Set([...allKeys, ...execKeys, ...workflowKeys])];
    
    if (relevantKeys.length > Object.keys(parametersFound).length) {
      console.log(`\n⏱️  Check ${i + 1}/15 (${new Date().toLocaleTimeString()})`);
      console.log(`  Found ${relevantKeys.length} keys in Redis`);
      
      for (const key of relevantKeys) {
        if (!parametersFound[key]) {
          const value = await redis.get(key);
          try {
            const parsed = JSON.parse(value);
            parametersFound[key] = parsed;
            
            if (parsed.activityName) {
              totalActivities++;
              console.log(`\n  ✅ ACTIVITY EXECUTED: ${parsed.activityName}`);
              console.log(`     Parameter: ${key.split('.').pop()}`);
              console.log(`     Value: ${JSON.stringify(parsed.value)}`);
              console.log(`     Type: ${parsed.type}`);
              console.log(`     Timestamp: ${new Date(parsed.timestamp).toLocaleTimeString()}`);
            }
          } catch {
            // Not JSON, skip
          }
        }
      }
    }
    
    // Check execution logs
    const logs = await getExecutionLogs(chainId, executionId);
    if (logs.length > 0) {
      const latestLog = logs[logs.length - 1];
      console.log(`\n  📝 Latest Log: ${latestLog.message || latestLog.status}`);
      
      if (latestLog.status === 'completed') {
        console.log('\n✅ WORKFLOW COMPLETED!');
        break;
      }
    }
  }

  // Step 3: Final Results
  console.log('\n' + '='.repeat(50));
  console.log('📊 FINAL EXECUTION SUMMARY:');
  console.log('='.repeat(50));
  
  console.log(`\n✅ VERIFICATION CHECKLIST:`);
  console.log(`  [${temporalWorkflow ? '✓' : ' '}] Workflow visible in Temporal`);
  console.log(`  [${totalActivities > 0 ? '✓' : ' '}] Activities executed (${totalActivities} total)`);
  console.log(`  [${Object.keys(parametersFound).length > 0 ? '✓' : ' '}] Parameters stored in Redis (${Object.keys(parametersFound).length} total)`);
  
  if (Object.keys(parametersFound).length > 0) {
    console.log('\n📦 ACTIVITY PARAMETER SUMMARY:');
    const activityParams = Object.entries(parametersFound)
      .filter(([_, v]) => v.activityName)
      .reduce((acc, [k, v]) => {
        if (!acc[v.activityName]) acc[v.activityName] = [];
        acc[v.activityName].push({
          parameter: k.split('.').pop(),
          value: v.value
        });
        return acc;
      }, {});
    
    for (const [activity, params] of Object.entries(activityParams)) {
      console.log(`\n  Activity: ${activity}`);
      params.forEach(p => {
        console.log(`    - ${p.parameter}: ${JSON.stringify(p.value)}`);
      });
    }
  }

  // Step 4: Show workflow result
  const finalResult = await getExecutionLogs(chainId, executionId);
  if (finalResult.length > 0) {
    console.log('\n📋 WORKFLOW EXECUTION RESULT:');
    const completedLog = finalResult.find(log => log.status === 'completed');
    if (completedLog && completedLog.result) {
      console.log(JSON.stringify(completedLog.result, null, 2));
    }
  }

  console.log('\n🌐 VIEW IN UIs:');
  console.log(`  Temporal Web: http://localhost:8233/namespaces/default/workflows/${executionId}`);
  console.log(`  Workflow Editor: http://localhost:3000`);
  
  // Save full report
  const report = {
    chainId,
    executionId,
    temporalStatus: temporalWorkflow?.status,
    totalActivities,
    parametersStored: Object.keys(parametersFound).length,
    parameters: parametersFound,
    timestamp: new Date().toISOString()
  };
  
  fs.writeFileSync('temporal_execution_report.json', JSON.stringify(report, null, 2));
  console.log('\n💾 Full report saved to: temporal_execution_report.json');
  
  await redis.quit();
}

if (require.main === module) {
  main().catch(console.error);
}