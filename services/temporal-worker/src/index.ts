/**
 * Temporal Worker Service
 * Main entry point for the temporal worker
 */

import { Worker, NativeConnection } from '@temporalio/worker';
import { createServiceLogger } from './utils/logger';
import { TemporalWorkerHttpServer } from './http-server';
import * as activities from './minimal-redis-activities';

const logger = createServiceLogger('temporal-worker');

let httpServer: TemporalWorkerHttpServer | null = null;

/**
 * Main function to start the temporal worker and HTTP server
 */
async function startWorker() {
  try {
    logger.info('Starting Temporal Worker Service...');

    // Create connection to temporal server
    const connection = await NativeConnection.connect({
      address: process.env.TEMPORAL_ADDRESS || 'temporal-server:7233',
    });

    // Create and start worker with minimal activities
    const worker = await Worker.create({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE || 'default',
      taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'workflow-automation',
      workflowsPath: require.resolve('./workflows-only'),
      activities,
      maxConcurrentWorkflowTaskExecutions: 10,
      maxConcurrentActivityTaskExecutions: 100,
      bundlerOptions: {
        ignoreModules: [
          '@temporalio/activity',
          'events',
          'stream',
          'net',
          'tls',
          'dns',
          'crypto',
          'buffer',
          'string_decoder',
          'ioredis'
        ]
      }
    });

    logger.info('Temporal worker created successfully');

    // Start HTTP server
    httpServer = new TemporalWorkerHttpServer(worker);
    await httpServer.start(8081, '0.0.0.0');

    // Start the worker (this is a blocking call)
    await worker.run();

    logger.info('Temporal worker started and running');

  } catch (error) {
    logger.error('Failed to start temporal worker:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down temporal worker...');
  if (httpServer) {
    await httpServer.stop();
  }
  if (activityLoader) {
    await activityLoader.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down temporal worker...');
  if (httpServer) {
    await httpServer.stop();
  }
  if (activityLoader) {
    await activityLoader.close();
  }
  process.exit(0);
});

// Start the worker
startWorker().catch((error) => {
  logger.error('Unhandled error in worker startup:', error);
  process.exit(1);
});