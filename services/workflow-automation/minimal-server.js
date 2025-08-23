/**
 * Minimal Workflow Automation Service
 * Simple Node.js HTTP server that responds to the Enhanced Temporal Workflow Editor
 */

const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 8092;
const HOST = process.env.HOST || '0.0.0.0';

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
      
      const result = {
        success: true,
        message: 'Workflow generated and deployed successfully',
        workflowId: `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`,
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
        "output": f"Processed {name} workflow",
        "timestamp": "{{ datetime.now().isoformat() }}"
    }
`;
}

// HTTP Request handler
async function handleRequest(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
      version: '1.0.0'
    }));
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
    error: 'Not found',
    path: path,
    method: method
  }));
}

// Create and start server
const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`🚀 Workflow Automation Service started`);
  console.log(`📍 Server: http://${HOST}:${PORT}`);
  console.log(`🏥 Health: http://${HOST}:${PORT}/health`);
  console.log(`🤖 API: http://${HOST}:${PORT}/api/workflows/generate`);
  console.log(`⚙️  Environment: ${process.env.NODE_ENV || 'development'}`);
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