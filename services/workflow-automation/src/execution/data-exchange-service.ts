/**
 * Data Exchange Service - Manages data flow between activities
 * Handles Redis-based inter-activity communication with:
 * - Execution context management
 * - Activity input/output storage
 * - Progress tracking
 * - Data persistence and cleanup
 */

import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('data-exchange-service');

export interface ExecutionContext {
  execution_id: string;
  workflow_input: Record<string, any>;
  execution_config: any;
  context: any;
  started_at: Date;
}

export interface ExecutionProgress {
  current_activity?: string;
  completed_activities: number;
  total_activities: number;
  percentage: number;
  last_updated: Date;
}

export class DataExchangeService {
  private redis: any;
  private keyPrefix = 'workflow_execution:';
  private ttl = 7 * 24 * 60 * 60; // 7 days in seconds

  constructor(redis: any) {
    this.redis = redis;
  }

  /**
   * Initialize execution environment in Redis
   */
  async initializeExecution(
    executionId: string,
    context: {
      workflow_input: Record<string, any>;
      execution_config: any;
      context: any;
    }
  ): Promise<void> {
    try {
      const executionData: ExecutionContext = {
        execution_id: executionId,
        workflow_input: context.workflow_input,
        execution_config: context.execution_config,
        context: context.context,
        started_at: new Date()
      };

      const key = this.getExecutionKey(executionId);
      await this.redis.setex(
        key,
        this.ttl,
        JSON.stringify(executionData)
      );

      // Initialize progress tracking
      await this.updateExecutionProgress(executionId, {
        completed_activities: 0,
        total_activities: 0,
        percentage: 0,
        last_updated: new Date()
      });

      logger.getLogger().info('Execution environment initialized', {
        executionId,
        key,
        inputKeys: Object.keys(context.workflow_input)
      });

    } catch (error) {
      logger.error(error as Error, { executionId }, 'Failed to initialize execution environment');
      throw error;
    }
  }

  /**
   * Store activity output data
   */
  async storeActivityOutput(
    executionId: string,
    activityName: string,
    outputData: Record<string, any>
  ): Promise<void> {
    try {
      const key = this.getActivityOutputKey(executionId, activityName);
      const data = {
        activity_name: activityName,
        output_data: outputData,
        timestamp: new Date().toISOString(),
        execution_id: executionId
      };

      await this.redis.setex(
        key,
        this.ttl,
        JSON.stringify(data)
      );

      // Also add to the list of completed activities
      const listKey = this.getCompletedActivitiesKey(executionId);
      await this.redis.rpush(listKey, activityName);
      await this.redis.expire(listKey, this.ttl);

      logger.getLogger().debug('Activity output stored', {
        executionId,
        activityName,
        outputKeys: Object.keys(outputData)
      });

    } catch (error) {
      logger.error(error as Error, {
        executionId,
        activityName
      }, 'Failed to store activity output');
      throw error;
    }
  }

  /**
   * Get activity inputs (combines workflow input and previous activity outputs)
   */
  async getActivityInputs(
    executionId: string,
    activityName: string
  ): Promise<Record<string, any>> {
    try {
      // Get execution context
      const executionContext = await this.getExecutionContext(executionId);
      if (!executionContext) {
        throw new Error(`Execution context not found for ${executionId}`);
      }

      // Get all previous activity outputs
      const previousOutputs = await this.getPreviousActivityOutputs(executionId);

      // Combine workflow input with previous outputs
      const inputs = {
        workflow_input: executionContext.workflow_input,
        previous_outputs: previousOutputs,
        execution_context: executionContext.context
      };

      logger.getLogger().debug('Activity inputs prepared', {
        executionId,
        activityName,
        inputKeys: Object.keys(inputs),
        previousOutputsCount: Object.keys(previousOutputs).length
      });

      return inputs;

    } catch (error) {
      logger.error(error as Error, {
        executionId,
        activityName
      }, 'Failed to get activity inputs');
      throw error;
    }
  }

  /**
   * Get execution context
   */
  async getExecutionContext(executionId: string): Promise<ExecutionContext | null> {
    try {
      const key = this.getExecutionKey(executionId);
      const data = await this.redis.get(key);
      
      if (!data) {
        return null;
      }

      return JSON.parse(data) as ExecutionContext;

    } catch (error) {
      logger.error(error as Error, { executionId }, 'Failed to get execution context');
      throw error;
    }
  }

  /**
   * Update execution progress
   */
  async updateExecutionProgress(
    executionId: string,
    progress: Partial<ExecutionProgress>
  ): Promise<void> {
    try {
      const key = this.getProgressKey(executionId);
      
      // Get current progress
      const currentProgressData = await this.redis.get(key);
      const currentProgress: ExecutionProgress = currentProgressData 
        ? JSON.parse(currentProgressData)
        : {
            completed_activities: 0,
            total_activities: 0,
            percentage: 0,
            last_updated: new Date()
          };

      // Update with new values
      const updatedProgress: ExecutionProgress = {
        ...currentProgress,
        ...progress,
        last_updated: new Date()
      };

      await this.redis.setex(
        key,
        this.ttl,
        JSON.stringify(updatedProgress)
      );

      logger.getLogger().debug('Execution progress updated', {
        executionId,
        progress: updatedProgress
      });

    } catch (error) {
      logger.error(error as Error, { executionId }, 'Failed to update execution progress');
      throw error;
    }
  }

