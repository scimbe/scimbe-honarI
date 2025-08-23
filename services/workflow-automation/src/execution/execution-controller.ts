/**
 * Execution Controller - Core orchestration for workflow execution
 * Manages the complete lifecycle of workflow execution including:
 * - Loading workflow definitions and activities
 * - Coordinating activity execution sequence
 * - Managing execution state and progress tracking
 * - Handling errors and retries
 */

import { createServiceLogger } from '../shared-utils-local';
import { ActivityRunner } from './activity-runner';
import { DataExchangeService } from './data-exchange-service';
import { ExecutionRepository } from './repositories/execution-repository';
import { WorkflowRepository } from './repositories/workflow-repository';
import { RetryHandler } from './retry-handler';
import { SchemaValidator } from './schema-validator';

const logger = createServiceLogger('execution-controller');

export interface ExecutionConfig {
  timeout_seconds?: number;
  retry_policy?: RetryPolicy;
  priority?: 'low' | 'normal' | 'high';
  max_concurrent_activities?: number;
}

export interface RetryPolicy {
  max_attempts: number;
  initial_delay_ms: number;
  max_delay_ms: number;
  backoff_multiplier: number;
  retryable_errors: string[];
}

export interface ExecutionContext {
  execution_id: string;
  workflow_id: string;
  user_id?: string;
  session_id?: string;
  metadata?: Record<string, any>;
}

export interface ExecutionResult {
  success: boolean;
  execution_id: string;
  workflow_id: string;
  status: ExecutionStatus;
  started_at: Date;
  completed_at?: Date;
  duration_ms?: number;
  result?: Record<string, any>;
  error?: ExecutionError;
  progress: ExecutionProgress;
}

export interface ExecutionProgress {
  current_activity?: string;
  completed_activities: number;
  total_activities: number;
  percentage: number;
}

export interface ExecutionError {
  type: string;
  message: string;
  activity?: string;
  timestamp: Date;
  stack_trace?: string;
  context?: Record<string, any>;
}

export enum ExecutionStatus {
  QUEUED = 'queued',
  RUNNING = 'running', 
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMED_OUT = 'timed_out'
}

export class ExecutionController {
  private activityRunner: ActivityRunner;
  private dataExchange: DataExchangeService;
  private executionRepo: ExecutionRepository;
  private workflowRepo: WorkflowRepository;
  private retryHandler: RetryHandler;
  private validator: SchemaValidator;

  constructor(
    database: any,
    redis: any,
    temporalClient?: any
  ) {
    this.activityRunner = new ActivityRunner(redis, logger.getLogger());
    this.dataExchange = new DataExchangeService(redis);
    this.executionRepo = new ExecutionRepository(database);
    this.workflowRepo = new WorkflowRepository(database);
    this.retryHandler = new RetryHandler();
    this.validator = new SchemaValidator();
  }

  /**
   * Execute a complete workflow with all its activities
   */
  async executeWorkflow(
    executionId: string,
    workflowId: string,
    inputData: Record<string, any>,
    config: ExecutionConfig = {},
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    logger.getLogger().info('Starting workflow execution', {
      executionId,
      workflowId,
      config,
      inputDataKeys: Object.keys(inputData)
    });

    try {
      // 1. Validate inputs and load workflow definition
      const workflowDef = await this.loadAndValidateWorkflow(workflowId, inputData);
      
      // 2. Create execution record
      await this.executionRepo.createExecution({
        execution_id: executionId,
        workflow_id: workflowId,
        input_data: inputData,
        status: ExecutionStatus.RUNNING,
        started_at: new Date(),
        triggered_by: context.user_id || 'system',
        execution_context: context
      });

      // 3. Initialize execution environment
      await this.dataExchange.initializeExecution(executionId, {
        workflow_input: inputData,
        execution_config: config,
        context: context
      });

      // 4. Execute activities in sequence
      const activities = await this.workflowRepo.getWorkflowActivities(workflowId);
      const executionResult = await this.executeActivitySequence(
        executionId,
        workflowId,
        activities,
        config,
        context
      );

      // 5. Finalize execution
      const duration = Date.now() - startTime;
      await this.finalizeExecution(executionId, executionResult, duration);

      logger.getLogger().info('Workflow execution completed', {
        executionId,
        duration,
        success: executionResult.success
      });

      return {
        success: executionResult.success,
        execution_id: executionId,
        workflow_id: workflowId,
        status: executionResult.success ? ExecutionStatus.COMPLETED : ExecutionStatus.FAILED,
        started_at: new Date(startTime),
        completed_at: new Date(),
        duration_ms: duration,
        result: executionResult.result,
        error: executionResult.error,
        progress: {
          current_activity: undefined,
          completed_activities: activities.length,
          total_activities: activities.length,
          percentage: 100
        }
      };

    } catch (error) {
      logger.error(error as Error, { executionId, workflowId }, 'Workflow execution failed');
      
      await this.handleExecutionError(executionId, error as Error);
      
      return {
        success: false,
        execution_id: executionId,
        workflow_id: workflowId,
        status: ExecutionStatus.FAILED,
        started_at: new Date(startTime),
        completed_at: new Date(),
        duration_ms: Date.now() - startTime,
        error: {
          type: 'EXECUTION_ERROR',
          message: (error as Error).message,
          timestamp: new Date(),
          stack_trace: (error as Error).stack
        },
        progress: {
          completed_activities: 0,
          total_activities: 0,
          percentage: 0
        }
      };
    }
  }

