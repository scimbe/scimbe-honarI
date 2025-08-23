#!/usr/bin/env node

/**
 * Script to generate a workflow for calculating the factorial of a number
 * Uses the workflow automation API at http://localhost:8092/workflow-automation/api/workflows/generate
 */

const https = require('http');

// Workflow request payload for factorial calculation
const workflowRequest = {
  name: "Factorial Calculator",
  description: "Calculate the factorial of a positive integer using the formula n! = n × (n-1) × ... × 2 × 1",
  requirements: "MANDATORY: Create exactly 3 sequential activities: 1) INPUT VALIDATION ACTIVITY: Accept integer input parameter, validate that input is a non-negative integer (0 ≤ n ≤ 20), throw error if invalid, return validated integer. 2) FACTORIAL CALCULATION ACTIVITY: Receive validated integer, calculate factorial using iterative method (n! = n × (n-1) × ... × 2 × 1), handle edge cases (0! = 1, 1! = 1), return calculated factorial. 3) RESULT FORMATTING ACTIVITY: Receive factorial result, format with calculation steps and formula, return formatted response with factorial value, steps, and formula used.",
  inputs: [
    {
      name: "number",
      type: "integer",
      description: "The positive integer to calculate factorial for",
      required: true,
      validation: "Must be a non-negative integer (0 ≤ n ≤ 20 for performance)"
    }
  ],
  outputs: [
    {
      name: "factorial", 
      type: "integer",
      description: "The calculated factorial result",
      format: "Integer number representing n!"
    },
    {
      name: "calculation_steps",
      type: "string", 
      description: "The step-by-step calculation breakdown"
    },
    {
      name: "formula_used",
      type: "string",
      description: "The mathematical formula and method used"
    }
  ],
  complexity: "simple",
  domain: "mathematics",
  tags: ["factorial", "mathematics", "calculation", "integer", "combinatorics"]
};

// Function to make the HTTP request
function generateWorkflow() {
  const postData = JSON.stringify(workflowRequest);
  
  const options = {
    hostname: 'localhost',
    port: 8092,
    path: '/workflow-automation/api/workflows/generate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  console.log('🚀 Requesting workflow generation for Factorial Calculator...');
  console.log('📍 URL:', `http://${options.hostname}:${options.port}${options.path}`);
  console.log('📊 Payload:', JSON.stringify(workflowRequest, null, 2));
  console.log('\n⏳ Sending request...\n');

  const req = https.request(options, (res) => {
    console.log(`📡 Response Status: ${res.statusCode}`);
    console.log('📋 Response Headers:', res.headers);
    console.log('');

    let responseData = '';
    
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      try {
        const response = JSON.parse(responseData);
        
        if (res.statusCode === 200 || res.statusCode === 201) {
          console.log('✅ SUCCESS: Factorial workflow generated successfully!');
          console.log('');
          console.log('📄 Generated Workflow:');
          console.log(JSON.stringify(response, null, 2));
          
          // Extract key information if available
          if (response.workflow) {
            console.log('\n🔍 Factorial Workflow Summary:');
            console.log(`  📝 Name: ${response.workflow.name || 'N/A'}`);
            console.log(`  🆔 ID: ${response.workflow.id || 'N/A'}`);
            console.log(`  📊 Nodes: ${response.workflow.nodes?.length || 0}`);
            console.log(`  🔗 Edges: ${response.workflow.edges?.length || 0}`);
          }
          
          // Show expected activities
          console.log('\n🎯 Expected Activities to be Generated:');
          console.log('  1️⃣ Validate Non-Negative Integer');
          console.log('  2️⃣ Calculate Factorial');
          console.log('  3️⃣ Format Factorial Result');
          console.log('\n💡 Test with: 5! = 5 × 4 × 3 × 2 × 1 = 120');
        } else {
          console.log('❌ ERROR: Failed to generate factorial workflow');
          console.log('Response:', response);
        }
      } catch (error) {
        console.log('❌ ERROR: Failed to parse response JSON');
        console.log('Raw response:', responseData);
      }
    });
  });

  req.on('error', (error) => {
    console.log('❌ REQUEST ERROR:', error.message);
    console.log('');
    console.log('💡 Troubleshooting tips:');
    console.log('  1. Ensure Docker containers are running: docker-compose ps');
    console.log('  2. Check if workflow-automation service is accessible: curl http://localhost:8092/health');
    console.log('  3. Verify the API endpoint exists and is responding');
  });

  req.write(postData);
  req.end();
}

// Execute the script
if (require.main === module) {
  console.log('🔢 Factorial Workflow Generator');
  console.log('================================\n');
  generateWorkflow();
}

module.exports = { generateWorkflow, workflowRequest };