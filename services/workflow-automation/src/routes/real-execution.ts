/**
 * Real Workflow Execution Routes
 * Actually deploys and runs workflows in Temporal
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '../shared-utils-local';
import { BasicTemporalExecutor } from '../temporal/basic-executor';
import { SampleWorkflowGenerator } from '../temporal/sample-workflow-generator';
import { EditorSchemaGenerator } from '../services/editor-schema-generator';

const logger = createServiceLogger('real-execution');

interface ExecuteWorkflowRequest {
  workflow_type: 'ecommerce' | 'data-processing' | 'notification' | 'custom';
  workflow_code?: string; // For custom workflows
  workflow?: any; // For drag&drop workflows
  requirements?: string; // For AI-generated workflows
  input_data?: any;
  temporal_config?: {
    taskQueue?: string;
    timeout?: string;
    retryPolicy?: any;
  };
}

interface ExecuteWorkflowChainRequest {
  workflows: Array<{
    name: string;
    type: 'ecommerce' | 'data-processing' | 'notification';
    input: any;
    dependencies?: string[];
  }>;
}

export async function realExecutionRoutes(fastify: FastifyInstance): Promise<void> {
  
  // Initialize Basic Temporal executor (using Basic until webpack issues are resolved)
  const temporalExecutor = new BasicTemporalExecutor(logger.getLogger());

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    await temporalExecutor.shutdown();
  });

  // Execute generated workflow by execution ID - FACTORIAL WORKFLOW ENDPOINT
  fastify.post<{ 
    Params: { executionId: string }, 
    Body: any 
  }>('/workflow-automation/api/execute/:executionId', async (request, reply) => {
    const { executionId } = request.params;
    const inputData = request.body || {};
    
    logger.info('🚀 Executing factorial workflow via execution ID', { 
      executionId, 
      inputData: JSON.stringify(inputData).substring(0, 200) 
    });

    try {
      // Parse execution ID to extract workflow ID
      // Format: exec_ac4ce05e-9c79-44ca-a828-af9b50d0cb44_1755898057936
      const workflowIdMatch = executionId.match(/exec_([a-f0-9-]+)_\d+/);
      if (!workflowIdMatch) {
        return reply.status(400).send({ 
          error: 'Invalid execution ID format', 
          expected: 'exec_{workflowId}_{timestamp}',
          received: executionId 
        });
      }

      const workflowId = workflowIdMatch[1];
      logger.info('📋 Extracted workflow ID from execution ID', { workflowId, executionId });

      // Submit to Temporal worker with dynamic workflow wrapper
      const temporalClient = await temporalExecutor.getClient();
      
      const workflowHandle = await temporalClient.workflow.start('dynamicWorkflow', {
        args: [{
          workflowId: workflowId,
          parameters: inputData,
          executionId: executionId,
          triggerType: 'manual' as const
        }],
        taskQueue: 'workflow-automation',
        workflowId: executionId,
      });

      logger.info('✅ Factorial workflow submitted to Temporal', { 
        executionId,
        workflowId, 
        temporalWorkflowId: workflowHandle.workflowId 
      });

      // Return execution details
      return reply.send({
        success: true,
        executionId: executionId,
        workflowId: workflowId,
        temporalWorkflowId: workflowHandle.workflowId,
        status: 'submitted',
        message: 'Factorial workflow submitted to Temporal for execution'
      });

    } catch (error) {
      logger.error('❌ Failed to execute factorial workflow', { 
        executionId, 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      return reply.status(500).send({
        success: false,
        executionId: executionId,
        error: 'Failed to execute workflow',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
}