  /**
   * Get execution progress
   */
  async getExecutionProgress(executionId: string): Promise<ExecutionProgress | null> {
    try {
      const key = this.getProgressKey(executionId);
      const data = await this.redis.get(key);
      
      if (!data) {
        return null;
      }

      return JSON.parse(data) as ExecutionProgress;

    } catch (error) {
      logger.error(error as Error, { executionId }, 'Failed to get execution progress');
      return null;
    }
  }

  /**
   * Get all activity outputs for an execution
   */
  async getAllActivityOutputs(executionId: string): Promise<Record<string, any>> {
    try {
      const outputs: Record<string, any> = {};
      
      // Get list of completed activities
      const completedActivities = await this.getCompletedActivities(executionId);
      
      // Get output for each completed activity
      for (const activityName of completedActivities) {
        const output = await this.getActivityOutput(executionId, activityName);
        if (output) {
          outputs[activityName] = output.output_data;
        }
      }

      return outputs;

    } catch (error) {
      logger.error(error as Error, { executionId }, 'Failed to get all activity outputs');
      throw error;
    }
  }

  /**
   * Clean up execution data from Redis
   */
  async cleanupExecution(executionId: string): Promise<void> {
    try {
      const keysToDelete = [
        this.getExecutionKey(executionId),
        this.getProgressKey(executionId),
        this.getCompletedActivitiesKey(executionId)
      ];

      // Get all activity output keys
      const completedActivities = await this.getCompletedActivities(executionId);
      for (const activityName of completedActivities) {
        keysToDelete.push(this.getActivityOutputKey(executionId, activityName));
      }

      // Delete all keys
      if (keysToDelete.length > 0) {
        await this.redis.del(...keysToDelete);
      }

      logger.getLogger().info('Execution data cleaned up', {
        executionId,
        keysDeleted: keysToDelete.length
      });

    } catch (error) {
      logger.error(error as Error, { executionId }, 'Failed to cleanup execution data');
      // Don't throw error for cleanup failures
    }
  }

  /**
   * Get execution statistics
   */
  async getExecutionStats(executionId: string): Promise<{
    total_activities: number;
    completed_activities: number;
    data_size_bytes: number;
    last_activity_time?: Date;
  }> {
    try {
      const progress = await this.getExecutionProgress(executionId);
      const completedActivities = await this.getCompletedActivities(executionId);
      
      // Calculate approximate data size
      let dataSize = 0;
      for (const activityName of completedActivities) {
        const key = this.getActivityOutputKey(executionId, activityName);
        const data = await this.redis.get(key);
        if (data) {
          dataSize += Buffer.byteLength(data, 'utf8');
        }
      }

      return {
        total_activities: progress?.total_activities || 0,
        completed_activities: completedActivities.length,
        data_size_bytes: dataSize,
        last_activity_time: progress?.last_updated
      };

    } catch (error) {
      logger.error(error as Error, { executionId }, 'Failed to get execution stats');
      throw error;
    }
  }

  /**
   * Private method: Get previous activity outputs
   */
  private async getPreviousActivityOutputs(executionId: string): Promise<Record<string, any>> {
    try {
      const outputs: Record<string, any> = {};
      const completedActivities = await this.getCompletedActivities(executionId);
      
      for (const activityName of completedActivities) {
        const output = await this.getActivityOutput(executionId, activityName);
        if (output) {
          outputs[activityName] = output.output_data;
        }
      }

      return outputs;

    } catch (error) {
      logger.warn('Failed to get previous activity outputs', { executionId, error });
      return {};
    }
  }

  /**
   * Private method: Get activity output
   */
  private async getActivityOutput(
    executionId: string,
    activityName: string
  ): Promise<any | null> {
    try {
      const key = this.getActivityOutputKey(executionId, activityName);
      const data = await this.redis.get(key);
      
      if (!data) {
        return null;
      }

      return JSON.parse(data);

    } catch (error) {
      logger.warn('Failed to get activity output', { executionId, activityName, error });
      return null;
    }
  }

  /**
   * Private method: Get completed activities list
   */
  private async getCompletedActivities(executionId: string): Promise<string[]> {
    try {
      const key = this.getCompletedActivitiesKey(executionId);
      return await this.redis.lrange(key, 0, -1);

    } catch (error) {
      logger.warn('Failed to get completed activities', { executionId, error });
      return [];
    }
  }

  /**
   * Private method: Generate Redis keys
   */
  private getExecutionKey(executionId: string): string {
    return `${this.keyPrefix}${executionId}:context`;
  }

  private getActivityOutputKey(executionId: string, activityName: string): string {
    return `${this.keyPrefix}${executionId}:output:${activityName}`;
  }

  private getProgressKey(executionId: string): string {
    return `${this.keyPrefix}${executionId}:progress`;
  }

  private getCompletedActivitiesKey(executionId: string): string {
    return `${this.keyPrefix}${executionId}:completed`;
  }
}