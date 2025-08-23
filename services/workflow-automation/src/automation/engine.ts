/**
 * Automation Engine - Core workflow automation with iterative improvement
 * Handles workflow execution, AI-driven quality control, and adaptive optimization
 */

import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { createServiceLogger } from '../shared-utils-local';
import { AutomationDatabase } from '../database/connection';
import { JobQueue } from '../jobs/queue';
import { QualityController } from '../quality/controller';

const logger = createServiceLogger('automation-engine');

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  type: string;
  configuration: Record<string, any>;
  triggers: WorkflowTrigger[];
  steps: WorkflowStep[];
  qualitySettings: QualitySettings;
  isActive: boolean;
}

export interface WorkflowTrigger {
  type: 'manual' | 'schedule' | 'webhook' | 'file' | 'api';
  configuration: Record<string, any>;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'ai_task' | 'data_processing' | 'api_call' | 'file_operation' | 'quality_check';
  configuration: Record<string, any>;
  dependencies: string[];
  retryPolicy?: {
    maxAttempts: number;
    backoffMs: number;
  };
}

export interface QualitySettings {
  threshold: number;
  maxIterations: number;
  assessmentCriteria: QualityCriteria[];
  improvementStrategy: 'iterative' | 'feedback_driven' | 'hybrid';
}

export interface QualityCriteria {
  name: string;
  type: 'accuracy' | 'completeness' | 'relevance' | 'consistency' | 'format' | 'custom';
  weight: number;
  threshold: number;
  description: string;
}

export interface ExecutionContext {
  executionId: string;
  workflowId: string;
  triggerSource: string;
  triggerData: any;
  inputData: any;
  currentIteration: number;
  maxIterations: number;
  qualityThreshold: number;
  metadata: Record<string, any>;
}

export interface ExecutionResult {
  success: boolean;
  output?: any;
  qualityScore?: number;
  iterations: number;
  duration: number;
  error?: string;
  improvements: string[];
}

export class AutomationEngine {
  private database: AutomationDatabase;
  private jobQueue: JobQueue;
  private qualityController: QualityController;
  private environment: any;
  private aiGatewayUrl: string;

  constructor(
    database: AutomationDatabase,
    jobQueue: JobQueue,
    qualityController: QualityController,
    environment: any
  ) {
    this.database = database;
    this.jobQueue = jobQueue;
    this.qualityController = qualityController;
    this.environment = environment;
    this.aiGatewayUrl = process.env.AI_GATEWAY_URL || 'http://localhost:8090';
  }

  /**
   * Execute a workflow with iterative improvement
   */
  async executeWorkflow(
    workflowId: string,
    triggerSource: string,
    triggerData: any,
    inputData: any,
    options: {
      maxIterations?: number;
      qualityThreshold?: number;
      userId?: string;
    } = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const executionId = uuidv4();

    try {
      // Get workflow definition
      const workflow = await this.getWorkflowDefinition(workflowId);
      if (!workflow || !workflow.isActive) {
        throw new Error(`Workflow not found or inactive: ${workflowId}`);
      }

      // Create execution context
      const context: ExecutionContext = {
        executionId,
        workflowId,
        triggerSource,
        triggerData,
        inputData,
        currentIteration: 1,
        maxIterations: options.maxIterations || workflow.qualitySettings.maxIterations || this.environment.MAX_ITERATIONS || 25,
        qualityThreshold: options.qualityThreshold || workflow.qualitySettings.threshold || this.environment.QUALITY_THRESHOLD || 0.95,
        metadata: {
          userId: options.userId,
          startTime: new Date().toISOString(),
        },
      };

      // Log execution start
      await this.logExecutionStart(context, workflow);

      logger.getLogger().info({
        executionId,
        workflowId,
        workflowName: workflow.name,
        triggerSource,
        maxIterations: context.maxIterations,
        qualityThreshold: context.qualityThreshold,
      }, 'Starting workflow execution');

      // Execute workflow with iterative improvement
      const result = await this.executeWithIterativeImprovement(workflow, context);

      // Log execution completion
      const duration = Date.now() - startTime;
      await this.logExecutionCompletion(executionId, result, duration);

      logger.getLogger().info({
        executionId,
        workflowId,
        success: result.success,
        iterations: result.iterations,
        qualityScore: result.qualityScore,
        duration,
      }, 'Workflow execution completed');

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error(error as Error, {
        executionId,
        workflowId,
        duration,
      }, 'Workflow execution failed');

      // Log execution failure
      await this.logExecutionCompletion(executionId, {
        success: false,
        error: (error as Error).message,
        iterations: 0,
        duration,
        improvements: [],
      }, duration);

      return {
        success: false,
        error: (error as Error).message,
        iterations: 0,
        duration,
        improvements: [],
      };
    }
  }

