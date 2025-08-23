/**
 * Real Temporal Executor - Executes workflows through actual Temporal client
 * This connects to the real Temporal server and executes workflows
 */

import { Client, Connection } from '@temporalio/client';
import { createServiceLogger } from './shared-utils-local';
import { WorkflowHandle } from '@temporalio/client';

const logger = createServiceLogger('real-temporal-executor');

export interface TemporalExecutionConfig {
  temporalHost: string;
  temporalPort: number;
  namespace: string;
  taskQueue: string;
}

export interface WorkflowExecutionRequest {
  workflowId: string;
  workflowType: string;
  input: any;
  timeout?: number; // seconds
}

export interface WorkflowExecutionResult {
  success: boolean;
  executionId: string;
  runId: string;
  result?: any;
  error?: string;
  startTime: string;
  endTime?: string;
  duration?: number; // milliseconds
}

/**
 * Real Temporal Executor Class
 */
export class RealTemporalExecutor {
  private client: Client | null = null;
  private connection: Connection | null = null;
  private config: TemporalExecutionConfig;

  constructor(config: TemporalExecutionConfig) {
    this.config = config;
  }

  /**
   * Connect to Temporal server
   */
  async connect(): Promise<void> {
    try {
      logger.info('Connecting to Temporal server', {
        host: this.config.temporalHost,
        port: this.config.temporalPort,
        namespace: this.config.namespace
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

      logger.info('Successfully connected to Temporal server');

    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), {}, 'Failed to connect to Temporal');
      throw error;
    }
  }

  /**
   * Disconnect from Temporal server
   */
  async disconnect(): Promise<void> {
    try {
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
        this.client = null;
        logger.info('Disconnected from Temporal server');
      }
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), {}, 'Error disconnecting from Temporal');
      throw error;
    }
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(request: WorkflowExecutionRequest): Promise<WorkflowExecutionResult> {
    if (!this.client) {
      throw new Error('Not connected to Temporal. Call connect() first.');
    }

    const startTime = new Date();
    logger.info('Starting workflow execution', {
      workflowId: request.workflowId,
      workflowType: request.workflowType,
      input: request.input
    });

    try {
      // Start workflow
      const uniqueWorkflowId = `${request.workflowId}-${Date.now()}`;
      const handle: WorkflowHandle = await this.client.workflow.start(request.workflowType, {
        args: [request.input],
        taskQueue: this.config.taskQueue,
        workflowId: uniqueWorkflowId,
      });

      logger.info('Workflow started successfully', {
        workflowId: request.workflowId,
        executionId: handle.workflowId,
        runId: 'started'
      });

      // Wait for result with timeout
      const timeoutMs = (request.timeout || 120) * 1000; // Default 2 minutes
      const resultPromise = handle.result();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Workflow execution timeout')), timeoutMs);
      });

      const result = await Promise.race([resultPromise, timeoutPromise]);
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      logger.info('Workflow completed successfully', {
        workflowId: request.workflowId,
        executionId: handle.workflowId,
        duration,
        result
      });

      return {
        success: true,
        executionId: handle.workflowId,
        runId: 'completed',
        result,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration
      };

    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(error instanceof Error ? error : new Error(String(error)), {
        workflowId: request.workflowId,
        workflowType: request.workflowType,
        duration
      }, 'Workflow execution failed');

      return {
        success: false,
        executionId: request.workflowId,
        runId: 'unknown',
        error: errorMessage,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration
      };
    }
  }

  /**
   * Get workflow execution status
   */
  async getWorkflowStatus(workflowId: string): Promise<{
    status: string;
    result?: any;
    error?: string;
  }> {
    if (!this.client) {
      throw new Error('Not connected to Temporal. Call connect() first.');
    }

    try {
      const handle = this.client.workflow.getHandle(workflowId);
      const result = await handle.result();

      return {
        status: 'COMPLETED',
        result
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if workflow is still running
      if (errorMessage.includes('workflow execution is still running')) {
        return { status: 'RUNNING' };
      }

      return {
        status: 'FAILED',
        error: errorMessage
      };
    }
  }

  /**
   * Cancel a running workflow
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to Temporal. Call connect() first.');
    }

    try {
      const handle = this.client.workflow.getHandle(workflowId);
      await handle.cancel();
      logger.info('Workflow cancelled successfully', { workflowId });

    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), { workflowId }, 'Failed to cancel workflow');
      throw error;
    }
  }

  /**
   * List recent workflow executions
   */
  async listWorkflows(limit: number = 10): Promise<Array<{
    workflowId: string;
    workflowType: string;
    status: string;
    startTime: string;
    endTime?: string;
  }>> {
    if (!this.client) {
      throw new Error('Not connected to Temporal. Call connect() first.');
    }

    try {
      // This is a simplified version - in practice you'd use the Temporal list API
      // For now, return empty array as we'd need more complex setup
      return [];

    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), {}, 'Failed to list workflows');
      return [];
    }
  }
}

/**
 * Create a default executor instance
 */
export function createDefaultTemporalExecutor(): RealTemporalExecutor {
  const config: TemporalExecutionConfig = {
    temporalHost: process.env.TEMPORAL_HOST || 'temporal',
    temporalPort: parseInt(process.env.TEMPORAL_PORT || '7233'),
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'workflow-editor-queue'
  };

  return new RealTemporalExecutor(config);
}

/**
 * Execute Circle Area Workflow - Convenience function
 */
export async function executeCircleAreaWorkflow(
  workflowId: string,
  radius: number,
  executor?: RealTemporalExecutor
): Promise<WorkflowExecutionResult> {
  const exec = executor || createDefaultTemporalExecutor();
  let shouldDisconnect = false;

  try {
    // Connect if not already connected
    if (!exec['client']) {
      await exec.connect();
      shouldDisconnect = true;
    }

    // Execute the workflow
    const result = await exec.executeWorkflow({
      workflowId: `circle-area-${workflowId}`,
      workflowType: `${workflowId}Workflow`,
      input: { radius },
      timeout: 60 // 1 minute timeout
    });

    logger.info('Circle area workflow execution completed', {
      workflowId,
      radius,
      success: result.success,
      result: result.result
    });

    return result;

  } finally {
    // Disconnect if we connected
    if (shouldDisconnect) {
      await exec.disconnect();
    }
  }
}