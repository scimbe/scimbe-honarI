/**
 * Iterative AI Workflow Generator with Context Collection
 * Implements intelligent iteration and continuous improvement
 */

import { FastifyBaseLogger } from 'fastify';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { MultiLevelWorkflowCache } from '../cache/workflow-cache';

export interface IterativeWorkflowRequest {
  customer_requirements: string;
  business_context: string;
  target_platform: 'temporal' | 'generic';
  quality_criteria: {
    performance_threshold: number;
    reliability_threshold: number;
    maintainability_threshold: number;
    security_threshold: number;
  };
  max_iterations: number;
  feedback_loops: boolean;
  custom_constraints?: Record<string, any>;
}

export interface IterationContext {
  iteration_number: number;
  previous_attempts: WorkflowAttempt[];
  learned_patterns: string[];
  quality_feedback: QualityFeedback[];
  performance_metrics: PerformanceMetrics;
  customer_satisfaction: number;
  improvement_suggestions: string[];
}

export interface WorkflowAttempt {
  attempt_id: string;
  generated_code: string;
  quality_scores: QualityScores;
  issues_identified: string[];
  timestamp: number;
  ai_reasoning: string;
}

export interface QualityFeedback {
  category: 'performance' | 'reliability' | 'maintainability' | 'security' | 'functionality';
  score: number;
  feedback: string;
  suggestions: string[];
  critical_issues: string[];
}

export interface QualityScores {
  performance: number;
  reliability: number;
  maintainability: number;
  security: number;
  functionality: number;
  overall: number;
}

export interface PerformanceMetrics {
  generation_time_ms: number;
  code_lines: number;
  complexity_score: number;
  test_coverage: number;
  estimated_execution_time_ms: number;
}

export class IterativeWorkflowGenerator {
  private logger: FastifyBaseLogger;
  private aiEndpoint: string;
  private cache: MultiLevelWorkflowCache | null;
  private contextDatabase: any;

  constructor(logger: FastifyBaseLogger, contextDatabase: any, cache?: MultiLevelWorkflowCache) {
    this.logger = logger;
    this.aiEndpoint = 'http://host.docker.internal:4000/openai/v1/chat/completions';
    this.cache = cache || null;
    this.contextDatabase = contextDatabase;
  }

  /**
   * Main iterative workflow generation process
   */
  async generateWorkflowIteratively(request: IterativeWorkflowRequest): Promise<any> {
    const sessionId = uuidv4();
    const startTime = Date.now();

    this.logger.info(`Starting iterative workflow generation session: ${sessionId}`);

    let context: IterationContext = {
      iteration_number: 0,
      previous_attempts: [],
      learned_patterns: await this.loadLearnedPatterns(request),
      quality_feedback: [],
      performance_metrics: {
        generation_time_ms: 0,
        code_lines: 0,
        complexity_score: 0,
        test_coverage: 0,
        estimated_execution_time_ms: 0
      },
      customer_satisfaction: 0,
      improvement_suggestions: []
    };

    let bestAttempt: WorkflowAttempt | null = null;
    let convergenceReached = false;

    for (let iteration = 1; iteration <= request.max_iterations && !convergenceReached; iteration++) {
      context.iteration_number = iteration;
      
      this.logger.info(`Starting iteration ${iteration}/${request.max_iterations}`);

      try {
        // Generate workflow for this iteration
        const attempt = await this.generateSingleIteration(request, context, sessionId);
        context.previous_attempts.push(attempt);

        // Evaluate quality and collect feedback
        const qualityFeedback = await this.evaluateQuality(attempt, request.quality_criteria);
        context.quality_feedback.push(...qualityFeedback);

        // Update best attempt
        if (!bestAttempt || attempt.quality_scores.overall > bestAttempt.quality_scores.overall) {
          bestAttempt = attempt;
        }

        // Check convergence criteria
        convergenceReached = await this.checkConvergence(attempt, request.quality_criteria, context);

        // Collect and learn from this iteration
        await this.collectIterationContext(sessionId, iteration, attempt, qualityFeedback, context);

        // Generate improvement suggestions for next iteration
        if (!convergenceReached && iteration < request.max_iterations) {
          context.improvement_suggestions = await this.generateImprovementSuggestions(context, request);
          this.logger.info(`Generated ${context.improvement_suggestions.length} improvement suggestions`);
        }

      } catch (error) {
        this.logger.error(`Iteration ${iteration} failed: ${error}`);
        // Continue with next iteration unless it's the last one
        if (iteration === request.max_iterations) {
          throw error;
        }
      }
    }

    if (!bestAttempt) {
      throw new Error('No successful workflow generation attempts');
    }

    // Create final workflow package
    const finalWorkflow = await this.createTemporalWorkflow(bestAttempt, request, context);

    // Store learning outcomes
    await this.storeLearnedPatterns(request, context, bestAttempt);

    const totalTime = Date.now() - startTime;
    
    this.logger.info(`Iterative generation completed in ${totalTime}ms with ${context.iteration_number} iterations`);

    return {
      session_id: sessionId,
      workflow: finalWorkflow,
      generation_summary: {
        total_iterations: context.iteration_number,
        convergence_reached: convergenceReached,
        total_time_ms: totalTime,
        final_quality_scores: bestAttempt.quality_scores,
        improvement_achieved: this.calculateImprovement(context),
        learned_patterns: context.learned_patterns.length
      },
      context: context
    };
  }