  /**
   * Execute workflow with iterative improvement logic
   */
  private async executeWithIterativeImprovement(
    workflow: WorkflowDefinition,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    let bestResult: any = null;
    let bestQualityScore = 0;
    const improvements: string[] = [];
    let currentData = context.inputData;

    for (let iteration = 1; iteration <= context.maxIterations; iteration++) {
      context.currentIteration = iteration;

      logger.getLogger().info({
        executionId: context.executionId,
        iteration,
        maxIterations: context.maxIterations,
      }, 'Starting workflow iteration');

      try {
        // Execute workflow steps
        const stepResults = await this.executeWorkflowSteps(workflow, context, currentData);
        
        // Assess quality
        const qualityAssessment = await this.qualityController.assessQuality(
          context,
          stepResults,
          workflow.qualitySettings.assessmentCriteria
        );

        logger.getLogger().info({
          executionId: context.executionId,
          iteration,
          qualityScore: qualityAssessment.overallScore,
          passed: qualityAssessment.passed,
        }, 'Quality assessment completed');

        // Check if quality threshold is met
        if (qualityAssessment.passed && qualityAssessment.overallScore >= context.qualityThreshold) {
          logger.getLogger().info({
            executionId: context.executionId,
            iteration,
            qualityScore: qualityAssessment.overallScore,
          }, 'Quality threshold met, completing execution');

          return {
            success: true,
            output: stepResults,
            qualityScore: qualityAssessment.overallScore,
            iterations: iteration,
            duration: 0, // Will be set by caller
            improvements,
          };
        }

        // Track best result
        if (qualityAssessment.overallScore > bestQualityScore) {
          bestResult = stepResults;
          bestQualityScore = qualityAssessment.overallScore;
        }

        // Generate improvement feedback if not at max iterations
        if (iteration < context.maxIterations) {
          const feedback = await this.generateImprovementFeedback(
            context,
            stepResults,
            qualityAssessment
          );
          
          if (feedback) {
            improvements.push(`Iteration ${iteration}: ${feedback}`);
            // Apply feedback to input data for next iteration
            currentData = await this.applyImprovementFeedback(currentData, feedback, stepResults);
          }
        }

      } catch (error) {
        logger.error(error as Error, {
          executionId: context.executionId,
          iteration,
        }, 'Iteration failed');

        // Continue to next iteration unless this is the last one
        if (iteration === context.maxIterations) {
          throw error;
        }
      }
    }

    // Return best result if no iteration met the quality threshold
    logger.getLogger().warn({
      executionId: context.executionId,
      maxIterations: context.maxIterations,
      bestQualityScore,
      threshold: context.qualityThreshold,
    }, 'Max iterations reached without meeting quality threshold');

    return {
      success: bestQualityScore > 0.5, // Consider success if above 50%
      output: bestResult,
      qualityScore: bestQualityScore,
      iterations: context.maxIterations,
      duration: 0, // Will be set by caller
      improvements,
    };
  }

