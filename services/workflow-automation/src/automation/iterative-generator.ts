/**
 * Iterative Workflow Generator
 * Generates high-quality workflows through iterative improvement and feedback loops
 */

import { v4 as uuidv4 } from 'uuid';
import { createServiceLogger } from '../shared-utils-local';
import { TemporalWorkflowGenerator, type TemporalWorkflowGenerationRequest, type TemporalWorkflowGenerationResult } from '../templates/temporal-generator';
import { AutomationDatabase } from '../database/connection';

const logger = createServiceLogger('iterative-generator');

export interface IterativeGenerationRequest {
  requirements: string;
  workflowYaml?: string;
  templateId?: string;
  businessContext?: string;
  targetLanguage: 'python' | 'typescript';
  autoActivate?: boolean;
  maxIterations?: number;
  qualityThreshold?: number;
  priorityFocus?: string;
  acceptablePartialSuccess?: boolean;
  userPreferences?: Record<string, any>;
}

export interface IterativeGenerationResult {
  executionId: string;
  workflowId: string;
  status: 'completed' | 'failed' | 'running' | 'deployed';
  temporalWorkflowClass: string;
  generatedCodeUrl?: string;
  deploymentEndpoint?: string;
  deploymentUrl?: string;
  finalQualityScores: Record<string, number>;
  totalIterations: number;
  executionTime: number;
  artifactsGenerated: number;
  success: boolean;
  improvementHistory: IterationHistory[];
  feedbackApplied: string[];
}

export interface IterationHistory {
  iteration: number;
  qualityScores: Record<string, number>;
  improvements: string[];
  codeSize: number;
  timestamp: string;
  feedbackApplied: string[];
}

export interface QualityMetrics {
  syntax: number;
  completeness: number;
  temporalCompliance: number;
  errorHandling: number;
  documentation: number;
  testCoverage: number;
  performance: number;
  maintainability: number;
}

export class IterativeWorkflowGenerator {
  private temporalGenerator: TemporalWorkflowGenerator;
  private database: AutomationDatabase;

  constructor(database: AutomationDatabase) {
    this.database = database;
    this.temporalGenerator = new TemporalWorkflowGenerator(database);
  }

