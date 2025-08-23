/**
 * Workflow Automation Application Setup
 * Configures Fastify with automation engine, job queue, and quality control
 */

import fastify, { FastifyInstance } from 'fastify';
import { createServiceLogger, WorkflowAutomationEnvironmentSchema } from './shared-utils-local';
import { z } from 'zod';
import { createDatabaseConnection } from './database/connection';
import { createRedisConnection } from './cache/redis';
import { AutomationEngine } from './automation/engine';
import { QualityController } from './quality/controller';
import { JobQueue } from './jobs/queue';
import { WorkflowScheduler } from './scheduler/scheduler';
import { WorkflowGeneratorPlugin } from './plugins/workflow-generator-plugin';
import { MultiLevelWorkflowCache } from './cache/workflow-cache';
import { healthRoutes } from './routes/health';
// import { automationRoutes } from './routes/automation'; // Removed to avoid route conflicts
import { workflowRoutes } from './routes/workflows';
import { qualityRoutes } from './routes/quality';
import { jobRoutes } from './routes/jobs';
import { scheduleRoutes } from './routes/schedule';
import { generatorRoutes } from './routes/generator';
import { cacheRoutes } from './routes/cache';
import { realExecutionRoutes } from './routes/real-execution';
import { mlOpsPipelineRoutes } from './routes/mlops-pipeline';
import { enhancedTemporalIntegration } from './routes/enhanced-temporal-integration.js';
import { TemporalAutomationEngine } from './services/temporal-automation-engine';
import { dataExchangeService } from './services/data-exchange';
import { extendedDb } from './services/database-extended';
import { LLMService } from './services/llm-service';

type WorkflowAutomationEnvironment = z.infer<typeof WorkflowAutomationEnvironmentSchema>;
const logger = createServiceLogger('workflow-automation-app');

export async function createApp(env: WorkflowAutomationEnvironment): Promise<FastifyInstance> {
  const app = fastify({
    logger: false, // Use our custom logger
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 50 * 1024 * 1024, // 50MB for file uploads
  });

  // Register multipart support for file uploads
  await app.register(require('@fastify/multipart'), {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  });

  // Add CORS support
  await app.register(require('@fastify/cors'), {
    origin: env.NODE_ENV === 'development' ? '*' : false,
    credentials: true,
  });

  // Add security headers
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    return payload;
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

  // Add error handling
  app.setErrorHandler((error, request, reply) => {
    logger.error(error, {
      method: request.method,
      url: request.url,
      requestId: request.id,
    }, 'Request error');

    if (error.validation) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validation,
        timestamp: new Date().toISOString(),
      });
    }

    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: error.name || 'BAD_REQUEST',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }

    return reply.status(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An internal server error occurred',
      timestamp: new Date().toISOString(),
      requestId: request.id,
    });
  });

  try {
    // Initialize database connection
    const database = await createDatabaseConnection(env);
    app.decorate('database', database);

    // Initialize Redis connection
    const redis = await createRedisConnection(env);
    app.decorate('redis', redis);

    // Initialize multi-level cache system
    const workflowCache = new MultiLevelWorkflowCache(redis, database, logger.getLogger());
    
    // Initialize core automation components
    const jobQueue = new JobQueue(redis);
    const qualityController = new QualityController(database, env);
    const automationEngine = new AutomationEngine(database, jobQueue, qualityController, env);
    const workflowScheduler = new WorkflowScheduler(database, redis, automationEngine);
    const workflowGenerator = new WorkflowGeneratorPlugin(logger.getLogger(), workflowCache);
    
    // Initialize Temporal automation engine
    const temporalAutomationEngine = new TemporalAutomationEngine(
      env.TEMPORAL_ADDRESS || 'temporal-server:7233',
      env.TEMPORAL_NAMESPACE || 'default',
      logger.getLogger()
    );

    // Initialize LLM service
    const llmService = new LLMService(
      env.LLM_API_URL || 'http://host.docker.internal:4000/openai/v1',
      env.LLM_MODEL || 'vscode-lm-proxy',
      logger.getLogger()
    );

    // Initialize job queue
    await jobQueue.initialize();

    // Decorate Fastify instance with automation components
    app.decorate('automationEngine', automationEngine);
    app.decorate('qualityController', qualityController);
    app.decorate('jobQueue', jobQueue);
    app.decorate('workflowScheduler', workflowScheduler);
    app.decorate('workflowGenerator', workflowGenerator);
    app.decorate('workflowCache', workflowCache);
    app.decorate('temporalAutomationEngine', temporalAutomationEngine);
    app.decorate('dataExchangeService', dataExchangeService);
    app.decorate('extendedDb', extendedDb);
    app.decorate('llmService', llmService);

    logger.getLogger().info('Workflow Automation components initialized successfully');

    // Warm up cache with frequently used data
    await workflowCache.warmUpCache();

    // Register route handlers
    await app.register(healthRoutes, { prefix: '/health' });
    // await app.register(automationRoutes, { prefix: '/automation' }); // Removed to avoid route conflicts
    await app.register(workflowRoutes, { prefix: '/workflows' });
    await app.register(qualityRoutes, { prefix: '/quality' });
    await app.register(jobRoutes, { prefix: '/jobs' });
    await app.register(scheduleRoutes, { prefix: '/schedule' });
    await app.register(generatorRoutes, { prefix: '/generator' });
    await app.register(cacheRoutes, { prefix: '/cache' });
    await app.register(realExecutionRoutes);
    await app.register(mlOpsPipelineRoutes);
    await app.register(enhancedTemporalIntegration);
    
    // Activity Parameter Management Routes
    const activityParameterModule = await import('./routes/activity-parameters');
    await app.register(activityParameterModule.activityParameterRoutes, { prefix: '/api/parameters' });
    
    // Activity Management Routes (for frontend compatibility)
    try {
      logger.getLogger().info('Loading activity management routes...');
      const activityModule = await import('./routes/activities');
      logger.getLogger().info('Activity module loaded successfully');
      await app.register(activityModule.activityRoutes);
      logger.getLogger().info('Activity routes registered successfully');
    } catch (error) {
      logger.error(error as Error, {}, 'Failed to register activity routes');
    }
    
    // Revolutionary dynamic workflow endpoints  
    try {
      const dynamicModule = await import('./routes/dynamic-workflow-endpoints');
      const chainModule = await import('./routes/chain-endpoints');
      const temporalActivityModule = await import('./routes/temporal-activity-endpoints');
      
      await app.register(dynamicModule.dynamicWorkflowEndpoints);
      await app.register(chainModule.chainEndpoints);
      await app.register(temporalActivityModule.temporalActivityEndpoints);
      
      logger.getLogger().info('Dynamic workflow and temporal activity endpoints registered successfully');
    } catch (error) {
      logger.error(error as Error, {}, 'Failed to register dynamic workflow endpoints');
    }

    logger.getLogger().info('Route handlers registered successfully');

    return app;

  } catch (error) {
    logger.error(error as Error, {}, 'Failed to create Workflow Automation application');
    throw error;
  }
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    database: any;
    redis: any;
    automationEngine: AutomationEngine;
    qualityController: QualityController;
    jobQueue: JobQueue;
    workflowScheduler: WorkflowScheduler;
    workflowGenerator: WorkflowGeneratorPlugin;
    workflowCache: MultiLevelWorkflowCache;
    temporalAutomationEngine: TemporalAutomationEngine;
    dataExchangeService: typeof dataExchangeService;
    extendedDb: typeof extendedDb;
    llmService: LLMService;
  }
}