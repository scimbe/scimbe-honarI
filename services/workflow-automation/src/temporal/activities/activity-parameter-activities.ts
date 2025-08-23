/**
 * Activity Parameter Activities
 * Temporal activities for Redis parameter storage and resolution
 */

import Redis from 'ioredis';
import { ActivityParameterManager, ParameterNotFoundError } from '../../services/activity-parameter-manager';
import { createServiceLogger } from '../../shared-utils-local';
import { createRedisConnection } from '../../cache/redis';

const logger = createServiceLogger('activity-parameter-activities');

let redis: Redis | null = null;
let parameterManager: ActivityParameterManager | null = null;

/**
 * Initialize Redis connection and parameter manager
 */
async function initializeServices(): Promise<void> {
  if (!redis) {
    const env = {
      REDIS_URL: process.env.REDIS_URL || 'redis://redis:6379',
    };
    redis = await createRedisConnection(env as any);
  }
  
  if (!parameterManager) {
    parameterManager = new ActivityParameterManager(redis);
  }
}

/**
 * Execute individual activity with parameter storage
 */
export async function executeActivity(params: {
  sessionId: string;
  workflowId: string;
  activityName: string;
  input: any;
  configuration: any;
}): Promise<any> {
  await initializeServices();
  
  try {
    logger.getLogger().info({
      sessionId: params.sessionId,
      workflowId: params.workflowId,
      activityName: params.activityName,
    }, 'Executing activity');

    // Create session if not exists
    await parameterManager!.createSession(params.sessionId);
    
    // Update workflow state
    await parameterManager!.updateWorkflowState(params.sessionId, params.workflowId, {
      currentActivity: params.activityName,
      executionStatus: 'running',
    });

    // Load activity code from database and execute
    const activityCode = await loadActivityCode(params.activityName);
    const result = await executeActivityCode(activityCode, params.input, params.configuration);
    
    // Store results in Redis
    await parameterManager!.storeActivityResults(
      params.sessionId,
      params.workflowId,
      params.activityName,
      result
    );

    logger.getLogger().info({
      sessionId: params.sessionId,
      workflowId: params.workflowId,
      activityName: params.activityName,
      resultKeys: Object.keys(result),
    }, 'Activity executed successfully');

    return result;

  } catch (error) {
    logger.error(error as Error, {
      sessionId: params.sessionId,
      workflowId: params.workflowId,
      activityName: params.activityName,
    }, 'Activity execution failed');
    
    // Update workflow state to failed
    await parameterManager!.updateWorkflowState(params.sessionId, params.workflowId, {
      executionStatus: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    
    throw error;
  }
}

/**
 * Store activity parameters in Redis
 */
export async function storeActivityParameters(params: {
  sessionId: string;
  workflowId: string;
  activityName: string;
  parameters: Record<string, any>;
}): Promise<boolean> {
  await initializeServices();
  
  try {
    await parameterManager!.storeActivityResults(
      params.sessionId,
      params.workflowId,
      params.activityName,
      params.parameters
    );

    logger.getLogger().info({
      sessionId: params.sessionId,
      workflowId: params.workflowId,
      activityName: params.activityName,
      parameterCount: Object.keys(params.parameters).length,
    }, 'Activity parameters stored');

    return true;

  } catch (error) {
    logger.error(error as Error, params, 'Failed to store activity parameters');
    throw error;
  }
}

/**
 * Resolve parameter from Redis with deterministic behavior
 */
export async function resolveParameter(params: {
  sessionId: string;
  workflowId: string;
  parameterId: string;
}): Promise<any> {
  await initializeServices();
  
  try {
    const value = await parameterManager!.resolveParameter(
      params.sessionId,
      params.workflowId,
      params.parameterId
    );

    logger.getLogger().debug({
      sessionId: params.sessionId,
      workflowId: params.workflowId,
      parameterId: params.parameterId,
    }, 'Parameter resolved');

    return value;

  } catch (error) {
    if (error instanceof ParameterNotFoundError) {
      logger.error(error as Error, params, 'Parameter not found - deterministic failure');
      throw new Error(`DETERMINISTIC_ERROR: Parameter ${params.parameterId} not found in session ${params.sessionId}.${params.workflowId}`);
    }
    
    logger.error(error as Error, params, 'Failed to resolve parameter');
    throw error;
  }
}

/**
 * Load workflow definition with activity information
 */
export async function loadWorkflowDefinition(workflowId: string): Promise<{
  activities: Array<{
    id: string;
    name: string;
    type: string;
    configuration: any;
    dependencies: string[];
    required: boolean;
  }>;
  steps: Array<{
    id: string;
    type: string;
    configuration: any;
    dependencies: string[];
  }>;
  metadata: any;
}> {
  try {
    // Load from database (enhanced-workflow-editor or workflow-automation)
    const workflowData = await loadWorkflowFromDatabase(workflowId);
    
    logger.getLogger().info({
      workflowId,
      activityCount: workflowData.activities?.length || 0,
      stepCount: workflowData.steps?.length || 0,
    }, 'Workflow definition loaded');

    return workflowData;

  } catch (error) {
    logger.error(error as Error, { workflowId }, 'Failed to load workflow definition');
    throw error;
  }
}

/**
 * Execute workflow step with enhanced parameter resolution
 */
export async function executeWorkflowStep(params: {
  workflowId: string;
  stepId: string;
  input: any;
  stepType: string;
  configuration: any;
  sessionId?: string;
}): Promise<any> {
  try {
    logger.getLogger().info({
      workflowId: params.workflowId,
      stepId: params.stepId,
      stepType: params.stepType,
      sessionId: params.sessionId,
    }, 'Executing workflow step');

    // Execute step based on type
    let result: any;
    
    switch (params.stepType) {
      case 'activity':
        // Execute as activity with parameter storage
        if (params.sessionId) {
          result = await executeActivity({
            sessionId: params.sessionId,
            workflowId: params.workflowId,
            activityName: params.stepId,
            input: params.input,
            configuration: params.configuration,
          });
        } else {
          // Fallback to direct execution
          result = await executeStepDirect(params);
        }
        break;
        
      case 'condition':
        result = await executeCondition(params.input, params.configuration);
        break;
        
      case 'parallel':
        result = await executeParallel(params.input, params.configuration);
        break;
        
      default:
        result = await executeStepDirect(params);
        break;
    }

    logger.getLogger().info({
      workflowId: params.workflowId,
      stepId: params.stepId,
      stepType: params.stepType,
    }, 'Workflow step executed successfully');

    return result;

  } catch (error) {
    logger.error(error as Error, {
      workflowId: params.workflowId,
      stepId: params.stepId,
      stepType: params.stepType,
    }, 'Workflow step execution failed');
    throw error;
  }
}

/**
 * Log execution for tracking and debugging
 */
export async function logExecution(params: {
  workflowId: string;
  stepId: string;
  status: string;
  result: any;
  timestamp: number;
  sessionId?: string;
}): Promise<boolean> {
  try {
    logger.getLogger().info({
      workflowId: params.workflowId,
      stepId: params.stepId,
      status: params.status,
      timestamp: params.timestamp,
      sessionId: params.sessionId,
    }, 'Execution logged');

    // Store execution log in database or Redis
    // Implementation depends on your logging requirements
    
    return true;

  } catch (error) {
    logger.error(error as Error, params, 'Failed to log execution');
    return false;
  }
}

// Helper functions

async function loadActivityCode(activityName: string): Promise<string> {
  // Load activity implementation from database
  // This should connect to the same database as enhanced-workflow-editor
  // and load from activity_library table
  
  // For now, return a placeholder
  return `
    async function ${activityName}(input, config) {
      // Activity implementation loaded from database
      console.log('Executing activity: ${activityName}');
      console.log('Input:', input);
      console.log('Config:', config);
      
      // Return mock result for now
      return {
        success: true,
        result: input,
        activityName: '${activityName}',
        timestamp: Date.now()
      };
    }
  `;
}

async function executeActivityCode(code: string, input: any, configuration: any): Promise<any> {
  // Execute the activity code in a safe context
  try {
    // This is a simplified execution - in production you'd want a proper sandbox
    const func = new Function('input', 'config', `
      ${code}
      return ${code.match(/function\s+(\w+)/)?.[1] || 'main'}(input, config);
    `);
    
    return await func(input, configuration);
    
  } catch (error) {
    throw new Error(`Activity execution failed: ${error.message}`);
  }
}

async function loadWorkflowFromDatabase(workflowId: string): Promise<any> {
  // Load workflow definition from database
  // This should integrate with enhanced-workflow-editor database
  
  // For now, return a mock structure
  return {
    activities: [
      {
        id: 'activity-1',
        name: 'processInput',
        type: 'processing',
        configuration: {},
        dependencies: [],
        required: true,
      },
      {
        id: 'activity-2', 
        name: 'validateData',
        type: 'validation',
        configuration: {},
        dependencies: ['activity-1'],
        required: true,
      },
      {
        id: 'activity-3',
        name: 'formatOutput',
        type: 'formatting',
        configuration: {},
        dependencies: ['activity-2'],
        required: true,
      }
    ],
    steps: [],
    metadata: {
      version: '1.0',
      description: 'Sample workflow with activities',
    }
  };
}

async function executeStepDirect(params: any): Promise<any> {
  // Direct step execution without parameter storage
  return {
    success: true,
    stepId: params.stepId,
    input: params.input,
    result: params.input,
    timestamp: Date.now(),
  };
}

async function executeCondition(input: any, config: any): Promise<any> {
  // Condition step execution
  return {
    success: true,
    condition: true,
    input,
    timestamp: Date.now(),
  };
}

async function executeParallel(input: any, config: any): Promise<any> {
  // Parallel step execution
  return {
    success: true,
    parallelResults: [input],
    timestamp: Date.now(),
  };
}