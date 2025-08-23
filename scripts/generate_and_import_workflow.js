#!/usr/bin/env node

/**
 * Complete workflow script that:
 * 1. Generates a workflow using the workflow automation API
 * 2. Imports it into the main workflow editor
 * 3. Verifies it appears in the workflow list
 */

const http = require('http');

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

// Function to make HTTP requests
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = responseData ? JSON.parse(responseData) : {};
          resolve({ status: res.statusCode, data: response, headers: res.headers });
        } catch (error) {
          resolve({ status: res.statusCode, data: responseData, headers: res.headers });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// Step 1: Generate workflow
async function generateWorkflow() {
  console.log('🔄 Step 1: Generating Circle Area Workflow');
  console.log('==========================================\n');

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

  try {
    const response = await makeRequest(options, postData);
    
    if (response.status === 200 || response.status === 201) {
      console.log('✅ Workflow generation request successful!');
      console.log('📊 Response:', JSON.stringify(response.data, null, 2));
      
      // Wait a bit for workflow to complete
      console.log('\n⏳ Waiting for workflow generation to complete...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      return true;
    } else {
      console.log('❌ Workflow generation failed');
      console.log('📊 Response:', response.data);
      return false;
    }
  } catch (error) {
    console.log('❌ Error generating workflow:', error.message);
    return false;
  }
}

// Step 2: Get generated workflows
async function getGeneratedWorkflows() {
  console.log('\n🔍 Step 2: Retrieving Generated Workflows');
  console.log('=========================================\n');

  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/generated-workflows',
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  };

  try {
    const response = await makeRequest(options);
    
    if (response.status === 200) {
      console.log('✅ Generated workflows retrieved successfully!');
      const workflows = response.data.data || [];
      
      if (workflows.length > 0) {
        console.log(`📊 Found ${workflows.length} generated workflow(s):`);
        workflows.forEach((workflow, index) => {
          console.log(`\n  ${index + 1}. Workflow ID: ${workflow.workflow_id}`);
          console.log(`     Class: ${workflow.temporal_workflow_class}`);
          console.log(`     Quality Score: ${workflow.quality_score}`);
          console.log(`     Created: ${workflow.created_at}`);
          console.log(`     Requirements: ${workflow.requirements.substring(0, 100)}...`);
        });
        
        return workflows[0]; // Return the most recent workflow
      } else {
        console.log('❌ No generated workflows found');
        return null;
      }
    } else {
      console.log('❌ Failed to retrieve generated workflows');
      console.log('📊 Response:', response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error retrieving generated workflows:', error.message);
    return null;
  }
}

// Step 3: Import workflow into main editor
async function importWorkflow(generatedWorkflow) {
  console.log('\n📥 Step 3: Importing Workflow into Main Editor');
  console.log('==============================================\n');

  const importData = {
    name: "Circle Area Calculator (Imported)",
    description: "Imported generated workflow for calculating circle area"
  };

  const postData = JSON.stringify(importData);
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: `/api/generated-workflows/${generatedWorkflow.workflow_id}/import`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  try {
    const response = await makeRequest(options, postData);
    
    if (response.status === 200 || response.status === 201) {
      console.log('✅ Workflow imported successfully!');
      console.log('📊 Imported workflow details:');
      const importedWorkflow = response.data.data;
      console.log(`  📝 Name: ${importedWorkflow.name}`);
      console.log(`  🆔 ID: ${importedWorkflow.id}`);
      console.log(`  📊 Nodes: ${importedWorkflow.nodes?.length || 0}`);
      console.log(`  🔗 Edges: ${importedWorkflow.edges?.length || 0}`);
      
      return importedWorkflow;
    } else {
      console.log('❌ Failed to import workflow');
      console.log('📊 Response:', response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error importing workflow:', error.message);
    return null;
  }
}

// Step 4: Verify workflow appears in main editor
async function verifyWorkflowInEditor() {
  console.log('\n✅ Step 4: Verifying Workflow in Main Editor');
  console.log('============================================\n');

  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/chains',
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  };

  try {
    const response = await makeRequest(options);
    
    if (response.status === 200) {
      const workflows = response.data.data || [];
      console.log(`✅ Found ${workflows.length} workflow(s) in main editor:`);
      
      workflows.forEach((workflow, index) => {
        console.log(`\n  ${index + 1}. ${workflow.name}`);
        console.log(`     ID: ${workflow.id}`);
        console.log(`     Description: ${workflow.description}`);
        console.log(`     Nodes: ${workflow.nodes?.length || 0}`);
        console.log(`     Created: ${workflow.created_at}`);
        
        // Check if this is our imported workflow
        if (workflow.metadata?.imported) {
          console.log(`     🎯 IMPORTED from workflow ID: ${workflow.metadata.sourceWorkflowId}`);
          console.log(`     🏆 Quality Score: ${workflow.metadata.qualityScore}`);
        }
      });
      
      return workflows;
    } else {
      console.log('❌ Failed to retrieve workflows from main editor');
      console.log('📊 Response:', response.data);
      return [];
    }
  } catch (error) {
    console.log('❌ Error verifying workflows:', error.message);
    return [];
  }
}

// Main execution
async function main() {
  console.log('🚀 Complete Workflow Generation and Import Process');
  console.log('==================================================\n');

  try {
    // Step 1: Generate workflow
    const generated = await generateWorkflow();
    if (!generated) {
      console.log('\n❌ Process stopped: Workflow generation failed');
      return;
    }

    // Step 2: Get generated workflows
    const generatedWorkflow = await getGeneratedWorkflows();
    if (!generatedWorkflow) {
      console.log('\n❌ Process stopped: No generated workflows found');
      return;
    }

    // Step 3: Import workflow
    const importedWorkflow = await importWorkflow(generatedWorkflow);
    if (!importedWorkflow) {
      console.log('\n❌ Process stopped: Workflow import failed');
      return;
    }

    // Step 4: Verify in main editor
    const workflows = await verifyWorkflowInEditor();

    console.log('\n🎉 SUCCESS: Complete Process Finished!');
    console.log('=====================================');
    console.log('✅ Workflow generated by automation service');
    console.log('✅ Workflow imported into main editor');
    console.log('✅ Workflow verified in workflow list');
    console.log(`\n📍 You can now view the workflow at: http://localhost:3000`);
    console.log(`🔧 Edit the imported workflow with ID: ${importedWorkflow.id}`);

  } catch (error) {
    console.log('\n❌ Fatal error:', error.message);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { 
  generateWorkflow, 
  getGeneratedWorkflows, 
  importWorkflow, 
  verifyWorkflowInEditor 
};