/**
 * Universal Dynamic Executor Workflow
 * Executes dynamically generated workflows from the MLOps system
 */

import { proxyActivities, sleep, log, defineSignal, defineQuery, setHandler } from '@temporalio/workflow';
import type * as activities from '../activities';

// Create activity proxies
const {
  // Dynamic execution activities
  executeMLOpsWorkflow,
  validateWorkflowDefinition,
  loadWorkflowFromDatabase,
  logWorkflowEvent,
  updateWorkflowStatus,
  handleWorkflowError,
  
  // AI Activities for generated workflows
  callAIProvider,
  analyzeUserInput,
  generateCode,
  analyzeData,
  
  // Common activities
  sendNotification,
  updateDatabase,
  callExternalAPI,
  processDocument,
  extractDocumentText,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2.0,
    maximumInterval: '2 minutes',
    maximumAttempts: 5,
  },
});

// Workflow signals
export const pauseWorkflowSignal = defineSignal<[]>('pauseWorkflow');
export const resumeWorkflowSignal = defineSignal<[]>('resumeWorkflow');
export const cancelWorkflowSignal = defineSignal<[]>('cancelWorkflow');

// Workflow queries
export const statusQuery = defineQuery<string>('status');
export const progressQuery = defineQuery<number>('progress');
export const resultQuery = defineQuery<any>('result');

/**
 * Universal Dynamic Executor
 * This workflow can execute any dynamically generated workflow definition
 */
export async function UniversalDynamicExecutor(
  workflowRequest: {
    workflow_name: string;
    workflow_id: string;
    input_data: any;
    metadata?: {
      execution_id?: string;
      source?: string;
      category?: string;
      timeout_minutes?: number;
    };
  }
): Promise<any> {
  let isPaused = false;
  let isCancelled = false;
  let status = 'RUNNING';
  let progress = 0;
  let currentResult: any = null;

  const executionId = workflowRequest.metadata?.execution_id || `exec-${Date.now()}`;
  const timeoutMinutes = workflowRequest.metadata?.timeout_minutes || 10;

  // Set up signal handlers
  setHandler(pauseWorkflowSignal, () => {
    isPaused = true;
    status = 'PAUSED';
    log.info('Universal Dynamic Executor paused by signal', { executionId });
  });

  setHandler(resumeWorkflowSignal, () => {
    isPaused = false;
    status = 'RUNNING';
    log.info('Universal Dynamic Executor resumed by signal', { executionId });
  });

  setHandler(cancelWorkflowSignal, () => {
    isCancelled = true;
    status = 'CANCELLED';
    log.info('Universal Dynamic Executor cancelled by signal', { executionId });
  });

  setHandler(statusQuery, () => status);
  setHandler(progressQuery, () => progress);
  setHandler(resultQuery, () => currentResult);

  try {
    log.info('Starting Universal Dynamic Executor', {
      workflowName: workflowRequest.workflow_name,
      workflowId: workflowRequest.workflow_id,
      executionId,
      inputData: workflowRequest.input_data,
    });

    await logWorkflowEvent('universal_dynamic_executor_started', {
      workflowRequest,
      executionId,
    });

    // Step 1: Load workflow definition from database (10% progress)
    if (isCancelled) throw new Error('Workflow cancelled');
    while (isPaused) await sleep(1000);
    
    progress = 10;
    const workflowDefinition = await loadWorkflowFromDatabase({
      workflowName: workflowRequest.workflow_name,
      workflowId: workflowRequest.workflow_id,
    });

    if (!workflowDefinition) {
      throw new Error(`Workflow definition not found: ${workflowRequest.workflow_name} (${workflowRequest.workflow_id})`);
    }

    log.info('Loaded workflow definition', {
      workflowName: workflowDefinition.name,
      category: workflowDefinition.category,
      executionId,
    });

    // Step 2: Validate workflow definition (20% progress)
    if (isCancelled) throw new Error('Workflow cancelled');
    while (isPaused) await sleep(1000);
    
    progress = 20;
    const validationResult = await validateWorkflowDefinition(workflowDefinition);
    
    if (!validationResult.isValid) {
      throw new Error(`Invalid workflow definition: ${validationResult.errors.join(', ')}`);
    }

    // Step 3: Execute the workflow based on its type/category (30-90% progress)
    if (isCancelled) throw new Error('Workflow cancelled');
    while (isPaused) await sleep(1000);
    
    progress = 30;
    
    let executionResult: any;
    
    if (workflowDefinition.category === 'ai') {
      // AI workflow execution
      executionResult = await executeAIWorkflow(
        workflowDefinition,
        workflowRequest.input_data,
        executionId,
        (p) => { progress = Math.max(progress, 30 + (p * 0.6)); }
      );
    } else if (workflowDefinition.category === 'data') {
      // Data processing workflow execution
      executionResult = await executeDataWorkflow(
        workflowDefinition,
        workflowRequest.input_data,
        executionId,
        (p) => { progress = Math.max(progress, 30 + (p * 0.6)); }
      );
    } else {
      // Generic MLOps workflow execution
      executionResult = await executeMLOpsWorkflow({
        workflowDefinition,
        inputData: workflowRequest.input_data,
        executionId,
        progressCallback: (p) => { progress = Math.max(progress, 30 + (p * 0.6)); }
      });
    }

    // Step 4: Process and format results (95% progress)
    if (isCancelled) throw new Error('Workflow cancelled');
    while (isPaused) await sleep(1000);
    
    progress = 95;
    currentResult = {
      success: true,
      output: executionResult,
      metadata: {
        workflowName: workflowRequest.workflow_name,
        workflowId: workflowRequest.workflow_id,
        executionId,
        category: workflowDefinition.category,
        executionTime: Date.now(),
      }
    };

    // Step 5: Update status and complete (100% progress)
    progress = 100;
    status = 'COMPLETED';

    await updateWorkflowStatus('completed', currentResult);
    await logWorkflowEvent('universal_dynamic_executor_completed', {
      executionId,
      result: currentResult,
    });

    log.info('Universal Dynamic Executor completed successfully', {
      executionId,
      workflowName: workflowRequest.workflow_name,
      success: true,
    });

    return currentResult;

  } catch (error) {
    status = 'FAILED';
    const errorMessage = (error as Error).message;
    
    log.error('Universal Dynamic Executor failed', {
      executionId,
      workflowName: workflowRequest.workflow_name,
      error: errorMessage,
    });

    // Handle the error and create error result
    const errorResult = await handleWorkflowError(error as Error, {
      workflowType: 'universal_dynamic_executor',
      input: workflowRequest,
      progress,
      executionId,
    });

    currentResult = {
      success: false,
      error: errorMessage,
      output: errorResult,
      metadata: {
        workflowName: workflowRequest.workflow_name,
        workflowId: workflowRequest.workflow_id,
        executionId,
        errorType: (error as Error).name,
      }
    };

    await logWorkflowEvent('universal_dynamic_executor_failed', {
      executionId,
      error: errorMessage,
    });

    return currentResult;
  }
}

