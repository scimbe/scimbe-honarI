/**
 * Temporal Workflows for AI Platform
 * These define the high-level workflow logic orchestrated by Temporal
 */

import { proxyActivities, sleep, log, defineSignal, defineQuery, setHandler } from '@temporalio/workflow';

// Import universal dynamic executor for MLOps workflows
export * from './universal-dynamic-executor';
import type * as activities from '../activities';
import { 
  WorkflowDefinition, 
  WorkflowContext, 
  AIModelConfig, 
  WorkflowStepResult,
  WorkflowExecutionStatus 
} from '@platform/shared';

// Create activity proxies with timeout configurations
const {
  // AI Activities
  callAIProvider,
  analyzeUserInput,
  generateCode,
  analyzeData,
  
  // File Processing Activities
  processDocument,
  extractDocumentText,
  analyzeImage,
  
  // ML Activities
  trainModel,
  evaluateModel,
  deployModel,
  
  // Integration Activities
  sendNotification,
  updateDatabase,
  callExternalAPI,
  
  // Workflow Management
  logWorkflowEvent,
  updateWorkflowStatus,
  handleWorkflowError,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2.0,
    maximumInterval: '1 minute',
    maximumAttempts: 3,
  },
});

// Workflow signals for external control
export const pauseSignal = defineSignal<[]>('pause');
export const resumeSignal = defineSignal<[]>('resume');
export const cancelSignal = defineSignal<[]>('cancel');
export const updateConfigSignal = defineSignal<[AIModelConfig]>('updateConfig');

// Workflow queries for status checking
export const statusQuery = defineQuery<WorkflowExecutionStatus>('status');
export const progressQuery = defineQuery<number>('progress');

/**
 * General Purpose AI Workflow
 * Handles general AI requests with routing and fallback logic
 */
export async function generalWorkflow(
  input: {
    userRequest: string;
    context?: WorkflowContext;
    config?: AIModelConfig;
  }
): Promise<WorkflowStepResult> {
  let isPaused = false;
  let isCancelled = false;
  let currentConfig = input.config || { provider: 'default', model: 'default' };
  let status: WorkflowExecutionStatus = 'RUNNING';
  let progress = 0;

  // Set up signal and query handlers
  setHandler(pauseSignal, () => {
    isPaused = true;
    status = 'PAUSED';
    log.info('Workflow paused by signal');
  });

  setHandler(resumeSignal, () => {
    isPaused = false;
    status = 'RUNNING';
    log.info('Workflow resumed by signal');
  });

  setHandler(cancelSignal, () => {
    isCancelled = true;
    status = 'CANCELLED';
    log.info('Workflow cancelled by signal');
  });

  setHandler(updateConfigSignal, (newConfig: AIModelConfig) => {
    currentConfig = newConfig;
    log.info('Workflow config updated', { newConfig });
  });

  setHandler(statusQuery, () => status);
  setHandler(progressQuery, () => progress);

  try {
    await logWorkflowEvent('general_workflow_started', { input });
    
    // Step 1: Analyze user input (10% progress)
    if (isCancelled) throw new Error('Workflow cancelled');
    while (isPaused) await sleep(1000);
    
    progress = 10;
    const analysis = await analyzeUserInput(input.userRequest, input.context);
    
    // Step 2: Call AI provider (50% progress)
    if (isCancelled) throw new Error('Workflow cancelled');
    while (isPaused) await sleep(1000);
    
    progress = 50;
    const aiResponse = await callAIProvider({
      prompt: input.userRequest,
      config: currentConfig,
      context: input.context,
      metadata: analysis,
    });

    // Step 3: Process and format response (80% progress)
    if (isCancelled) throw new Error('Workflow cancelled');
    while (isPaused) await sleep(1000);
    
    progress = 80;
    
    // Step 4: Update workflow status and complete (100% progress)
    progress = 100;
    status = 'COMPLETED';
    
    const result: WorkflowStepResult = {
      success: true,
      output: aiResponse.response,
      metadata: {
        analysis,
        provider: aiResponse.provider,
        model: aiResponse.model,
        tokens: aiResponse.usage?.total_tokens,
        cost: aiResponse.cost,
      }
    };

    await updateWorkflowStatus('completed', result);
    await logWorkflowEvent('general_workflow_completed', { result });
    
    return result;

  } catch (error) {
    status = 'FAILED';
    log.error('General workflow failed', { error });
    
    const errorResult = await handleWorkflowError(error as Error, {
      workflowType: 'general',
      input,
      progress,
    });

    return errorResult;
  }
}

