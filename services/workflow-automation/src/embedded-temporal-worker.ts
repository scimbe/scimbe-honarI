/**
 * Embedded Temporal Worker - Runs inside the Workflow Automation Service
 * Automatically deploys and executes generated workflows
 */

import { Client, Connection, WorkflowHandle } from '@temporalio/client';
import { Worker } from '@temporalio/worker';
import { createServiceLogger } from './shared-utils-local';

const logger = createServiceLogger('embedded-temporal-worker');

export interface EmbeddedWorkerConfig {
  temporalHost: string;
  temporalPort: number;
  namespace: string;
  taskQueue: string;
}

export class EmbeddedTemporalWorker {
  private client: Client | null = null;
  private connection: Connection | null = null;
  private worker: Worker | null = null;
  private config: EmbeddedWorkerConfig;
  private isRunning = false;

  constructor(config: EmbeddedWorkerConfig) {
    this.config = config;
  }

  /**
   * Start the embedded worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.info('Worker already running');
      return;
    }

    try {
      logger.info('🚀 Starting embedded Temporal worker', {
        host: this.config.temporalHost,
        port: this.config.temporalPort,
        namespace: this.config.namespace,
        taskQueue: this.config.taskQueue
      });

      // Create connection
      this.connection = await Connection.connect({
        address: `${this.config.temporalHost}:${this.config.temporalPort}`,
      });

      // Create client
      this.client = new Client({
        connection: this.connection,
        namespace: this.config.namespace,
      });

      // Import workflows and activities
      const workflows = await import('./embedded-workflows');
      const activities = await import('./embedded-activities');

      // Create worker with imported modules
      this.worker = await Worker.create({
        connection: this.connection,
        namespace: this.config.namespace,
        taskQueue: this.config.taskQueue,
        workflows: workflows,
        activities: activities,
      });

      // Start worker in background
      this.startWorkerInBackground();
      
      this.isRunning = true;
      logger.info('✅ Embedded Temporal worker started successfully');

    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), {}, 'Failed to start embedded worker');
      throw error;
    }
  }

  /**
   * Start worker in background (non-blocking)
   */
  private async startWorkerInBackground(): Promise<void> {
    if (!this.worker) return;

    // Run worker in background
    setImmediate(async () => {
      try {
        logger.info('🏃‍♂️ Worker running in background...');
        await this.worker!.run();
      } catch (error) {
        logger.error(error instanceof Error ? error : new Error(String(error)), {}, 'Worker execution error');
        this.isRunning = false;
      }
    });
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(workflowId: string, input: any): Promise<any> {
    if (!this.client) {
      throw new Error('Worker not started. Call start() first.');
    }

    logger.info('🎯 Executing workflow via embedded worker', { workflowId, input });

    try {
      const handle = await this.client.workflow.start('CircleAreaWorkflow', {
        args: [input],
        taskQueue: this.config.taskQueue,
        workflowId: `${workflowId}-${Date.now()}`,
      });

      logger.info('⏳ Waiting for workflow result...');
      
      const result = await handle.result();
      
      logger.info('✅ Workflow completed via embedded worker', { result });
      return result;

    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), { workflowId }, 'Workflow execution failed');
      throw error;
    }
  }

  /**
   * Stop the embedded worker
   */
  async stop(): Promise<void> {
    logger.info('🛑 Stopping embedded Temporal worker...');

    try {
      if (this.worker) {
        this.worker.shutdown();
        this.worker = null;
      }

      if (this.connection) {
        await this.connection.close();
        this.connection = null;
        this.client = null;
      }

      this.isRunning = false;
      logger.info('✅ Embedded worker stopped successfully');

    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), {}, 'Error stopping worker');
      throw error;
    }
  }

  /**
   * Check if worker is running
   */
  isWorkerRunning(): boolean {
    return this.isRunning;
  }
}

/**
 * Create default embedded worker
 */
export function createDefaultEmbeddedWorker(): EmbeddedTemporalWorker {
  const config: EmbeddedWorkerConfig = {
    temporalHost: process.env.TEMPORAL_HOST || 'temporal',
    temporalPort: parseInt(process.env.TEMPORAL_PORT || '7233'),
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'circle-area-queue'
  };

  return new EmbeddedTemporalWorker(config);
}