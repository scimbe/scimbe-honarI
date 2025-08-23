/**
 * Jobs Routes for Workflow Automation Service
 * Handles job queue management, monitoring, and control
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('jobs-routes');

// Request/Response types
interface CreateJobRequest {
  queueName: string;
  jobType: string;
  payload: any;
  priority?: number;
  delay?: number;
  attempts?: number;
  executionId?: string;
  workflowId?: string;
}

interface JobsListQuery {
  queueName?: string;
  status?: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  jobType?: string;
  executionId?: string;
  workflowId?: string;
  limit?: number;
  offset?: number;
}

interface JobActionParams {
  queueName: string;
  jobId: string;
}

interface QueueStatsParams {
  queueName: string;
}

export async function jobRoutes(fastify: FastifyInstance): Promise<void> {
  
  // Create new job
  fastify.post<{ Body: CreateJobRequest }>('/api/jobs', {
    schema: {


      body: {
        type: 'object',
        required: ['queueName', 'jobType', 'payload'],
        properties: {
          queueName: { type: 'string', minLength: 1 },
          jobType: { type: 'string', minLength: 1 },
          payload: { type: 'object' },
          priority: { type: 'number', minimum: -20, maximum: 20, default: 0 },
          delay: { type: 'number', minimum: 0 },
          attempts: { type: 'number', minimum: 1, maximum: 10, default: 3 },
          executionId: { type: 'string' },
          workflowId: { type: 'string' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            jobId: { type: 'string' },
            queueName: { type: 'string' },
            estimatedDelay: { type: 'number' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CreateJobRequest }>, reply: FastifyReply) => {
    const startTime = Date.now();
    const { queueName, jobType, payload, priority, delay, attempts, executionId, workflowId } = request.body;

    try {
      logger.getLogger().info({
        queueName,
        jobType,
        priority,
        delay,
        executionId,
        workflowId,
      }, 'Creating new job');

      // Add job to queue
      const jobId = await fastify.jobQueue.addJob(queueName, jobType, payload, {
        priority,
        delay,
        attempts,
        executionId,
        workflowId,
      });

      const duration = Date.now() - startTime;
      logger.getLogger().info({
        jobId,
        queueName,
        jobType,
        duration,
      }, 'Job created successfully');

      return reply.status(201).send({
        success: true,
        jobId,
        queueName,
        estimatedDelay: delay || 0,
        message: `Job ${jobId} added to queue ${queueName}`,
      });

    } catch (error) {
      logger.error(error as Error, {
        queueName,
        jobType,
      }, 'Failed to create job');

      return reply.status(500).send({
        success: false,
        error: 'Failed to create job',
        message: (error as Error).message,
      });
    }
  });

  // List jobs
  fastify.get<{ Querystring: JobsListQuery }>('/api/jobs', {
    schema: {


      querystring: {
        type: 'object',
        properties: {
          queueName: { type: 'string' },
          status: { type: 'string', enum: ['waiting', 'active', 'completed', 'failed', 'delayed'] },
          jobType: { type: 'string' },
          executionId: { type: 'string' },
          workflowId: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'number', minimum: 0, default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            jobs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  queueName: { type: 'string' },
                  type: { type: 'string' },
                  priority: { type: 'number' },
                  attempts: { type: 'number' },
                  maxAttempts: { type: 'number' },
                  status: { type: 'string' },
                  progress: { type: 'number' },
                  createdAt: { type: 'string', format: 'date-time' },
                  processedAt: { type: 'string', format: 'date-time' },
                  completedAt: { type: 'string', format: 'date-time' },
                  executionId: { type: 'string' },
                  workflowId: { type: 'string' }
                }
              }
            },
            total: { type: 'number' },
            limit: { type: 'number' },
            offset: { type: 'number' },
            queueStats: { type: 'object' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: JobsListQuery }>, reply: FastifyReply) => {
    const { queueName, status, jobType, executionId, workflowId, limit = 20, offset = 0 } = request.query;

    try {
      const queueNames = queueName ? [queueName] : fastify.jobQueue.getQueueNames();
      const allJobs: any[] = [];
      
      logger.getLogger().info({
        queueNames: queueNames.length,
        status,
        jobType,
        executionId,
        workflowId,
      }, 'Listing jobs');

      // Get jobs from each queue
      for (const queue of queueNames) {
        try {
          let jobs;
          if (status) {
            jobs = await fastify.jobQueue.getJobsByStatus(queue, status, 0, 100);
          } else {
            // Get jobs from all statuses
            const allStatuses = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const;
            jobs = [];
            for (const s of allStatuses) {
              const statusJobs = await fastify.jobQueue.getJobsByStatus(queue, s, 0, 25);
              jobs.push(...statusJobs);
            }
          }

          // Filter jobs
          let filteredJobs = jobs.filter(job => {
            if (jobType && job.type !== jobType) return false;
            if (executionId && job.executionId !== executionId) return false;
            if (workflowId && job.workflowId !== workflowId) return false;
            return true;
          });

          // Add queue name to jobs
          filteredJobs = filteredJobs.map(job => ({
            ...job,
            queueName: queue,
            status: status || 'unknown',
            progress: 0,
            createdAt: new Date().toISOString(),
            processedAt: null,
            completedAt: null,
          }));

          allJobs.push(...filteredJobs);
        } catch (error) {
          logger.warn({
            queueName: queue,
            error: (error as Error).message,
          }, 'Failed to get jobs from queue');
        }
      }

      // Apply pagination
      const total = allJobs.length;
      const paginatedJobs = allJobs.slice(offset, offset + limit);

      // Get queue statistics
      const queueStats: Record<string, any> = {};
      for (const queue of queueNames) {
        try {
          queueStats[queue] = await fastify.jobQueue.getQueueStats(queue);
        } catch (error) {
          queueStats[queue] = { error: (error as Error).message };
        }
      }

      logger.getLogger().info({
        totalJobs: total,
        returnedJobs: paginatedJobs.length,
        queuesChecked: queueNames.length,
      }, 'Jobs listed successfully');

      return reply.send({
        jobs: paginatedJobs,
        total,
        limit,
        offset,
        queueStats,
      });

    } catch (error) {
      logger.error(error as Error, {
        query: request.query,
      }, 'Failed to list jobs');

      return reply.status(500).send({
        error: 'Failed to list jobs',
        message: (error as Error).message,
      });
    }
  });

  // Get specific job details
  fastify.get<{ Params: JobActionParams }>('/api/jobs/:queueName/:jobId', {
    schema: {


      params: {
        type: 'object',
        required: ['queueName', 'jobId'],
        properties: {
          queueName: { type: 'string' },
          jobId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            job: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                queueName: { type: 'string' },
                type: { type: 'string' },
                priority: { type: 'number' },
                payload: { type: 'object' },
                attempts: { type: 'number' },
                maxAttempts: { type: 'number' },
                delay: { type: 'number' },
                executionId: { type: 'string' },
                workflowId: { type: 'string' }
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
  }, async (request: FastifyRequest<{ Params: JobActionParams }>, reply: FastifyReply) => {
    const { queueName, jobId } = request.params;

    try {
      const job = await fastify.jobQueue.getJob(queueName, jobId);

      if (!job) {
        return reply.status(404).send({
          error: 'Job not found',
          message: `Job ${jobId} not found in queue ${queueName}`,
        });
      }

      logger.getLogger().debug({
        queueName,
        jobId,
        jobType: job.type,
      }, 'Job details retrieved');

      return reply.send({
        job: {
          ...job,
          queueName,
        },
      });

    } catch (error) {
      logger.error(error as Error, {
        queueName,
        jobId,
      }, 'Failed to get job details');

      return reply.status(500).send({
        error: 'Failed to get job details',
        message: (error as Error).message,
      });
    }
  });

  // Cancel job
  fastify.delete<{ Params: JobActionParams }>('/api/jobs/:queueName/:jobId', {
    schema: {


      params: {
        type: 'object',
        required: ['queueName', 'jobId'],
        properties: {
          queueName: { type: 'string' },
          jobId: { type: 'string' }
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
  }, async (request: FastifyRequest<{ Params: JobActionParams }>, reply: FastifyReply) => {
    const { queueName, jobId } = request.params;

    try {
      const cancelled = await fastify.jobQueue.cancelJob(queueName, jobId);

      if (!cancelled) {
        return reply.status(404).send({
          success: false,
          message: `Job ${jobId} not found in queue ${queueName}`,
        });
      }

      logger.getLogger().info({
        queueName,
        jobId,
      }, 'Job cancelled');

      return reply.send({
        success: true,
        message: `Job ${jobId} cancelled successfully`,
      });

    } catch (error) {
      logger.error(error as Error, {
        queueName,
        jobId,
      }, 'Failed to cancel job');

      return reply.status(500).send({
        success: false,
        error: 'Failed to cancel job',
        message: (error as Error).message,
      });
    }
  });

  // Retry failed job
  fastify.post<{ Params: JobActionParams }>('/api/jobs/:queueName/:jobId/retry', {
    schema: {


      params: {
        type: 'object',
        required: ['queueName', 'jobId'],
        properties: {
          queueName: { type: 'string' },
          jobId: { type: 'string' }
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
  }, async (request: FastifyRequest<{ Params: JobActionParams }>, reply: FastifyReply) => {
    const { queueName, jobId } = request.params;

    try {
      const retried = await fastify.jobQueue.retryJob(queueName, jobId);

      if (!retried) {
        return reply.status(404).send({
          success: false,
          message: `Job ${jobId} not found in queue ${queueName}`,
        });
      }

      logger.getLogger().info({
        queueName,
        jobId,
      }, 'Job retried');

      return reply.send({
        success: true,
        message: `Job ${jobId} retried successfully`,
      });

    } catch (error) {
      logger.error(error as Error, {
        queueName,
        jobId,
      }, 'Failed to retry job');

      return reply.status(500).send({
        success: false,
        error: 'Failed to retry job',
        message: (error as Error).message,
      });
    }
  });

  // Get queue statistics
  fastify.get<{ Params: QueueStatsParams }>('/api/queues/:queueName/stats', {
    schema: {


      params: {
        type: 'object',
        required: ['queueName'],
        properties: {
          queueName: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            queueName: { type: 'string' },
            stats: {
              type: 'object',
              properties: {
                waiting: { type: 'number' },
                active: { type: 'number' },
                completed: { type: 'number' },
                failed: { type: 'number' },
                delayed: { type: 'number' }
              }
            },
            health: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: QueueStatsParams }>, reply: FastifyReply) => {
    const { queueName } = request.params;

    try {
      const stats = await fastify.jobQueue.getQueueStats(queueName);
      
      // Determine queue health
      let health = 'healthy';
      if (stats.failed > stats.completed) {
        health = 'degraded';
      }
      if (stats.active === 0 && stats.waiting > 10) {
        health = 'stalled';
      }

      logger.getLogger().debug({
        queueName,
        stats,
        health,
      }, 'Queue statistics retrieved');

      return reply.send({
        queueName,
        stats,
        health,
      });

    } catch (error) {
      logger.error(error as Error, {
        queueName,
      }, 'Failed to get queue statistics');

      return reply.status(500).send({
        error: 'Failed to get queue statistics',
        message: (error as Error).message,
      });
    }
  });

  // List all queues
  fastify.get('/api/queues', {
    schema: {


      response: {
        200: {
          type: 'object',
          properties: {
            queues: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  stats: {
                    type: 'object',
                    properties: {
                      waiting: { type: 'number' },
                      active: { type: 'number' },
                      completed: { type: 'number' },
                      failed: { type: 'number' },
                      delayed: { type: 'number' }
                    }
                  },
                  health: { type: 'string' }
                }
              }
            },
            totalQueues: { type: 'number' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const queueNames = fastify.jobQueue.getQueueNames();
      const queues: any[] = [];

      for (const queueName of queueNames) {
        try {
          const stats = await fastify.jobQueue.getQueueStats(queueName);
          
          // Determine queue health
          let health = 'healthy';
          if (stats.failed > stats.completed) {
            health = 'degraded';
          }
          if (stats.active === 0 && stats.waiting > 10) {
            health = 'stalled';
          }

          queues.push({
            name: queueName,
            stats,
            health,
          });
        } catch (error) {
          queues.push({
            name: queueName,
            stats: null,
            health: 'error',
            error: (error as Error).message,
          });
        }
      }

      logger.getLogger().info({
        totalQueues: queues.length,
      }, 'All queues listed');

      return reply.send({
        queues,
        totalQueues: queues.length,
      });

    } catch (error) {
      logger.error(error as Error, {}, 'Failed to list queues');

      return reply.status(500).send({
        error: 'Failed to list queues',
        message: (error as Error).message,
      });
    }
  });
}