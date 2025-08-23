/**
 * Enhanced Minimal Workflow Automation Service
 * Provides essential endpoints for the Enhanced Temporal Workflow Editor
 * Includes: GET /api/workflows, DELETE /api/workflows/:id, POST /api/chains
 */

const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 8092;
const HOST = process.env.HOST || '0.0.0.0';

// In-memory workflow storage (for demo purposes)
let workflows = [
  {
    id: 'mlops-iterative-factorial-workflow-1755588443544',
    name: 'MLOps Iterative Factorial Workflow',
    description: 'Iterative factorial calculation with quality assessment',
    category: 'Data Processing',
    complexity: 'moderate',
    estimatedDuration: 5000,
    steps: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 2,
    averageQualityScore: 0.85
  },
  {
    id: 'ecommerce-order-processing-workflow',
    name: 'E-commerce Order Processing',
    description: 'Complete order processing workflow with payment and shipping',
    category: 'E-Commerce',
    complexity: 'complex',
    estimatedDuration: 8000,
    steps: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 15,
    averageQualityScore: 0.92
  }
];

// Simulate AI workflow generation
function simulateWorkflowGeneration(request) {
  const { name, description, endToEndTest, aiConfig } = request;
  
  console.log('Generating workflow:', {
    name,
    description: description.substring(0, 100),
    hasEndToEndTest: !!endToEndTest,
    aiProvider: aiConfig.provider
  });
  
  // Simulate processing time
  const processingTime = Math.random() * 2000 + 1000; // 1-3 seconds
  
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simulate test results if end-to-end test is provided
      const testResults = endToEndTest ? [
        {
          success: Math.random() > 0.3, // 70% success rate
          testName: 'End-to-End Workflow Test',
          expectedResult: 'Expected output based on test description',
          actualResult: 'Simulated workflow execution result',
          errorMessage: Math.random() > 0.3 ? undefined : 'Test assertion failed: output format mismatch'
        }
      ] : [];
      
      const refinementAttempts = endToEndTest ? Math.floor(Math.random() * 3) + 1 : 0;
      const workflowId = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
      
      // Add to workflows list
      workflows.push({
        id: workflowId,
        name: name,
        description: description,
        category: 'Generated',
        complexity: 'moderate',
        estimatedDuration: 5000,
        steps: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: 0,
        averageQualityScore: 0.8
      });
      
      const result = {
        success: true,
        message: 'Workflow generated and deployed successfully',
        workflowId: workflowId,
        code: generateSampleWorkflowCode(name, description),
        testResults,
        refinementAttempts,
        deployment: {
          deploymentPath: `./workflows/generated/${name.toLowerCase()}.py`,
          status: 'deployed'
        }
      };
      
      resolve(result);
    }, processingTime);
  });
}

// Generate sample workflow code
function generateSampleWorkflowCode(name, description) {
  return `#!/usr/bin/env python3
"""
Generated Temporal Workflow: ${name}
Description: ${description}
Generated on: ${new Date().toISOString()}
"""

import asyncio
from datetime import timedelta
from typing import Dict, Any
from temporalio import workflow, activity
from temporalio.common import RetryPolicy

@workflow.defn
class ${name.replace(/[^a-zA-Z0-9]/g, '')}Workflow:
    """${description}"""
    
    @workflow.run
    async def run(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the workflow with the provided input data"""
        workflow_id = workflow.info().workflow_id
        
        try:
            # Execute main workflow logic
            result = await workflow.execute_activity(
                ${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_activity,
                input_data,
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=RetryPolicy(maximum_attempts=3)
            )
            
            return {
                "success": True,
                "workflow_id": workflow_id,
                "result": result,
                "completed_at": workflow.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "workflow_id": workflow_id,
                "error": str(e),
                "failed_at": workflow.now().isoformat()
            }

@activity.defn
async def ${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_activity(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """Main activity implementation"""
    # TODO: Implement actual business logic here
    
    return {
        "processed": True,
        "input": input_data,
        "output": f"Processed ${name} workflow",
        "timestamp": "{{ datetime.now().isoformat() }}"
    }
`;
}