  /**
   * Get current status of a workflow execution
   */
  async getExecutionStatus(executionId: string): Promise<ExecutionResult | null> {
    try {
      const execution = await this.executionRepo.getExecution(executionId);
      if (!execution) {
        return null;
      }

      // Get current progress from data exchange service
      const progress = await this.dataExchange.getExecutionProgress(executionId);

      return {
        success: execution.status === ExecutionStatus.COMPLETED,
        execution_id: execution.execution_id,
        workflow_id: execution.workflow_id,
        status: execution.status,
        started_at: execution.started_at,
        completed_at: execution.completed_at || undefined,
        duration_ms: execution.duration_ms || undefined,
        result: execution.output_data || undefined,
        error: execution.error_message ? {
          type: execution.error_type || 'UNKNOWN_ERROR',
          message: execution.error_message,
          timestamp: execution.completed_at || new Date()
        } : undefined,
        progress: progress || {
          completed_activities: 0,
          total_activities: 0,
          percentage: 0
        }
      };

    } catch (error) {
      logger.error(error as Error, { executionId }, 'Failed to get execution status');
      throw error;
    }
  }

  /**
   * Cancel a running workflow execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    try {
      logger.getLogger().info('Cancelling workflow execution', { executionId });

      // Update execution status
      await this.executionRepo.updateExecutionStatus(
        executionId, 
        ExecutionStatus.CANCELLED
      );

      // Cancel any running activities
      await this.activityRunner.cancelActivities(executionId);

      // Clean up execution data
      await this.dataExchange.cleanupExecution(executionId);

      logger.getLogger().info('Workflow execution cancelled successfully', { executionId });
      return true;

    } catch (error) {
      logger.error(error as Error, { executionId }, 'Failed to cancel execution');
      return false;
    }
  }

  /**
   * Retry a failed workflow execution
   */
  async retryExecution(
    executionId: string,
    config?: ExecutionConfig
  ): Promise<ExecutionResult> {
    try {
      logger.getLogger().info('Retrying workflow execution', { executionId });

      // Get original execution details
      const originalExecution = await this.executionRepo.getExecution(executionId);
      if (!originalExecution) {
        throw new Error(`Execution ${executionId} not found`);
      }

      // Create new execution ID for retry
      const retryExecutionId = `${executionId}-retry-${Date.now()}`;

      // Execute with original parameters but new execution ID
      return await this.executeWorkflow(
        retryExecutionId,
        originalExecution.workflow_id,
        originalExecution.input_data,
        config || {},
        originalExecution.execution_context || {}
      );

    } catch (error) {
      logger.error(error as Error, { executionId }, 'Failed to retry execution');
      throw error;
    }
  }

  /**
   * Private method: Load and validate workflow definition
   */
  private async loadAndValidateWorkflow(
    workflowId: string,
    inputData: Record<string, any>
  ): Promise<any> {
    // Load workflow definition
    const workflowDef = await this.workflowRepo.getWorkflowDefinition(workflowId);
    if (!workflowDef) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Validate workflow is active
    if (workflowDef.status !== 'active') {
      throw new Error(`Workflow ${workflowId} is not active (status: ${workflowDef.status})`);
    }

    // Validate input data against workflow schema
    if (workflowDef.input_schema) {
      const validation = await this.validator.validateInputData(
        workflowDef.input_schema,
        inputData
      );
      
      if (!validation.valid) {
        throw new Error(`Input validation failed: ${validation.errors.join(', ')}`);
      }
    }

    return workflowDef;
  }