/**
 * Code Generation Workflow
 * Specialized workflow for code generation tasks
 */
export async function codeGenerationWorkflow(
  input: {
    prompt: string;
    language: string;
    framework?: string;
    includeTests: boolean;
    includeDocs: boolean;
    context?: WorkflowContext;
  }
): Promise<WorkflowStepResult> {
  let status: WorkflowExecutionStatus = 'RUNNING';
  let progress = 0;

  setHandler(statusQuery, () => status);
  setHandler(progressQuery, () => progress);

  try {
    await logWorkflowEvent('code_generation_started', { input });
    
    // Step 1: Analyze code requirements (20% progress)
    progress = 20;
    const requirements = await analyzeUserInput(input.prompt, input.context);
    
    // Step 2: Generate main code (60% progress)
    progress = 60;
    const codeResult = await generateCode({
      prompt: input.prompt,
      language: input.language,
      framework: input.framework,
      includeTests: input.includeTests,
      includeDocs: input.includeDocs,
      context: input.context,
    });

    // Step 3: Validate and optimize code (90% progress)
    progress = 90;
    await sleep(1000); // Simulate validation time
    
    // Step 4: Complete workflow (100% progress)
    progress = 100;
    status = 'COMPLETED';
    
    const result: WorkflowStepResult = {
      success: true,
      output: codeResult.code,
      metadata: {
        language: input.language,
        framework: input.framework,
        qualityScore: codeResult.qualityScore,
        hasTests: input.includeTests,
        hasDocs: input.includeDocs,
        lineCount: codeResult.code.split('\n').length,
      }
    };

    await updateWorkflowStatus('completed', result);
    await logWorkflowEvent('code_generation_completed', { result });
    
    return result;

  } catch (error) {
    status = 'FAILED';
    log.error('Code generation workflow failed', { error });
    
    return await handleWorkflowError(error as Error, {
      workflowType: 'code_generation',
      input,
      progress,
    });
  }
}

/**
 * Data Analysis Workflow
 * Handles data processing and analysis tasks
 */
export async function dataAnalysisWorkflow(
  input: {
    dataSource: string;
    analysisType: 'descriptive' | 'predictive' | 'diagnostic' | 'prescriptive';
    outputFormat: 'json' | 'csv' | 'report';
    context?: WorkflowContext;
  }
): Promise<WorkflowStepResult> {
  let status: WorkflowExecutionStatus = 'RUNNING';
  let progress = 0;

  setHandler(statusQuery, () => status);
  setHandler(progressQuery, () => progress);

  try {
    await logWorkflowEvent('data_analysis_started', { input });
    
    // Step 1: Process data source (25% progress)
    progress = 25;
    const processedData = await analyzeData({
      source: input.dataSource,
      type: input.analysisType,
      context: input.context,
    });

    // Step 2: Perform analysis (75% progress)
    progress = 75;
    const analysis = await callAIProvider({
      prompt: `Analyze this data: ${JSON.stringify(processedData)}`,
      config: { provider: 'default', model: 'gpt-4' },
      context: input.context,
    });

    // Step 3: Format output (100% progress)
    progress = 100;
    status = 'COMPLETED';
    
    const result: WorkflowStepResult = {
      success: true,
      output: analysis.response,
      metadata: {
        analysisType: input.analysisType,
        outputFormat: input.outputFormat,
        dataPoints: processedData.dataPoints,
        insights: processedData.insights,
      }
    };

    await updateWorkflowStatus('completed', result);
    await logWorkflowEvent('data_analysis_completed', { result });
    
    return result;

  } catch (error) {
    status = 'FAILED';
    log.error('Data analysis workflow failed', { error });
    
    return await handleWorkflowError(error as Error, {
      workflowType: 'data_analysis',
      input,
      progress,
    });
  }
}

