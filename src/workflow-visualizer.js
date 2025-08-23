#!/usr/bin/env node

/**
 * Workflow Visualization Converter
 * Converts programmatically created workflows into frontend-displayable format
 */

const { Pool } = require('pg');

async function convertWorkflowToVisualFormat(workflowChainId) {
  const dbPool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'temporal',
    user: 'temporal',
    password: 'temporal',
    ssl: false
  });

  try {
    console.log(`🎨 Converting workflow chain ${workflowChainId} to visual format...`);

    // 1. Get the workflow chain
    const chainResult = await dbPool.query(
      'SELECT * FROM workflow_chains WHERE id = $1',
      [workflowChainId]
    );

    if (chainResult.rows.length === 0) {
      throw new Error(`Workflow chain ${workflowChainId} not found`);
    }

    const chain = chainResult.rows[0];
    const workflowIds = chain.workflows;

    console.log(`📋 Chain: ${chain.name}`);
    console.log(`🔗 Contains ${workflowIds.length} workflow(s)`);

    // 2. Get the workflow definition
    const workflowResult = await dbPool.query(
      'SELECT * FROM workflow_definitions WHERE id = $1',
      [workflowIds[0]]
    );

    if (workflowResult.rows.length === 0) {
      throw new Error(`Workflow ${workflowIds[0]} not found`);
    }

    const workflow = workflowResult.rows[0];
    const workflowDef = workflow.definition;

    console.log(`⚡ Workflow: ${workflow.name}`);
    console.log(`📊 Steps: ${workflowDef.steps.length}`);

    // 3. Create visual nodes
    const nodes = [];
    const edges = [];

    // Start node
    const startNode = {
      id: 'start-node',
      type: 'start',
      position: { x: 100, y: 200 },
      data: {
        label: 'Start',
        description: 'Workflow execution begins here'
      }
    };
    nodes.push(startNode);

    // Activity nodes from workflow steps
    let x = 300;
    const y = 200;
    let previousNodeId = 'start-node';

    for (let i = 0; i < workflowDef.steps.length; i++) {
      const step = workflowDef.steps[i];
      
      const nodeId = `activity-${i + 1}`;
      const activityNode = {
        id: nodeId,
        type: 'activity',
        position: { x: x, y: y },
        data: {
          label: step.name,
          description: step.activity_id,
          activityType: step.activity_id,
          inputs: step.inputs || {},
          outputs: step.outputs || []
        }
      };
      nodes.push(activityNode);

      // Create edge from previous node
      edges.push({
        id: `edge-${previousNodeId}-${nodeId}`,
        source: previousNodeId,
        target: nodeId,
        type: 'smoothstep'
      });

      previousNodeId = nodeId;
      x += 250; // Space nodes horizontally
    }

    // End node
    const endNode = {
      id: 'end-node',
      type: 'end',
      position: { x: x, y: y },
      data: {
        label: 'End',
        description: 'Workflow execution completes here'
      }
    };
    nodes.push(endNode);

    // Final edge to end node
    edges.push({
      id: `edge-${previousNodeId}-end-node`,
      source: previousNodeId,
      target: 'end-node',
      type: 'smoothstep'
    });

    console.log(`✨ Created ${nodes.length} nodes and ${edges.length} edges`);

    // 4. Update the workflow chain with visual data
    const visualChainDefinition = {
      nodes: nodes,
      edges: edges,
      workflows: workflowIds,
      version: '1.0',
      visual: true
    };

    await dbPool.query(`
      UPDATE workflow_chains 
      SET 
        chain_definition = $1,
        metadata = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [
      JSON.stringify(visualChainDefinition),
      JSON.stringify({
        ...chain.metadata,
        visual: true,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        layout: 'horizontal'
      }),
      workflowChainId
    ]);

    console.log('✅ Workflow chain updated with visual data');

    await dbPool.end();

    return {
      success: true,
      workflowChainId: workflowChainId,
      nodes: nodes.length,
      edges: edges.length,
      visualData: {
        nodes: nodes,
        edges: edges
      }
    };

  } catch (error) {
    console.error('❌ Error:', error.message);
    await dbPool.end();
    throw error;
  }
}

if (require.main === module) {
  const workflowChainId = process.argv[2] || 'circle-area-chain-1755791750';
  
  convertWorkflowToVisualFormat(workflowChainId)
    .then(result => {
      console.log('');
      console.log('🎉 WORKFLOW VISUALIZATION COMPLETED!');
      console.log('===================================');
      console.log('');
      console.log(`✅ Workflow Chain: ${result.workflowChainId}`);
      console.log(`📊 Visual Nodes: ${result.nodes}`);
      console.log(`🔗 Visual Edges: ${result.edges}`);
      console.log('');
      console.log('🎯 FRONTEND DISPLAY:');
      console.log('   - Refresh localhost:3000');
      console.log('   - Click "Edit" on the Circle Area workflow');
      console.log('   - You should now see the visual workflow diagram!');
      console.log('');
    })
    .catch(error => {
      console.error('❌ Conversion failed:', error);
      process.exit(1);
    });
}

module.exports = { convertWorkflowToVisualFormat };