/**
 * Workflow Chain Endpoints - Support for Inter-Workflow Communication
 * These endpoints support the workflow chain executor
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('chain-endpoints');

export async function chainEndpoints(fastify: FastifyInstance): Promise<void> {
  
  /**
   * Get workflow chain definition
   */
  fastify.get<{ Params: { chainId: string } }>('/api/workflows/chains/:chainId/definition', 
  async (request: FastifyRequest<{ Params: { chainId: string } }>, reply: FastifyReply) => {
    const { chainId } = request.params;
    
    logger.info('Loading workflow chain definition', { chainId });
    
    try {
      // Predefined chain definitions for the demo
      const chainDefinitions: Record<string, any> = {
        'add-divide-chain': {
          workflows: [
            {
              id: 'step1',
              workflowId: 'add-numbers-workflow',
              dependencies: [],
              dataMapping: {},
              triggerConditions: {},
              required: true
            },
            {
              id: 'step2', 
              workflowId: 'divide-number-workflow',
              dependencies: ['step1'],
              dataMapping: {
                'step1.result': 'receivedNumber'
              },
              triggerConditions: {},
              required: true
            }
          ],
          metadata: {
            description: 'Add two numbers then divide result by 2',
            finalWorkflow: 'divide-number-workflow',
            executionMode: 'sequential'
          }
        }
      };
      
      const definition = chainDefinitions[chainId];
      if (!definition) {
        return reply.code(404).send({
          error: 'Chain definition not found',
          chainId
        });
      }
      
      logger.info('Chain definition loaded', { chainId, workflowCount: definition.workflows.length });
      
      return reply.code(200).send(definition);
      
    } catch (error) {
      logger.error('Failed to load chain definition', { chainId, error });
      return reply.code(500).send({
        error: 'Failed to load chain definition',
        chainId,
        message: (error as Error).message
      });
    }
  });

  /**
   * Log chain execution events
   */
  fastify.post('/api/workflows/chains/execution-log', 
  async (request: FastifyRequest, reply: FastifyReply) => {
    const logData = request.body as any;
    
    logger.info('Logging chain execution', logData);
    
    try {
      // Store chain execution log in database
      await fastify.extendedDb.storeChainExecutionLog({
        chainId: logData.chainId,
        executionId: logData.executionId,
        status: logData.status,
        currentWorkflow: logData.currentWorkflow,
        result: logData.result,
        timestamp: logData.timestamp || Date.now()
      });
      
      return reply.code(200).send({ success: true });
      
    } catch (error) {
      logger.warn('Failed to store chain execution log', { error });
      return reply.code(200).send({ success: false });
    }
  });

  /**
   * Data transfer between workflows
   */
  fastify.post('/api/workflows/data-transfer', 
  async (request: FastifyRequest, reply: FastifyReply) => {
    const transferData = request.body as any;
    
    logger.info('Processing data transfer', {
      source: transferData.sourceWorkflowId,
      target: transferData.targetWorkflowId,
      type: transferData.transferType
    });
    
    try {
      // Use Redis for workflow data transfer
      const redis = fastify.redis;
      const transferKey = `workflow_transfer:${transferData.sourceWorkflowId}:${transferData.targetWorkflowId}:${Date.now()}`;
      
      await redis.setex(transferKey, 3600, JSON.stringify({
        sourceWorkflowId: transferData.sourceWorkflowId,
        targetWorkflowId: transferData.targetWorkflowId,
        data: transferData.data,
        transferType: transferData.transferType,
        timestamp: transferData.timestamp
      }));
      
      // Notify target workflow
      await redis.publish(`workflow_transfer:${transferData.targetWorkflowId}`, JSON.stringify({
        type: 'data_transfer',
        source: transferData.sourceWorkflowId,
        transferKey,
        transferType: transferData.transferType
      }));
      
      logger.info('Data transfer completed', { transferKey });
      
      return reply.code(200).send({
        success: true,
        transferKey,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Data transfer failed', { error });
      return reply.code(500).send({
        success: false,
        error: (error as Error).message
      });
    }
  });

  /**
   * Create workflow chain dynamically
   */
  fastify.post('/api/workflows/chains/create', 
  async (request: FastifyRequest, reply: FastifyReply) => {
    const chainSpec = request.body as any;
    
    logger.info('Creating workflow chain', { chainId: chainSpec.chainId });
    
    try {
      // Generate chain definition using LLM service
      const llmService = fastify.llmService;
      
      const prompt = `
        Create a workflow chain definition for: ${chainSpec.description}
        
        Requirements:
        - Chain ID: ${chainSpec.chainId}
        - Workflows: ${JSON.stringify(chainSpec.workflows)}
        - Execution Mode: ${chainSpec.executionMode || 'sequential'}
        - Data Flow: ${JSON.stringify(chainSpec.dataFlow)}
        
        Generate a JSON chain definition with workflow dependencies and data mapping.
      `;
      
      const chainDefinition = await llmService.generateContent(prompt);
      
      // Store chain definition
      await fastify.extendedDb.storeChainDefinition(chainSpec.chainId, chainDefinition);
      
      logger.info('Workflow chain created', { chainId: chainSpec.chainId });
      
      return reply.code(201).send({
        success: true,
        chainId: chainSpec.chainId,
        definition: chainDefinition,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Failed to create workflow chain', { error });
      return reply.code(500).send({
        success: false,
        error: (error as Error).message
      });
    }
  });
}