/**
 * Workflow Automation Service Server
 * Main server for Temporal workflow code generation and automation
 */

import Fastify, { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { createServiceLogger, WorkflowAutomationEnvironmentSchema } from './shared-utils-local';
import { createDatabaseConnection } from './database/connection';
import { AutomationDatabase } from './database/connection';
import { TemporalAutomationEngine } from './automation/temporal-engine';
import { JobQueue } from './jobs/queue';
import { QualityController } from './quality/controller';
import { WorkflowScheduler } from './scheduler/scheduler';
import { healthRoutes } from './routes/health';
// import { automationRoutes } from './routes/automation'; // Removed to avoid route conflicts
// import { workflowRoutes } from './routes/workflows';
import { qualityRoutes } from './routes/quality';
import { jobRoutes } from './routes/jobs';
import { scheduleRoutes } from './routes/schedule';
import { schemaGeneratorRoutes } from './routes/schema-generator';
import { workflowGenerationRoutes } from './routes/workflow-generation'; // Enhanced workflow generation routes
import { mlOpsPipelineRoutes } from './routes/mlops-pipeline';
import { realExecutionRoutes } from './routes/real-execution';
import { apiDiscoveryRoutes } from './routes/api-discovery';
import { temporalFixRoutes } from './routes/temporal-fix';
import { dynamicWorkflowEndpoints } from './routes/dynamic-workflow-endpoints';
import { workflowGenerator } from './services/workflow-generator';
import { dataExchangeService } from './services/data-exchange';
import { extendedDb } from './services/database-extended';
import { LLMService } from './services/llm-service';

const logger = createServiceLogger('workflow-automation-server');

// Extend Fastify instance type
declare module 'fastify' {
  interface FastifyInstance {
    database: any;
    redis: any;
    temporalAutomationEngine: TemporalAutomationEngine;
    jobQueue: JobQueue;
    qualityController: QualityController;
    workflowScheduler: WorkflowScheduler;
    workflowGenerator: typeof workflowGenerator;
    dataExchangeService: typeof dataExchangeService;
    extendedDb: typeof extendedDb;
    llmService: any;
  }
}

interface WorkflowAutomationEnvironment {
  NODE_ENV: string;
  PORT: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  AI_GATEWAY_URL: string;
  TEMPORAL_WORKER_URL: string;
  LOG_LEVEL: string;
  CORS_ORIGIN: string;
  MAX_CONCURRENT_EXECUTIONS: string;
  DEFAULT_QUALITY_THRESHOLD: string;
  ENABLE_ITERATIVE_MODE: string;
  DEFAULT_COMPLEXITY: string;
  EXECUTION_TIMEOUT: string;
  STEP_TIMEOUT: string;
  ENABLE_QUALITY_CHECKS: string;
  DEFAULT_QUALITY_CRITERIA: string;
}

async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      serializers: {
        req: (req) => ({
          method: req.method,
          url: req.url,
          headers: {
            'user-agent': req.headers['user-agent'],
            'x-correlation-id': req.headers['x-correlation-id'],
            'x-user-id': req.headers['x-user-id'],
          },
        }),
      },
    },
    requestIdHeader: 'x-correlation-id',
    genReqId: (req) => req.headers['x-correlation-id'] as string || require('uuid').v4(),
  });

  // Register CORS
  await server.register(require('@fastify/cors'), {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3004', 'http://localhost:8099'],
    credentials: true,
  });

  // Register rate limiting
  await server.register(require('@fastify/rate-limit'), {
    max: 100,
    timeWindow: '1 minute',
  });

  // Health check route (before authentication)
  server.get('/', async () => ({
    service: 'workflow-automation',
    status: 'healthy',
    timestamp: Date.now(),
    version: '2.0.0',
  }));

  try {
    // Initialize database connection
    logger.getLogger().info('Initializing database connection...');
    const env = WorkflowAutomationEnvironmentSchema.parse(process.env);
    const database = await createDatabaseConnection(env);
    server.decorate('database', database);

    // Initialize Redis connection
    logger.getLogger().info('Initializing Redis connection...');
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    await redis.connect();
    server.decorate('redis', redis);

    // Initialize job queue system
    logger.getLogger().info('Initializing job queue system...');
    const jobQueue = new JobQueue(redis);
    await jobQueue.initialize();
    server.decorate('jobQueue', jobQueue);

    // Initialize quality controller
    logger.getLogger().info('Initializing quality controller...');
    const qualityController = new QualityController(database, process.env);
    server.decorate('qualityController', qualityController);

    // Initialize workflow scheduler
    logger.getLogger().info('Initializing workflow scheduler...');
    const workflowScheduler = new WorkflowScheduler(database, redis, null as any); // Will be set after engine init
    server.decorate('workflowScheduler', workflowScheduler);

    // Initialize Temporal automation engine
    logger.getLogger().info('Initializing Temporal automation engine...');
    const temporalAutomationEngine = new TemporalAutomationEngine(
      database,
      jobQueue,
      qualityController
    );
    server.decorate('temporalAutomationEngine', temporalAutomationEngine);

    // Update scheduler with automation engine
    (workflowScheduler as any).automationEngine = temporalAutomationEngine;
    await workflowScheduler.initialize();

    // Initialize extended services
    logger.getLogger().info('Initializing extended workflow services...');
    const llmService = new LLMService();
    server.decorate('llmService', llmService);
    server.decorate('workflowGenerator', workflowGenerator);
    server.decorate('dataExchangeService', dataExchangeService);
    server.decorate('extendedDb', extendedDb);

    // Set up job processors
    await setupJobProcessors(jobQueue, temporalAutomationEngine, qualityController);

    // Register API routes
    logger.getLogger().info('Registering API routes...');
    await server.register(healthRoutes, { prefix: '/health' });
    await server.register(dynamicWorkflowEndpoints, { prefix: '' }); // Dynamic workflow endpoints - no prefix for /api/workflows
    await server.register(apiDiscoveryRoutes, { prefix: '/workflow-automation' }); // API Discovery - register early
    await server.register(workflowGenerationRoutes, { prefix: '/workflow-automation' }); // Enhanced workflow generation routes
    await server.register(qualityRoutes, { prefix: '/workflow-automation' });
    await server.register(jobRoutes, { prefix: '/workflow-automation' });
    await server.register(scheduleRoutes, { prefix: '/workflow-automation' });
    await server.register(schemaGeneratorRoutes, { prefix: '/workflow-automation' });
    await server.register(temporalFixRoutes, { prefix: '/workflow-automation' }); // Temporal fix routes
    await server.register(mlOpsPipelineRoutes, { prefix: '' }); // MLOps routes with no prefix
    await server.register(realExecutionRoutes, { prefix: '' }); // Real execution routes with no prefix

    // Register shutdown hooks
    setupShutdownHooks(server, database, redis, jobQueue, workflowScheduler);

    // Setup data exchange listeners
    setupDataExchangeListeners(dataExchangeService, temporalAutomationEngine);

    logger.getLogger().info({
      port: process.env.PORT || 8092,
      environment: process.env.NODE_ENV || 'development',
      databaseConnected: true,
      redisConnected: true,
    }, 'Workflow Automation Service initialized successfully');

  } catch (error) {
    logger.error(error as Error, {}, 'Failed to initialize Workflow Automation Service');
    throw error;
  }

  return server;
}