  /**
   * Generate workflow with iterative improvements
   */
  async generateIterativeWorkflow(request: IterativeGenerationRequest): Promise<IterativeGenerationResult> {
    const executionId = uuidv4();
    const workflowId = uuidv4();
    const startTime = Date.now();

    logger.getLogger().info({
      executionId,
      maxIterations: request.maxIterations,
      qualityThreshold: request.qualityThreshold,
      targetLanguage: request.targetLanguage,
    }, 'Starting iterative workflow generation');

    try {
      // Create execution tracking record
      await this.createExecutionRecord(executionId, request);

      let currentCode = '';
      let currentQuality = 0;
      let bestCode = '';
      let bestQuality = 0;
      let bestIteration = 0;
      
      const improvementHistory: IterationHistory[] = [];
      const feedbackApplied: string[] = [];
      const maxIterations = request.maxIterations || 5;
      const qualityThreshold = request.qualityThreshold || 0.85;

      for (let iteration = 1; iteration <= maxIterations; iteration++) {
        logger.getLogger().info({
          executionId,
          iteration,
          maxIterations,
          currentQuality,
          qualityThreshold,
        }, `Starting iteration ${iteration}`);

        try {
          // Update execution progress
          await this.updateExecutionProgress(executionId, iteration, maxIterations);

          // Generate enhanced requirements for this iteration
          const enhancedRequest = await this.enhanceRequirementsForIteration(
            request,
            iteration,
            improvementHistory,
            feedbackApplied
          );

          // Generate workflow using Temporal generator
          const generationResult = await this.temporalGenerator.generateWorkflow(enhancedRequest);

          if (!generationResult.success) {
            logger.warn({
              executionId,
              iteration,
              error: 'Generation failed for iteration',
            }, 'Iteration failed, continuing with next');
            continue;
          }

          currentCode = await this.getGeneratedCode(generationResult.workflowId);
          
          // Perform comprehensive quality assessment
          const qualityMetrics = await this.assessCodeQuality(currentCode, request.targetLanguage);
          const overallQuality = this.calculateOverallQuality(qualityMetrics);

          // Track this iteration
          const iterationHistory: IterationHistory = {
            iteration,
            qualityScores: qualityMetrics,
            improvements: await this.identifyImprovements(currentCode, bestCode, request.targetLanguage),
            codeSize: currentCode.length,
            timestamp: new Date().toISOString(),
            feedbackApplied: [...feedbackApplied],
          };
          
          improvementHistory.push(iterationHistory);

          // Check if this is the best version so far
          if (overallQuality > bestQuality) {
            bestCode = currentCode;
            bestQuality = overallQuality;
            bestIteration = iteration;
            
            logger.getLogger().info({
              executionId,
              iteration,
              qualityScore: overallQuality,
              previousBest: bestQuality,
            }, 'New best quality achieved');
          }

          currentQuality = overallQuality;

          // Apply feedback for next iteration if needed
          if (iteration < maxIterations && overallQuality < qualityThreshold) {
            const iterationFeedback = await this.generateIterationFeedback(
              qualityMetrics, 
              currentCode, 
              request
            );
            feedbackApplied.push(...iterationFeedback);
          }

          // Check if we've reached the quality threshold
          if (overallQuality >= qualityThreshold) {
            logger.getLogger().info({
              executionId,
              iteration,
              qualityScore: overallQuality,
              threshold: qualityThreshold,
            }, 'Quality threshold reached, stopping iterations');
            break;
          }

        } catch (iterationError) {
          logger.error(iterationError as Error, {
            executionId,
            iteration,
          }, 'Iteration failed with error');
          
          // Continue with next iteration unless it's the last one
          if (iteration === maxIterations && bestCode === '') {
            throw iterationError;
          }
        }
      }

      // Use the best code generated
      if (bestCode === '') {
        throw new Error('No successful iterations completed');
      }

      const finalQualityScores = await this.assessCodeQuality(bestCode, request.targetLanguage);
      const executionTime = Date.now() - startTime;

      // Deploy if requested
      let deploymentEndpoint: string | undefined;
      let deploymentUrl: string | undefined;
      let status: 'completed' | 'deployed' = 'completed';

      if (request.autoActivate) {
        try {
          deploymentEndpoint = await this.deployBestWorkflow(
            workflowId,
            bestCode,
            request.targetLanguage
          );
          deploymentUrl = deploymentEndpoint;
          status = 'deployed';
        } catch (deployError) {
          logger.error(deployError as Error, {
            executionId,
            workflowId,
          }, 'Deployment failed, but generation was successful');
          // Don't fail the entire process if deployment fails
        }
      }

      // Store final results
      await this.storeIterativeResult(executionId, {
        workflowId,
        bestCode,
        finalQualityScores,
        improvementHistory,
        bestIteration,
        totalIterations: improvementHistory.length,
        executionTime,
      });

      const result: IterativeGenerationResult = {
        executionId,
        workflowId,
        status,
        temporalWorkflowClass: this.extractWorkflowClassName(bestCode),
        generatedCodeUrl: `/workflow-automation/api/workflows/${workflowId}/code`,
        deploymentEndpoint,
        deploymentUrl,
        finalQualityScores,
        totalIterations: improvementHistory.length,
        executionTime,
        artifactsGenerated: improvementHistory.length + (deploymentEndpoint ? 1 : 0),
        success: true,
        improvementHistory,
        feedbackApplied,
      };

      logger.getLogger().info({
        executionId,
        workflowId,
        totalIterations: result.totalIterations,
        finalQualityScore: this.calculateOverallQuality(finalQualityScores),
        bestIteration,
        executionTime,
      }, 'Iterative workflow generation completed successfully');

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      logger.error(error as Error, {
        executionId,
        executionTime,
      }, 'Iterative workflow generation failed');

      // Update execution record with failure
      await this.markExecutionFailed(executionId, (error as Error).message);

      return {
        executionId,
        workflowId,
        status: 'failed',
        temporalWorkflowClass: '',
        finalQualityScores: {},
        totalIterations: 0,
        executionTime,
        artifactsGenerated: 0,
        success: false,
        improvementHistory: [],
        feedbackApplied: [],
      };
    }
  }

