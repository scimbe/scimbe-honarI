/**
 * Temporal Worker Service - Main Entry Point
 * Port: 8081
 * 
 * Executes workflow activities and manages workflow state
 */

import { NativeConnection, Worker } from '@temporalio/worker';
import { createServiceLogger, loadEnvironment, TemporalWorkerEnvironmentSchema } from '@platform/shared';
import { createServer } from './server';
import * as activities from './activities';

const logger = createServiceLogger('temporal-worker');

async function startWorker(): Promise<void> {
  try {
    // Load and validate environment configuration
    const env = loadEnvironment(TemporalWorkerEnvironmentSchema);
    
    logger.getLogger().info({
      port: env.TEMPORAL_WORKER_PORT,
      temporalHost: env.TEMPORAL_HOST,
      temporalPort: env.TEMPORAL_PORT,
      taskQueue: env.TEMPORAL_TASK_QUEUE,
      nodeEnv: env.NODE_ENV,
    }, 'Starting Temporal Worker Service');

    // Create Temporal connection
    const connection = await NativeConnection.connect({
      address: `${env.TEMPORAL_HOST}:${env.TEMPORAL_PORT}`,
    });

    // Create and start Temporal Worker
    const worker = await Worker.create({
      connection,
      namespace: env.TEMPORAL_NAMESPACE || 'default',
      taskQueue: env.TEMPORAL_TASK_QUEUE,
      workflowsPath: require.resolve('./workflows'),
      activities,
      maxConcurrentActivityTaskExecutions: env.MAX_CONCURRENT_ACTIVITIES || 10,
      maxConcurrentWorkflowTaskExecutions: env.MAX_CONCURRENT_WORKFLOWS || 5,
      enableLoggingInReplay: false,
    });

    // Start the worker
    const workerPromise = worker.run();
    
    logger.getLogger().info({
      taskQueue: env.TEMPORAL_TASK_QUEUE,
      namespace: env.TEMPORAL_NAMESPACE,
    }, 'Temporal Worker started successfully');

    // Create and start HTTP server for health checks and management
    const server = await createServer(env, worker, connection);
    await server.listen({
      host: env.HOST,
      port: env.TEMPORAL_WORKER_PORT,
    });

    logger.getLogger().info({
      port: env.TEMPORAL_WORKER_PORT,
      host: env.HOST,
    }, 'Temporal Worker HTTP server started successfully');

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.getLogger().info({ signal }, 'Received shutdown signal');
      
      try {
        // Stop accepting new tasks
        worker.shutdown();
        
        // Close HTTP server
        await server.close();
        
        // Close Temporal connection
        await connection.close();
        
        logger.getLogger().info('Temporal Worker Service stopped gracefully');
        process.exit(0);
      } catch (error) {
        logger.error(error as Error, {}, 'Error during graceful shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Wait for worker to complete (this usually doesn't happen)
    await workerPromise;

  } catch (error) {
    logger.error(error as Error, {}, 'Failed to start Temporal Worker Service');
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(error, {}, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(new Error(String(reason)), { promise }, 'Unhandled rejection');
  process.exit(1);
});

// Start the worker
startWorker().catch((error) => {
  logger.error(error as Error, {}, 'Failed to start worker');
  process.exit(1);
});