  /**
   * Private method: Execute sequence of activities
   */
  private async executeActivitySequence(
    executionId: string,
    workflowId: string,
    activities: any[],
    config: ExecutionConfig,
    context: ExecutionContext
  ): Promise<{ success: boolean; result?: any; error?: ExecutionError }> {
    let previousOutputs: Record<string, any> = {};
    let currentActivity = '';

    try {
      for (let i = 0; i < activities.length; i++) {
        const activity = activities[i];
        currentActivity = activity.name;

        // Update progress
        await this.updateExecutionProgress(executionId, {
          current_activity: activity.name,
          completed_activities: i,
          total_activities: activities.length,
          percentage: Math.round((i / activities.length) * 100)
        });

        logger.getLogger().info('Executing activity', {
          executionId,
          activityName: activity.name,
          position: i + 1,
          total: activities.length
        });

        // Prepare activity inputs
        const activityInputs = await this.prepareActivityInputs(
          executionId,
          activity,
          previousOutputs
        );

        // Execute activity with retry logic
        const activityResult = await this.retryHandler.executeWithRetry(
          () => this.activityRunner.executeActivity(
            activity.id,
            activityInputs,
            {
              execution_id: executionId,
              workflow_id: workflowId,
              activity_position: i,
              previous_outputs: previousOutputs,
              execution_config: config,
              logger: logger.getLogger()
            }
          ),
          config.retry_policy || this.getDefaultRetryPolicy()
        );

        if (!activityResult.success) {
          throw new Error(`Activity ${activity.name} failed: ${activityResult.error?.message}`);
        }

        // Store activity outputs for next activities
        previousOutputs[activity.name] = activityResult.output_data;
        await this.dataExchange.storeActivityOutput(
          executionId,
          activity.name,
          activityResult.output_data
        );

        logger.getLogger().info('Activity completed successfully', {
          executionId,
          activityName: activity.name,
          executionTimeMs: activityResult.execution_time_ms
        });
      }

      // Final progress update
      await this.updateExecutionProgress(executionId, {
        current_activity: undefined,
        completed_activities: activities.length,
        total_activities: activities.length,
        percentage: 100
      });

      return {
        success: true,
        result: previousOutputs
      };

    } catch (error) {
      logger.error(error as Error, {
        executionId,
        currentActivity
      }, 'Activity sequence execution failed');

      return {
        success: false,
        error: {
          type: 'ACTIVITY_EXECUTION_ERROR',
          message: (error as Error).message,
          activity: currentActivity,
          timestamp: new Date(),
          stack_trace: (error as Error).stack
        }
      };
    }
  }

  /**
   * Private method: Prepare inputs for an activity
   */
  private async prepareActivityInputs(
    executionId: string,
    activity: any,
    previousOutputs: Record<string, any>
  ): Promise<Record<string, any>> {
    const inputs: Record<string, any> = {};

    // Get workflow input data
    const executionData = await this.dataExchange.getExecutionContext(executionId);
    
    // Map inputs according to activity configuration
    if (activity.input_mapping) {
      for (const [inputKey, sourceKey] of Object.entries(activity.input_mapping)) {
        if (sourceKey === 'workflow_input') {
          inputs[inputKey] = executionData.workflow_input;
        } else if (previousOutputs[sourceKey as string]) {
          inputs[inputKey] = previousOutputs[sourceKey as string];
        }
      }
    } else {
      // Default: pass all previous outputs
      inputs.previous_outputs = previousOutputs;
      inputs.workflow_input = executionData.workflow_input;
    }

    return inputs;
  }

  /**
   * Private method: Update execution progress
   */
  private async updateExecutionProgress(
    executionId: string,
    progress: ExecutionProgress
  ): Promise<void> {
    await Promise.all([
      this.executionRepo.updateExecutionProgress(executionId, progress),
      this.dataExchange.updateExecutionProgress(executionId, progress)
    ]);
  }

  /**
   * Private method: Finalize execution
   */
  private async finalizeExecution(
    executionId: string,
    result: { success: boolean; result?: any; error?: ExecutionError },
    duration: number
  ): Promise<void> {
    const status = result.success ? ExecutionStatus.COMPLETED : ExecutionStatus.FAILED;
    
    await this.executionRepo.updateExecution(executionId, {
      status,
      completed_at: new Date(),
      duration_ms: duration,
      output_data: result.result,
      error_type: result.error?.type,
      error_message: result.error?.message
    });

    // Clean up temporary execution data if successful
    if (result.success) {
      await this.dataExchange.cleanupExecution(executionId);
    }
  }

  /**
   * Private method: Handle execution errors
   */
  private async handleExecutionError(
    executionId: string,
    error: Error
  ): Promise<void> {
    await this.executionRepo.updateExecution(executionId, {
      status: ExecutionStatus.FAILED,
      completed_at: new Date(),
      error_type: 'EXECUTION_ERROR',
      error_message: error.message
    });
  }

  /**
   * Private method: Get default retry policy
   */
  private getDefaultRetryPolicy(): RetryPolicy {
    return {
      max_attempts: 3,
      initial_delay_ms: 1000,
      max_delay_ms: 10000,
      backoff_multiplier: 2,
      retryable_errors: [
        'TIMEOUT_ERROR',
        'NETWORK_ERROR',
        'TEMPORARY_FAILURE'
      ]
    };
  }
}