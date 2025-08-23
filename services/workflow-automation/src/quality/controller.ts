/**
 * Quality Controller - AI-driven quality assessment and improvement
 * Evaluates workflow outputs against configurable criteria
 */

import axios from 'axios';
import { createServiceLogger } from '../shared-utils-local';
import { AutomationDatabase } from '../database/connection';
import { ExecutionContext, QualityCriteria } from '../automation/engine';

const logger = createServiceLogger('quality-controller');

export interface QualityAssessment {
  overallScore: number;
  passed: boolean;
  criteriaResults: CriteriaResult[];
  feedback: string;
  suggestions: string[];
  assessedAt: Date;
}

export interface CriteriaResult {
  name: string;
  type: string;
  score: number;
  weight: number;
  passed: boolean;
  details: Record<string, any>;
  feedback?: string;
}

export class QualityController {
  private database: AutomationDatabase;
  private environment: any;
  private aiGatewayUrl: string;

  constructor(database: AutomationDatabase, environment: any) {
    this.database = database;
    this.environment = environment;
    this.aiGatewayUrl = process.env.AI_GATEWAY_URL || 'http://localhost:8090';
  }

  /**
   * Assess quality of workflow results against criteria
   */
  async assessQuality(
    context: ExecutionContext,
    results: any,
    criteria: QualityCriteria[]
  ): Promise<QualityAssessment> {
    const startTime = Date.now();

    try {
      logger.getLogger().info({
        executionId: context.executionId,
        iteration: context.currentIteration,
        criteriaCount: criteria.length,
      }, 'Starting quality assessment');

      // Assess each criterion
      const criteriaResults: CriteriaResult[] = [];
      for (const criterion of criteria) {
        const result = await this.assessCriterion(criterion, results, context);
        criteriaResults.push(result);
      }

      // Calculate overall score (weighted average)
      const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
      const weightedScore = criteriaResults.reduce((sum, r) => sum + (r.score * r.weight), 0);
      const overallScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

      // Determine if quality passes
      const passed = overallScore >= context.qualityThreshold &&
                    criteriaResults.every(r => r.passed || r.weight === 0);

      // Generate feedback and suggestions
      const feedback = await this.generateQualityFeedback(context, results, criteriaResults);
      const suggestions = await this.generateImprovementSuggestions(context, criteriaResults);

      const assessment: QualityAssessment = {
        overallScore,
        passed,
        criteriaResults,
        feedback: feedback || 'No specific feedback available',
        suggestions: suggestions || [],
        assessedAt: new Date(),
      };

      // Log assessment to database
      await this.logQualityAssessment(context, assessment);

      const duration = Date.now() - startTime;
      logger.getLogger().info({
        executionId: context.executionId,
        iteration: context.currentIteration,
        overallScore,
        passed,
        duration,
      }, 'Quality assessment completed');

      return assessment;

    } catch (error) {
      logger.error(error as Error, {
        executionId: context.executionId,
        iteration: context.currentIteration,
      }, 'Quality assessment failed');

      // Return a default failing assessment
      return {
        overallScore: 0,
        passed: false,
        criteriaResults: [],
        feedback: `Quality assessment failed: ${(error as Error).message}`,
        suggestions: ['Fix quality assessment errors and retry'],
        assessedAt: new Date(),
      };
    }
  }

