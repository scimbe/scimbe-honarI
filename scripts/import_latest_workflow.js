#!/usr/bin/env node

/**
 * Script to import the latest generated workflow into the main workflow editor
 * This bridges the gap between the workflow automation service and the main frontend
 */

const http = require('http');

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

// Get the latest generated workflow from database
async function getLatestGeneratedWorkflow() {
  console.log('🔍 Getting latest generated workflow from database...');
  
  // Query the database directly via the enhanced-workflow-editor
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
    
    if (response.status === 200 && response.data.success) {
      const workflows = response.data.data || [];
      if (workflows.length > 0) {
        const latest = workflows[0];
        console.log(`✅ Found latest workflow: ${latest.workflow_id}`);
        console.log(`   Class: ${latest.temporal_workflow_class}`);
        console.log(`   Created: ${latest.created_at}`);
        console.log(`   Quality: ${latest.quality_score}`);
        return latest;
      } else {
        console.log('❌ No generated workflows found');
        return null;
      }
    } else {
      console.log('❌ Failed to get generated workflows:', response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error getting generated workflows:', error.message);
    return null;
  }
}

// Create workflow chain from generated workflow data
async function createWorkflowChain(generatedWorkflow) {
  console.log(`\n📝 Creating workflow chain from: ${generatedWorkflow.workflow_id}`);
  
  // Create a workflow chain that the frontend can display
  const chainData = {
    name: `Circle Area Calculator (Generated)`,
    description: `Generated workflow: ${generatedWorkflow.requirements}`,
    nodes: [
      {
        id: 'start_node',
        type: 'start', 
        position: { x: 100, y: 200 },
        data: {
          label: 'Start',
          description: 'Workflow start'
        }
      },
      {
        id: 'circle_calc_node',
        type: 'activity',
        position: { x: 300, y: 200 },
        data: {
          label: generatedWorkflow.temporal_workflow_class || 'Circle Area Calculator',
          description: generatedWorkflow.requirements,
          activityType: 'custom',
          config: {
            generated: true,
            sourceWorkflowId: generatedWorkflow.workflow_id,
            qualityScore: generatedWorkflow.quality_score,
            language: generatedWorkflow.target_language,
            code: generatedWorkflow.generated_code ? generatedWorkflow.generated_code.substring(0, 500) + '...' : 'Generated code available'
          }
        }
      },
      {
        id: 'end_node',
        type: 'end',
        position: { x: 500, y: 200 },
        data: {
          label: 'End',
          description: 'Workflow end'
        }
      }
    ],
    edges: [
      {
        id: 'edge_start_calc',
        source: 'start_node',
        target: 'circle_calc_node',
        type: 'default'
      },
      {
        id: 'edge_calc_end',
        source: 'circle_calc_node', 
        target: 'end_node',
        type: 'default'
      }
    ],
    metadata: {
      version: '1.0',
      author: 'Workflow Automation',
      tags: ['generated', 'circle', 'area', 'math'],
      sourceWorkflowId: generatedWorkflow.workflow_id,
      qualityScore: generatedWorkflow.quality_score,
      imported: true,
      importedAt: new Date().toISOString()
    }
  };

  const postData = JSON.stringify(chainData);
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/chains',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  try {
    const response = await makeRequest(options, postData);
    
    if (response.status === 200 || response.status === 201) {
      console.log('✅ Workflow chain created successfully!');
      const chain = response.data.data;
      console.log(`   Chain ID: ${chain.id}`);
      console.log(`   Name: ${chain.name}`);
      console.log(`   Nodes: ${chain.nodes?.length || 0}`);
      return chain;
    } else {
      console.log('❌ Failed to create workflow chain:', response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Error creating workflow chain:', error.message);
    return null;
  }
}

// Verify the workflow appears in the main editor
async function verifyWorkflowInEditor() {
  console.log('\n✅ Verifying workflow appears in main editor...');
  
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
    
    if (response.status === 200 && response.data.success) {
      const chains = response.data.data || [];
      console.log(`✅ Found ${chains.length} workflow(s) in main editor:`);
      
      chains.forEach((chain, index) => {
        console.log(`\n  ${index + 1}. ${chain.name}`);
        console.log(`     ID: ${chain.id}`);
        console.log(`     Nodes: ${chain.nodes?.length || 0}`);
        console.log(`     Created: ${chain.created_at}`);
        
        if (chain.metadata?.imported) {
          console.log(`     🎯 IMPORTED from: ${chain.metadata.sourceWorkflowId}`);
          console.log(`     🏆 Quality: ${chain.metadata.qualityScore}`);
        }
      });
      
      return chains;
    } else {
      console.log('❌ Failed to get workflows from main editor:', response.data);
      return [];
    }
  } catch (error) {
    console.log('❌ Error verifying workflows:', error.message);
    return [];
  }
}

// Main execution
async function main() {
  console.log('🚀 Import Latest Generated Workflow');
  console.log('===================================\n');

  try {
    // Step 1: Get latest generated workflow
    const generatedWorkflow = await getLatestGeneratedWorkflow();
    if (!generatedWorkflow) {
      console.log('\n❌ No generated workflow to import');
      return;
    }

    // Step 2: Create workflow chain
    const chain = await createWorkflowChain(generatedWorkflow);
    if (!chain) {
      console.log('\n❌ Failed to create workflow chain');
      return;
    }

    // Step 3: Verify it appears in the editor
    const workflows = await verifyWorkflowInEditor();

    console.log('\n🎉 SUCCESS!');
    console.log('============');
    console.log('✅ Latest generated workflow imported successfully');
    console.log(`✅ Available in main editor with ID: ${chain.id}`);
    console.log('\n📍 View at: http://localhost:3000');
    console.log(`🔧 Edit workflow: Select "${chain.name}" from the workflow list`);

  } catch (error) {
    console.log('\n❌ Fatal error:', error.message);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { 
  getLatestGeneratedWorkflow,
  createWorkflowChain,
  verifyWorkflowInEditor,
  main
};