  /**
   * Execute all workflow steps
   */
  private async executeWorkflowSteps(
    workflow: WorkflowDefinition,
    context: ExecutionContext,
    inputData: any
  ): Promise<any> {
    const stepResults: Record<string, any> = {};
    let currentData = inputData;

    // Sort steps by dependencies (simple topological sort)
    const sortedSteps = this.sortStepsByDependencies(workflow.steps);

    for (const step of sortedSteps) {
      logger.getLogger().debug({
        executionId: context.executionId,
        stepId: step.id,
        stepName: step.name,
        stepType: step.type,
        iteration: context.currentIteration,
      }, 'Executing workflow step');

      try {
        const stepResult = await this.executeStep(step, context, currentData, stepResults);
        stepResults[step.id] = stepResult;
        
        // Use step result as input for subsequent steps if no specific dependencies
        if (step.dependencies.length === 0) {
          currentData = stepResult;
        }

        await this.logStepExecution(context, step, stepResult, 'completed');

      } catch (error) {
        logger.error(error as Error, {
          executionId: context.executionId,
          stepId: step.id,
          stepName: step.name,
        }, 'Step execution failed');

        await this.logStepExecution(context, step, null, 'failed', (error as Error).message);
        throw error;
      }
    }

    return stepResults;
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    step: WorkflowStep,
    context: ExecutionContext,
    inputData: any,
    previousResults: Record<string, any>
  ): Promise<any> {
    const stepStartTime = Date.now();

    // Prepare step input based on dependencies
    let stepInput = inputData;
    if (step.dependencies.length > 0) {
      stepInput = {};
      for (const depId of step.dependencies) {
        if (previousResults[depId]) {
          stepInput[depId] = previousResults[depId];
        }
      }
    }

    switch (step.type) {
      case 'ai_task':
        return await this.executeAITask(step, context, stepInput);
      
      case 'data_processing':
        return await this.executeDataProcessing(step, context, stepInput);
      
      case 'api_call':
        return await this.executeAPICall(step, context, stepInput);
      
      case 'file_operation':
        return await this.executeFileOperation(step, context, stepInput);
      
      case 'quality_check':
        return await this.executeQualityCheck(step, context, stepInput);
      
      default:
        throw new Error(`Unsupported step type: ${step.type}`);
    }
  }