  /**
   * Assess a single quality criterion
   */
  private async assessCriterion(
    criterion: QualityCriteria,
    results: any,
    context: ExecutionContext
  ): Promise<CriteriaResult> {
    try {
      switch (criterion.type) {
        case 'accuracy':
          return await this.assessAccuracy(criterion, results, context);
        case 'completeness':
          return await this.assessCompleteness(criterion, results, context);
        case 'relevance':
          return await this.assessRelevance(criterion, results, context);
        case 'consistency':
          return await this.assessConsistency(criterion, results, context);
        case 'format':
          return await this.assessFormat(criterion, results, context);
        case 'custom':
          return await this.assessCustom(criterion, results, context);
        default:
          throw new Error(`Unknown criterion type: ${criterion.type}`);
      }
    } catch (error) {
      logger.error(error as Error, {
        criterionName: criterion.name,
        criterionType: criterion.type,
      }, 'Criterion assessment failed');

      return {
        name: criterion.name,
        type: criterion.type,
        score: 0,
        weight: criterion.weight,
        passed: false,
        details: { error: (error as Error).message },
        feedback: `Assessment failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Assess accuracy using AI
   */
  private async assessAccuracy(
    criterion: QualityCriteria,
    results: any,
    context: ExecutionContext
  ): Promise<CriteriaResult> {
    const prompt = `
      Assess the accuracy of the following results based on the criteria:
      
      Criterion: ${criterion.name}
      Description: ${criterion.description}
      
      Results to assess:
      ${JSON.stringify(results, null, 2)}
      
      Rate accuracy from 0.0 to 1.0 and explain your reasoning.
      Respond in JSON format: {"score": 0.85, "reasoning": "explanation"}
    `;

    const aiResponse = await this.callAIForAssessment(prompt, context);
    const score = Math.max(0, Math.min(1, aiResponse.score || 0));

    return {
      name: criterion.name,
      type: criterion.type,
      score,
      weight: criterion.weight,
      passed: score >= criterion.threshold,
      details: {
        reasoning: aiResponse.reasoning,
        threshold: criterion.threshold,
      },
    };
  }

  /**
   * Assess completeness
   */
  private async assessCompleteness(
    criterion: QualityCriteria,
    results: any,
    context: ExecutionContext
  ): Promise<CriteriaResult> {
    // Check for required fields/keys
    let completenessScore = 1.0;
    const details: Record<string, any> = {};

    if (typeof results === 'object' && results !== null) {
      const resultKeys = Object.keys(results);
      details.foundKeys = resultKeys;
      details.keyCount = resultKeys.length;

      // Simple completeness check based on non-empty values
      const nonEmptyValues = resultKeys.filter(key => {
        const value = results[key];
        return value !== null && value !== undefined && value !== '';
      });

      completenessScore = resultKeys.length > 0 ? nonEmptyValues.length / resultKeys.length : 0;
      details.nonEmptyCount = nonEmptyValues.length;
    } else {
      completenessScore = results ? 1.0 : 0.0;
      details.hasValue = !!results;
    }

    return {
      name: criterion.name,
      type: criterion.type,
      score: completenessScore,
      weight: criterion.weight,
      passed: completenessScore >= criterion.threshold,
      details,
    };
  }

  /**
   * Assess relevance using AI
   */
  private async assessRelevance(
    criterion: QualityCriteria,
    results: any,
    context: ExecutionContext
  ): Promise<CriteriaResult> {
    const prompt = `
      Assess how relevant these results are to the original task:
      
      Original Input: ${JSON.stringify(context.inputData, null, 2)}
      Results: ${JSON.stringify(results, null, 2)}
      
      Criterion: ${criterion.name} - ${criterion.description}
      
      Rate relevance from 0.0 to 1.0 and explain your reasoning.
      Respond in JSON format: {"score": 0.9, "reasoning": "explanation"}
    `;

    const aiResponse = await this.callAIForAssessment(prompt, context);
    const score = Math.max(0, Math.min(1, aiResponse.score || 0));

    return {
      name: criterion.name,
      type: criterion.type,
      score,
      weight: criterion.weight,
      passed: score >= criterion.threshold,
      details: {
        reasoning: aiResponse.reasoning,
        originalInput: context.inputData,
      },
    };
  }

  /**
   * Assess consistency
   */
  private async assessConsistency(
    criterion: QualityCriteria,
    results: any,
    context: ExecutionContext
  ): Promise<CriteriaResult> {
    // Check internal consistency of results
    let consistencyScore = 1.0;
    const details: Record<string, any> = {};

    if (typeof results === 'object' && results !== null) {
      // Check for conflicting information
      const values = Object.values(results);
      const stringValues = values.filter(v => typeof v === 'string');
      
      // Simple consistency check - no obvious contradictions
      details.valueTypes = values.map(v => typeof v);
      details.hasConflictingTypes = new Set(details.valueTypes).size > 1 && details.valueTypes.length > 1;
      
      if (details.hasConflictingTypes) {
        consistencyScore = 0.8;
      }
    }

    return {
      name: criterion.name,
      type: criterion.type,
      score: consistencyScore,
      weight: criterion.weight,
      passed: consistencyScore >= criterion.threshold,
      details,
    };
  }

  /**
   * Assess format compliance
   */
  private async assessFormat(
    criterion: QualityCriteria,
    results: any,
    context: ExecutionContext
  ): Promise<CriteriaResult> {
    let formatScore = 1.0;
    const details: Record<string, any> = {};

    try {
      // Basic format validation
      if (typeof results === 'string') {
        // Check if it's valid JSON if expected
        if (criterion.description.includes('JSON')) {
          try {
            JSON.parse(results);
            details.validJSON = true;
          } catch {
            formatScore = 0.5;
            details.validJSON = false;
          }
        }
      } else if (typeof results === 'object') {
        details.isObject = true;
        details.hasKeys = Object.keys(results).length > 0;
      }

      details.actualType = typeof results;
    } catch (error) {
      formatScore = 0;
      details.error = (error as Error).message;
    }

    return {
      name: criterion.name,
      type: criterion.type,
      score: formatScore,
      weight: criterion.weight,
      passed: formatScore >= criterion.threshold,
      details,
    };
  }

  /**
   * Assess custom criteria using AI
   */
  private async assessCustom(
    criterion: QualityCriteria,
    results: any,
    context: ExecutionContext
  ): Promise<CriteriaResult> {
    const prompt = `
      Assess the following results against this custom criterion:
      
      Criterion: ${criterion.name}
      Description: ${criterion.description}
      Threshold: ${criterion.threshold}
      
      Results to assess:
      ${JSON.stringify(results, null, 2)}
      
      Provide a score from 0.0 to 1.0 and detailed reasoning.
      Respond in JSON format: {"score": 0.75, "reasoning": "detailed explanation"}
    `;

    const aiResponse = await this.callAIForAssessment(prompt, context);
    const score = Math.max(0, Math.min(1, aiResponse.score || 0));

    return {
      name: criterion.name,
      type: criterion.type,
      score,
      weight: criterion.weight,
      passed: score >= criterion.threshold,
      details: {
        reasoning: aiResponse.reasoning,
        customCriterion: true,
      },
    };
  }

  /**
   * Call AI for assessment
   */
  private async callAIForAssessment(
    prompt: string,
    context: ExecutionContext
  ): Promise<{ score: number; reasoning: string }> {
    try {
      const response = await axios.post(`${this.aiGatewayUrl}/ai-gateway/chat`, {
        model: 'default',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1, // Low temperature for consistent assessment
        max_tokens: 500,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': context.executionId,
        },
        timeout: 30000,
      });

      // Try to parse JSON response
      try {
        const parsed = JSON.parse(response.data.response);
        return {
          score: parsed.score || 0,
          reasoning: parsed.reasoning || response.data.response,
        };
      } catch {
        // Fallback to text parsing
        return {
          score: 0.5, // Default middle score if can't parse
          reasoning: response.data.response,
        };
      }
    } catch (error) {
      logger.error(error as Error, {
        executionId: context.executionId,
      }, 'AI assessment call failed');

      return {
        score: 0,
        reasoning: `AI assessment failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Generate quality feedback
   */
  private async generateQualityFeedback(
    context: ExecutionContext,
    results: any,
    criteriaResults: CriteriaResult[]
  ): Promise<string | null> {
    try {
      const failedCriteria = criteriaResults.filter(r => !r.passed);
      
      if (failedCriteria.length === 0) {
        return 'All quality criteria passed successfully.';
      }

      const prompt = `
        Provide constructive feedback for improving workflow results based on failed criteria:
        
        Failed Criteria:
        ${failedCriteria.map(c => `- ${c.name}: Score ${c.score}, needed ${c.weight * 0.8}`).join('\n')}
        
        Current Results:
        ${JSON.stringify(results, null, 2)}
        
        Provide specific, actionable feedback in 2-3 sentences.
      `;

      const response = await axios.post(`${this.aiGatewayUrl}/ai-gateway/chat`, {
        model: 'default',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 300,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': context.executionId,
        },
        timeout: 30000,
      });

      return response.data.response;

    } catch (error) {
      logger.error(error as Error, { executionId: context.executionId }, 'Failed to generate quality feedback');
      return null;
    }
  }

  /**
   * Generate improvement suggestions
   */
  private async generateImprovementSuggestions(
    context: ExecutionContext,
    criteriaResults: CriteriaResult[]
  ): Promise<string[]> {
    const suggestions: string[] = [];
    
    for (const result of criteriaResults) {
      if (!result.passed) {
        switch (result.type) {
          case 'accuracy':
            suggestions.push(`Improve accuracy for ${result.name}: Provide more specific requirements`);
            break;
          case 'completeness':
            suggestions.push(`Increase completeness for ${result.name}: Add missing required fields`);
            break;
          case 'relevance':
            suggestions.push(`Enhance relevance for ${result.name}: Focus more on the core requirements`);
            break;
          case 'consistency':
            suggestions.push(`Fix consistency issues in ${result.name}: Resolve contradictory information`);
            break;
          case 'format':
            suggestions.push(`Correct format for ${result.name}: Follow the specified output format`);
            break;
          default:
            suggestions.push(`Address issues with ${result.name}: Score ${result.score} below threshold`);
        }
      }
    }

    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }

  /**
   * Log quality assessment to database
   */
  private async logQualityAssessment(
    context: ExecutionContext,
    assessment: QualityAssessment
  ): Promise<void> {
    try {
      await this.database.query(`
        INSERT INTO quality_assessments (
          execution_id, iteration, assessment_type, criteria, results,
          overall_score, passed, feedback_for_improvement, assessor
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        context.executionId,
        context.currentIteration,
        'automated',
        JSON.stringify(assessment.criteriaResults),
        JSON.stringify({ feedback: assessment.feedback, suggestions: assessment.suggestions }),
        assessment.overallScore,
        assessment.passed,
        assessment.feedback,
        'quality-controller',
      ]);
    } catch (error) {
      logger.error(error as Error, {
        executionId: context.executionId,
      }, 'Failed to log quality assessment');
    }
  }
}