/**
 * Set up job processors for background tasks
 */
async function setupJobProcessors(
  jobQueue: JobQueue,
  temporalAutomationEngine: TemporalAutomationEngine,
  qualityController: QualityController
): Promise<void> {
  logger.getLogger().info('Setting up job processors...');

  // Workflow execution processor
  await jobQueue.processJobs('workflow-execution', async (job) => {
    const { requirements, metadata, options } = job.payload;
    
    return await temporalAutomationEngine.generateWorkflow(
      requirements,
      'background_generation',
      {},
      metadata,
      options
    );
  }, 2);

  // Quality assessment processor
  await jobQueue.processJobs('quality-assessment', async (job) => {
    const { context, results, criteria } = job.payload;
    
    return await qualityController.assessQuality(context, results, criteria);
  }, 3);

  // Data processing processor
  await jobQueue.processJobs('data-processing', async (job) => {
    const { workflowId, data } = job.payload;
    
    // Process workflow data (placeholder implementation)
    logger.getLogger().info({ workflowId, dataSize: JSON.stringify(data).length }, 'Processing workflow data');
    
    return { processed: true, workflowId, timestamp: Date.now() };
  }, 5);

  // AI tasks processor
  await jobQueue.processJobs('ai-tasks', async (job) => {
    const { taskType, payload } = job.payload;
    
    // Handle AI-related tasks (placeholder implementation)
    logger.getLogger().info({ taskType }, 'Processing AI task');
    
    return { completed: true, taskType, result: payload };
  }, 3);

  logger.getLogger().info('Job processors set up successfully');
}

/**
 * Set up graceful shutdown hooks
 */
/**
 * Setup data exchange listeners for inter-workflow communication
 */
function setupDataExchangeListeners(
  dataExchangeService: typeof dataExchangeService,
  temporalAutomationEngine: TemporalAutomationEngine
): void {
  logger.getLogger().info('Setting up data exchange listeners...');

  // Listen for workflow data events
  dataExchangeService.on('workflow-data', async (event) => {
    const { sourceWorkflow, targetWorkflow, message, channel } = event;
    
    logger.getLogger().info('Received workflow data event', {
      sourceWorkflow,
      targetWorkflow,
      messageId: message?.id,
      channel
    });

    // Trigger target workflow if needed
    try {
      if (targetWorkflow && message) {
        // This could trigger workflow execution based on received data
        await temporalAutomationEngine.processWorkflowData(targetWorkflow, message.data);
      }
    } catch (error) {
      logger.error(error as Error, { sourceWorkflow, targetWorkflow }, 'Failed to process workflow data event');
    }
  });

  logger.getLogger().info('Data exchange listeners setup completed');
}

/**
 * Set up graceful shutdown hooks
 */
function setupShutdownHooks(
  server: FastifyInstance,
  database: AutomationDatabase,
  redis: Redis,
  jobQueue: JobQueue,
  workflowScheduler: WorkflowScheduler
): void {
  const gracefulShutdown = async (signal: string) => {
    logger.getLogger().info({ signal }, 'Received shutdown signal, starting graceful shutdown...');

    try {
      // Stop accepting new requests
      await server.close();

      // Shutdown services in reverse order of initialization
      await dataExchangeService.close();
      await workflowGenerator.close();
      await extendedDb.close();
      await workflowScheduler.shutdown();
      await jobQueue.close();
      await redis.quit();
      await database.close();

      logger.getLogger().info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error(error as Error, {}, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // Nodemon restart
}

/**
 * Start the server
 */
async function start(): Promise<void> {
  try {
    const server = await createServer();
    const port = parseInt(process.env.PORT || '8092', 10);
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });

    logger.getLogger().info({
      port,
      host,
      environment: process.env.NODE_ENV || 'development',
      pid: process.pid,
    }, 'Workflow Automation Service started successfully');

  } catch (error) {
    logger.error(error as Error, {}, 'Failed to start Workflow Automation Service');
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  start();
}

export { createServer, start };
export type { WorkflowAutomationEnvironment };