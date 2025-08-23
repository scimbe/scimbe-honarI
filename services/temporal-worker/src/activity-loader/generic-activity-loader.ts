/**
 * Generic Activity Loader - Main Orchestration Class
 * Coordinates database, cache, and execution components for dynamic activity loading
 */

import { 
  ActivityDefinition, 
  WorkflowDefinition, 
  ActivityExecutionContext, 
  ActivityExecutionResult,
  ActivityLoaderConfig,
  ExecutionMetrics
} from './types';
import { DatabaseProvider } from './database-provider';
import { CacheProvider } from './cache-provider';
import { ActivityExecutionEngine } from './execution-engine';
import { createServiceLogger } from '../utils/logger';

const logger = createServiceLogger('generic-activity-loader');

export class GenericActivityLoader {
  private database: DatabaseProvider;
  private cache: CacheProvider;
  private engine: ActivityExecutionEngine;
  private config: ActivityLoaderConfig;
  private metrics: Map<string, ExecutionMetrics[]> = new Map();

  constructor(config: ActivityLoaderConfig) {
    this.config = config;
    this.database = new DatabaseProvider(config.database);
    this.cache = new CacheProvider(config.redis, config.cache);
    this.engine = new ActivityExecutionEngine({
      defaultTimeout: config.execution.defaultTimeout,
      defaultMemoryLimit: config.execution.maxMemory,
      sandboxed: config.execution.sandboxed
    });

    logger.info('Generic Activity Loader initialized', {
      sandboxed: config.execution.sandboxed,
      cacheEnabled: true,
      databaseEnabled: true
    });
  }