/**
 * Execute AI-category workflows
 */
async function executeAIWorkflow(
  workflowDefinition: any,
  inputData: any,
  executionId: string,
  progressCallback: (progress: number) => void
): Promise<any> {
  log.info('Executing AI workflow', { workflowName: workflowDefinition.name, executionId });
  
  progressCallback(0.2);
  
  // Extract prompt from input data
  const prompt = inputData.prompt || inputData.input || inputData.request || 'Default AI request';
  
  progressCallback(0.4);
  
  // Analyze the input
  const analysis = await analyzeUserInput(prompt, { executionId });
  
  progressCallback(0.6);
  
  // Call AI provider
  const aiResponse = await callAIProvider({
    prompt,
    config: { provider: 'default', model: 'gpt-3.5-turbo' },
    context: { executionId, workflowName: workflowDefinition.name },
  });
  
  progressCallback(0.9);
  
  // Return formatted result
  return {
    response: aiResponse.response,
    analysis,
    provider: aiResponse.provider,
    model: aiResponse.model,
    tokens: aiResponse.usage?.total_tokens,
    executionId,
  };
}

/**
 * Execute data-category workflows
 */
async function executeDataWorkflow(
  workflowDefinition: any,
  inputData: any,
  executionId: string,
  progressCallback: (progress: number) => void
): Promise<any> {
  log.info('Executing data workflow', { workflowName: workflowDefinition.name, executionId });
  
  progressCallback(0.2);
  
  // Process the data
  const dataSource = inputData.data || inputData.source || inputData;
  
  progressCallback(0.5);
  
  // Analyze data
  const analysisResult = await analyzeData({
    source: JSON.stringify(dataSource),
    type: 'descriptive',
    context: { executionId, workflowName: workflowDefinition.name },
  });
  
  progressCallback(0.8);
  
  // Return analysis results
  return {
    analysis: analysisResult,
    dataPoints: analysisResult.dataPoints,
    insights: analysisResult.insights,
    executionId,
  };
}

/**
 * Helper workflow for Circle Area Calculator (specific to the error case)
 */
export async function advancedcircleareacalculatorWorkflow(
  input: {
    radius?: number;
    input_data?: any;
  }
): Promise<any> {
  log.info('Executing Advanced Circle Area Calculator workflow', { input });
  
  try {
    // Extract radius from input
    const radius = input.radius || input.input_data?.radius || 1;
    
    if (radius <= 0) {
      throw new Error('Radius must be a positive number');
    }
    
    // Calculate area
    const area = Math.PI * radius * radius;
    
    // Log the calculation
    await logWorkflowEvent('circle_area_calculated', {
      radius,
      area,
      formula: 'π × r²',
    });
    
    const result = {
      success: true,
      radius,
      area,
      circumference: 2 * Math.PI * radius,
      diameter: 2 * radius,
      formula: 'π × r²',
      calculation: `π × ${radius}² = ${area}`,
    };
    
    log.info('Circle area calculation completed', result);
    
    return result;
    
  } catch (error) {
    log.error('Circle area calculation failed', { error: (error as Error).message, input });
    
    return {
      success: false,
      error: (error as Error).message,
      input,
    };
  }
}

/**
 * Helper workflow aliases for common MLOps workflows
 */
export async function SimpleChainWorkflow(
  chain_name: string,
  nodes: any[],
  edges: any[]
): Promise<any> {
  return await UniversalDynamicExecutor({
    workflow_name: chain_name,
    workflow_id: 'SimpleChainWorkflow',
    input_data: { chain_name, nodes, edges },
    metadata: { source: 'drag_drop_editor' }
  });
}

export async function SandboxCompatibleChainWorkflow(
  chain_name: string,
  nodes: any[],
  edges: any[]
): Promise<any> {
  return await UniversalDynamicExecutor({
    workflow_name: chain_name,
    workflow_id: 'SandboxCompatibleChainWorkflow',
    input_data: { chain_name, nodes, edges },
    metadata: { source: 'sandbox_editor' }
  });
}