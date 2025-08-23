/**
 * Schedule Routes for Workflow Automation Service
 * Handles workflow scheduling, cron management, and schedule execution tracking
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('schedule-routes');

// Request/Response types
interface CreateScheduleRequest {
  workflowId: string;
  name: string;
  cronExpression: string;
  timezone?: string;
  isActive?: boolean;
  metadata?: Record<string, any>;
}

interface UpdateScheduleRequest {
  name?: string;
  cronExpression?: string;
  timezone?: string;
  isActive?: boolean;
  metadata?: Record<string, any>;
}

interface ScheduleListQuery {
  workflowId?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

interface ScheduleParams {
  scheduleId: string;
}

interface ScheduleExecutionHistoryQuery {
  limit?: number;
  offset?: number;
}

export async function scheduleRoutes(fastify: FastifyInstance): Promise<void> {
  
  // Create new workflow schedule
  fastify.post<{ Body: CreateScheduleRequest }>('/api/schedules', {
    schema: {


      body: {
        type: 'object',
        required: ['workflowId', 'name', 'cronExpression'],
        properties: {
          workflowId: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 3, maxLength: 100 },
          cronExpression: { type: 'string', minLength: 9 },
          timezone: { type: 'string', default: 'UTC' },
          isActive: { type: 'boolean', default: true },
          metadata: { type: 'object' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            scheduleId: { type: 'string' },
            nextExecution: { type: 'string', format: 'date-time' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CreateScheduleRequest }>, reply: FastifyReply) => {
    const startTime = Date.now();
    const { workflowId, name, cronExpression, timezone, isActive, metadata } = request.body;

    try {
      logger.getLogger().info({
        workflowId,
        name,
        cronExpression,
        timezone: timezone || 'UTC',
        isActive: isActive !== false,
      }, 'Creating workflow schedule');

      // Verify workflow exists
      const { rows: workflowRows } = await fastify.database.query(`
        SELECT workflow_id FROM workflows WHERE workflow_id = $1
      `, [workflowId]);

      if (workflowRows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Workflow not found',
          message: `Workflow ${workflowId} not found`,
        });
      }

      // Create schedule using scheduler
      const scheduleId = await fastify.workflowScheduler.createSchedule(
        workflowId,
        name,
        cronExpression,
        {
          timezone: timezone || 'UTC',
          isActive: isActive !== false,
          metadata: metadata || {},
        }
      );

      // Get the created schedule to return next execution time
      const schedule = await fastify.workflowScheduler.getSchedule(scheduleId);

      const duration = Date.now() - startTime;
      logger.getLogger().info({
        scheduleId,
        workflowId,
        name,
        nextExecution: schedule?.nextExecution,
        duration,
      }, 'Workflow schedule created');

      return reply.status(201).send({
        success: true,
        scheduleId,
        nextExecution: schedule?.nextExecution?.toISOString(),
        message: `Schedule '${name}' created successfully`,
      });

    } catch (error) {
      logger.error(error as Error, {
        workflowId,
        name,
        cronExpression,
      }, 'Failed to create workflow schedule');

      return reply.status(500).send({
        success: false,
        error: 'Failed to create schedule',
        message: (error as Error).message,
      });
    }
  });

  // List workflow schedules
  fastify.get<{ Querystring: ScheduleListQuery }>('/api/schedules', {
    schema: {


      querystring: {
        type: 'object',
        properties: {
          workflowId: { type: 'string' },
          isActive: { type: 'boolean' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'number', minimum: 0, default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            schedules: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  workflowId: { type: 'string' },
                  name: { type: 'string' },
                  cronExpression: { type: 'string' },
                  timezone: { type: 'string' },
                  isActive: { type: 'boolean' },
                  lastExecution: { type: 'string', format: 'date-time' },
                  nextExecution: { type: 'string', format: 'date-time' },
                  executionCount: { type: 'number' },
                  metadata: { type: 'object' }
                }
              }
            },
            total: { type: 'number' },
            limit: { type: 'number' },
            offset: { type: 'number' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: ScheduleListQuery }>, reply: FastifyReply) => {
    const { workflowId, isActive, limit = 20, offset = 0 } = request.query;

    try {
      const filters: any = { limit, offset };
      if (workflowId) filters.workflowId = workflowId;
      if (isActive !== undefined) filters.isActive = isActive;

      const { schedules, total } = await fastify.workflowScheduler.listSchedules(filters);

      logger.getLogger().info({
        resultCount: schedules.length,
        total,
        filters: { workflowId, isActive },
      }, 'Workflow schedules listed');

      return reply.send({
        schedules,
        total,
        limit,
        offset,
      });

    } catch (error) {
      logger.error(error as Error, {
        query: request.query,
      }, 'Failed to list workflow schedules');

      return reply.status(500).send({
        error: 'Failed to list schedules',
        message: (error as Error).message,
      });
    }
  });

  // Get specific schedule
  fastify.get<{ Params: ScheduleParams }>('/api/schedules/:scheduleId', {
    schema: {


      params: {
        type: 'object',
        required: ['scheduleId'],
        properties: {
          scheduleId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            schedule: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                workflowId: { type: 'string' },
                name: { type: 'string' },
                cronExpression: { type: 'string' },
                timezone: { type: 'string' },
                isActive: { type: 'boolean' },
                lastExecution: { type: 'string', format: 'date-time' },
                nextExecution: { type: 'string', format: 'date-time' },
                executionCount: { type: 'number' },
                metadata: { type: 'object' }
              }
            }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: ScheduleParams }>, reply: FastifyReply) => {
    const { scheduleId } = request.params;

    try {
      const schedule = await fastify.workflowScheduler.getSchedule(scheduleId);

      if (!schedule) {
        return reply.status(404).send({
          error: 'Schedule not found',
          message: `Schedule ${scheduleId} not found`,
        });
      }

      logger.getLogger().debug({
        scheduleId,
        workflowId: schedule.workflowId,
        isActive: schedule.isActive,
      }, 'Schedule details retrieved');

      return reply.send({ schedule });

    } catch (error) {
      logger.error(error as Error, {
        scheduleId,
      }, 'Failed to get schedule details');

      return reply.status(500).send({
        error: 'Failed to get schedule details',
        message: (error as Error).message,
      });
    }
  });

  // Update schedule
  fastify.put<{ Params: ScheduleParams; Body: UpdateScheduleRequest }>('/api/schedules/:scheduleId', {
    schema: {


      params: {
        type: 'object',
        required: ['scheduleId'],
        properties: {
          scheduleId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 3, maxLength: 100 },
          cronExpression: { type: 'string', minLength: 9 },
          timezone: { type: 'string' },
          isActive: { type: 'boolean' },
          metadata: { type: 'object' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            updatedFields: { type: 'array', items: { type: 'string' } },
            nextExecution: { type: 'string', format: 'date-time' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: ScheduleParams; Body: UpdateScheduleRequest }>, reply: FastifyReply) => {
    const { scheduleId } = request.params;
    const updates = request.body;

    try {
      const updatedFields = Object.keys(updates);
      
      logger.getLogger().info({
        scheduleId,
        updatedFields,
      }, 'Updating workflow schedule');

      await fastify.workflowScheduler.updateSchedule(scheduleId, updates);

      // Get updated schedule to return next execution
      const schedule = await fastify.workflowScheduler.getSchedule(scheduleId);

      logger.getLogger().info({
        scheduleId,
        updatedFields,
        nextExecution: schedule?.nextExecution,
      }, 'Workflow schedule updated');

      return reply.send({
        success: true,
        updatedFields,
        nextExecution: schedule?.nextExecution?.toISOString(),
        message: `Schedule updated successfully. ${updatedFields.length} fields modified.`,
      });

    } catch (error) {
      logger.error(error as Error, {
        scheduleId,
        updates: Object.keys(updates),
      }, 'Failed to update workflow schedule');

      return reply.status(500).send({
        success: false,
        error: 'Failed to update schedule',
        message: (error as Error).message,
      });
    }
  });

  // Delete schedule
  fastify.delete<{ Params: ScheduleParams }>('/api/schedules/:scheduleId', {
    schema: {


      params: {
        type: 'object',
        required: ['scheduleId'],
        properties: {
          scheduleId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: ScheduleParams }>, reply: FastifyReply) => {
    const { scheduleId } = request.params;

    try {
      await fastify.workflowScheduler.deleteSchedule(scheduleId);

      logger.getLogger().info({
        scheduleId,
      }, 'Workflow schedule deleted');

      return reply.send({
        success: true,
        message: `Schedule ${scheduleId} deleted successfully`,
      });

    } catch (error) {
      logger.error(error as Error, {
        scheduleId,
      }, 'Failed to delete workflow schedule');

      return reply.status(500).send({
        success: false,
        error: 'Failed to delete schedule',
        message: (error as Error).message,
      });
    }
  });

  // Start/Stop schedule
  fastify.post<{ Params: ScheduleParams }>('/api/schedules/:scheduleId/start', {
    schema: {


      params: {
        type: 'object',
        required: ['scheduleId'],
        properties: {
          scheduleId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: ScheduleParams }>, reply: FastifyReply) => {
    const { scheduleId } = request.params;

    try {
      await fastify.workflowScheduler.startSchedule(scheduleId);

      logger.getLogger().info({
        scheduleId,
      }, 'Workflow schedule started');

      return reply.send({
        success: true,
        message: `Schedule ${scheduleId} started successfully`,
      });

    } catch (error) {
      logger.error(error as Error, {
        scheduleId,
      }, 'Failed to start workflow schedule');

      return reply.status(500).send({
        success: false,
        error: 'Failed to start schedule',
        message: (error as Error).message,
      });
    }
  });

  fastify.post<{ Params: ScheduleParams }>('/api/schedules/:scheduleId/stop', {
    schema: {


      params: {
        type: 'object',
        required: ['scheduleId'],
        properties: {
          scheduleId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: ScheduleParams }>, reply: FastifyReply) => {
    const { scheduleId } = request.params;

    try {
      await fastify.workflowScheduler.stopSchedule(scheduleId);

      logger.getLogger().info({
        scheduleId,
      }, 'Workflow schedule stopped');

      return reply.send({
        success: true,
        message: `Schedule ${scheduleId} stopped successfully`,
      });

    } catch (error) {
      logger.error(error as Error, {
        scheduleId,
      }, 'Failed to stop workflow schedule');

      return reply.status(500).send({
        success: false,
        error: 'Failed to stop schedule',
        message: (error as Error).message,
      });
    }
  });

  // Get schedule execution history
  fastify.get<{ Params: ScheduleParams; Querystring: ScheduleExecutionHistoryQuery }>('/api/schedules/:scheduleId/history', {
    schema: {


      params: {
        type: 'object',
        required: ['scheduleId'],
        properties: {
          scheduleId: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'number', minimum: 0, default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            executions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  scheduleId: { type: 'string' },
                  executionId: { type: 'string' },
                  executedAt: { type: 'string', format: 'date-time' },
                  status: { type: 'string', enum: ['success', 'failed'] },
                  result: { type: 'object' },
                  error: { type: 'string' }
                }
              }
            },
            total: { type: 'number' },
            limit: { type: 'number' },
            offset: { type: 'number' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: ScheduleParams; Querystring: ScheduleExecutionHistoryQuery }>, reply: FastifyReply) => {
    const { scheduleId } = request.params;
    const { limit = 50, offset = 0 } = request.query;

    try {
      const executions = await fastify.workflowScheduler.getExecutionHistory(scheduleId, limit, offset);

      logger.getLogger().debug({
        scheduleId,
        executionCount: executions.length,
      }, 'Schedule execution history retrieved');

      return reply.send({
        executions,
        total: executions.length, // This would come from a proper implementation
        limit,
        offset,
      });

    } catch (error) {
      logger.error(error as Error, {
        scheduleId,
      }, 'Failed to get schedule execution history');

      return reply.status(500).send({
        error: 'Failed to get execution history',
        message: (error as Error).message,
      });
    }
  });

  // Get scheduler statistics
  fastify.get('/api/schedules/stats', {
    schema: {


      response: {
        200: {
          type: 'object',
          properties: {
            stats: {
              type: 'object',
              properties: {
                totalSchedules: { type: 'number' },
                activeSchedules: { type: 'number' },
                runningJobs: { type: 'number' },
                recentExecutions: { type: 'number' }
              }
            },
            health: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await fastify.workflowScheduler.getStats();
      
      // Determine scheduler health
      let health = 'healthy';
      if (stats.activeSchedules === 0 && stats.totalSchedules > 0) {
        health = 'degraded';
      }
      if (stats.runningJobs === 0 && stats.activeSchedules > 0) {
        health = 'warning';
      }

      logger.getLogger().info({
        stats,
        health,
      }, 'Scheduler statistics retrieved');

      return reply.send({
        stats,
        health,
      });

    } catch (error) {
      logger.error(error as Error, {}, 'Failed to get scheduler statistics');

      return reply.status(500).send({
        error: 'Failed to get scheduler statistics',
        message: (error as Error).message,
      });
    }
  });
}