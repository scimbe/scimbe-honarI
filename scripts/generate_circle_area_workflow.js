#!/usr/bin/env node

/**
 * Script to generate a workflow for calculating the area of a circle
 * Uses the workflow automation API at http://localhost:8092/workflow-automation/api/workflows/generate
 */

const https = require('http');

// Workflow request payload for circle area calculation
const workflowRequest = {
  name: "Circle Area Calculator",
  description: "Calculate the area of a circle given its radius using the formula π × r²",
  requirements: "Accept radius as input parameter. Validate that radius is a positive number. Calculate area using formula: π × radius². Return the calculated area with appropriate precision. Handle edge cases like zero or negative radius.",
  inputs: [
    {
      name: "radius",
      type: "number",
      description: "The radius of the circle in units",
      required: true,
      validation: "Must be a positive number greater than 0"
    }
  ],
  outputs: [
    {
      name: "area", 
      type: "number",
      description: "The calculated area of the circle",
      format: "Decimal number with 4 decimal places"
    },
    {
      name: "formula_used",
      type: "string", 
      description: "The mathematical formula used for calculation"
    }
  ],
  complexity: "simple",
  domain: "mathematics",
  tags: ["geometry", "circle", "area", "calculation", "math"]
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

  console.log('🚀 Requesting workflow generation for Circle Area Calculator...');
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
          console.log('✅ SUCCESS: Workflow generated successfully!');
          console.log('');
          console.log('📄 Generated Workflow:');
          console.log(JSON.stringify(response, null, 2));
          
          // Extract key information if available
          if (response.workflow) {
            console.log('\n🔍 Workflow Summary:');
            console.log(`  📝 Name: ${response.workflow.name || 'N/A'}`);
            console.log(`  🆔 ID: ${response.workflow.id || 'N/A'}`);
            console.log(`  📊 Nodes: ${response.workflow.nodes?.length || 0}`);
            console.log(`  🔗 Edges: ${response.workflow.edges?.length || 0}`);
          }
        } else {
          console.log('❌ ERROR: Failed to generate workflow');
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
  console.log('🔄 Circle Area Workflow Generator');
  console.log('==================================\n');
  generateWorkflow();
}

module.exports = { generateWorkflow, workflowRequest };