  /**
   * Enhance requirements for specific iteration
   */
  private async enhanceRequirementsForIteration(
    baseRequest: IterativeGenerationRequest,
    iteration: number,
    history: IterationHistory[],
    feedbackApplied: string[]
  ): Promise<TemporalWorkflowGenerationRequest> {
    let enhancedRequirements = baseRequest.requirements;

    // Add iteration-specific enhancements
    if (iteration > 1) {
      const lastHistory = history[history.length - 1];
      if (lastHistory) {
        enhancedRequirements += `\n\nIMPROVEMENT FOCUS FOR ITERATION ${iteration}:`;
        
        // Add specific improvement areas based on previous quality scores
        const qualityScores = lastHistory.qualityScores;
        const improvementAreas: string[] = [];

        if ((qualityScores.syntax || 0) < 0.9) {
          improvementAreas.push('- Fix syntax errors and improve code structure');
        }
        if ((qualityScores.temporalCompliance || 0) < 0.8) {
          improvementAreas.push('- Enhance Temporal.io workflow compliance and patterns');
        }
        if ((qualityScores.errorHandling || 0) < 0.7) {
          improvementAreas.push('- Add comprehensive error handling and retry logic');
        }
        if ((qualityScores.documentation || 0) < 0.6) {
          improvementAreas.push('- Improve code documentation and comments');
        }
        if ((qualityScores.testCoverage || 0) < 0.5) {
          improvementAreas.push('- Add comprehensive test coverage');
        }

        enhancedRequirements += '\n' + improvementAreas.join('\n');
      }
    }

    // Add applied feedback context
    if (feedbackApplied.length > 0) {
      enhancedRequirements += '\n\nPREVIOUS FEEDBACK APPLIED:';
      enhancedRequirements += '\n' + feedbackApplied.slice(-3).join('\n'); // Last 3 feedback items
    }

    return {
      requirements: enhancedRequirements,
      workflowYaml: baseRequest.workflowYaml,
      templateId: baseRequest.templateId,
      businessContext: baseRequest.businessContext,
      targetLanguage: baseRequest.targetLanguage,
      autoActivate: false, // Don't auto-deploy intermediate iterations
      deployEnvironment: 'development',
    };
  }

  /**
   * Assess comprehensive code quality
   */
  private async assessCodeQuality(code: string, language: 'python' | 'typescript'): Promise<QualityMetrics> {
    const metrics: QualityMetrics = {
      syntax: 0,
      completeness: 0,
      temporalCompliance: 0,
      errorHandling: 0,
      documentation: 0,
      testCoverage: 0,
      performance: 0,
      maintainability: 0,
    };

    // Syntax quality
    metrics.syntax = this.assessSyntaxQuality(code, language);

    // Completeness
    metrics.completeness = this.assessCompleteness(code);

    // Temporal compliance
    metrics.temporalCompliance = this.assessTemporalCompliance(code);

    // Error handling
    metrics.errorHandling = this.assessErrorHandling(code);

    // Documentation
    metrics.documentation = this.assessDocumentation(code);

    // Test coverage (approximate)
    metrics.testCoverage = this.assessTestCoverage(code);

    // Performance considerations
    metrics.performance = this.assessPerformance(code);

    // Maintainability
    metrics.maintainability = this.assessMaintainability(code);

    return metrics;
  }