  /**
   * Load workflow definition with all activities
   */
  async loadWorkflowDefinition(workflowIdOrName: string): Promise<WorkflowDefinition> {
    logger.info('Loading workflow definition:', { workflow: workflowIdOrName });

    try {
      // Check cache first
      let workflow = await this.cache.getWorkflowDefinition(workflowIdOrName);
      
      if (!workflow) {
        // Load from database
        workflow = await this.database.getWorkflowDefinition(workflowIdOrName);
        
        if (!workflow) {
          throw new Error(`Workflow not found: ${workflowIdOrName}`);
        }

        // Cache the result
        await this.cache.setWorkflowDefinition(workflow);
      }

      // Load all activity definitions for this workflow
      const activityIds = workflow.activities
        .map(ref => ref.id)
        .filter((id, index, self) => self.indexOf(id) === index); // Remove duplicates

      const activities = await this.loadActivities(activityIds);
      
      // Validate all required activities are available
      const missingActivities = activityIds.filter(id => 
        !activities.find(activity => activity.id === id || activity.name === id)
      );

      if (missingActivities.length > 0) {
        logger.warn('Missing activity definitions for workflow:', { 
          workflow: workflowIdOrName,
          missing: missingActivities 
        });
      }

      logger.info('Workflow definition loaded successfully:', {
        workflow: workflow.name,
        activityCount: activities.length,
        stepCount: workflow.steps.length
      });

      return workflow;

    } catch (error) {
      logger.error('Failed to load workflow definition:', { 
        workflow: workflowIdOrName, 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Execute single activity with full context
   */
  async executeActivity(context: ActivityExecutionContext): Promise<ActivityExecutionResult> {
    const { activityId, activityName, sessionId, workflowId } = context;
    const activityIdentifier = activityId || activityName;

    logger.info('Executing activity:', {
      identifier: activityIdentifier,
      sessionId,
      workflowId,
      attempt: context.attempt
    });

    try {
      // Load activity definition
      const activity = await this.getActivityDefinition(activityIdentifier);
      if (!activity) {
        throw new Error(`Activity not found: ${activityIdentifier}`);
      }

      // Load previous execution results for context
      const previousResults = await this.cache.getAllParameters(sessionId, workflowId);
      const enrichedContext: ActivityExecutionContext = {
        ...context,
        previousResults
      };

      // Execute the activity
      const result = await this.engine.executeActivity(activity, enrichedContext);

      // Store execution result and parameters
      await this.storeExecutionResults(context, activity, result);

      // Record metrics
      this.recordMetrics(activity.name, result);

      logger.info('Activity execution completed:', {
        identifier: activityIdentifier,
        success: result.success,
        executionTime: result.metadata?.executionTime
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('Activity execution failed:', {
        identifier: activityIdentifier,
        error: errorMessage,
        sessionId,
        workflowId
      });

      const failureResult: ActivityExecutionResult = {
        success: false,
        error: errorMessage,
        metadata: {
          executionTime: 0,
          attempt: context.attempt,
          timestamp: Date.now()
        }
      };

      // Record failure metrics
      this.recordMetrics(activityIdentifier, failureResult);

      return failureResult;
    }
  }

  /**
   * Store activity parameters (for backward compatibility)
   */
  async storeActivityParameters(params: {
    sessionId: string;
    workflowId: string;
    activityName: string;
    parameters: Record<string, any>;
  }): Promise<boolean> {
    logger.debug('Storing activity parameters:', { 
      activityName: params.activityName,
      paramCount: Object.keys(params.parameters).length
    });

    try {
      // Store each parameter separately for flexible access
      const promises = Object.entries(params.parameters).map(([key, value]) =>
        this.cache.storeActivityParameter(
          params.sessionId,
          params.workflowId,
          key,
          value,
          { activityName: params.activityName }
        )
      );

      await Promise.all(promises);
      return true;

    } catch (error) {
      logger.error('Failed to store activity parameters:', {
        activityName: params.activityName,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Log execution for auditing
   */
  async logExecution(params: any): Promise<boolean> {
    logger.info('Execution logged:', params);
    
    try {
      // Store in database for permanent auditing
      if (params.sessionId && params.workflowId && params.activityName) {
        await this.database.storeExecutionResult({
          sessionId: params.sessionId,
          workflowId: params.workflowId,
          activityId: params.activityId || params.activityName,
          activityName: params.activityName,
          input: params.input || {},
          output: params.output || {},
          success: params.success !== false,
          error: params.error,
          executionTime: params.executionTime || 0,
          attempt: params.attempt || 1
        });
      }

      return true;

    } catch (error) {
      logger.error('Failed to log execution:', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Get execution metrics
   */
  getMetrics(): Record<string, any> {
    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000);

    const recentMetrics = Array.from(this.metrics.entries()).map(([activityName, metrics]) => {
      const recent = metrics.filter(m => m.timestamp > hourAgo);
      const successful = recent.filter(m => m.success);
      
      return {
        activityName,
        totalExecutions: recent.length,
        successfulExecutions: successful.length,
        failureRate: recent.length > 0 ? 1 - (successful.length / recent.length) : 0,
        averageExecutionTime: successful.length > 0 
          ? successful.reduce((sum, m) => sum + m.executionTime, 0) / successful.length 
          : 0,
        cacheHitRate: recent.length > 0 
          ? recent.filter(m => m.cacheHit).length / recent.length 
          : 0
      };
    });

    return {
      timestamp: now,
      activities: recentMetrics,
      totalActivitiesLoaded: this.metrics.size
    };
  }

  /**
   * Health check for all components
   */
  async healthCheck(): Promise<Record<string, any>> {
    const health: Record<string, any> = {
      timestamp: Date.now(),
      overall: 'healthy'
    };

    try {
      // Test database connection
      const testActivity = await this.database.searchActivities({ limit: 1 });
      health.database = {
        status: 'healthy',
        testQuery: 'success'
      };
    } catch (error) {
      health.database = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error)
      };
      health.overall = 'degraded';
    }

    try {
      // Test cache connection
      const cacheStats = await this.cache.getStats();
      health.cache = {
        status: cacheStats.connected ? 'healthy' : 'unhealthy',
        ...cacheStats
      };
    } catch (error) {
      health.cache = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error)
      };
      health.overall = 'degraded';
    }

    // Execution engine is always available
    health.executionEngine = {
      status: 'healthy',
      sandboxed: this.config.execution.sandboxed
    };

    return health;
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await Promise.all([
      this.database.close(),
      this.cache.close()
    ]);
    
    logger.info('Generic Activity Loader closed');
  }

  // Private helper methods

  private async getActivityDefinition(idOrName: string): Promise<ActivityDefinition | null> {
    // Check cache first
    let activity = await this.cache.getActivityDefinition(idOrName);
    
    if (!activity) {
      // Load from database
      activity = await this.database.getActivityDefinition(idOrName);
      
      if (activity) {
        // Cache the result
        await this.cache.setActivityDefinition(activity);
      }
    }

    return activity;
  }

  private async loadActivities(ids: string[]): Promise<ActivityDefinition[]> {
    const activities: ActivityDefinition[] = [];
    const uncachedIds: string[] = [];

    // Check cache for each activity
    for (const id of ids) {
      const cached = await this.cache.getActivityDefinition(id);
      if (cached) {
        activities.push(cached);
      } else {
        uncachedIds.push(id);
      }
    }

    // Load uncached activities from database
    if (uncachedIds.length > 0) {
      const dbActivities = await this.database.getActivityDefinitions(uncachedIds);
      
      // Cache newly loaded activities
      const cachePromises = dbActivities.map(activity =>
        this.cache.setActivityDefinition(activity)
      );
      await Promise.all(cachePromises);
      
      activities.push(...dbActivities);
    }

    return activities;
  }

  private async storeExecutionResults(
    context: ActivityExecutionContext,
    activity: ActivityDefinition,
    result: ActivityExecutionResult
  ): Promise<void> {
    const { sessionId, workflowId } = context;

    try {
      // Store execution result in cache for workflow chaining
      if (result.success && result.result) {
        await this.cache.storeExecutionResult(
          sessionId,
          workflowId,
          activity.id,
          result.result
        );

        // Store individual result properties as parameters
        if (typeof result.result === 'object' && result.result !== null) {
          const promises = Object.entries(result.result).map(([key, value]) => {
            // Create semantic parameter names based on activity and output
            const parameterName = this.createParameterName(activity.name, key);
            return this.cache.storeActivityParameter(
              sessionId,
              workflowId,
              parameterName,
              value,
              {
                activityId: activity.id,
                activityName: activity.name,
                outputKey: key
              }
            );
          });

          await Promise.all(promises);
        }
      }

      // Store execution record in database for auditing (fire-and-forget)
      this.database.storeExecutionResult({
        sessionId,
        workflowId,
        activityId: activity.id,
        activityName: activity.name,
        input: context.input,
        output: result.result,
        success: result.success,
        error: result.error,
        executionTime: result.metadata?.executionTime || 0,
        attempt: context.attempt
      }).catch(error => {
        logger.warn('Failed to store execution result in database:', { error });
      });

    } catch (error) {
      logger.error('Failed to store execution results:', { 
        activityId: activity.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private createParameterName(activityName: string, outputKey: string): string {
    // Create semantic parameter names for better workflow chaining
    // Examples:
    // validate_input + radius -> validated_radius
    // calculate_area + area -> calculated_area
    // format_result + formatted_result -> formatted_result

    if (activityName.includes('validate') && outputKey.includes('radius')) {
      return 'validated_radius';
    } else if (activityName.includes('validate') && outputKey.includes('integer')) {
      return 'validated_integer';
    } else if (activityName.includes('calculate') && outputKey.includes('area')) {
      return 'calculated_area';
    } else if (activityName.includes('calculate') && outputKey.includes('factorial')) {
      return 'factorial_result';
    } else if (outputKey.includes('formatted')) {
      return 'formatted_result';
    } else {
      // Default: activity_name + output_key
      return `${activityName.replace(/[^a-zA-Z0-9]/g, '_')}_${outputKey}`;
    }
  }

  private recordMetrics(activityName: string, result: ActivityExecutionResult): void {
    if (!this.metrics.has(activityName)) {
      this.metrics.set(activityName, []);
    }

    const metrics = this.metrics.get(activityName)!;
    metrics.push({
      activityName,
      executionTime: result.metadata?.executionTime || 0,
      memoryUsed: result.metadata?.memoryUsed || 0,
      cacheHit: false, // Would need to track this from cache operations
      attempt: result.metadata?.attempt || 1,
      success: result.success,
      errorType: result.error ? 'execution_error' : undefined,
      timestamp: Date.now()
    });

    // Keep only last 1000 metrics per activity
    if (metrics.length > 1000) {
      metrics.splice(0, metrics.length - 1000);
    }
  }
}