/**
 * Workflow Management Activities
 * Handle workflow logging, status updates, and error handling
 */

import { Context } from '@temporalio/activity';
import { Pool } from 'pg';
import { 
  WorkflowStepResult, 
  createServiceLogger 
} from '@platform/shared';

const logger = createServiceLogger('temporal-workflow-mgmt-activities');

// Database connection pool
let dbPool: Pool | null = null;

function getDbPool(): Pool {
  if (!dbPool) {
    dbPool = new Pool({
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      database: process.env.DATABASE_NAME || 'temporal_ai_platform',
      user: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return dbPool;
}

/**
 * Log workflow events for audit and monitoring
 */
export async function logWorkflowEvent(
  eventType: string,
  eventData: Record<string, any>
): Promise<{
  success: boolean;
  eventId?: string;
  error?: string;
}> {
  const activityContext = Context.current();
  const workflowInfo = activityContext.info.workflowExecution;
  const correlationId = workflowInfo.workflowId;
  
  logger.getLogger().info({
    correlationId,
    eventType,
    runId: workflowInfo.runId,
  }, 'Logging workflow event');

  try {
    const db = getDbPool();
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Insert workflow event log
    const insertQuery = `
      INSERT INTO workflow_event_logs (
        event_id, workflow_id, run_id, event_type, event_data,
        activity_id, activity_type, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    
    const values = [
      eventId,
      workflowInfo.workflowId,
      workflowInfo.runId,
      eventType,
      JSON.stringify(eventData),
      activityContext.info.activityId,
      activityContext.info.activityType,
      new Date(),
    ];

    await db.query(insertQuery, values);

    logger.getLogger().info({
      correlationId,
      eventType,
      eventId,
    }, 'Workflow event logged successfully');

    return {
      success: true,
      eventId,
    };

  } catch (error) {
    logger.error(error as Error, {
      correlationId,
      eventType,
    }, 'Failed to log workflow event');
    
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Update workflow execution status
 */
export async function updateWorkflowStatus(
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'paused',
  result?: WorkflowStepResult
): Promise<{
  success: boolean;
  error?: string;
}> {
  const activityContext = Context.current();
  const workflowInfo = activityContext.info.workflowExecution;
  const correlationId = workflowInfo.workflowId;
  
  logger.getLogger().info({
    correlationId,
    status,
    hasResult: !!result,
    runId: workflowInfo.runId,
  }, 'Updating workflow status');

  try {
    const db = getDbPool();
    
    // Update or insert workflow execution record
    const upsertQuery = `
      INSERT INTO workflow_executions (
        workflow_id, run_id, workflow_type, status, 
        result, updated_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $6)
      ON CONFLICT (workflow_id, run_id) 
      DO UPDATE SET 
        status = EXCLUDED.status,
        result = EXCLUDED.result,
        updated_at = EXCLUDED.updated_at
    `;
    
    const values = [
      workflowInfo.workflowId,
      workflowInfo.runId,
      workflowInfo.workflowType,
      status,
      result ? JSON.stringify(result) : null,
      new Date(),
    ];

    await db.query(upsertQuery, values);

    // Update workflow statistics
    if (status === 'completed' || status === 'failed') {
      const statsQuery = `
        INSERT INTO workflow_statistics (
          workflow_type, total_executions, 
          successful_executions, failed_executions,
          last_execution_at, created_at, updated_at
        ) VALUES ($1, 1, $2, $3, $4, $4, $4)
        ON CONFLICT (workflow_type)
        DO UPDATE SET
          total_executions = workflow_statistics.total_executions + 1,
          successful_executions = workflow_statistics.successful_executions + $2,
          failed_executions = workflow_statistics.failed_executions + $3,
          last_execution_at = EXCLUDED.last_execution_at,
          updated_at = EXCLUDED.updated_at
      `;
      
      const successCount = status === 'completed' ? 1 : 0;
      const failureCount = status === 'failed' ? 1 : 0;
      
      await db.query(statsQuery, [
        workflowInfo.workflowType,
        successCount,
        failureCount,
        new Date(),
      ]);
    }

    logger.getLogger().info({
      correlationId,
      status,
      workflowType: workflowInfo.workflowType,
    }, 'Workflow status updated successfully');

    return {
      success: true,
    };

  } catch (error) {
    logger.error(error as Error, {
      correlationId,
      status,
    }, 'Failed to update workflow status');
    
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Handle workflow errors with retry logic and escalation
 */
export async function handleWorkflowError(
  error: Error,
  context: {
    workflowType: string;
    input: any;
    progress: number;
  }
): Promise<WorkflowStepResult> {
  const activityContext = Context.current();
  const workflowInfo = activityContext.info.workflowExecution;
  const correlationId = workflowInfo.workflowId;
  
  logger.error(error, {
    correlationId,
    workflowType: context.workflowType,
    progress: context.progress,
    runId: workflowInfo.runId,
  }, 'Handling workflow error');

  try {
    const db = getDbPool();
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Log error details
    const errorQuery = `
      INSERT INTO workflow_errors (
        error_id, workflow_id, run_id, workflow_type,
        error_message, error_stack, error_context,
        progress, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;
    
    const errorValues = [
      errorId,
      workflowInfo.workflowId,
      workflowInfo.runId,
      context.workflowType,
      error.message,
      error.stack || '',
      JSON.stringify(context),
      context.progress,
      new Date(),
    ];

    await db.query(errorQuery, errorValues);

    // Determine error severity and recovery strategy
    let errorSeverity: 'low' | 'medium' | 'high' = 'medium';
    let recoverable = true;
    
    if (error.message.includes('timeout') || error.message.includes('network')) {
      errorSeverity = 'low';
      recoverable = true;
    } else if (error.message.includes('auth') || error.message.includes('permission')) {
      errorSeverity = 'high';
      recoverable = false;
    } else if (error.message.includes('validation') || error.message.includes('invalid')) {
      errorSeverity = 'medium';
      recoverable = false;
    }

    // Create error result
    const errorResult: WorkflowStepResult = {
      success: false,
      output: `Workflow failed: ${error.message}`,
      metadata: {
        errorId,
        errorType: error.constructor.name,
        errorMessage: error.message,
        progress: context.progress,
        severity: errorSeverity,
        recoverable,
        timestamp: new Date().toISOString(),
        workflowContext: {
          workflowId: workflowInfo.workflowId,
          runId: workflowInfo.runId,
          workflowType: context.workflowType,
        }
      }
    };

    // Update workflow status to failed
    await updateWorkflowStatus('failed', errorResult);

    // Send error notification for high severity errors
    if (errorSeverity === 'high') {
      logger.getLogger().warn({
        correlationId,
        errorId,
        errorSeverity,
      }, 'High severity workflow error detected - notification should be sent');
      
      // In a real implementation, this would trigger error notifications
      // await sendNotification({
      //   type: 'slack',
      //   recipient: process.env.ERROR_SLACK_WEBHOOK,
      //   message: `High severity workflow error in ${context.workflowType}: ${error.message}`,
      // });
    }

    logger.getLogger().info({
      correlationId,
      errorId,
      errorSeverity,
      recoverable,
    }, 'Workflow error handled');

    return errorResult;

  } catch (handlingError) {
    logger.error(handlingError as Error, {
      correlationId,
      originalError: error.message,
    }, 'Failed to handle workflow error');
    
    // Fallback error result
    return {
      success: false,
      output: `Critical workflow failure: ${error.message}`,
      metadata: {
        errorType: 'CRITICAL_ERROR',
        originalError: error.message,
        handlingError: (handlingError as Error).message,
        timestamp: new Date().toISOString(),
      }
    };
  }
}

/**
 * Record workflow performance metrics
 */
export async function recordWorkflowMetrics(
  input: {
    workflowType: string;
    duration: number;
    status: 'completed' | 'failed';
    stepCount: number;
    resourceUsage?: Record<string, number>;
  }
): Promise<{
  success: boolean;
  error?: string;
}> {
  const activityContext = Context.current();
  const workflowInfo = activityContext.info.workflowExecution;
  const correlationId = workflowInfo.workflowId;
  
  logger.getLogger().info({
    correlationId,
    workflowType: input.workflowType,
    duration: input.duration,
    status: input.status,
    stepCount: input.stepCount,
  }, 'Recording workflow metrics');

  try {
    const db = getDbPool();
    
    // Insert workflow metrics
    const metricsQuery = `
      INSERT INTO workflow_metrics (
        workflow_id, run_id, workflow_type, execution_duration_ms,
        step_count, status, resource_usage, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    
    const values = [
      workflowInfo.workflowId,
      workflowInfo.runId,
      input.workflowType,
      input.duration,
      input.stepCount,
      input.status,
      input.resourceUsage ? JSON.stringify(input.resourceUsage) : null,
      new Date(),
    ];

    await db.query(metricsQuery, values);

    logger.getLogger().info({
      correlationId,
      workflowType: input.workflowType,
      duration: input.duration,
    }, 'Workflow metrics recorded successfully');

    return {
      success: true,
    };

  } catch (error) {
    logger.error(error as Error, {
      correlationId,
      workflowType: input.workflowType,
    }, 'Failed to record workflow metrics');
    
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Load workflow definition from database
 */
export async function loadWorkflowFromDatabase(params: {
  workflowName: string;
  workflowId: string;
}): Promise<any> {
  logger.getLogger().info({
    workflowName: params.workflowName,
    workflowId: params.workflowId,
  }, 'Loading workflow definition from database');

  try {
    const db = getDbPool();
    
    // First try to load by workflow_id
    let result = await db.query(`
      SELECT 
        id, name, workflow_class_name, python_workflow_code,
        visual_definition, form_schema, category, status,
        quality_score, created_at, updated_at
      FROM workflow_definitions 
      WHERE id::text = $1 OR workflow_class_name = $2 OR name = $1
      ORDER BY updated_at DESC
      LIMIT 1
    `, [params.workflowId, params.workflowName]);

    // If not found by ID, try by name pattern
    if (result.rows.length === 0) {
      result = await db.query(`
        SELECT 
          id, name, workflow_class_name, python_workflow_code,
          visual_definition, form_schema, category, status,
          quality_score, created_at, updated_at
        FROM workflow_definitions 
        WHERE name ILIKE $1 OR workflow_class_name ILIKE $1
        ORDER BY updated_at DESC
        LIMIT 1
      `, [`%${params.workflowName}%`]);
    }

    if (result.rows.length === 0) {
      logger.getLogger().warn({
        workflowName: params.workflowName,
        workflowId: params.workflowId,
      }, 'Workflow definition not found in database');
      return null;
    }

    const workflow = result.rows[0];
    
    logger.getLogger().info({
      workflowId: workflow.id,
      workflowName: workflow.name,
      category: workflow.category,
      status: workflow.status,
    }, 'Successfully loaded workflow definition');

    return {
      id: workflow.id,
      name: workflow.name,
      workflowClassName: workflow.workflow_class_name,
      pythonCode: workflow.python_workflow_code,
      visualDefinition: workflow.visual_definition,
      formSchema: workflow.form_schema,
      category: workflow.category,
      status: workflow.status,
      qualityScore: workflow.quality_score,
      createdAt: workflow.created_at,
      updatedAt: workflow.updated_at,
    };

  } catch (error) {
    logger.error(error as Error, {
      workflowName: params.workflowName,
      workflowId: params.workflowId,
    }, 'Failed to load workflow from database');
    throw error;
  }
}

/**
 * Validate workflow definition
 */
export async function validateWorkflowDefinition(workflowDefinition: any): Promise<{
  isValid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  if (!workflowDefinition) {
    errors.push('Workflow definition is null or undefined');
    return { isValid: false, errors };
  }

  if (!workflowDefinition.name) {
    errors.push('Workflow name is required');
  }

  if (!workflowDefinition.workflowClassName && !workflowDefinition.pythonCode) {
    errors.push('Either workflow class name or Python code is required');
  }

  if (workflowDefinition.status === 'inactive' || workflowDefinition.status === 'deprecated') {
    errors.push(`Workflow is ${workflowDefinition.status} and cannot be executed`);
  }

  // Additional validation can be added here

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Execute MLOps workflow
 */
export async function executeMLOpsWorkflow(params: {
  workflowDefinition: any;
  inputData: any;
  executionId: string;
  progressCallback?: (progress: number) => void;
}): Promise<any> {
  logger.getLogger().info({
    workflowName: params.workflowDefinition.name,
    executionId: params.executionId,
  }, 'Executing MLOps workflow');

  try {
    const { workflowDefinition, inputData, executionId } = params;
    
    if (params.progressCallback) {
      params.progressCallback(0.1);
    }

    // For now, implement basic execution logic
    // In a real implementation, this would execute the Python code or call the appropriate handler
    
    if (params.progressCallback) {
      params.progressCallback(0.5);
    }

    // Simulate workflow execution based on category
    let result: any;
    
    if (workflowDefinition.category === 'ai') {
      // AI workflow - simulate AI processing
      result = {
        type: 'ai_result',
        response: `AI processing completed for ${workflowDefinition.name}`,
        inputData,
        model: 'gpt-3.5-turbo',
        tokens: 150,
      };
    } else if (workflowDefinition.category === 'data') {
      // Data workflow - simulate data processing
      result = {
        type: 'data_result',
        processed: true,
        inputData,
        recordsProcessed: Object.keys(inputData).length,
        outputData: inputData, // Echo input for now
      };
    } else {
      // Generic workflow
      result = {
        type: 'generic_result',
        processed: true,
        inputData,
        workflowName: workflowDefinition.name,
        executionId,
      };
    }

    if (params.progressCallback) {
      params.progressCallback(1.0);
    }

    logger.getLogger().info({
      workflowName: workflowDefinition.name,
      executionId,
      resultType: result.type,
    }, 'MLOps workflow execution completed');

    return result;

  } catch (error) {
    logger.error(error as Error, {
      workflowName: params.workflowDefinition?.name,
      executionId: params.executionId,
    }, 'MLOps workflow execution failed');
    throw error;
  }
}