  /**
   * Generate a single iteration attempt
   */
  private async generateSingleIteration(
    request: IterativeWorkflowRequest, 
    context: IterationContext, 
    sessionId: string
  ): Promise<WorkflowAttempt> {
    const attemptId = `${sessionId}_${context.iteration_number}`;
    const iterationStart = Date.now();

    // Build context-aware prompt
    const prompt = this.buildIterativePrompt(request, context);

    // Call AI endpoint
    const aiResponse = await this.callAI(prompt, {
      model: 'vscode-lm-proxy',
      temperature: 0.3,
      max_tokens: 4000
    });

    // Parse and analyze the generated code
    const generatedCode = this.extractCodeFromResponse(aiResponse);
    const qualityScores = await this.analyzeCodeQuality(generatedCode, request);
    const issues = await this.identifyIssues(generatedCode, request);

    const attempt: WorkflowAttempt = {
      attempt_id: attemptId,
      generated_code: generatedCode,
      quality_scores: qualityScores,
      issues_identified: issues,
      timestamp: Date.now(),
      ai_reasoning: aiResponse.reasoning || 'AI reasoning not provided'
    };

    const iterationTime = Date.now() - iterationStart;
    this.logger.info(`Iteration ${context.iteration_number} completed in ${iterationTime}ms with quality score: ${qualityScores.overall}`);

    return attempt;
  }

  /**
   * Build context-aware prompt for AI
   */
  private buildIterativePrompt(request: IterativeWorkflowRequest, context: IterationContext): string {
    let prompt = `You are an expert Temporal workflow developer. Create a production-ready workflow based on these requirements:

CUSTOMER REQUIREMENTS:
${request.customer_requirements}

BUSINESS CONTEXT:
${request.business_context}

TARGET PLATFORM: ${request.target_platform}

QUALITY CRITERIA:
- Performance threshold: ${request.quality_criteria.performance_threshold}
- Reliability threshold: ${request.quality_criteria.reliability_threshold}
- Maintainability threshold: ${request.quality_criteria.maintainability_threshold}
- Security threshold: ${request.quality_criteria.security_threshold}
`;

    // Add context from previous iterations
    if (context.iteration_number > 1) {
      prompt += `\nPREVIOUS ITERATIONS CONTEXT:
This is iteration ${context.iteration_number}. Previous attempts had these issues:
`;
      
      context.previous_attempts.forEach((attempt, index) => {
        prompt += `\nAttempt ${index + 1} (Quality: ${attempt.quality_scores.overall.toFixed(2)}):
Issues: ${attempt.issues_identified.join(', ')}
`;
      });

      if (context.improvement_suggestions.length > 0) {
        prompt += `\nIMPROVEMENT SUGGESTIONS:
${context.improvement_suggestions.join('\n')}
`;
      }

      if (context.learned_patterns.length > 0) {
        prompt += `\nLEARNED PATTERNS:
${context.learned_patterns.slice(0, 5).join('\n')}
`;
      }
    }

    prompt += `\nGENERATE:
1. Complete Temporal workflow class with activities
2. Error handling and retry logic
3. Comprehensive logging
4. Input validation
5. Performance optimizations

Respond with valid TypeScript code for Temporal workflows. Include your reasoning for design decisions.

CODE:`;

    return prompt;
  }

