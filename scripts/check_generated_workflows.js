#!/usr/bin/env node

/**
 * Script to check for generated workflows and their artifacts
 * Attempts to find endpoints to retrieve generated workflow details
 */

const http = require('http');

// Function to make HTTP GET request
function makeRequest(url, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔍 ${description}`);
    console.log(`📍 URL: ${url}`);
    
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          console.log(`📡 Status: ${res.statusCode}`);
          
          if (res.statusCode === 200) {
            console.log('✅ SUCCESS');
            console.log(JSON.stringify(response, null, 2));
          } else {
            console.log('❌ ERROR');
            console.log(JSON.stringify(response, null, 2));
          }
          
          resolve({ status: res.statusCode, data: response });
        } catch (error) {
          console.log(`📡 Status: ${res.statusCode}`);
          console.log('📄 Raw response:', responseData);
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (error) => {
      console.log('❌ REQUEST ERROR:', error.message);
      reject(error);
    });

    req.end();
  });
}

// Function to check various endpoints
async function checkEndpoints() {
  console.log('🔄 Checking Workflow Automation API Endpoints');
  console.log('==============================================');

  const baseUrl = 'http://localhost:8092';
  const workflowId = 'c0a60a8b-2f59-4982-869e-9e0af9777ae4'; // From the logs
  
  const endpoints = [
    `${baseUrl}/workflow-automation/api/status`,
    `${baseUrl}/workflow-automation/api/workflows`,
    `${baseUrl}/workflow-automation/api/workflows/list`,
    `${baseUrl}/workflow-automation/api/workflows/${workflowId}`,
    `${baseUrl}/workflow-automation/api/workflows/generate/${workflowId}`,
    `${baseUrl}/workflow-automation/api/workflows/generate/status/${workflowId}`,
    `${baseUrl}/workflow-automation/api/generated-workflows`,
    `${baseUrl}/workflow-automation/api/generated-workflows/${workflowId}`,
    `${baseUrl}/workflow-automation/api/executions`,
    `${baseUrl}/workflow-automation/api/executions/${workflowId}`,
    `${baseUrl}/workflow-automation/api/artifacts`,
    `${baseUrl}/workflow-automation/api/artifacts/${workflowId}`,
    `${baseUrl}/api/workflows`,
    `${baseUrl}/api/workflows/${workflowId}`,
    `${baseUrl}/health`,
    `${baseUrl}/status`
  ];

  const results = [];
  
  for (const endpoint of endpoints) {
    try {
      const result = await makeRequest(endpoint, `Testing: ${endpoint.replace(baseUrl, '')}`);
      results.push({ endpoint, ...result });
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      results.push({ endpoint, status: 'error', error: error.message });
    }
  }

  console.log('\n📊 SUMMARY OF ENDPOINT TESTS');
  console.log('============================');
  
  const successfulEndpoints = results.filter(r => r.status === 200);
  const failedEndpoints = results.filter(r => r.status !== 200);
  
  console.log(`✅ Successful endpoints: ${successfulEndpoints.length}`);
  successfulEndpoints.forEach(r => {
    console.log(`  📍 ${r.endpoint}`);
  });
  
  console.log(`\n❌ Failed endpoints: ${failedEndpoints.length}`);
  failedEndpoints.forEach(r => {
    console.log(`  📍 ${r.endpoint} (${r.status})`);
  });
  
  return results;
}

// Execute the script
if (require.main === module) {
  checkEndpoints().catch(console.error);
}

module.exports = { checkEndpoints, makeRequest };