/**
 * Document Processing Workflow
 * Handles document analysis and processing
 */
export async function documentProcessingWorkflow(
  input: {
    documentUrl: string;
    taskType: 'extract' | 'summarize' | 'analyze' | 'translate';
    outputLanguage?: string;
    context?: WorkflowContext;
  }
): Promise<WorkflowStepResult> {
  let status: WorkflowExecutionStatus = 'RUNNING';
  let progress = 0;

  setHandler(statusQuery, () => status);
  setHandler(progressQuery, () => progress);

  try {
    await logWorkflowEvent('document_processing_started', { input });
    
    // Step 1: Extract document text (30% progress)
    progress = 30;
    const documentText = await extractDocumentText(input.documentUrl);

    // Step 2: Process based on task type (80% progress)
    progress = 80;
    const processResult = await processDocument({
      text: documentText.content,
      taskType: input.taskType,
      language: input.outputLanguage,
      context: input.context,
    });

    // Step 3: Complete processing (100% progress)
    progress = 100;
    status = 'COMPLETED';
    
    const result: WorkflowStepResult = {
      success: true,
      output: processResult.output,
      metadata: {
        taskType: input.taskType,
        documentType: documentText.type,
        wordCount: documentText.wordCount,
        language: input.outputLanguage,
        confidence: processResult.confidence,
      }
    };

    await updateWorkflowStatus('completed', result);
    await logWorkflowEvent('document_processing_completed', { result });
    
    return result;

  } catch (error) {
    status = 'FAILED';
    log.error('Document processing workflow failed', { error });
    
    return await handleWorkflowError(error as Error, {
      workflowType: 'document_processing',
      input,
      progress,
    });
  }
}

/**
 * ML Training Workflow
 * Handles machine learning model training and evaluation
 */
export async function mlTrainingWorkflow(
  input: {
    datasetPath: string;
    modelType: string;
    hyperparameters: Record<string, any>;
    validationSplit: number;
    context?: WorkflowContext;
  }
): Promise<WorkflowStepResult> {
  let status: WorkflowExecutionStatus = 'RUNNING';
  let progress = 0;

  setHandler(statusQuery, () => status);
  setHandler(progressQuery, () => progress);

  try {
    await logWorkflowEvent('ml_training_started', { input });
    
    // Step 1: Prepare training data (20% progress)
    progress = 20;
    await sleep(2000); // Simulate data preparation
    
    // Step 2: Train model (70% progress)
    progress = 70;
    const trainingResult = await trainModel({
      datasetPath: input.datasetPath,
      modelType: input.modelType,
      hyperparameters: input.hyperparameters,
      validationSplit: input.validationSplit,
      context: input.context,
    });

    // Step 3: Evaluate model (90% progress)
    progress = 90;
    const evaluationResult = await evaluateModel({
      modelPath: trainingResult.modelPath,
      testDataPath: input.datasetPath,
      metrics: ['accuracy', 'precision', 'recall', 'f1'],
    });

    // Step 4: Deploy model if evaluation passes threshold (100% progress)
    if (evaluationResult.accuracy > 0.8) {
      await deployModel({
        modelPath: trainingResult.modelPath,
        version: trainingResult.version,
        environment: 'staging',
      });
    }

    progress = 100;
    status = 'COMPLETED';
    
    const result: WorkflowStepResult = {
      success: true,
      output: 'Model training completed successfully',
      metadata: {
        modelType: input.modelType,
        modelPath: trainingResult.modelPath,
        accuracy: evaluationResult.accuracy,
        trainingTime: trainingResult.trainingTime,
        deployed: evaluationResult.accuracy > 0.8,
      }
    };

    await updateWorkflowStatus('completed', result);
    await logWorkflowEvent('ml_training_completed', { result });
    
    return result;

  } catch (error) {
    status = 'FAILED';
    log.error('ML training workflow failed', { error });
    
    return await handleWorkflowError(error as Error, {
      workflowType: 'ml_training',
      input,
      progress,
    });
  }
}

// Export all workflows for registration
export {
  generalWorkflow,
  codeGenerationWorkflow,
  dataAnalysisWorkflow,
  documentProcessingWorkflow,
  mlTrainingWorkflow,
};