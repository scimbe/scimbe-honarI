/**
 * Workflow Execution API Routes
 * REST API endpoints for executing Temporal workflows
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '../shared-utils-local';
import { TemporalWorkflowExecutor } from '../temporal/workflow-executor';
import type { 
  AddNumbersInput,
  TeamsWebhookInput,
  GitHubMcpInput
} from '../temporal/workflows';

const logger = createServiceLogger('workflow-execution-routes');

// Initialize workflow executor
let workflowExecutor: TemporalWorkflowExecutor;

export async function workflowExecutionRoutes(fastify: FastifyInstance): Promise<void> {
  
  // Initialize workflow executor
  workflowExecutor = new TemporalWorkflowExecutor(
    process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    process.env.TEMPORAL_NAMESPACE || 'default',
    process.env.TEMPORAL_TASK_QUEUE || 'workflow-automation'
  );

  try {
    await workflowExecutor.initialize();
    logger.getLogger().info('Workflow executor initialized successfully');
  } catch (error) {
    logger.error(error as Error, {}, 'Failed to initialize workflow executor');
  }

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    if (workflowExecutor) {
      await workflowExecutor.shutdown();
    }
  });

  // Execute Add Numbers Workflow
  fastify.post<{ Body: { input: AddNumbersInput; workflowId?: string } }>(
    '/api/v1/workflows/add-numbers/execute', 
    {
      schema: {
        body: {
          type: 'object',
          required: ['input'],
          properties: {
            input: {
              type: 'object',
              required: ['number1', 'number2'],
              properties: {
                number1: { type: 'number' },
                number2: { type: 'number' },
                multiplier: { type: 'number' }
              }
            },
            workflowId: { type: 'string' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              workflowId: { type: 'string' },
              runId: { type: 'string' },
              status: { type: 'string' },
              result: { type: 'object' },
              executionTime: { type: 'number' },
              temporalUI: { type: 'string' }
            }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: { input: AddNumbersInput; workflowId?: string } }>, reply: FastifyReply) => {
      const startTime = Date.now();
      
      try {
        logger.getLogger().info('Executing Add Numbers workflow', { 
          input: request.body.input,
          workflowId: request.body.workflowId
        });

        const result = await workflowExecutor.executeAddNumbers(
          request.body.input, 
          request.body.workflowId
        );

        const executionTime = Date.now() - startTime;

        return reply.send({
          success: result.status === 'completed',
          workflowId: result.workflowId,
          runId: result.runId,
          status: result.status,
          result: result.result,
          executionTime,
          temporalUI: `http://localhost:8088/namespaces/default/workflows/${result.workflowId}`,
          message: result.status === 'completed' 
            ? 'Add Numbers workflow completed successfully!' 
            : `Workflow ${result.status}: ${result.error || 'Unknown error'}`
        });

      } catch (error) {
        logger.error(error as Error, { input: request.body.input }, 'Add Numbers workflow execution failed');
        
        return reply.status(500).send({
          success: false,
          error: 'WORKFLOW_EXECUTION_FAILED',
          message: (error as Error).message,
          executionTime: Date.now() - startTime
        });
      }
    }
  );

  // Execute Teams Webhook Workflow
  fastify.post<{ Body: { input: TeamsWebhookInput; workflowId?: string } }>(
    '/api/v1/workflows/teams-webhook/execute',
    {
      schema: {
        body: {
          type: 'object',
          required: ['input'],
          properties: {
            input: {
              type: 'object',
              required: ['webhookUrl', 'title', 'message', 'priority', 'author'],
              properties: {
                webhookUrl: { type: 'string' },
                title: { type: 'string' },
                message: { type: 'string' },
                priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
                author: {
                  type: 'object',
                  required: ['name', 'email'],
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string' }
                  }
                },
                additionalData: { type: 'object' },
                fallbackEmail: { type: 'string' },
                requireDeliveryConfirmation: { type: 'boolean' }
              }
            },
            workflowId: { type: 'string' }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: { input: TeamsWebhookInput; workflowId?: string } }>, reply: FastifyReply) => {
      const startTime = Date.now();
      
      try {
        logger.getLogger().info('Executing Teams Webhook workflow', { 
          title: request.body.input.title,
          priority: request.body.input.priority,
          workflowId: request.body.workflowId
        });

        const result = await workflowExecutor.executeTeamsWebhook(
          request.body.input, 
          request.body.workflowId
        );

        const executionTime = Date.now() - startTime;

        return reply.send({
          success: result.status === 'completed',
          workflowId: result.workflowId,
          runId: result.runId,
          status: result.status,
          result: result.result,
          executionTime,
          temporalUI: `http://localhost:8088/namespaces/default/workflows/${result.workflowId}`,
          message: result.status === 'completed' 
            ? `Teams webhook workflow completed! Delivery status: ${(result.result as any)?.deliveryStatus}` 
            : `Workflow ${result.status}: ${result.error || 'Unknown error'}`
        });

      } catch (error) {
        logger.error(error as Error, { title: request.body.input.title }, 'Teams Webhook workflow execution failed');
        
        return reply.status(500).send({
          success: false,
          error: 'WORKFLOW_EXECUTION_FAILED',
          message: (error as Error).message,
          executionTime: Date.now() - startTime
        });
      }
    }
  );

  // Execute GitHub MCP Workflow
  fastify.post<{ Body: { input: GitHubMcpInput; workflowId?: string } }>(
    '/api/v1/workflows/github-mcp/execute',
    {
      schema: {
        body: {
          type: 'object',
          required: ['input'],
          properties: {
            input: {
              type: 'object',
              required: ['githubToken', 'mcpServerUrl', 'operation', 'repository'],
              properties: {
                githubToken: { type: 'string' },
                mcpServerUrl: { type: 'string' },
                operation: { 
                  type: 'string', 
                  enum: ['analyze_repository', 'create_feature_branch', 'review_pull_requests', 'issue_management'] 
                },
                repository: {
                  type: 'object',
                  required: ['owner', 'name'],
                  properties: {
                    owner: { type: 'string' },
                    name: { type: 'string' }
                  }
                },
                parameters: { type: 'object' }
              }
            },
            workflowId: { type: 'string' }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: { input: GitHubMcpInput; workflowId?: string } }>, reply: FastifyReply) => {
      const startTime = Date.now();
      
      try {
        logger.getLogger().info('Executing GitHub MCP workflow', { 
          operation: request.body.input.operation,
          repository: `${request.body.input.repository.owner}/${request.body.input.repository.name}`,
          workflowId: request.body.workflowId
        });

        const result = await workflowExecutor.executeGitHubMcp(
          request.body.input, 
          request.body.workflowId
        );

        const executionTime = Date.now() - startTime;

        return reply.send({
          success: result.status === 'completed',
          workflowId: result.workflowId,
          runId: result.runId,
          status: result.status,
          result: result.result,
          executionTime,
          temporalUI: `http://localhost:8088/namespaces/default/workflows/${result.workflowId}`,
          message: result.status === 'completed' 
            ? `GitHub MCP workflow completed! Operation: ${(result.result as any)?.operation}, Steps: ${(result.result as any)?.executionSteps?.length}` 
            : `Workflow ${result.status}: ${result.error || 'Unknown error'}`
        });

      } catch (error) {
        logger.error(error as Error, { 
          operation: request.body.input.operation,
          repository: `${request.body.input.repository.owner}/${request.body.input.repository.name}`
        }, 'GitHub MCP workflow execution failed');
        
        return reply.status(500).send({
          success: false,
          error: 'WORKFLOW_EXECUTION_FAILED',
          message: (error as Error).message,
          executionTime: Date.now() - startTime
        });
      }
    }
  );

  // Get workflow status
  fastify.get<{ Params: { workflowId: string } }>(
    '/api/v1/workflows/:workflowId/status',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workflowId'],
          properties: {
            workflowId: { type: 'string' }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { workflowId: string } }>, reply: FastifyReply) => {
      try {
        const { workflowId } = request.params;
        
        const status = await workflowExecutor.getWorkflowStatus(workflowId);
        
        if (!status) {
          return reply.status(404).send({
            success: false,
            error: 'WORKFLOW_NOT_FOUND',
            message: `Workflow ${workflowId} not found`
          });
        }

        return reply.send({
          success: true,
          workflowId: status.workflowId,
          runId: status.runId,
          status: status.status,
          startTime: status.startTime,
          endTime: status.endTime,
          duration: status.duration,
          result: status.result,
          temporalUI: `http://localhost:8088/namespaces/default/workflows/${workflowId}`
        });

      } catch (error) {
        logger.error(error as Error, { workflowId: request.params.workflowId }, 'Failed to get workflow status');
        
        return reply.status(500).send({
          success: false,
          error: 'STATUS_QUERY_FAILED',
          message: (error as Error).message
        });
      }
    }
  );

  // Cancel workflow
  fastify.post<{ Params: { workflowId: string } }>(
    '/api/v1/workflows/:workflowId/cancel',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workflowId'],
          properties: {
            workflowId: { type: 'string' }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { workflowId: string } }>, reply: FastifyReply) => {
      try {
        const { workflowId } = request.params;
        
        const cancelled = await workflowExecutor.cancelWorkflow(workflowId);
        
        return reply.send({
          success: cancelled,
          workflowId: workflowId,
          message: cancelled 
            ? 'Workflow cancelled successfully' 
            : 'Failed to cancel workflow'
        });

      } catch (error) {
        logger.error(error as Error, { workflowId: request.params.workflowId }, 'Failed to cancel workflow');
        
        return reply.status(500).send({
          success: false,
          error: 'CANCEL_FAILED',
          message: (error as Error).message
        });
      }
    }
  );

  // List available workflows
  fastify.get('/api/v1/workflows', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      availableWorkflows: [
        {
          name: 'add-numbers',
          description: 'Simple workflow that adds two numbers and multiplies the result',
          endpoint: '/api/v1/workflows/add-numbers/execute',
          inputExample: {
            number1: 10,
            number2: 5,
            multiplier: 2
          },
          expectedOutput: {
            sum: 15,
            finalResult: 30,
            isValid: true
          }
        },
        {
          name: 'teams-webhook',
          description: 'Complex workflow that sends notifications to MS Teams with retry logic and fallback',
          endpoint: '/api/v1/workflows/teams-webhook/execute',
          inputExample: {
            webhookUrl: 'https://webhook.office.com/webhookb2/...',
            title: 'Test Notification',
            message: 'This is a test message from Temporal workflow',
            priority: 'normal',
            author: {
              name: 'Workflow Bot',
              email: 'bot@example.com'
            },
            requireDeliveryConfirmation: true
          }
        },
        {
          name: 'github-mcp',
          description: 'Advanced workflow that integrates with GitHub MCP server for repository operations',
          endpoint: '/api/v1/workflows/github-mcp/execute',
          inputExample: {
            githubToken: 'ghp_xxxxxxxxxxxx',
            mcpServerUrl: 'http://localhost:3001/mcp',
            operation: 'analyze_repository',
            repository: {
              owner: 'username',
              name: 'repository'
            },
            parameters: {
              analysisType: 'all'
            }
          }
        }
      ],
      endpoints: {
        execute: 'POST /api/v1/workflows/{workflow-name}/execute',
        status: 'GET /api/v1/workflows/{workflowId}/status',
        cancel: 'POST /api/v1/workflows/{workflowId}/cancel',
        list: 'GET /api/v1/workflows'
      },
      temporalUI: 'http://localhost:8088',
      documentation: 'See workflow implementations in /src/temporal/workflows/'
    });
  });
}