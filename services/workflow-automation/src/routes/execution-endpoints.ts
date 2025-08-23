/**
 * Execution API Endpoints - REST API for workflow execution
 * Provides comprehensive API endpoints for:
 * - Executing workflows with input data
 * - Monitoring execution status and progress
 * - Retrieving execution logs and results
 * - Managing execution lifecycle (cancel, retry)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '../shared-utils-local';
import { ExecutionController, ExecutionConfig } from '../execution/execution-controller';

const logger = createServiceLogger('execution-endpoints');

// Request/Response type definitions
interface ExecuteWorkflowRequest {
  input_data: Record<string, any>;
  execution_config?: {
    timeout_seconds?: number;
    retry_policy?: {
      max_attempts: number;
      initial_delay_ms: number;
      max_delay_ms: number;
      backoff_multiplier: number;
      retryable_errors: string[];
    };
    priority?: 'low' | 'normal' | 'high';
  };
  context?: {
    user_id?: string;
    session_id?: string;
    metadata?: Record<string, any>;
  };
}

interface ExecuteWorkflowResponse {
  success: boolean;
  execution_id: string;
  workflow_id: string;
  status: string;
  started_at: string;
  estimated_completion?: string;
  progress: {
    current_activity?: string;
    completed_activities: number;
    total_activities: number;
    percentage: number;
  };
  temporal_execution_url?: string;
  message: string;
}

interface ExecutionStatusResponse {
  success: boolean;
  execution_id: string;
  workflow_id: string;
  status: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  current_activity?: string;
  progress: {
    completed_activities: number;
    total_activities: number;
    percentage: number;
  };
  result?: Record<string, any>;
  error?: {
    type: string;
    message: string;
    activity?: string;
    timestamp: string;
  };
}

interface ExecutionLogsResponse {
  success: boolean;
  execution_id: string;
  total_logs: number;
  logs: Array<{
    id: string;
    timestamp: string;
    level: string;
    activity?: string;
    message: string;
    metadata?: Record<string, any>;
  }>;
  pagination: {
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export async function executionEndpoints(fastify: FastifyInstance): Promise<void> {
  // Initialize execution controller
  const executionController = new ExecutionController(
    fastify.database,
    fastify.redis
  );

  /**
   * POST /api/execute/{execution_id}
   * Execute a workflow with input data
   */
  fastify.post<{ 
    Params: { execution_id: string }; 
    Body: ExecuteWorkflowRequest 
  }>('/api/execute/:execution_id', {
    schema: {
      params: {
        type: 'object',
        required: ['execution_id'],
        properties: {
          execution_id: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' }
        }
      },
      body: {
        type: 'object',
        required: ['input_data'],
        properties: {
          input_data: { type: 'object' },
          execution_config: {
            type: 'object',
            properties: {
              timeout_seconds: { type: 'number', minimum: 1, maximum: 3600 },
              retry_policy: {
                type: 'object',
                properties: {
                  max_attempts: { type: 'number', minimum: 1, maximum: 10 },
                  initial_delay_ms: { type: 'number', minimum: 100 },
                  max_delay_ms: { type: 'number', minimum: 1000 },
                  backoff_multiplier: { type: 'number', minimum: 1 },
                  retryable_errors: { type: 'array', items: { type: 'string' } }
                }
              },
              priority: { type: 'string', enum: ['low', 'normal', 'high'] }
            }
          },
          context: {
            type: 'object',
            properties: {
              user_id: { type: 'string' },
              session_id: { type: 'string' },
              metadata: { type: 'object' }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            execution_id: { type: 'string' },
            workflow_id: { type: 'string' },
            status: { type: 'string' },
            started_at: { type: 'string' },
            estimated_completion: { type: 'string' },
            progress: {
              type: 'object',
              properties: {
                current_activity: { type: 'string' },
                completed_activities: { type: 'number' },
                total_activities: { type: 'number' },
                percentage: { type: 'number' }
              }
            },
            temporal_execution_url: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Params: { execution_id: string }; 
    Body: ExecuteWorkflowRequest 
  }>, reply: FastifyReply) => {
    const startTime = Date.now();
    const { execution_id } = request.params;
    const { input_data, execution_config = {}, context = {} } = request.body;

    try {
      logger.getLogger().info('Executing workflow', {
        execution_id,
        inputKeys: Object.keys(input_data),
        userId: context.user_id,
        priority: execution_config.priority
      });

      // Extract workflow_id from execution_id (format: exec_<uuid>_<timestamp>)
      let workflowId: string;
      
      // Handle format: exec_fbc7b314-4641-4dfc-8c69-5d9803decd1b_1755898057936
      const uuidMatch = execution_id.match(/exec_([a-f0-9-]{36})_/);
      if (uuidMatch) {
        workflowId = uuidMatch[1];
      } else {
        // Fallback to old format (workflowId-timestamp)
        workflowId = execution_id.split('-')[0];
      }
      
      if (!workflowId || workflowId === 'exec') {
        return reply.status(400).send({
          success: false,
          error: 'INVALID_EXECUTION_ID',
          message: 'Execution ID must contain valid workflow UUID: ' + execution_id
        });
      }

      // Convert request config to internal format
      const config: ExecutionConfig = {
        timeout_seconds: execution_config.timeout_seconds,
        retry_policy: execution_config.retry_policy,
        priority: execution_config.priority || 'normal'
      };

      // Execute workflow
      const result = await executionController.executeWorkflow(
        execution_id,
        workflowId,
        input_data,
        config,
        {
          execution_id,
          workflow_id: workflowId,
          user_id: context.user_id,
          session_id: context.session_id,
          metadata: context.metadata
        }
      );

      const executionTime = Date.now() - startTime;

      // Estimate completion time (simple heuristic based on workflow complexity)
      const estimatedCompletion = new Date(
        Date.now() + (result.progress.total_activities * 30000) // 30s per activity
      ).toISOString();

      const response: ExecuteWorkflowResponse = {
        success: result.success,
        execution_id: result.execution_id,
        workflow_id: result.workflow_id,
        status: result.status,
        started_at: result.started_at.toISOString(),
        estimated_completion: result.status === 'running' ? estimatedCompletion : undefined,
        progress: result.progress,
        temporal_execution_url: `${process.env.TEMPORAL_UI_URL || 'http://localhost:8088'}/namespaces/default/workflows/${execution_id}`,
        message: result.success 
          ? `Workflow execution ${result.status} successfully`
          : `Workflow execution failed: ${result.error?.message}`
      };

      logger.getLogger().info('Workflow execution completed', {
        execution_id,
        success: result.success,
        status: result.status,
        executionTime
      });

      return reply.send(response);

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      logger.error(error as Error, {
        execution_id,
        executionTime
      }, 'Workflow execution failed');

      return reply.status(500).send({
        success: false,
        error: 'EXECUTION_FAILED',
        message: (error as Error).message,
        execution_time_ms: executionTime
      });
    }
  });

  /**
   * GET /api/executions/{execution_id}/status
   * Check execution status and progress
   */
  fastify.get<{ 
    Params: { execution_id: string } 
  }>('/api/executions/:execution_id/status', {
    schema: {
      params: {
        type: 'object',
        required: ['execution_id'],
        properties: {
          execution_id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            execution_id: { type: 'string' },
            workflow_id: { type: 'string' },
            status: { type: 'string' },
            started_at: { type: 'string' },
            completed_at: { type: 'string' },
            duration_ms: { type: 'number' },
            current_activity: { type: 'string' },
            progress: {
              type: 'object',
              properties: {
                completed_activities: { type: 'number' },
                total_activities: { type: 'number' },
                percentage: { type: 'number' }
              }
            },
            result: { type: 'object' },
            error: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                message: { type: 'string' },
                activity: { type: 'string' },
                timestamp: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Params: { execution_id: string } 
  }>, reply: FastifyReply) => {
    const { execution_id } = request.params;

    try {
      const result = await executionController.getExecutionStatus(execution_id);
      
      if (!result) {
        return reply.status(404).send({
          success: false,
          error: 'EXECUTION_NOT_FOUND',
          message: `Execution ${execution_id} not found`
        });
      }

      const response: ExecutionStatusResponse = {
        success: true,
        execution_id: result.execution_id,
        workflow_id: result.workflow_id,
        status: result.status,
        started_at: result.started_at.toISOString(),
        completed_at: result.completed_at?.toISOString(),
        duration_ms: result.duration_ms,
        current_activity: result.progress.current_activity,
        progress: {
          completed_activities: result.progress.completed_activities,
          total_activities: result.progress.total_activities,
          percentage: result.progress.percentage
        },
        result: result.result,
        error: result.error ? {
          type: result.error.type,
          message: result.error.message,
          activity: result.error.activity,
          timestamp: result.error.timestamp.toISOString()
        } : undefined
      };

      return reply.send(response);

    } catch (error) {
      logger.error(error as Error, { execution_id }, 'Failed to get execution status');

      return reply.status(500).send({
        success: false,
        error: 'STATUS_QUERY_FAILED',
        message: (error as Error).message
      });
    }
  });

  /**
   * GET /api/executions/{execution_id}/logs
   * Get execution logs with filtering
   */
  fastify.get<{ 
    Params: { execution_id: string };
    Querystring: {
      level?: string;
      activity?: string;
      limit?: number;
      offset?: number;
    }
  }>('/api/executions/:execution_id/logs', {
    schema: {
      params: {
        type: 'object',
        required: ['execution_id'],
        properties: {
          execution_id: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
          activity: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 1000, default: 100 },
          offset: { type: 'number', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Params: { execution_id: string };
    Querystring: {
      level?: string;
      activity?: string;
      limit?: number;
      offset?: number;
    }
  }>, reply: FastifyReply) => {
    const { execution_id } = request.params;
    const { level, activity, limit = 100, offset = 0 } = request.query;

    try {
      // First check if execution exists
      const execution = await executionController.getExecutionStatus(execution_id);
      if (!execution) {
        return reply.status(404).send({
          success: false,
          error: 'EXECUTION_NOT_FOUND',
          message: `Execution ${execution_id} not found`
        });
      }

      // Get logs from execution repository
      const executionRepo = new (await import('../execution/repositories/execution-repository')).ExecutionRepository(
        fastify.database
      );

      const { logs, total } = await executionRepo.getExecutionLogs(execution_id, {
        level,
        activity,
        limit,
        offset
      });

      const response: ExecutionLogsResponse = {
        success: true,
        execution_id,
        total_logs: total,
        logs: logs.map(log => ({
          id: log.id,
          timestamp: log.timestamp.toISOString(),
          level: log.level,
          activity: log.activity_name,
          message: log.message,
          metadata: log.metadata
        })),
        pagination: {
          limit,
          offset,
          has_more: offset + limit < total
        }
      };

      return reply.send(response);

    } catch (error) {
      logger.error(error as Error, {
        execution_id,
        filters: { level, activity, limit, offset }
      }, 'Failed to get execution logs');

      return reply.status(500).send({
        success: false,
        error: 'LOGS_QUERY_FAILED',
        message: (error as Error).message
      });
    }
  });

  /**
   * POST /api/executions/{execution_id}/cancel
   * Cancel a running execution
   */
  fastify.post<{ 
    Params: { execution_id: string } 
  }>('/api/executions/:execution_id/cancel', {
    schema: {
      params: {
        type: 'object',
        required: ['execution_id'],
        properties: {
          execution_id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            execution_id: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Params: { execution_id: string } 
  }>, reply: FastifyReply) => {
    const { execution_id } = request.params;

    try {
      logger.getLogger().info('Cancelling execution', { execution_id });

      const success = await executionController.cancelExecution(execution_id);

      return reply.send({
        success,
        execution_id,
        message: success 
          ? 'Execution cancelled successfully' 
          : 'Failed to cancel execution'
      });

    } catch (error) {
      logger.error(error as Error, { execution_id }, 'Failed to cancel execution');

      return reply.status(500).send({
        success: false,
        error: 'CANCEL_FAILED',
        message: (error as Error).message
      });
    }
  });

  /**
   * POST /api/executions/{execution_id}/retry
   * Retry a failed execution
   */
  fastify.post<{ 
    Params: { execution_id: string };
    Body: {
      execution_config?: ExecutionConfig;
    }
  }>('/api/executions/:execution_id/retry', {
    schema: {
      params: {
        type: 'object',
        required: ['execution_id'],
        properties: {
          execution_id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          execution_config: {
            type: 'object',
            properties: {
              timeout_seconds: { type: 'number' },
              priority: { type: 'string', enum: ['low', 'normal', 'high'] }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Params: { execution_id: string };
    Body: {
      execution_config?: ExecutionConfig;
    }
  }>, reply: FastifyReply) => {
    const { execution_id } = request.params;
    const { execution_config } = request.body;

    try {
      logger.getLogger().info('Retrying execution', { execution_id });

      const result = await executionController.retryExecution(
        execution_id,
        execution_config
      );

      return reply.send({
        success: result.success,
        execution_id: result.execution_id,
        workflow_id: result.workflow_id,
        status: result.status,
        started_at: result.started_at.toISOString(),
        message: result.success 
          ? 'Execution retry started successfully'
          : `Execution retry failed: ${result.error?.message}`
      });

    } catch (error) {
      logger.error(error as Error, { execution_id }, 'Failed to retry execution');

      return reply.status(500).send({
        success: false,
        error: 'RETRY_FAILED',
        message: (error as Error).message
      });
    }
  });

  /**
   * GET /api/executions
   * List executions with filtering
   */
  fastify.get<{
    Querystring: {
      workflow_id?: string;
      status?: string;
      triggered_by?: string;
      start_date?: string;
      end_date?: string;
      limit?: number;
      offset?: number;
    }
  }>('/api/executions', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          workflow_id: { type: 'string' },
          status: { type: 'string' },
          triggered_by: { type: 'string' },
          start_date: { type: 'string', format: 'date-time' },
          end_date: { type: 'string', format: 'date-time' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'number', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: {
      workflow_id?: string;
      status?: string;
      triggered_by?: string;
      start_date?: string;
      end_date?: string;
      limit?: number;
      offset?: number;
    }
  }>, reply: FastifyReply) => {
    const {
      workflow_id,
      status,
      triggered_by,
      start_date,
      end_date,
      limit = 20,
      offset = 0
    } = request.query;

    try {
      const executionRepo = new (await import('../execution/repositories/execution-repository')).ExecutionRepository(
        fastify.database
      );

      const filters: any = {
        workflow_id,
        status,
        triggered_by,
        limit,
        offset
      };

      if (start_date) filters.start_date = new Date(start_date);
      if (end_date) filters.end_date = new Date(end_date);

      const { executions, total } = await executionRepo.getExecutions(filters);

      return reply.send({
        success: true,
        total,
        executions: executions.map(exec => ({
          execution_id: exec.execution_id,
          workflow_id: exec.workflow_id,
          status: exec.status,
          started_at: exec.started_at.toISOString(),
          completed_at: exec.completed_at?.toISOString(),
          duration_ms: exec.duration_ms,
          triggered_by: exec.triggered_by,
          error_type: exec.error_type
        })),
        pagination: {
          limit,
          offset,
          has_more: offset + limit < total
        }
      });

    } catch (error) {
      logger.error(error as Error, 'Failed to list executions');

      return reply.status(500).send({
        success: false,
        error: 'LIST_EXECUTIONS_FAILED',
        message: (error as Error).message
      });
    }
  });

  logger.getLogger().info('Execution endpoints registered successfully');
}