  /**
   * Call AI endpoint with vscode-lm-proxy model
   */
  private async callAI(prompt: string, options: any): Promise<any> {
    try {
      const response = await axios.post(this.aiEndpoint, {
        model: options.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert Temporal workflow developer focused on creating high-quality, production-ready workflows.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: options.temperature,
        max_tokens: options.max_tokens
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      return {
        content: response.data.choices[0].message.content,
        reasoning: response.data.choices[0].reasoning || '',
        usage: response.data.usage
      };

    } catch (error) {
      this.logger.error(`AI API call failed: ${error}`);
      throw new Error(`AI endpoint error: ${error}`);
    }
  }

  /**
   * Extract code from AI response
   */
  private extractCodeFromResponse(aiResponse: any): string {
    let content = aiResponse.content || '';
    
    // Extract TypeScript code blocks
    const codeBlockRegex = /```(?:typescript|ts)?\n([\s\S]*?)\n```/g;
    const matches = content.match(codeBlockRegex);
    
    if (matches && matches.length > 0) {
      // Return the largest code block
      const codes = matches.map(match => 
        match.replace(/```(?:typescript|ts)?\n/, '').replace(/\n```$/, '')
      );
      return codes.reduce((longest, current) => 
        current.length > longest.length ? current : longest
      );
    }

    // If no code blocks, try to extract code patterns
    const lines = content.split('\n');
    const codeLines = lines.filter(line => 
      line.includes('class ') || 
      line.includes('function ') ||
      line.includes('export ') ||
      line.includes('import ') ||
      line.trim().startsWith('//')
    );

    return codeLines.length > 5 ? codeLines.join('\n') : content;
  }

  /**
   * Analyze code quality
   */
  private async analyzeCodeQuality(code: string, request: IterativeWorkflowRequest): Promise<QualityScores> {
    const analysis = {
      performance: this.analyzePerformance(code),
      reliability: this.analyzeReliability(code),
      maintainability: this.analyzeMaintainability(code),
      security: this.analyzeSecurity(code),
      functionality: this.analyzeFunctionality(code, request)
    };

    const overall = (
      analysis.performance + 
      analysis.reliability + 
      analysis.maintainability + 
      analysis.security + 
      analysis.functionality
    ) / 5;

    return { ...analysis, overall };
  }

  private analyzePerformance(code: string): number {
    let score = 0.5; // Base score
    
    // Check for async/await patterns
    if (code.includes('async ') && code.includes('await ')) score += 0.2;
    
    // Check for error handling
    if (code.includes('try {') && code.includes('catch')) score += 0.1;
    
    // Check for timeout configurations
    if (code.includes('timeout') || code.includes('Timeout')) score += 0.1;
    
    // Check for retry logic
    if (code.includes('retry') || code.includes('RetryPolicy')) score += 0.1;
    
    return Math.min(score, 1.0);
  }

  private analyzeReliability(code: string): number {
    let score = 0.5;
    
    // Error handling
    if (code.includes('try') && code.includes('catch')) score += 0.2;
    
    // Input validation
    if (code.includes('validate') || code.includes('check')) score += 0.1;
    
    // Logging
    if (code.includes('log') || code.includes('Log')) score += 0.1;
    
    // Retry mechanisms
    if (code.includes('retry') || code.includes('Retry')) score += 0.1;
    
    return Math.min(score, 1.0);
  }

  private analyzeMaintainability(code: string): number {
    let score = 0.5;
    
    // Comments and documentation
    const commentLines = (code.match(/\/\/.*/g) || []).length;
    const docLines = (code.match(/\/\*\*[\s\S]*?\*\//g) || []).length;
    if (commentLines + docLines > 5) score += 0.2;
    
    // Function decomposition
    const functionCount = (code.match(/function |async function |=>/g) || []).length;
    if (functionCount > 3) score += 0.1;
    
    // Type definitions
    if (code.includes('interface ') || code.includes('type ')) score += 0.1;
    
    // Clear naming
    if (!/[a-z]+[0-9]/.test(code)) score += 0.1; // No variable1, variable2 patterns
    
    return Math.min(score, 1.0);
  }

  private analyzeSecurity(code: string): number {
    let score = 0.7; // Start with good security assumption
    
    // Check for input validation
    if (code.includes('validate') || code.includes('sanitize')) score += 0.1;
    
    // Check for dangerous patterns (reduce score)
    if (code.includes('eval(') || code.includes('Function(')) score -= 0.3;
    if (code.includes('innerHTML') || code.includes('document.write')) score -= 0.2;
    
    // Check for secure patterns
    if (code.includes('encrypt') || code.includes('hash')) score += 0.1;
    
    return Math.max(0, Math.min(score, 1.0));
  }

  private analyzeFunctionality(code: string, request: IterativeWorkflowRequest): number {
    let score = 0.3; // Base functionality score
    
    // Check if it contains Temporal patterns
    if (code.includes('@workflow') || code.includes('WorkflowMethod')) score += 0.2;
    if (code.includes('@activity') || code.includes('ActivityMethod')) score += 0.2;
    
    // Check for business logic implementation
    const requirements = request.customer_requirements.toLowerCase();
    const codeWords = code.toLowerCase().split(/\W+/);
    const requirementWords = requirements.split(/\W+/).filter(w => w.length > 3);
    
    const matches = requirementWords.filter(word => 
      codeWords.some(codeWord => codeWord.includes(word) || word.includes(codeWord))
    );
    
    score += Math.min(matches.length * 0.05, 0.3);
    
    return Math.min(score, 1.0);
  }

  /**
   * Identify issues in generated code
   */
  private async identifyIssues(code: string, request: IterativeWorkflowRequest): Promise<string[]> {
    const issues: string[] = [];
    
    // Check for missing error handling
    if (!code.includes('try') || !code.includes('catch')) {
      issues.push('Missing error handling');
    }
    
    // Check for missing logging
    if (!code.includes('log') && !code.includes('Log')) {
      issues.push('Missing logging statements');
    }
    
    // Check for missing input validation
    if (!code.includes('validate') && !code.includes('check')) {
      issues.push('Missing input validation');
    }
    
    // Check for Temporal-specific issues
    if (request.target_platform === 'temporal') {
      if (!code.includes('@workflow') && !code.includes('WorkflowMethod')) {
        issues.push('Missing Temporal workflow annotations');
      }
      if (!code.includes('@activity') && !code.includes('ActivityMethod')) {
        issues.push('Missing Temporal activity definitions');
      }
    }
    
    // Check for complexity issues
    const lineCount = code.split('\n').length;
    if (lineCount > 200) {
      issues.push('Code is too complex, consider breaking into smaller functions');
    }
    
    return issues;
  }

  /**
   * Evaluate quality and generate feedback
   */
  private async evaluateQuality(attempt: WorkflowAttempt, qualityCriteria: any): Promise<QualityFeedback[]> {
    const feedback: QualityFeedback[] = [];

    // Performance feedback
    if (attempt.quality_scores.performance < qualityCriteria.performance_threshold) {
      feedback.push({
        category: 'performance',
        score: attempt.quality_scores.performance,
        feedback: 'Performance score below threshold',
        suggestions: ['Add async/await patterns', 'Implement proper timeouts', 'Add retry logic'],
        critical_issues: attempt.quality_scores.performance < 0.3 ? ['Critical performance issues detected'] : []
      });
    }

    // Reliability feedback
    if (attempt.quality_scores.reliability < qualityCriteria.reliability_threshold) {
      feedback.push({
        category: 'reliability',
        score: attempt.quality_scores.reliability,
        feedback: 'Reliability score below threshold',
        suggestions: ['Add comprehensive error handling', 'Implement input validation', 'Add logging'],
        critical_issues: attempt.quality_scores.reliability < 0.3 ? ['Critical reliability issues detected'] : []
      });
    }

    // Add feedback for other categories...
    
    return feedback;
  }

  /**
   * Check if convergence criteria are met
   */
  private async checkConvergence(
    attempt: WorkflowAttempt, 
    qualityCriteria: any, 
    context: IterationContext
  ): Promise<boolean> {
    // Check if all quality thresholds are met
    const thresholdsMet = 
      attempt.quality_scores.performance >= qualityCriteria.performance_threshold &&
      attempt.quality_scores.reliability >= qualityCriteria.reliability_threshold &&
      attempt.quality_scores.maintainability >= qualityCriteria.maintainability_threshold &&
      attempt.quality_scores.security >= qualityCriteria.security_threshold;

    // Check if improvement has plateaued
    if (context.previous_attempts.length >= 3) {
      const lastThreeScores = context.previous_attempts
        .slice(-3)
        .map(a => a.quality_scores.overall);
      
      const improvement = Math.max(...lastThreeScores) - Math.min(...lastThreeScores);
      const plateauReached = improvement < 0.05; // Less than 5% improvement
      
      if (thresholdsMet && plateauReached) {
        this.logger.info('Convergence reached: thresholds met and improvement plateaued');
        return true;
      }
    }

    return thresholdsMet;
  }

  /**
   * Collect context from this iteration for learning
   */
  private async collectIterationContext(
    sessionId: string,
    iteration: number,
    attempt: WorkflowAttempt,
    qualityFeedback: QualityFeedback[],
    context: IterationContext
  ): Promise<void> {
    try {
      await this.contextDatabase.query(`
        INSERT INTO iteration_contexts (
          session_id, iteration_number, attempt_id, 
          generated_code, quality_scores, quality_feedback,
          issues_identified, ai_reasoning, timestamp,
          learned_patterns, improvement_suggestions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        sessionId,
        iteration,
        attempt.attempt_id,
        attempt.generated_code,
        JSON.stringify(attempt.quality_scores),
        JSON.stringify(qualityFeedback),
        JSON.stringify(attempt.issues_identified),
        attempt.ai_reasoning,
        new Date(attempt.timestamp),
        JSON.stringify(context.learned_patterns),
        JSON.stringify(context.improvement_suggestions)
      ]);

      this.logger.debug(`Stored context for iteration ${iteration}`);
    } catch (error) {
      this.logger.error(`Failed to store iteration context: ${error}`);
    }
  }

  /**
   * Generate improvement suggestions for next iteration
   */
  private async generateImprovementSuggestions(
    context: IterationContext, 
    request: IterativeWorkflowRequest
  ): Promise<string[]> {
    const suggestions: string[] = [];
    const lastAttempt = context.previous_attempts[context.previous_attempts.length - 1];

    // Analyze issues from last attempt
    lastAttempt.issues_identified.forEach(issue => {
      if (issue.includes('error handling')) {
        suggestions.push('Add comprehensive try-catch blocks and specific error types');
      }
      if (issue.includes('logging')) {
        suggestions.push('Add structured logging with correlation IDs');
      }
      if (issue.includes('validation')) {
        suggestions.push('Implement input validation with Zod or similar library');
      }
    });

    // Quality-based suggestions
    if (lastAttempt.quality_scores.performance < 0.7) {
      suggestions.push('Optimize for performance with async patterns and timeouts');
    }
    if (lastAttempt.quality_scores.maintainability < 0.7) {
      suggestions.push('Break down large functions and add documentation');
    }

    // Pattern-based suggestions from learned patterns
    context.learned_patterns.forEach(pattern => {
      if (pattern.includes('successful')) {
        suggestions.push(`Apply pattern: ${pattern}`);
      }
    });

    return suggestions.slice(0, 5); // Limit to top 5 suggestions
  }

  /**
   * Load learned patterns from previous sessions
   */
  private async loadLearnedPatterns(request: IterativeWorkflowRequest): Promise<string[]> {
    try {
      const { rows } = await this.contextDatabase.query(`
        SELECT pattern_description, success_rate, usage_count
        FROM learned_patterns 
        WHERE category = 'workflow_generation'
        AND success_rate > 0.8
        ORDER BY usage_count DESC, success_rate DESC
        LIMIT 10
      `);

      return rows.map(row => row.pattern_description);
    } catch (error) {
      this.logger.error(`Failed to load learned patterns: ${error}`);
      return [];
    }
  }

  /**
   * Store learned patterns from successful session
   */
  private async storeLearnedPatterns(
    request: IterativeWorkflowRequest,
    context: IterationContext,
    bestAttempt: WorkflowAttempt
  ): Promise<void> {
    if (bestAttempt.quality_scores.overall < 0.8) {
      return; // Only store patterns from high-quality results
    }

    try {
      // Extract patterns from successful attempt
      const patterns = this.extractPatterns(bestAttempt, context);
      
      for (const pattern of patterns) {
        await this.contextDatabase.query(`
          INSERT INTO learned_patterns (
            pattern_description, category, code_snippet, 
            success_rate, usage_count, quality_score, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (pattern_description) DO UPDATE SET
            usage_count = learned_patterns.usage_count + 1,
            success_rate = (learned_patterns.success_rate + $4) / 2
        `, [
          pattern.description,
          'workflow_generation',
          pattern.code_snippet,
          bestAttempt.quality_scores.overall,
          1,
          bestAttempt.quality_scores.overall
        ]);
      }

      this.logger.info(`Stored ${patterns.length} learned patterns`);
    } catch (error) {
      this.logger.error(`Failed to store learned patterns: ${error}`);
    }
  }

  /**
   * Extract reusable patterns from successful attempt
   */
  private extractPatterns(attempt: WorkflowAttempt, context: IterationContext): any[] {
    const patterns: any[] = [];
    const code = attempt.generated_code;

    // Error handling patterns
    if (code.includes('try {') && code.includes('catch')) {
      patterns.push({
        description: 'Comprehensive error handling with try-catch blocks',
        code_snippet: this.extractCodeSnippet(code, 'try')
      });
    }

    // Temporal workflow patterns
    if (code.includes('@workflow') || code.includes('WorkflowMethod')) {
      patterns.push({
        description: 'Temporal workflow annotation pattern',
        code_snippet: this.extractCodeSnippet(code, '@workflow')
      });
    }

    // Async/await patterns
    if (code.includes('async ') && code.includes('await ')) {
      patterns.push({
        description: 'Async/await implementation pattern',
        code_snippet: this.extractCodeSnippet(code, 'async')
      });
    }

    return patterns;
  }

  private extractCodeSnippet(code: string, keyword: string): string {
    const lines = code.split('\n');
    const keywordLine = lines.findIndex(line => line.includes(keyword));
    
    if (keywordLine === -1) return '';
    
    // Extract 5 lines around the keyword
    const start = Math.max(0, keywordLine - 2);
    const end = Math.min(lines.length, keywordLine + 3);
    
    return lines.slice(start, end).join('\n');
  }

  /**
   * Calculate improvement achieved across iterations
   */
  private calculateImprovement(context: IterationContext): number {
    if (context.previous_attempts.length < 2) return 0;
    
    const firstScore = context.previous_attempts[0].quality_scores.overall;
    const lastScore = context.previous_attempts[context.previous_attempts.length - 1].quality_scores.overall;
    
    return ((lastScore - firstScore) / firstScore) * 100;
  }

  /**
   * Create final Temporal workflow package
   */
  private async createTemporalWorkflow(
    bestAttempt: WorkflowAttempt,
    request: IterativeWorkflowRequest,
    context: IterationContext
  ): Promise<any> {
    const workflowId = uuidv4();
    
    return {
      id: workflowId,
      name: `Generated_Workflow_${workflowId.substring(0, 8)}`,
      description: `AI-generated workflow: ${request.customer_requirements.substring(0, 100)}...`,
      type: 'temporal_workflow',
      generated_code: bestAttempt.generated_code,
      quality_metrics: bestAttempt.quality_scores,
      generation_metadata: {
        iterations_used: context.iteration_number,
        ai_model: 'vscode-lm-proxy',
        generation_time: Date.now(),
        improvement_achieved: this.calculateImprovement(context),
        learned_patterns_applied: context.learned_patterns.length
      },
      deployment_ready: bestAttempt.quality_scores.overall >= 0.8,
      temporal_config: {
        task_queue: `generated-workflow-${workflowId}`,
        execution_timeout: '1h',
        retry_policy: {
          max_attempts: 3,
          backoff_coefficient: 2.0
        }
      }
    };
  }
}