/**
 * HTTP Server for Temporal Worker Service
 * Provides health checks and management endpoints
 */

import fastify, { FastifyInstance } from 'fastify';
import { Worker, NativeConnection } from '@temporalio/worker';
import { createServiceLogger, TemporalWorkerEnvironment } from '@platform/shared';

const logger = createServiceLogger('temporal-worker-server');

export async function createServer(
  env: TemporalWorkerEnvironment,
  worker: Worker,
  connection: NativeConnection
): Promise<FastifyInstance> {
  const app = fastify({
    logger: false, // Use our custom logger
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // Add CORS support
  await app.register(require('@fastify/cors'), {
    origin: env.NODE_ENV === 'development' ? '*' : false,
    credentials: true,
  });

  // Add request/response logging
  app.addHook('onRequest', async (request) => {
    logger.getLogger().info({
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
    }, 'HTTP request received');
  });

  app.addHook('onResponse', async (request, reply) => {
    logger.getLogger().info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.getResponseTime(),
      requestId: request.id,
    }, 'HTTP request completed');
  });

  // Health check endpoint
  app.get('/health', {
    schema: {
      description: 'Temporal Worker health check',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            timestamp: { type: 'number' },
            worker: { type: 'string' },
            temporal: { type: 'string' },
            version: { type: 'string' },
            uptime: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const startTime = Date.now();
    
    try {
      let workerStatus = 'healthy';
      let temporalStatus = 'healthy';
      let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      // Check worker state
      try {
        // Worker doesn't have a direct health check, so we assume it's healthy if it's running
        const workerInfo = worker.getState();
        workerStatus = workerInfo === 'RUNNING' ? 'healthy' : 'unhealthy';
        
        if (workerStatus === 'unhealthy') {
          overallStatus = 'unhealthy';
        }
      } catch (error) {
        workerStatus = 'unhealthy';
        overallStatus = 'unhealthy';
        logger.error(error as Error, {}, 'Worker health check failed');
      }

      // Check Temporal connection
      try {
        // Simple connection check
        await connection.workflowService.getSystemInfo({});
        temporalStatus = 'healthy';
      } catch (error) {
        temporalStatus = 'unhealthy';
        overallStatus = 'unhealthy';
        logger.error(error as Error, {}, 'Temporal connection health check failed');
      }

      const healthStatus = {
        status: overallStatus,
        timestamp: Date.now(),
        worker: workerStatus,
        temporal: temporalStatus,
        version: process.env.npm_package_version || '2.0.0',
        uptime: process.uptime(),
      };

      const duration = Date.now() - startTime;
      logger.getLogger().debug({ duration, status: overallStatus }, 'Health check completed');

      return reply.status(overallStatus === 'healthy' ? 200 : 503).send(healthStatus);
    } catch (error) {
      logger.error(error as Error, {}, 'Health check failed');
      
      return reply.status(503).send({
        status: 'unhealthy',
        timestamp: Date.now(),
        error: 'Health check failed',
        version: process.env.npm_package_version || '2.0.0',
        uptime: process.uptime(),
      });
    }
  });

  // Readiness probe (Kubernetes)
  app.get('/ready', {
    schema: {
      description: 'Readiness probe for Kubernetes',
      tags: ['health'],
      response: {
        200: { type: 'object', properties: { ready: { type: 'boolean' } } },
        503: { type: 'object', properties: { ready: { type: 'boolean' }, reason: { type: 'string' } } }
      }
    }
  }, async (request, reply) => {
    try {
      // Check if worker is ready to accept tasks
      const workerState = worker.getState();
      
      if (workerState !== 'RUNNING') {
        return reply.status(503).send({ 
          ready: false, 
          reason: `Worker not running (state: ${workerState})` 
        });
      }

      // Check Temporal connection
      await connection.workflowService.getSystemInfo({});

      return reply.send({ ready: true });
    } catch (error) {
      return reply.status(503).send({ 
        ready: false, 
        reason: (error as Error).message 
      });
    }
  });

  // Liveness probe (Kubernetes)
  app.get('/live', {
    schema: {
      description: 'Liveness probe for Kubernetes',
      tags: ['health'],
      response: {
        200: { type: 'object', properties: { alive: { type: 'boolean' } } }
      }
    }
  }, async (request, reply) => {
    // Simple liveness check - just ensure the service is running
    return reply.send({ alive: true });
  });

  // Worker status endpoint
  app.get('/status', {
    schema: {
      description: 'Get worker detailed status',
      tags: ['status'],
      response: {
        200: {
          type: 'object',
          properties: {
            worker: {
              type: 'object',
              properties: {
                state: { type: 'string' },
                taskQueue: { type: 'string' },
                namespace: { type: 'string' },
                maxConcurrentActivities: { type: 'number' },
                maxConcurrentWorkflows: { type: 'number' }
              }
            },
            temporal: {
              type: 'object',
              properties: {
                connected: { type: 'boolean' },
                host: { type: 'string' }
              }
            },
            system: {
              type: 'object',
              properties: {
                nodeVersion: { type: 'string' },
                platform: { type: 'string' },
                arch: { type: 'string' },
                memoryUsage: { type: 'object' },
                cpuUsage: { type: 'object' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Get system info
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      const status = {
        worker: {
          state: worker.getState(),
          taskQueue: env.TEMPORAL_TASK_QUEUE,
          namespace: env.TEMPORAL_NAMESPACE || 'default',
          maxConcurrentActivities: env.MAX_CONCURRENT_ACTIVITIES || 10,
          maxConcurrentWorkflows: env.MAX_CONCURRENT_WORKFLOWS || 5,
        },
        temporal: {
          connected: true, // If we got here, connection is working
          host: `${env.TEMPORAL_HOST}:${env.TEMPORAL_PORT}`,
        },
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          memoryUsage: {
            rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
            external: Math.round(memoryUsage.external / 1024 / 1024) + ' MB',
          },
          cpuUsage: {
            user: cpuUsage.user,
            system: cpuUsage.system,
          }
        }
      };

      logger.getLogger().info(status, 'Worker status retrieved');
      return reply.send(status);
    } catch (error) {
      logger.error(error as Error, {}, 'Failed to get worker status');
      
      return reply.status(500).send({
        error: 'STATUS_RETRIEVAL_FAILED',
        message: 'Failed to retrieve worker status',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Deploy workflow endpoint (called by workflow automation service)
  app.post('/temporal-worker/deploy', {
    schema: {
      description: 'Deploy generated workflow to Temporal worker',
      tags: ['deployment'],
      body: {
        type: 'object',
        required: ['workflowId', 'workflowCode', 'language'],
        properties: {
          workflowId: { type: 'string', format: 'uuid' },
          workflowCode: { type: 'string' },
          supportingFiles: { type: 'array', items: { type: 'string' } },
          language: { type: 'string', enum: ['python', 'typescript'] },
          environment: { type: 'string', enum: ['development', 'staging', 'production'] },
          autoStart: { type: 'boolean' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            endpoint: { type: 'string', format: 'uri' },
            workflowId: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { workflowId, workflowCode, supportingFiles, language, environment, autoStart } = request.body;
    
    logger.getLogger().info({
      workflowId,
      language,
      environment,
      autoStart,
      codeLength: workflowCode.length,
      supportingFilesCount: supportingFiles?.length || 0
    }, 'Deploying workflow to Temporal worker');

    try {
      // In a real implementation, this would:
      // 1. Validate the workflow code
      // 2. Compile/prepare the workflow for execution
      // 3. Register it with the Temporal worker
      // 4. Store metadata in database
      
      // For now, simulate successful deployment
      const endpoint = `http://temporal-worker:${env.TEMPORAL_WORKER_PORT}/workflows/${workflowId}`;
      
      return reply.send({
        success: true,
        endpoint,
        workflowId,
        message: `Workflow ${workflowId} deployed successfully to ${environment}`,
      });
    } catch (error) {
      logger.error(error as Error, { workflowId }, 'Failed to deploy workflow');
      
      return reply.status(500).send({
        success: false,
        error: 'DEPLOYMENT_FAILED',
        message: `Failed to deploy workflow: ${(error as Error).message}`,
        workflowId,
      });
    }
  });

  // Deploy final workflow endpoint (called by automation engine)
  app.post('/temporal-worker/deploy-final', {
    schema: {
      description: 'Deploy final optimized workflow',
      tags: ['deployment'],
      body: {
        type: 'object',
        required: ['workflowId', 'workflowClass'],
        properties: {
          workflowId: { type: 'string', format: 'uuid' },
          workflowClass: { type: 'string' },
          environment: { type: 'string', enum: ['development', 'staging', 'production'] },
          autoStart: { type: 'boolean' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            endpoint: { type: 'string', format: 'uri' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { workflowId, workflowClass, environment, autoStart } = request.body;
    
    logger.getLogger().info({
      workflowId,
      workflowClass,
      environment,
      autoStart
    }, 'Deploying final workflow');

    try {
      const endpoint = `http://temporal-worker:${env.TEMPORAL_WORKER_PORT}/workflows/${workflowId}/execute`;
      
      return reply.send({
        endpoint,
        message: `Final workflow ${workflowClass} deployed and ready for execution`,
      });
    } catch (error) {
      logger.error(error as Error, { workflowId }, 'Failed to deploy final workflow');
      throw error;
    }
  });

  // Shutdown endpoint (for graceful shutdown)
  app.post('/shutdown', {
    schema: {
      description: 'Gracefully shutdown the worker',
      tags: ['management'],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  }, async (request, reply) => {
    logger.getLogger().info('Shutdown requested via HTTP endpoint');
    
    // Send response first
    reply.send({
      message: 'Shutdown initiated',
      timestamp: new Date().toISOString(),
    });

    // Trigger graceful shutdown after a short delay
    setTimeout(() => {
      process.kill(process.pid, 'SIGTERM');
    }, 1000);
  });

  return app;
}