// HTTP Request handler
async function handleRequest(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;
  
  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Health check endpoint
  if (path === '/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'workflow-automation',
      timestamp: new Date().toISOString(),
      version: '2.0.0'
    }));
    return;
  }
  
  // Root endpoint
  if (path === '/' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      service: 'workflow-automation',
      status: 'healthy',
      timestamp: Date.now(),
      version: '2.0.0'
    }));
    return;
  }
  
  // List workflows endpoint
  if (path === '/api/workflows' && method === 'GET') {
    const query = parsedUrl.query;
    let filteredWorkflows = [...workflows];
    
    // Apply filters if provided
    if (query.search) {
      const search = query.search.toLowerCase();
      filteredWorkflows = filteredWorkflows.filter(w => 
        w.name.toLowerCase().includes(search) || 
        w.description.toLowerCase().includes(search)
      );
    }
    
    if (query.category) {
      filteredWorkflows = filteredWorkflows.filter(w => w.category === query.category);
    }
    
    const limit = parseInt(query.limit) || 20;
    const offset = parseInt(query.offset) || 0;
    const paginatedWorkflows = filteredWorkflows.slice(offset, offset + limit);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      workflows: paginatedWorkflows,
      total: filteredWorkflows.length,
      limit: limit,
      offset: offset
    }));
    return;
  }
  
  // Delete workflow endpoint
  if (path.match(/^\/api\/workflows\/(.+)$/) && method === 'DELETE') {
    const workflowId = path.match(/^\/api\/workflows\/(.+)$/)[1];
    
    console.log('Deleting workflow:', workflowId);
    
    // Find workflow
    const workflowIndex = workflows.findIndex(w => w.id === workflowId);
    if (workflowIndex === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'WORKFLOW_NOT_FOUND',
        message: `Workflow ${workflowId} not found`
      }));
      return;
    }
    
    const workflow = workflows[workflowIndex];
    workflows.splice(workflowIndex, 1);
    
    console.log('Workflow deleted successfully:', workflow.name);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: `Workflow "${workflow.name}" deleted successfully`,
      workflowId: workflowId
    }));
    return;
  }
  
  // Workflow chains endpoint (for frontend compatibility)
  if (path === '/api/chains' && method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const requestData = JSON.parse(body);
        const { workflows: chainWorkflows } = requestData;
        
        if (!chainWorkflows || !Array.isArray(chainWorkflows)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'workflows array is required'
          }));
          return;
        }
        
        console.log('Executing workflow chain with', chainWorkflows.length, 'workflows');
        
        // Simulate chain execution
        const deployments = chainWorkflows.map((wf, index) => ({
          workflowId: `${wf.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}-${index}`,
          workflowType: wf.type,
          status: 'running',
          executionUrl: `http://localhost:8088/workflows/${wf.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}-${index}`,
          taskQueue: 'default'
        }));
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          chain_id: `chain_${Date.now()}`,
          workflows_started: deployments.length,
          workflows: deployments,
          message: `Workflow chain with ${deployments.length} workflows is now running in Temporal.`,
          execution_time_ms: Math.floor(Math.random() * 500) + 100
        }));
        
      } catch (error) {
        console.error('Error processing workflow chain:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'WORKFLOW_CHAIN_EXECUTION_FAILED',
          message: error.message
        }));
      }
    });
    
    return;
  }
  
  // Workflow generation endpoint
  if (path === '/api/workflows/generate' && method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const requestData = JSON.parse(body);
        
        // Validate required fields
        if (!requestData.name || !requestData.description || !requestData.aiConfig) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'Missing required fields: name, description, or aiConfig'
          }));
          return;
        }
        
        // Generate workflow
        const result = await simulateWorkflowGeneration(requestData);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        
      } catch (error) {
        console.error('Error processing workflow generation:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: `Internal server error: ${error.message}`
        }));
      }
    });
    
    return;
  }
  
  // Default 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: {
      message: 'Route not found',
      statusCode: 404,
      timestamp: new Date().toISOString(),
      path: path,
      method: method
    }
  }));
}

// Create and start server
const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`🚀 Enhanced Workflow Automation Service started`);
  console.log(`📍 Server: http://${HOST}:${PORT}`);
  console.log(`🏥 Health: http://${HOST}:${PORT}/health`);
  console.log(`📋 Workflows: http://${HOST}:${PORT}/api/workflows`);
  console.log(`🤖 Generate: http://${HOST}:${PORT}/api/workflows/generate`);
  console.log(`⛓️  Chains: http://${HOST}:${PORT}/api/chains`);
  console.log(`⚙️  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\n🎯 Frontend-compatible endpoints:`);
  console.log(`   GET    /api/workflows            - List workflows`);
  console.log(`   DELETE /api/workflows/:id        - Delete workflow`);
  console.log(`   POST   /api/chains               - Execute workflow chains`);
  console.log(`   POST   /api/workflows/generate   - Generate new workflow`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});