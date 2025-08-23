/**
 * Temporal Workflow Automation Engine
 * Core engine for generating, optimizing, and deploying Temporal workflows
 */

import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { createServiceLogger } from '../shared-utils-local';
import { AutomationDatabase } from '../database/connection';
import { JobQueue } from '../jobs/queue';
import { QualityController } from '../quality/controller';
import { TemporalWorkflowGenerator, TemporalWorkflowGenerationRequest, TemporalWorkflowGenerationResult } from '../templates/temporal-generator';

const logger = createServiceLogger('temporal-automation-engine');

export interface TemporalWorkflowExecutionRequest {
  requirements: string;
  workflowYaml?: string;
  templateId?: string;
  businessContext?: string;
  targetLanguage?: 'python' | 'typescript';
  autoActivate?: boolean;
  deployEnvironment?: 'development' | 'staging' | 'production';
  maxIterations?: number;
  qualityThreshold?: number;
  userPreferences?: Record<string, any>;
}

export interface TemporalWorkflowExecutionResult {
  executionId: string;
  workflowId: string;
  status: 'completed' | 'failed' | 'running' | 'deployed';
  success: boolean;
  temporalWorkflowClass: string;
  generatedCodeUrl?: string;
  deploymentEndpoint?: string;
  qualityScores: Record<string, number>;
  iterations: number;
  finalQualityScore: number;
  improvementSuggestions: string[];
  feedbackApplied: string[];
  executionTime: number;
  artifactsGenerated: number;
  error?: string;
}

export interface ExecutionContext {
  executionId: string;
  workflowId: string;
  inputData: any;
  currentIteration: number;
  maxIterations: number;
  qualityThreshold: number;
  userId: string;
  correlationId?: string;
}

export class TemporalAutomationEngine {
  private database: AutomationDatabase;
  private jobQueue: JobQueue;
  private qualityController: QualityController;
  private temporalGenerator: TemporalWorkflowGenerator;
  private aiGatewayUrl: string;

  constructor(
    database: AutomationDatabase, 
    jobQueue: JobQueue, 
    qualityController: QualityController
  ) {
    this.database = database;
    this.jobQueue = jobQueue;
    this.qualityController = qualityController;
    this.temporalGenerator = new TemporalWorkflowGenerator(database);
    this.aiGatewayUrl = process.env.AI_GATEWAY_URL || 'http://localhost:8090';
  }

