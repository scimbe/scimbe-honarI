/**
 * Temporal Workflow Executor
 * Provides high-level API for executing workflows
 */

import { Connection, Client } from '@temporalio/client';
import { createServiceLogger } from '../shared-utils-local';
import type { 
  AddNumbersInput, 
  AddNumbersOutput,
  TeamsWebhookInput,
  TeamsWebhookOutput,
  GitHubMcpInput,
  GitHubMcpOutput
} from './workflows';

const logger = createServiceLogger('workflow-executor');

export interface WorkflowExecutionResult {
  workflowId: string;
  runId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  result?: any;
  error?: string;
  startTime: string;
  endTime?: string;
  duration?: number;
}

export class TemporalWorkflowExecutor {
  private connection: Connection | null = null;
  private client: Client | null = null;

  constructor(
    private temporalAddress: string = 'localhost:7233',
    private namespace: string = 'default',
    private taskQueue: string = 'workflow-automation'
  ) {}

  /**
   * Initialize connection to Temporal
   */
  async initialize(): Promise<void> {
    try {
      logger.getLogger().info('Initializing Temporal connection...', {
        address: this.temporalAddress,
        namespace: this.namespace
      });

      this.connection = await Connection.connect({
        address: this.temporalAddress,
      });

      this.client = new Client({
        connection: this.connection,
        namespace: this.namespace,
      });

      logger.getLogger().info('Temporal connection initialized successfully');

    } catch (error) {
      logger.error(error as Error, {}, 'Failed to initialize Temporal connection');
      throw error;
    }
  }

  /**
   * Execute Add Numbers Workflow
   */
  async executeAddNumbers(input: AddNumbersInput, workflowId?: string): Promise<WorkflowExecutionResult> {
    if (!this.client) {
      throw new Error('Temporal client not initialized. Call initialize() first.');
    }

    const actualWorkflowId = workflowId || `add-numbers-${Date.now()}`;
    const startTime = new Date().toISOString();

    try {
      logger.getLogger().info('Starting Add Numbers workflow...', {
        workflowId: actualWorkflowId,
        input
      });

      const handle = await this.client.workflow.start('addNumbersWorkflow', {
        args: [input],
        taskQueue: this.taskQueue,
        workflowId: actualWorkflowId,
      });

      logger.getLogger().info('Add Numbers workflow started', {
        workflowId: handle.workflowId,
        runId: handle.firstExecutionRunId
      });

      // Wait for completion (with timeout)
      const result = await Promise.race([
        handle.result(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Workflow execution timeout')), 60000)
        )
      ]) as AddNumbersOutput;

      const endTime = new Date().toISOString();
      const duration = Date.now() - new Date(startTime).getTime();

      logger.getLogger().info('Add Numbers workflow completed', {
        workflowId: actualWorkflowId,
        duration,
        result: result.finalResult
      });

      return {
        workflowId: actualWorkflowId,
        runId: handle.firstExecutionRunId,
        status: 'completed',
        result,
        startTime,
        endTime,
        duration
      };

    } catch (error) {
      logger.error(error as Error, { workflowId: actualWorkflowId }, 'Add Numbers workflow failed');
      
      return {
        workflowId: actualWorkflowId,
        runId: '',
        status: 'failed',
        error: (error as Error).message,
        startTime
      };
    }
  }

  /**
   * Execute Teams Webhook Workflow
   */
  async executeTeamsWebhook(input: TeamsWebhookInput, workflowId?: string): Promise<WorkflowExecutionResult> {
    if (!this.client) {
      throw new Error('Temporal client not initialized. Call initialize() first.');
    }

    const actualWorkflowId = workflowId || `teams-webhook-${Date.now()}`;
    const startTime = new Date().toISOString();

    try {
      logger.getLogger().info('Starting Teams Webhook workflow...', {
        workflowId: actualWorkflowId,
        title: input.title,
        priority: input.priority
      });

      const handle = await this.client.workflow.start('teamsWebhookWorkflow', {
        args: [input],
        taskQueue: this.taskQueue,
        workflowId: actualWorkflowId,
      });

      logger.getLogger().info('Teams Webhook workflow started', {
        workflowId: handle.workflowId,
        runId: handle.firstExecutionRunId
      });

      // Wait for completion (with longer timeout for complex workflow)
      const result = await Promise.race([
        handle.result(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Workflow execution timeout')), 120000)
        )
      ]) as TeamsWebhookOutput;

      const endTime = new Date().toISOString();
      const duration = Date.now() - new Date(startTime).getTime();

      logger.getLogger().info('Teams Webhook workflow completed', {
        workflowId: actualWorkflowId,
        duration,
        deliveryStatus: result.deliveryStatus
      });

      return {
        workflowId: actualWorkflowId,
        runId: handle.firstExecutionRunId,
        status: 'completed',
        result,
        startTime,
        endTime,
        duration
      };

    } catch (error) {
      logger.error(error as Error, { workflowId: actualWorkflowId }, 'Teams Webhook workflow failed');
      
      return {
        workflowId: actualWorkflowId,
        runId: '',
        status: 'failed',
        error: (error as Error).message,
        startTime
      };
    }
  }