  /**
   * Execute AI task step
   */
  private async executeAITask(step: WorkflowStep, context: ExecutionContext, input: any): Promise<any> {
    const config = step.configuration;
    const prompt = this.buildPrompt(config.prompt, input, context);

    try {
      const response = await axios.post(`${this.aiGatewayUrl}/ai-gateway/chat`, {
        model: config.model || 'default',
        messages: [{ role: 'user', content: prompt }],
        temperature: config.temperature || 0.7,
        max_tokens: config.maxTokens || 2000,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': context.executionId,
        },
        timeout: 60000,
      });

      return {
        response: response.data.response,
        model: response.data.model,
        usage: response.data.usage,
        prompt: prompt.substring(0, 200) + '...', // Truncated for logging
      };

    } catch (error) {
      logger.error(error as Error, {
        executionId: context.executionId,
        stepName: step.name,
      }, 'AI task execution failed');
      throw new Error(`AI task failed: ${(error as Error).message}`);
    }
  }

  /**
   * Execute data processing step
   */
  private async executeDataProcessing(step: WorkflowStep, context: ExecutionContext, input: any): Promise<any> {
    const config = step.configuration;
    
    switch (config.operation) {
      case 'transform':
        return this.transformData(input, config.transformation);
      
      case 'filter':
        return this.filterData(input, config.filter);
      
      case 'aggregate':
        return this.aggregateData(input, config.aggregation);
      
      default:
        throw new Error(`Unsupported data processing operation: ${config.operation}`);
    }
  }

  /**
   * Execute API call step
   */
  private async executeAPICall(step: WorkflowStep, context: ExecutionContext, input: any): Promise<any> {
    const config = step.configuration;
    
    try {
      const response = await axios({
        method: config.method || 'GET',
        url: config.url,
        data: config.includeInput ? input : config.data,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': context.executionId,
          ...config.headers,
        },
        timeout: config.timeout || 30000,
      });

      return {
        status: response.status,
        data: response.data,
        headers: response.headers,
      };

    } catch (error) {
      throw new Error(`API call failed: ${(error as Error).message}`);
    }
  }

  /**
   * Execute file operation step
   */
  private async executeFileOperation(step: WorkflowStep, context: ExecutionContext, input: any): Promise<any> {
    const config = step.configuration;
    
    // Mock file operations for demo
    switch (config.operation) {
      case 'read':
        return { content: `Mock file content from ${config.path}`, size: 1024 };
      
      case 'write':
        return { written: true, path: config.path, size: JSON.stringify(input).length };
      
      case 'process':
        return { processed: true, input: input, type: config.fileType };
      
      default:
        throw new Error(`Unsupported file operation: ${config.operation}`);
    }
  }

  /**
   * Execute quality check step
   */
  private async executeQualityCheck(step: WorkflowStep, context: ExecutionContext, input: any): Promise<any> {
    const config = step.configuration;
    
    // Simple quality check implementation
    const checks = [];
    let overallScore = 1.0;

    if (config.checks) {
      for (const check of config.checks) {
        let passed = true;
        let score = 1.0;

        switch (check.type) {
          case 'not_empty':
            passed = input && Object.keys(input).length > 0;
            score = passed ? 1.0 : 0.0;
            break;
          
          case 'contains_key':
            passed = input && input.hasOwnProperty(check.key);
            score = passed ? 1.0 : 0.0;
            break;
          
          case 'min_length':
            const content = typeof input === 'string' ? input : JSON.stringify(input);
            passed = content.length >= check.minLength;
            score = passed ? 1.0 : Math.max(0, content.length / check.minLength);
            break;
        }

        checks.push({
          name: check.name,
          type: check.type,
          passed,
          score,
        });

        overallScore *= score;
      }
    }

    return {
      passed: overallScore >= (config.threshold || 0.8),
      score: overallScore,
      checks,
    };
  }

  /**
   * Generate improvement feedback using AI
   */
  private async generateImprovementFeedback(
    context: ExecutionContext,
    results: any,
    qualityAssessment: any
  ): Promise<string | null> {
    try {
      const prompt = `
        Analyze the following workflow execution results and quality assessment.
        Provide specific, actionable feedback for improvement.

        Results: ${JSON.stringify(results, null, 2)}
        Quality Assessment: ${JSON.stringify(qualityAssessment, null, 2)}
        
        Current Quality Score: ${qualityAssessment.overallScore}
        Target Threshold: ${context.qualityThreshold}
        
        Provide concrete suggestions for improvement in a single paragraph.
      `;

      const response = await axios.post(`${this.aiGatewayUrl}/ai-gateway/chat`, {
        model: 'default',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': context.executionId,
        },
        timeout: 30000,
      });

      return response.data.response;

    } catch (error) {
      logger.error(error as Error, {
        executionId: context.executionId,
      }, 'Failed to generate improvement feedback');
      return null;
    }
  }

  /**
   * Apply improvement feedback to input data
   */
  private async applyImprovementFeedback(
    inputData: any,
    feedback: string,
    previousResults: any
  ): Promise<any> {
    // Simple feedback application - in production, this would be more sophisticated
    const enhanced = {
      ...inputData,
      _improvementContext: {
        feedback,
        previousResults: previousResults,
        iteration: Date.now(),
      }
    };

    // Add feedback as additional context for AI tasks
    if (typeof inputData === 'string') {
      return `${inputData}\n\nImprovement feedback: ${feedback}`;
    }

    return enhanced;
  }

  // Helper methods
  private async getWorkflowDefinition(workflowId: string): Promise<WorkflowDefinition | null> {
    try {
      const { rows } = await this.database.query(`
        SELECT * FROM automation_workflows WHERE workflow_id = $1
      `, [workflowId]);

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      return {
        id: row.workflow_id,
        name: row.name,
        description: row.description,
        type: row.workflow_type,
        configuration: row.configuration,
        triggers: row.triggers,
        steps: row.steps,
        qualitySettings: row.quality_settings,
        isActive: row.is_active,
      };
    } catch (error) {
      logger.error(error as Error, { workflowId }, 'Failed to get workflow definition');
      throw error;
    }
  }

  private sortStepsByDependencies(steps: WorkflowStep[]): WorkflowStep[] {
    // Simple topological sort
    const sorted: WorkflowStep[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (step: WorkflowStep) => {
      if (visiting.has(step.id)) {
        throw new Error(`Circular dependency detected: ${step.id}`);
      }
      if (visited.has(step.id)) {
        return;
      }

      visiting.add(step.id);
      
      for (const depId of step.dependencies) {
        const depStep = steps.find(s => s.id === depId);
        if (depStep) {
          visit(depStep);
        }
      }

      visiting.delete(step.id);
      visited.add(step.id);
      sorted.push(step);
    };

    for (const step of steps) {
      visit(step);
    }

    return sorted;
  }

  private buildPrompt(template: string, input: any, context: ExecutionContext): string {
    let prompt = template;
    
    // Replace placeholders
    prompt = prompt.replace(/\{input\}/g, JSON.stringify(input));
    prompt = prompt.replace(/\{executionId\}/g, context.executionId);
    prompt = prompt.replace(/\{iteration\}/g, context.currentIteration.toString());
    
    return prompt;
  }

  private transformData(data: any, transformation: any): any {
    // Simple data transformation logic
    switch (transformation.type) {
      case 'map':
        if (Array.isArray(data)) {
          return data.map(item => transformation.mapping(item));
        }
        break;
      case 'extract':
        return data[transformation.field];
      default:
        return data;
    }
  }

  private filterData(data: any, filter: any): any {
    if (Array.isArray(data)) {
      return data.filter(item => this.evaluateFilter(item, filter));
    }
    return data;
  }

  private aggregateData(data: any, aggregation: any): any {
    if (!Array.isArray(data)) {
      return data;
    }

    switch (aggregation.operation) {
      case 'count':
        return { count: data.length };
      case 'sum':
        return { sum: data.reduce((sum, item) => sum + (item[aggregation.field] || 0), 0) };
      default:
        return data;
    }
  }

  private evaluateFilter(item: any, filter: any): boolean {
    // Simple filter evaluation
    switch (filter.operator) {
      case 'equals':
        return item[filter.field] === filter.value;
      case 'contains':
        return String(item[filter.field]).includes(filter.value);
      default:
        return true;
    }
  }

  // Logging methods
  private async logExecutionStart(context: ExecutionContext, workflow: WorkflowDefinition): Promise<void> {
    try {
      await this.database.query(`
        INSERT INTO automation_executions (
          execution_id, workflow_id, trigger_source, trigger_data,
          input_data, max_iterations, quality_threshold, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'running')
      `, [
        context.executionId,
        context.workflowId,
        context.triggerSource,
        JSON.stringify(context.triggerData),
        JSON.stringify(context.inputData),
        context.maxIterations,
        context.qualityThreshold,
      ]);
    } catch (error) {
      logger.error(error as Error, { executionId: context.executionId }, 'Failed to log execution start');
    }
  }

  private async logExecutionCompletion(
    executionId: string,
    result: ExecutionResult,
    duration: number
  ): Promise<void> {
    try {
      await this.database.query(`
        UPDATE automation_executions
        SET status = $1, output_data = $2, quality_scores = $3,
            error_details = $4, completed_at = NOW(),
            total_duration_ms = $5, current_iteration = $6
        WHERE execution_id = $7
      `, [
        result.success ? 'completed' : 'failed',
        JSON.stringify(result.output),
        JSON.stringify([{ score: result.qualityScore, iteration: result.iterations }]),
        result.error ? JSON.stringify({ error: result.error }) : null,
        duration,
        result.iterations,
        executionId,
      ]);
    } catch (error) {
      logger.error(error as Error, { executionId }, 'Failed to log execution completion');
    }
  }

  private async logStepExecution(
    context: ExecutionContext,
    step: WorkflowStep,
    result: any,
    status: string,
    error?: string
  ): Promise<void> {
    try {
      await this.database.query(`
        INSERT INTO automation_step_executions (
          execution_id, step_name, step_type, iteration, status,
          input_data, output_data, error_details, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        context.executionId,
        step.name,
        step.type,
        context.currentIteration,
        status,
        JSON.stringify({}), // Input would be tracked if needed
        result ? JSON.stringify(result) : null,
        error ? JSON.stringify({ error }) : null,
      ]);
    } catch (dbError) {
      logger.error(dbError as Error, {
        executionId: context.executionId,
        stepName: step.name,
      }, 'Failed to log step execution');
    }
  }
}