  /**
   * Generate Temporal workflow from requirements
   */
  async generateWorkflow(
    requirements: string,
    triggerSource: string,
    inputData: any,
    metadata: any,
    options: { userId: string; correlationId?: string }
  ): Promise<TemporalWorkflowExecutionResult> {
    const executionId = uuidv4();
    const workflowId = uuidv4();
    const startTime = Date.now();

    try {
      logger.getLogger().info({
        executionId,
        workflowId,
        requirements: requirements.substring(0, 100),
        triggerSource,
        userId: options.userId,
      }, 'Starting Temporal workflow generation');

      // Create execution context
      const context: ExecutionContext = {
        executionId,
        workflowId,
        inputData,
        currentIteration: 1,
        maxIterations: metadata.maxIterations || 3,
        qualityThreshold: metadata.qualityThreshold || 0.8,
        userId: options.userId,
        correlationId: options.correlationId,
      };

      // Log execution start
      await this.logExecutionStart(context, requirements, metadata);

      // Prepare generation request
      const generationRequest: TemporalWorkflowGenerationRequest = {
        requirements,
        workflowYaml: metadata.workflowYaml,
        templateId: metadata.templateId,
        businessContext: metadata.businessContext,
        targetLanguage: metadata.targetLanguage || 'python',
        autoActivate: metadata.autoActivate || false,
        deployEnvironment: metadata.deployEnvironment || 'development',
        maxIterations: context.maxIterations,
        userPreferences: metadata.userPreferences,
      };

      // Generate workflow
      const generationResult = await this.temporalGenerator.generateWorkflow(generationRequest);

      // Convert to execution result format
      const result: TemporalWorkflowExecutionResult = {
        executionId,
        workflowId,
        status: generationResult.status,
        success: generationResult.success,
        temporalWorkflowClass: generationResult.temporalWorkflowClass,
        generatedCodeUrl: generationResult.generatedCodeUrl,
        deploymentEndpoint: generationResult.deploymentEndpoint,
        qualityScores: generationResult.qualityScores,
        iterations: generationResult.iterations,
        finalQualityScore: Object.values(generationResult.qualityScores).reduce((a, b) => a + b, 0) / 
                          Object.keys(generationResult.qualityScores).length,
        improvementSuggestions: generationResult.improvementSuggestions || [],
        feedbackApplied: generationResult.feedbackApplied,
        executionTime: generationResult.executionTime,
        artifactsGenerated: generationResult.artifactsGenerated,
      };

      // Log execution completion
      const duration = Date.now() - startTime;
      await this.logExecutionCompletion(executionId, result, duration);

      logger.getLogger().info({
        executionId,
        workflowId,
        success: result.success,
        temporalWorkflowClass: result.temporalWorkflowClass,
        finalQualityScore: result.finalQualityScore,
        duration,
      }, 'Temporal workflow generation completed');

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error(error as Error, {
        executionId,
        workflowId,
        requirements: requirements.substring(0, 50),
        duration,
      }, 'Temporal workflow generation failed');

      // Log execution failure
      await this.logExecutionCompletion(executionId, {
        success: false,
        error: (error as Error).message,
        iterations: 0,
        duration,
      }, duration);

      return {
        executionId,
        workflowId,
        status: 'failed',
        success: false,
        temporalWorkflowClass: '',
        qualityScores: {},
        iterations: 0,
        finalQualityScore: 0,
        improvementSuggestions: [],
        feedbackApplied: [],
        executionTime: duration,
        artifactsGenerated: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Process workflow data from inter-workflow communication
   */
  async processWorkflowData(workflowId: string, data: any): Promise<void> {
    try {
      logger.getLogger().info({
        workflowId,
        dataSize: JSON.stringify(data).length
      }, 'Processing workflow data');

      // Store the data for the workflow to process
      // This could trigger workflow execution or update workflow state
      
      // For now, we'll log the data processing
      // In a real implementation, this would:
      // 1. Check if the target workflow exists
      // 2. Validate the data format
      // 3. Either start a new workflow execution or update existing execution
      // 4. Log the data exchange for monitoring
      
      logger.getLogger().info({
        workflowId,
        processed: true
      }, 'Workflow data processed successfully');

    } catch (error) {
      logger.error(error as Error, {
        workflowId
      }, 'Failed to process workflow data');
      throw error;
    }
  }

  /**
   * Execute iterative Temporal workflow generation with quality optimization
   */
  async executeIterativeWorkflow(
    requirements: string,
    triggerSource: string,
    inputData: any,
    metadata: any,
    options: { userId: string; correlationId?: string }
  ): Promise<TemporalWorkflowExecutionResult> {
    const executionId = uuidv4();
    const workflowId = uuidv4();
    const startTime = Date.now();

    try {
      logger.getLogger().info({
        executionId,
        workflowId,
        requirements: requirements.substring(0, 100),
        maxIterations: metadata.maxIterations || 5,
        qualityThreshold: metadata.qualityThreshold || 0.9,
      }, 'Starting iterative Temporal workflow generation');

      const context: ExecutionContext = {
        executionId,
        workflowId,
        inputData,
        currentIteration: 1,
        maxIterations: metadata.maxIterations || 5,
        qualityThreshold: metadata.qualityThreshold || 0.9,
        userId: options.userId,
        correlationId: options.correlationId,
      };

      // Log execution start
      await this.logExecutionStart(context, requirements, metadata);

      let bestResult: TemporalWorkflowExecutionResult | null = null;
      let bestQualityScore = 0;
      const allFeedback: string[] = [];

      // Iterative improvement loop
      for (let iteration = 1; iteration <= context.maxIterations; iteration++) {
        logger.getLogger().info({
          executionId,
          iteration,
          maxIterations: context.maxIterations,
        }, 'Starting workflow generation iteration');

        context.currentIteration = iteration;

        // Prepare enhanced generation request with feedback from previous iterations
        const generationRequest: TemporalWorkflowGenerationRequest = {
          requirements: this.enhanceRequirementsWithFeedback(requirements, allFeedback),
          workflowYaml: metadata.workflowYaml,
          templateId: metadata.templateId,
          businessContext: metadata.businessContext,
          targetLanguage: metadata.targetLanguage || 'python',
          autoActivate: false, // Don't auto-deploy until final iteration
          deployEnvironment: metadata.deployEnvironment || 'development',
          maxIterations: 1, // Single generation per iteration
          userPreferences: metadata.userPreferences,
        };

        // Generate workflow for this iteration
        const generationResult = await this.temporalGenerator.generateWorkflow(generationRequest);

        if (!generationResult.success) {
          logger.warn({
            executionId,
            iteration,
            error: 'Generation failed for this iteration',
          }, 'Workflow generation failed in iteration');
          continue;
        }

        // Assess quality using quality controller
        const qualityAssessment = await this.qualityController.assessQuality(
          context,
          {
            generatedCode: 'temporal_workflow_code', // Placeholder - would contain actual code
            temporalWorkflowClass: generationResult.temporalWorkflowClass,
            qualityScores: generationResult.qualityScores,
          },
          this.getQualityCriteria()
        );

        const currentQualityScore = qualityAssessment.overallScore;

        logger.getLogger().info({
          executionId,
          iteration,
          qualityScore: currentQualityScore,
          qualityThreshold: context.qualityThreshold,
          passed: qualityAssessment.passed,
        }, 'Quality assessment completed for iteration');

        // Update best result if this iteration is better
        if (currentQualityScore > bestQualityScore) {
          bestQualityScore = currentQualityScore;
          bestResult = {
            executionId,
            workflowId,
            status: generationResult.status,
            success: true,
            temporalWorkflowClass: generationResult.temporalWorkflowClass,
            generatedCodeUrl: generationResult.generatedCodeUrl,
            deploymentEndpoint: generationResult.deploymentEndpoint,
            qualityScores: generationResult.qualityScores,
            iterations: iteration,
            finalQualityScore: currentQualityScore,
            improvementSuggestions: qualityAssessment.suggestions,
            feedbackApplied: allFeedback.slice(),
            executionTime: Date.now() - startTime,
            artifactsGenerated: generationResult.artifactsGenerated,
          };
        }

        // Add feedback for next iteration
        allFeedback.push(qualityAssessment.feedback);
        allFeedback.push(...qualityAssessment.suggestions);

        // Check if quality threshold is met
        if (qualityAssessment.passed && currentQualityScore >= context.qualityThreshold) {
          logger.getLogger().info({
            executionId,
            iteration,
            qualityScore: currentQualityScore,
            qualityThreshold: context.qualityThreshold,
          }, 'Quality threshold met, stopping iterations');
          break;
        }
      }

      if (!bestResult) {
        throw new Error('No successful workflow generation achieved in any iteration');
      }

      // Deploy final result if auto_activate is enabled
      if (metadata.autoActivate && bestResult.temporalWorkflowClass) {
        try {
          const deploymentEndpoint = await this.deployFinalWorkflow(
            bestResult.workflowId,
            bestResult.temporalWorkflowClass,
            metadata.deployEnvironment || 'development'
          );
          bestResult.deploymentEndpoint = deploymentEndpoint;
          bestResult.status = 'deployed';
        } catch (deployError) {
          logger.warn({ 
            executionId, 
            error: (deployError as Error).message 
          }, 'Failed to deploy final workflow');
        }
      }

      // Log execution completion
      const duration = Date.now() - startTime;
      bestResult.executionTime = duration;
      await this.logExecutionCompletion(executionId, bestResult, duration);

      logger.getLogger().info({
        executionId,
        workflowId,
        success: bestResult.success,
        iterations: bestResult.iterations,
        finalQualityScore: bestResult.finalQualityScore,
        temporalWorkflowClass: bestResult.temporalWorkflowClass,
        duration,
      }, 'Iterative Temporal workflow generation completed');

      return bestResult;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error(error as Error, {
        executionId,
        workflowId,
        requirements: requirements.substring(0, 50),
        duration,
      }, 'Iterative Temporal workflow generation failed');

      return {
        executionId,
        workflowId,
        status: 'failed',
        success: false,
        temporalWorkflowClass: '',
        qualityScores: {},
        iterations: 0,
        finalQualityScore: 0,
        improvementSuggestions: [],
        feedbackApplied: [],
        executionTime: duration,
        artifactsGenerated: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Enhance requirements with feedback from previous iterations
   */
  private enhanceRequirementsWithFeedback(
    originalRequirements: string,
    feedback: string[]
  ): string {
    if (feedback.length === 0) {
      return originalRequirements;
    }

    const enhancedRequirements = `${originalRequirements}

IMPROVEMENTS NEEDED BASED ON PREVIOUS ITERATIONS:
${feedback.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Please incorporate these improvements in the generated Temporal workflow.`;

    return enhancedRequirements;
  }

  /**
   * Get quality criteria for Temporal workflow assessment
   */
  private getQualityCriteria(): any[] {
    return [
      {
        name: 'Temporal Compliance',
        type: 'custom',
        description: 'Adherence to Temporal.io patterns and best practices',
        threshold: 0.8,
        weight: 0.3,
      },
      {
        name: 'Code Quality',
        type: 'accuracy',
        description: 'Overall code quality, structure, and readability',
        threshold: 0.8,
        weight: 0.25,
      },
      {
        name: 'Error Handling',
        type: 'completeness',
        description: 'Comprehensive error handling and retry policies',
        threshold: 0.8,
        weight: 0.2,
      },
      {
        name: 'Requirements Coverage',
        type: 'relevance',
        description: 'How well the workflow addresses the requirements',
        threshold: 0.85,
        weight: 0.25,
      },
    ];
  }

  /**
   * Deploy final workflow to Temporal Worker Service
   */
  private async deployFinalWorkflow(
    workflowId: string,
    temporalWorkflowClass: string,
    environment: string
  ): Promise<string> {
    try {
      const temporalWorkerUrl = process.env.TEMPORAL_WORKER_URL || 'http://localhost:8081';
      
      const response = await axios.post(`${temporalWorkerUrl}/temporal-worker/deploy-final`, {
        workflowId,
        workflowClass: temporalWorkflowClass,
        environment,
        autoStart: true,
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      return response.data.endpoint;

    } catch (error) {
      logger.error(error as Error, {
        workflowId,
        temporalWorkflowClass,
        environment,
      }, 'Failed to deploy final workflow');
      throw error;
    }
  }

  /**
   * Get available workflow templates
   */
  getWorkflowTemplates(): any[] {
    return this.temporalGenerator.getTemplates();
  }

  /**
   * Get specific workflow template
   */
  getWorkflowTemplate(templateId: string): any {
    return this.temporalGenerator.getTemplate(templateId);
  }

  /**
   * Log execution start
   */
  private async logExecutionStart(
    context: ExecutionContext,
    requirements: string,
    metadata: any
  ): Promise<void> {
    try {
      await this.database.query(`
        INSERT INTO workflow_executions (
          execution_id, workflow_id, status, started_at, input_data,
          trigger_source, user_id, correlation_id, metadata
        ) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8)
      `, [
        context.executionId,
        context.workflowId,
        'running',
        JSON.stringify({ requirements, ...context.inputData }),
        'temporal_generation',
        context.userId,
        context.correlationId,
        JSON.stringify(metadata),
      ]);
    } catch (error) {
      logger.error(error as Error, {
        executionId: context.executionId,
      }, 'Failed to log execution start');
    }
  }

  /**
   * Log execution completion
   */
  private async logExecutionCompletion(
    executionId: string,
    result: any,
    duration: number
  ): Promise<void> {
    try {
      await this.database.query(`
        UPDATE workflow_executions 
        SET status = $1, completed_at = NOW(), result = $2, 
            quality_score = $3, iterations = $4, error = $5
        WHERE execution_id = $6
      `, [
        result.success ? 'completed' : 'failed',
        JSON.stringify(result),
        result.finalQualityScore || 0,
        result.iterations || 0,
        result.error || null,
        executionId,
      ]);
    } catch (error) {
      logger.error(error as Error, {
        executionId,
      }, 'Failed to log execution completion');
    }
  }
}