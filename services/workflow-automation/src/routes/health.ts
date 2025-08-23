/**
 * Health Check Routes for Workflow Automation Service
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { HealthStatus } from '../shared-utils-local';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  // Basic health check
  fastify.get('/', {
    schema: {


      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            timestamp: { type: 'number' },
            database: { type: 'string' },
            redis: { type: 'string' },
            automation_engine: { type: 'string' },
            job_queue: { type: 'string' },
            scheduler: { type: 'string' },
            version: { type: 'string' },
            uptime: { type: 'number' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const { 
      logger, 
      database, 
      redis, 
      temporalAutomationEngine: automationEngine, 
      jobQueue, 
      workflowScheduler,
      workflowGenerator,
      dataExchangeService,
      extendedDb
    } = fastify;

    try {
      let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      // Check database connection
      let databaseStatus = 'ok';
      try {
        const isConnected = await database.checkConnection();
        if (!isConnected) {
          databaseStatus = 'error';
          overallStatus = 'unhealthy';
        }
      } catch (error) {
        databaseStatus = 'error';
        overallStatus = 'unhealthy';
        if (logger && logger.error) {
          logger.error(error as Error, {}, 'Database health check failed');
        }
      }

      // Check Redis connection
      let redisStatus = 'ok';
      try {
        await redis.ping();
      } catch (error) {
        redisStatus = 'error';
        overallStatus = 'degraded';
        if (logger && logger.error) {
          logger.error(error as Error, {}, 'Redis health check failed');
        }
      }

      // Check automation engine
      let automationEngineStatus = 'ok';
      try {
        // Basic check - engine should be initialized
        if (!automationEngine) {
          automationEngineStatus = 'error';
          overallStatus = 'unhealthy';
        }
      } catch (error) {
        automationEngineStatus = 'error';
        overallStatus = 'degraded';
        if (logger && logger.error) {
          logger.error(error as Error, {}, 'Automation engine health check failed');
        }
      }

      // Check job queue
      let jobQueueStatus = 'ok';
      try {
        if (jobQueue && jobQueue.getQueueNames) {
          const queueNames = jobQueue.getQueueNames();
          if (queueNames.length === 0) {
            jobQueueStatus = 'warning';
            if (overallStatus === 'healthy') overallStatus = 'degraded';
          }
        } else {
          jobQueueStatus = 'error';
          overallStatus = 'degraded';
        }
      } catch (error) {
        jobQueueStatus = 'error';
        overallStatus = 'degraded';
        if (logger && logger.error) {
          logger.error(error as Error, {}, 'Job queue health check failed');
        }
      }

      // Check scheduler
      let schedulerStatus = 'ok';
      try {
        if (workflowScheduler && workflowScheduler.getStats) {
          const stats = await workflowScheduler.getStats();
          if (stats.activeSchedules > 0 && stats.runningJobs === 0) {
            schedulerStatus = 'warning';
            if (overallStatus === 'healthy') overallStatus = 'degraded';
          }
        } else {
          schedulerStatus = 'warning';
          if (overallStatus === 'healthy') overallStatus = 'degraded';
        }
      } catch (error) {
        schedulerStatus = 'error';
        overallStatus = 'degraded';
        if (logger && logger.error) {
          logger.error(error as Error, {}, 'Scheduler health check failed');
        }
      }

      // Check extended services
      let extendedServicesStatus = 'ok';
      try {
        if (!workflowGenerator || !dataExchangeService || !extendedDb) {
          extendedServicesStatus = 'warning';
          if (overallStatus === 'healthy') overallStatus = 'degraded';
        }
      } catch (error) {
        extendedServicesStatus = 'error';
        overallStatus = 'degraded';
      }

      const healthStatus = {
        status: overallStatus,
        timestamp: Date.now(),
        database: databaseStatus,
        redis: redisStatus,
        automation_engine: automationEngineStatus,
        job_queue: jobQueueStatus,
        scheduler: schedulerStatus,
        extended_services: extendedServicesStatus,
        version: process.env.npm_package_version || '2.0.0',
        uptime: process.uptime(),
      };

      const duration = Date.now() - startTime;
      if (logger && logger.getLogger) {
        logger.getLogger().debug({ duration, status: overallStatus }, 'Health check completed');
      }

      return reply.status(overallStatus === 'healthy' ? 200 : 503).send(healthStatus);
    } catch (error) {
      if (logger && logger.error) {
        logger.error(error as Error, {}, 'Health check failed');
      }
      
      return reply.status(503).send({
        status: 'unhealthy',
        timestamp: Date.now(),
        error: 'Health check failed',
        version: process.env.npm_package_version || '2.0.0',
        uptime: process.uptime(),
      });
    }
  });

  // Detailed health check
  fastify.get('/detailed', {
    schema: {


      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'number' },
            checks: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  duration: { type: 'number' },
                  details: { type: 'object' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { logger, database, redis, jobQueue, workflowScheduler, workflowGenerator, dataExchangeService, extendedDb } = fastify;
    const checks: Record<string, any> = {};
    let overallStatus = 'healthy';

    // Database check
    const dbStart = Date.now();
    try {
      const result = await database.query('SELECT NOW() as current_time, version() as version');
      checks.database = {
        status: 'healthy',
        duration: Date.now() - dbStart,
        details: {
          connected: true,
          version: result.rows[0]?.version?.split(' ')[0] || 'unknown',
          currentTime: result.rows[0]?.current_time,
        }
      };
    } catch (error) {
      checks.database = {
        status: 'unhealthy',
        duration: Date.now() - dbStart,
        details: { error: (error as Error).message }
      };
      overallStatus = 'unhealthy';
    }

    // Redis check
    const redisStart = Date.now();
    try {
      const info = await redis.info('memory');
      checks.redis = {
        status: 'healthy',
        duration: Date.now() - redisStart,
        details: {
          connected: true,
          ping: 'pong',
          memoryInfo: info.split('\n').slice(0, 3),
        }
      };
    } catch (error) {
      checks.redis = {
        status: 'unhealthy',
        duration: Date.now() - redisStart,
        details: { error: (error as Error).message }
      };
      overallStatus = 'degraded';
    }

    // Job Queue check
    const queueStart = Date.now();
    try {
      const queueNames = jobQueue.getQueueNames();
      const queueStats = await Promise.all(
        queueNames.map(async name => ({
          name,
          stats: await jobQueue.getQueueStats(name),
        }))
      );

      checks.job_queue = {
        status: 'healthy',
        duration: Date.now() - queueStart,
        details: {
          queueCount: queueNames.length,
          queues: queueStats,
        }
      };
    } catch (error) {
      checks.job_queue = {
        status: 'unhealthy',
        duration: Date.now() - queueStart,
        details: { error: (error as Error).message }
      };
      overallStatus = 'degraded';
    }

    // Scheduler check
    const schedulerStart = Date.now();
    try {
      const stats = await workflowScheduler.getStats();
      checks.scheduler = {
        status: 'healthy',
        duration: Date.now() - schedulerStart,
        details: stats,
      };
    } catch (error) {
      checks.scheduler = {
        status: 'unhealthy',
        duration: Date.now() - schedulerStart,
        details: { error: (error as Error).message }
      };
      overallStatus = 'degraded';
    }

    return reply.send({
      status: overallStatus,
      timestamp: Date.now(),
      checks,
    });
  });

  // Readiness probe (Kubernetes)
  fastify.get('/ready', {
    schema: {


      response: {
        200: { type: 'object', properties: { ready: { type: 'boolean' } } },
        503: { type: 'object', properties: { ready: { type: 'boolean' }, reason: { type: 'string' } } }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check critical dependencies for readiness
      const isDbReady = await fastify.database.checkConnection();
      if (!isDbReady) {
        return reply.status(503).send({ ready: false, reason: 'Database not ready' });
      }

      // Check Redis
      try {
        await fastify.redis.ping();
      } catch (error) {
        return reply.status(503).send({ ready: false, reason: 'Redis not ready' });
      }

      // Check if queues are initialized
      try {
        const queueNames = fastify.jobQueue?.getQueueNames() || [];
        if (queueNames.length === 0) {
          return reply.status(503).send({ ready: false, reason: 'Job queues not initialized' });
        }
      } catch (error) {
        return reply.status(503).send({ ready: false, reason: 'Job queue check failed' });
      }

      return reply.send({ ready: true });
    } catch (error) {
      return reply.status(503).send({ 
        ready: false, 
        reason: (error as Error).message 
      });
    }
  });

  // Liveness probe (Kubernetes)
  fastify.get('/live', {
    schema: {


      response: {
        200: { type: 'object', properties: { alive: { type: 'boolean' } } }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Simple liveness check - just ensure the service is running
    return reply.send({ alive: true });
  });
}