  private assessSyntaxQuality(code: string, language: 'python' | 'typescript'): number {
    let score = 1.0;

    // Basic syntax checks
    if (language === 'python') {
      // Check for proper indentation patterns
      const lines = code.split('\n');
      let indentationIssues = 0;
      
      for (const line of lines) {
        if (line.trim() && !line.match(/^[ \t]*(#|$)/)) {
          // Check for mixed tabs and spaces (simplified)
          if (line.includes('\t') && line.includes('    ')) {
            indentationIssues++;
          }
        }
      }
      
      score -= Math.min(0.3, indentationIssues * 0.1);
      
      // Check for common Python patterns
      if (!code.includes('import') && code.length > 100) score -= 0.1;
      if (!code.includes('def ') && code.length > 50) score -= 0.2;
      
    } else if (language === 'typescript') {
      // Check for TypeScript/JavaScript patterns
      if (!code.includes('export') && !code.includes('function') && code.length > 100) {
        score -= 0.2;
      }
      
      // Check for semicolons (good practice)
      const statementLines = code.split('\n').filter(line => 
        line.trim() && 
        !line.trim().startsWith('//') && 
        !line.trim().startsWith('*') &&
        line.includes('=') || line.includes('return') || line.includes('await')
      );
      
      const missingSemicolons = statementLines.filter(line => !line.trim().endsWith(';')).length;
      score -= Math.min(0.2, missingSemicolons * 0.02);
    }

    return Math.max(0, score);
  }

  private assessCompleteness(code: string): number {
    let score = 0.5; // Base score

    // Check for essential workflow components
    if (code.includes('@workflow') || code.includes('workflow.')) score += 0.2;
    if (code.includes('@activity') || code.includes('activity.')) score += 0.2;
    if (code.includes('try') && code.includes('except') || code.includes('catch')) score += 0.1;

    return Math.min(1.0, score);
  }

  private assessTemporalCompliance(code: string): number {
    let score = 0;

    // Check for Temporal-specific imports and decorators
    if (code.includes('temporalio') || code.includes('@temporalio')) score += 0.3;
    if (code.includes('@workflow.defn') || code.includes('workflow.defn')) score += 0.3;
    if (code.includes('@activity.defn') || code.includes('activity.defn')) score += 0.2;
    if (code.includes('workflow.execute_activity') || code.includes('executeActivity')) score += 0.2;

    return Math.min(1.0, score);
  }

  private assessErrorHandling(code: string): number {
    let score = 0;

    if (code.includes('try') || code.includes('catch')) score += 0.3;
    if (code.includes('except') || code.includes('finally')) score += 0.2;
    if (code.includes('retry') || code.includes('RetryPolicy')) score += 0.2;
    if (code.includes('timeout') || code.includes('TimeoutError')) score += 0.2;
    if (code.includes('logger') || code.includes('log.')) score += 0.1;

    return Math.min(1.0, score);
  }

  private assessDocumentation(code: string): number {
    let score = 0;

    const docStringPatterns = /"""[\s\S]*?"""|'''[\s\S]*?'''|\/\*\*[\s\S]*?\*\//g;
    const docStrings = code.match(docStringPatterns) || [];
    
    if (docStrings.length > 0) score += 0.4;
    if (docStrings.length > 2) score += 0.2;

    // Check for comments
    const commentLines = code.split('\n').filter(line => 
      line.trim().startsWith('#') || line.trim().startsWith('//')
    );
    
    if (commentLines.length > 2) score += 0.2;
    if (commentLines.length > 5) score += 0.2;

    return Math.min(1.0, score);
  }

  private assessTestCoverage(code: string): number {
    let score = 0;

    if (code.includes('test') || code.includes('Test')) score += 0.3;
    if (code.includes('assert') || code.includes('expect')) score += 0.3;
    if (code.includes('pytest') || code.includes('jest') || code.includes('unittest')) score += 0.2;
    if (code.includes('mock') || code.includes('Mock')) score += 0.2;

    return Math.min(1.0, score);
  }

  private assessPerformance(code: string): number {
    let score = 0.7; // Default reasonable score

    // Check for performance considerations
    if (code.includes('async') || code.includes('await')) score += 0.2;
    if (code.includes('concurrent') || code.includes('parallel')) score += 0.1;
    
    // Penalize obvious performance issues
    if (code.includes('time.sleep') && !code.includes('workflow.sleep')) score -= 0.2;
    if (code.match(/for.*in.*range.*:\s*time\.sleep/)) score -= 0.3;

    return Math.max(0, Math.min(1.0, score));
  }

  private assessMaintainability(code: string): number {
    let score = 0.6; // Base score

    // Check for good practices
    if (code.includes('class ')) score += 0.1;
    if (code.includes('def ') || code.includes('function ')) score += 0.1;
    
    // Check line length (approximate)
    const longLines = code.split('\n').filter(line => line.length > 120).length;
    if (longLines > 0) score -= Math.min(0.2, longLines * 0.02);

    // Check for magic numbers (very basic)
    const magicNumbers = code.match(/[^a-zA-Z_]\d{3,}/g) || [];
    if (magicNumbers.length > 2) score -= 0.1;

    return Math.max(0, Math.min(1.0, score));
  }

  private calculateOverallQuality(metrics: QualityMetrics): number {
    const weights = {
      syntax: 0.2,
      completeness: 0.2,
      temporalCompliance: 0.2,
      errorHandling: 0.15,
      documentation: 0.1,
      testCoverage: 0.05,
      performance: 0.05,
      maintainability: 0.05,
    };

    let weightedSum = 0;
    let totalWeights = 0;

    for (const [metric, value] of Object.entries(metrics)) {
      const weight = weights[metric as keyof typeof weights] || 0;
      weightedSum += value * weight;
      totalWeights += weight;
    }

    return totalWeights > 0 ? weightedSum / totalWeights : 0;
  }

  // Helper methods for database operations and other utilities...

  private async createExecutionRecord(executionId: string, request: IterativeGenerationRequest): Promise<void> {
    try {
      await this.database.query(`
        INSERT INTO workflow_generation_executions (
          execution_id, status, requirements, target_language, 
          max_iterations, quality_threshold, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        executionId,
        'running',
        request.requirements,
        request.targetLanguage,
        request.maxIterations || 5,
        request.qualityThreshold || 0.85,
      ]);
    } catch (error) {
      logger.error(error as Error, { executionId }, 'Failed to create execution record');
      // Don't fail the entire process for database issues
    }
  }

  private async updateExecutionProgress(executionId: string, currentIteration: number, maxIterations: number): Promise<void> {
    try {
      const progress = (currentIteration - 1) / maxIterations;
      await this.database.query(`
        UPDATE workflow_generation_executions 
        SET current_iteration = $1, progress = $2, updated_at = NOW()
        WHERE execution_id = $3
      `, [currentIteration, progress, executionId]);
    } catch (error) {
      logger.warn(error as Error, { executionId }, 'Failed to update execution progress');
    }
  }

  private async markExecutionFailed(executionId: string, errorMessage: string): Promise<void> {
    try {
      await this.database.query(`
        UPDATE workflow_generation_executions 
        SET status = 'failed', error_message = $1, updated_at = NOW()
        WHERE execution_id = $2
      `, [errorMessage, executionId]);
    } catch (error) {
      logger.warn(error as Error, { executionId }, 'Failed to mark execution as failed');
    }
  }

  private async getGeneratedCode(workflowId: string): Promise<string> {
    // This would retrieve the generated code from wherever it's stored
    // For now, return a placeholder
    return `# Generated workflow code for ${workflowId}\n# Implementation would be retrieved from storage`;
  }

  private async identifyImprovements(currentCode: string, previousCode: string, language: string): Promise<string[]> {
    const improvements: string[] = [];
    
    if (currentCode.length > previousCode.length) {
      improvements.push('Expanded code with additional functionality');
    }
    
    if (currentCode.includes('try') && !previousCode.includes('try')) {
      improvements.push('Added error handling');
    }
    
    if (currentCode.includes('"""') && !previousCode.includes('"""')) {
      improvements.push('Added documentation');
    }
    
    return improvements;
  }

  private async generateIterationFeedback(
    qualityMetrics: QualityMetrics,
    currentCode: string,
    request: IterativeGenerationRequest
  ): Promise<string[]> {
    const feedback: string[] = [];
    
    if (qualityMetrics.syntax < 0.8) {
      feedback.push('Focus on improving code syntax and structure');
    }
    
    if (qualityMetrics.temporalCompliance < 0.7) {
      feedback.push('Enhance Temporal.io workflow compliance and best practices');
    }
    
    if (qualityMetrics.errorHandling < 0.6) {
      feedback.push('Add comprehensive error handling and retry mechanisms');
    }
    
    return feedback;
  }

  private async deployBestWorkflow(workflowId: string, code: string, language: string): Promise<string> {
    // This would deploy to the Temporal Worker Service
    // For now, return a mock endpoint
    return `http://temporal-worker:8081/workflows/${workflowId}/execute`;
  }

  private async storeIterativeResult(executionId: string, result: any): Promise<void> {
    try {
      await this.database.query(`
        UPDATE workflow_generation_executions 
        SET 
          status = 'completed',
          final_quality_scores = $1,
          total_iterations = $2,
          execution_time = $3,
          completed_at = NOW()
        WHERE execution_id = $4
      `, [
        JSON.stringify(result.finalQualityScores),
        result.totalIterations,
        result.executionTime,
        executionId,
      ]);
    } catch (error) {
      logger.warn(error as Error, { executionId }, 'Failed to store iterative result');
    }
  }

  private extractWorkflowClassName(code: string): string {
    // Extract workflow class name from generated code
    const pythonMatch = code.match(/class\s+(\w+Workflow)/);
    if (pythonMatch) {
      return pythonMatch[1];
    }
    
    const tsMatch = code.match(/export\s+(?:async\s+)?function\s+(\w+)/);
    if (tsMatch) {
      return tsMatch[1];
    }
    
    return 'GeneratedWorkflow';
  }
}