  /**
   * Execute GitHub MCP Workflow
   */
  async executeGitHubMcp(input: GitHubMcpInput, workflowId?: string): Promise<WorkflowExecutionResult> {
    if (!this.client) {
      throw new Error('Temporal client not initialized. Call initialize() first.');
    }

    const actualWorkflowId = workflowId || `github-mcp-${input.operation}-${Date.now()}`;
    const startTime = new Date().toISOString();

    try {
      logger.getLogger().info('Starting GitHub MCP workflow...', {
        workflowId: actualWorkflowId,
        operation: input.operation,
        repository: `${input.repository.owner}/${input.repository.name}`
      });

      const handle = await this.client.workflow.start('githubMcpWorkflow', {
        args: [input],
        taskQueue: this.taskQueue,
        workflowId: actualWorkflowId,
      });

      logger.getLogger().info('GitHub MCP workflow started', {
        workflowId: handle.workflowId,
        runId: handle.firstExecutionRunId
      });

      // Wait for completion (with extended timeout for complex operations)
      const result = await Promise.race([
        handle.result(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Workflow execution timeout')), 300000) // 5 minutes
        )
      ]) as GitHubMcpOutput;

      const endTime = new Date().toISOString();
      const duration = Date.now() - new Date(startTime).getTime();

      logger.getLogger().info('GitHub MCP workflow completed', {
        workflowId: actualWorkflowId,
        duration,
        operation: result.operation,
        success: result.success
      });

      return {
        workflowId: actualWorkflowId,
        runId: handle.firstExecutionRunId,
        status: 'completed',
        result,
        startTime,
        endTime,
        duration
      };

    } catch (error) {
      logger.error(error as Error, { workflowId: actualWorkflowId }, 'GitHub MCP workflow failed');
      
      return {
        workflowId: actualWorkflowId,
        runId: '',
        status: 'failed',
        error: (error as Error).message,
        startTime
      };
    }
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(workflowId: string): Promise<WorkflowExecutionResult | null> {
    if (!this.client) {
      throw new Error('Temporal client not initialized. Call initialize() first.');
    }

    try {
      const handle = this.client.workflow.getHandle(workflowId);
      const description = await handle.describe();

      const result: WorkflowExecutionResult = {
        workflowId: workflowId,
        runId: description.runId,
        status: description.status.name === 'RUNNING' ? 'running' :
               description.status.name === 'COMPLETED' ? 'completed' :
               description.status.name === 'FAILED' ? 'failed' : 'cancelled',
        startTime: description.startTime.toISOString(),
        endTime: description.closeTime?.toISOString(),
        duration: description.closeTime ? 
          description.closeTime.getTime() - description.startTime.getTime() : undefined
      };

      // Try to get result if completed
      if (result.status === 'completed') {
        try {
          result.result = await handle.result();
        } catch (error) {
          // Result might not be serializable, that's ok
          result.result = { message: 'Result available but not serializable' };
        }
      }

      return result;

    } catch (error) {
      logger.error(error as Error, { workflowId }, 'Failed to get workflow status');
      return null;
    }
  }

  /**
   * Cancel workflow
   */
  async cancelWorkflow(workflowId: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Temporal client not initialized. Call initialize() first.');
    }

    try {
      const handle = this.client.workflow.getHandle(workflowId);
      await handle.cancel();
      
      logger.getLogger().info('Workflow cancelled', { workflowId });
      return true;

    } catch (error) {
      logger.error(error as Error, { workflowId }, 'Failed to cancel workflow');
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    try {
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
        this.client = null;
        
        logger.getLogger().info('Temporal connection closed');
      }
    } catch (error) {
      logger.error(error as Error, {}, 'Error during shutdown');
    }
  }
}