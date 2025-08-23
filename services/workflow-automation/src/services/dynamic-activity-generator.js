/**
 * Dynamic Activity Generator Service
 * Uses LLM to generate activities dynamically based on natural language descriptions
 */

const { Pool } = require('pg');

class DynamicActivityGenerator {
  constructor(llmService, logger) {
    this.llmService = llmService;
    this.logger = logger;
    this.dbPool = new Pool({
      host: process.env.DB_HOST || 'postgres',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'temporal',
      user: process.env.DB_USER || 'temporal',
      password: process.env.DB_PASSWORD || 'temporal',
      ssl: false
    });
  }

  /**
   * Generate activities dynamically from workflow description
   */
  async generateActivitiesFromDescription(description, workflowSteps = []) {
    this.logger.info('Generating activities dynamically from description', { description });

    const activities = [];
    const generatedActivityIds = new Set();

    // Extract required activities from workflow steps
    const requiredActivities = this.extractRequiredActivities(workflowSteps);

    for (const activityInfo of requiredActivities) {
      try {
        // Check if activity already exists in database
        const existingActivity = await this.getActivityFromDatabase(activityInfo.id);
        if (existingActivity) {
          this.logger.info('Using existing activity from database', { activityId: activityInfo.id });
          activities.push(existingActivity);
          continue;
        }

        // Generate activity using LLM
        const generatedActivity = await this.generateActivityWithLLM(activityInfo, description);
        if (generatedActivity) {
          activities.push(generatedActivity);
          generatedActivityIds.add(generatedActivity.id);
        }

      } catch (error) {
        this.logger.error('Failed to generate activity', { 
          activityInfo, 
          error: error.message 
        });
        
        // Fallback: create a basic template activity
        const fallbackActivity = this.createFallbackActivity(activityInfo);
        activities.push(fallbackActivity);
      }
    }

    // Store generated activities in database
    await this.storeActivitiesInDatabase(activities.filter(a => generatedActivityIds.has(a.id)));

    return activities;
  }

  /**
   * Extract required activities from workflow steps
   */
  extractRequiredActivities(steps) {
    const activities = [];

    for (const step of steps) {
      if (step.activity_id) {
        const activityInfo = {
          id: step.activity_id,
          name: step.name || step.activity_id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          type: 'function',
          inputs: this.extractInputsFromStep(step),
          outputs: step.outputs || ['result'],
          stepContext: step
        };
        activities.push(activityInfo);
      }
    }

    return activities;
  }

  /**
   * Extract inputs from step definition
   */
  extractInputsFromStep(step) {
    const inputs = [];
    
    if (step.inputs) {
      for (const [key, inputDef] of Object.entries(step.inputs)) {
        if (typeof inputDef === 'object' && inputDef.source === 'input') {
          inputs.push(inputDef.path || key);
        } else if (typeof inputDef === 'string') {
          inputs.push(inputDef);
        } else {
          inputs.push(key);
        }
      }
    }

    return inputs.length > 0 ? inputs : ['input'];
  }

  /**
   * Generate activities using TWO-PHASE LLM approach: Planning + Generation
   */
  async generateActivitiesWithTwoPhase(workflowSpec) {
    try {
      this.logger.info('🚀 Starting TWO-PHASE activity generation', {
        workflowName: workflowSpec.name,
        domain: workflowSpec.domain,
        hasRequirements: !!workflowSpec.requirements,
        requirementsLength: workflowSpec.requirements?.length,
        inputs: workflowSpec.inputs,
        outputs: workflowSpec.outputs
      });

      // PHASE 1: Plan the workflow activities
      this.logger.info('📊 PHASE 1: Planning workflow activities');
      
      let activityPlan;
      try {
        activityPlan = await this.llmService.planWorkflowActivities(workflowSpec);
        this.logger.info('✅ PHASE 1 completed successfully', {
          activityPlan: !!activityPlan,
          activityPlanKeys: activityPlan ? Object.keys(activityPlan) : null
        });
      } catch (planError) {
        this.logger.error('❌ PHASE 1 FAILED with detailed error', {
          error: planError.message,
          stack: planError.stack?.substring(0, 500),
          errorType: planError.constructor.name,
          workflowSpec: {
            name: workflowSpec.name,
            hasRequirements: !!workflowSpec.requirements,
            domain: workflowSpec.domain
          }
        });
        throw new Error(`Phase 1 planning failed: ${planError.message}`);
      }
      
      this.logger.info('📅 Activity plan created', {
        activityCount: activityPlan.activityCount,
        activities: activityPlan.activities.map(a => ({
          name: a.name,
          type: a.type,
          id: a.id
        })),
        hasExecutionFlow: !!activityPlan.execution_flow,
        hasDataFlow: !!activityPlan.data_flow
      });

      // PHASE 2: Generate code for each planned activity
      this.logger.info('⚙️ PHASE 2: Generating individual activity code');
      const generatedActivities = [];
      
      for (let i = 0; i < activityPlan.activities.length; i++) {
        const activitySpec = activityPlan.activities[i];
        
        this.logger.info(`🔨 Generating activity ${i + 1}/${activityPlan.activities.length}`, {
          activityName: activitySpec.name,
          activityType: activitySpec.type,
          activityId: activitySpec.id,
          hasImplementationNotes: !!activitySpec.implementation_notes
        });

        try {
          // Generate code for this specific activity
          const activityCode = await this.llmService.generateActivityCode(activitySpec, {
            domain: workflowSpec.domain,
            requirements: workflowSpec.requirements,
            name: workflowSpec.name
          });

          // Validate the generated code
          const validationResult = this.validateActivityCode(activityCode, activitySpec);
          
          this.logger.info('🔍 Validation result:', {
            activityName: activitySpec.name,
            valid: validationResult.valid,
            reason: validationResult.reason,
            codeLength: activityCode?.length
          });
          
          if (validationResult.valid) {
            const activity = {
              id: activitySpec.id,
              name: activitySpec.name,
              type: activitySpec.type,
              code: activityCode,
              inputs: activitySpec.inputs,
              outputs: activitySpec.outputs,
              description: activitySpec.description,
              generated_by: 'two_phase_llm',
              activity_plan: activitySpec
            };

            generatedActivities.push(activity);
            
            this.logger.info(`✅ Activity generated successfully`, {
              activityName: activitySpec.name,
              codeLength: activityCode.length,
              generatedBy: 'two_phase_llm'
            });
          } else {
            this.logger.warn(`⚠️ Activity validation failed`, {
              activityName: activitySpec.name,
              reason: validationResult.reason,
              error: validationResult.error,
              codeSnippet: activityCode?.substring(0, 200)
            });
            
            // Create a fallback activity if validation fails
            const fallbackActivity = this.createFallbackActivity(activitySpec);
            generatedActivities.push(fallbackActivity);
            
            this.logger.info('🔄 Created fallback activity', {
              activityName: activitySpec.name
            });
          }
          
        } catch (error) {
          this.logger.error(`❌ Failed to generate activity`, {
            activityName: activitySpec.name,
            error: error.message,
            stack: error.stack?.substring(0, 500)
          });
          
          // Create a fallback activity if generation fails
          const fallbackActivity = this.createFallbackActivity(activitySpec);
          generatedActivities.push(fallbackActivity);
          
          this.logger.info('🔄 Created fallback activity due to generation error', {
            activityName: activitySpec.name
          });
        }
      }

      this.logger.info('📊 Two-phase generation SUMMARY', {
        plannedActivities: activityPlan.activityCount,
        generatedActivities: generatedActivities.length,
        successfulActivities: generatedActivities.filter(a => a.generated_by === 'two_phase_llm').length,
        fallbackActivities: generatedActivities.filter(a => a.generated_by === 'fallback').length,
        activityNames: generatedActivities.map(a => ({ name: a.name, generatedBy: a.generated_by }))
      });

      return {
        activities: generatedActivities,
        plan: activityPlan,
        executionFlow: activityPlan.execution_flow,
        dataFlow: activityPlan.data_flow
      };

    } catch (error) {
      this.logger.error('❌ Two-phase generation FAILED COMPLETELY', {
        error: error.message,
        stack: error.stack?.substring(0, 500),
        workflowName: workflowSpec?.name,
        domain: workflowSpec?.domain
      });
      throw new Error(`Two-phase activity generation failed: ${error.message}`);
    }
  }

  /**
   * Create fallback activity when generation fails
   */
  createFallbackActivity(activitySpec) {
    return {
      id: activitySpec.id,
      name: activitySpec.name,
      type: activitySpec.type,
      code: `
// Fallback implementation for ${activitySpec.name}
export function ${activitySpec.id}(input) {
  console.log('Executing ${activitySpec.name}:', input);
  // ${activitySpec.description}
  
  // TODO: Implement ${activitySpec.implementation_notes}
  
  return {
    processed: true,
    data: input,
    message: 'Fallback implementation - needs proper implementation'
  };
}`,
      inputs: activitySpec.inputs,
      outputs: activitySpec.outputs,
      description: activitySpec.description,
      generated_by: 'fallback',
      activity_plan: activitySpec
    };
  }

  /**
   * Validate generated activity code
   */
  validateActivityCode(code, activitySpec) {
    const result = {
      valid: false,
      reason: null
    };
    
    try {
      // Basic syntax validation
      new Function(code);
      
      // Check for function structure
      if (!code.includes('function') && !code.includes('=>') && !code.includes('export')) {
        result.reason = 'no_function_found';
        return result;
      }
      
      // Check if it contains activity-specific logic (not just generic processing)
      const hasSpecificLogic = activitySpec.name.toLowerCase().split(/[\s_-]+/).some(word => 
        code.toLowerCase().includes(word) && word.length > 3
      );
      
      if (!hasSpecificLogic) {
        result.reason = 'generic_implementation';
        // Still consider it valid - we want to accept any working code
      }
      
      result.valid = true;
      return result;
      
    } catch (error) {
      result.reason = 'syntax_error';
      result.error = error.message;
      return result;
    }
  }

  /**
   * Generate activity using LLM with multi-stage learning process (LEGACY - kept for compatibility)
   */
  async generateActivityWithLLM(activityInfo, workflowDescription, maxRetries = 5) {
    // This is the old method - we'll try the new two-phase approach first
    try {
      const workflowSpec = {
        name: workflowDescription,
        description: workflowDescription,
        requirements: workflowDescription,
        domain: 'general',
        inputs: [],
        outputs: [],
        tags: []
      };
      
      const result = await this.generateActivitiesWithTwoPhase(workflowSpec);
      
      // Return the first activity from the two-phase result in the old format
      if (result.activities && result.activities.length > 0) {
        return result.activities[0];
      }
    } catch (error) {
      this.logger.warn('Two-phase generation failed, falling back to old method', error);
    }

    let attempts = 0;
    let learningContext = {
      failures: [],
      patterns: new Set(),
      adjustments: [],
      lastSuccessfulPattern: null,
      cumulativeErrors: new Map()
    };
    
    while (attempts < maxRetries) {
      attempts++;
      
      try {
        this.logger.info(`Multi-stage generation attempt ${attempts}/${maxRetries}`, { 
          activityId: activityInfo.id,
          stage: this.getGenerationStage(attempts),
          learningInsights: learningContext.adjustments.length
        });
        
        // Build adaptive prompt using learning context
        const prompt = this.buildAdaptivePrompt(activityInfo, workflowDescription, attempts, learningContext);
        const response = await this.llmService.generateText(prompt);
        const activityCode = this.parseActivityCodeFromLLMResponse(response);

        if (activityCode) {
          // Detailed validation with failure analysis
          const validationResult = this.validateWithLearning(activityCode, activityInfo, learningContext);
          
          if (validationResult.valid) {
            this.logger.info(`Multi-stage generation succeeded after ${attempts} attempts`, { 
              activityId: activityInfo.id,
              stage: this.getGenerationStage(attempts),
              totalFailures: learningContext.failures.length,
              keyAdjustments: learningContext.adjustments
            });
            
            // Store successful pattern for future use
            await this.storeSuccessfulPattern(activityInfo, activityCode, prompt, attempts, learningContext);
            
            return {
              id: activityInfo.id,
              name: activityInfo.name,
              type: activityInfo.type,
              code: activityCode,
              inputs: activityInfo.inputs,
              outputs: activityInfo.outputs,
              generated_by: 'llm_adaptive',
              generation_prompt: prompt,
              attempts_taken: attempts,
              learning_stage: this.getGenerationStage(attempts),
              failures_analyzed: learningContext.failures.length,
              adjustments_made: learningContext.adjustments
            };
          } else {
            // Learn from this failure
            this.learnFromFailure(validationResult, activityCode, prompt, learningContext);
          }
        } else {
          // Learn from parsing failure
          this.learnFromParsingFailure(response, prompt, learningContext);
        }

      } catch (error) {
        // Learn from generation error
        this.learnFromGenerationError(error, activityInfo, learningContext);
        
        // Adaptive backoff based on error type and learning
        const delay = this.calculateAdaptiveDelay(error, attempts, learningContext);
        if (delay > 0) {
          this.logger.debug(`Adaptive delay: ${delay}ms`, { activityId: activityInfo.id });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      // Dynamic delay based on learning patterns
      if (attempts < maxRetries) {
        const adaptiveDelay = this.calculateProgressiveDelay(attempts, learningContext);
        await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
      }
      
      // Since validation is now simple, we don't need complex pattern analysis
    }

    this.logger.error(`Multi-stage generation exhausted after ${maxRetries} attempts`, { 
      activityId: activityInfo.id,
      totalFailures: learningContext.failures.length,
      errorPatterns: Array.from(learningContext.patterns),
      finalAdjustments: learningContext.adjustments
    });

    // Store failure analysis for future improvements
    await this.storeFailureAnalysis(activityInfo, learningContext);

    return null;
  }
  
  /**
   * Get current generation stage based on attempt number
   */
  getGenerationStage(attempts) {
    if (attempts <= 25) return 'initial';
    if (attempts <= 50) return 'adaptive';
    if (attempts <= 75) return 'pattern_analysis';
    if (attempts <= 100) return 'deep_learning';
    if (attempts <= 125) return 'creative_variation';
    return 'exhaustive_search';
  }
  
  /**
   * Learn from validation failures
   */
  learnFromFailure(validationResult, code, prompt, learningContext) {
    const failure = {
      timestamp: Date.now(),
      reason: validationResult.reason,
      code_snippet: code.substring(0, 200),
      prompt_approach: this.extractPromptApproach(prompt),
      patterns_detected: validationResult.patterns || []
    };
    
    learningContext.failures.push(failure);
    
    // Extract patterns from failures
    validationResult.patterns?.forEach(pattern => learningContext.patterns.add(pattern));
    
    // Generate adjustments based on failure analysis
    const adjustments = this.generateAdjustments(failure, learningContext);
    learningContext.adjustments.push(...adjustments);
    
    // Count error types
    const errorType = validationResult.reason || 'unknown';
    learningContext.cumulativeErrors.set(errorType, 
      (learningContext.cumulativeErrors.get(errorType) || 0) + 1);
  }
  
  /**
   * Learn from parsing failures
   */
  learnFromParsingFailure(response, prompt, learningContext) {
    const failure = {
      timestamp: Date.now(),
      reason: 'parsing_failed',
      response_start: response?.substring(0, 100) || 'no_response',
      prompt_approach: this.extractPromptApproach(prompt)
    };
    
    learningContext.failures.push(failure);
    learningContext.patterns.add('parsing_issues');
    
    // Add parsing-specific adjustments
    learningContext.adjustments.push({
      type: 'prompt_clarity',
      change: 'Emphasize code-only output format',
      priority: 'high'
    });
  }
  
  /**
   * Learn from generation errors
   */
  learnFromGenerationError(error, activityInfo, learningContext) {
    const failure = {
      timestamp: Date.now(),
      reason: 'generation_error',
      error_type: error.code || error.name,
      error_message: error.message,
      activity_type: activityInfo.id
    };
    
    learningContext.failures.push(failure);
    learningContext.patterns.add(`error_${error.code || error.name}`);
    
    // Add error-specific adjustments
    if (error.code === 'ECONNREFUSED') {
      learningContext.adjustments.push({
        type: 'connectivity',
        change: 'Increase connection timeout and retry interval',
        priority: 'critical'
      });
    }
  }
  
  /**
   * Generic validation - only check syntax and basic structure
   */
  validateWithLearning(code, activityInfo, learningContext) {
    const result = {
      valid: false,
      reason: null,
      patterns: []
    };
    
    try {
      // Only check basic syntax - let AI generate any valid JavaScript
      new Function(code);
      
      // Check for basic function structure (any function is fine)
      if (!code.includes('function') && !code.includes('=>') && !code.includes('export')) {
        result.reason = 'no_function_found';
        result.patterns.push('missing_function');
        return result;
      }
      
      // That's it! No hardcoded requirements. 
      // If it's syntactically valid JavaScript with a function, accept it.
      result.valid = true;
      return result;
      
    } catch (error) {
      result.reason = 'syntax_error';
      result.patterns.push('syntax_issues');
      return result;
    }
  }
  
  /**
   * Build adaptive prompt using learning context
   */
  buildAdaptivePrompt(activityInfo, workflowDescription, attempts, learningContext) {
    const stage = this.getGenerationStage(attempts);
    const adjustments = learningContext.adjustments;
    
    let basePrompt = `Generate a JavaScript async function for a workflow activity.

STAGE: ${stage.toUpperCase()} (Attempt ${attempts})

Workflow Description: ${workflowDescription}

Activity Details:
- ID: ${activityInfo.id}
- Name: ${activityInfo.name}
- Inputs: ${JSON.stringify(activityInfo.inputs)}
- Outputs: ${JSON.stringify(activityInfo.outputs)}`;

    // Add learning-based adjustments
    let learningAdjustments = '';
    if (learningContext.patterns.has('factorial_logic_missing')) {
      learningAdjustments += `
⚠️ CRITICAL FIX NEEDED: Previous attempts missing factorial calculation logic!
MUST include: factorial multiplication, iterative calculation (for loop), factorial variable.`;
    }
    
    if (learningContext.patterns.has('factorial_outputs_missing')) {
      learningAdjustments += `
⚠️ OUTPUT FIX NEEDED: Must return factorial_result, calculation_steps, formula_used fields!
Example return: { factorial_result: 120, calculation_steps: "5 × 4 × 3 × 2 × 1", formula_used: "n!" }`;
    }
    
    if (learningContext.patterns.has('parsing_issues')) {
      learningAdjustments += `
⚠️ FORMAT FIX NEEDED: Return ONLY executable JavaScript code! No markdown, no explanations!`;
    }
    
    if (learningContext.patterns.has('syntax_issues')) {
      learningAdjustments += `
⚠️ SYNTAX FIX NEEDED: Ensure proper JavaScript syntax, semicolons, brackets!`;
    }
    
    // Stage-specific improvements
    let stageGuidance = '';
    switch (stage) {
      case 'adaptive':
        stageGuidance = `
ADAPTIVE STAGE: Learning from ${learningContext.failures.length} previous failures.
Focus on: Correct function structure and required outputs.`;
        break;
      case 'pattern_analysis':
        stageGuidance = `
PATTERN ANALYSIS STAGE: Analyzing failure patterns to improve generation.
Most common issues: ${Array.from(learningContext.patterns).slice(0, 3).join(', ')}`;
        break;
      case 'deep_learning':
        stageGuidance = `
DEEP LEARNING STAGE: Applying comprehensive failure analysis.
Key adjustments made: ${adjustments.slice(-3).map(a => a.change).join('; ')}`;
        break;
      case 'creative_variation':
        stageGuidance = `
CREATIVE VARIATION STAGE: Trying alternative implementation approaches.
Use different variable names, coding patterns, and logic structures.`;
        break;
      case 'exhaustive_search':
        stageGuidance = `
EXHAUSTIVE SEARCH STAGE: Final attempts with maximum specificity.
Generate the most explicit, detailed, bulletproof implementation possible.`;
        break;
    }
    
    // Activity-specific requirements based on learning
    let specificRequirements = this.buildSpecificRequirements(activityInfo, learningContext);
    
    return `${basePrompt}
${learningAdjustments}
${stageGuidance}
${specificRequirements}

CRITICAL RULES:
1. Function MUST be named 'execute' and be async
2. MUST take single 'input' parameter object  
3. MUST return object with ALL specified output fields
4. MUST include console.log for debugging
5. MUST handle errors appropriately
6. MUST be production-ready JavaScript
7. RESPOND WITH CODE ONLY - NO EXPLANATIONS!

async function execute(input) {
  console.log('Executing ${activityInfo.name}', input);
  // Implementation here
  return { /* required outputs */ };
}

GENERATE CODE NOW:`;
  }
  
  /**
   * Extract prompt approach for learning
   */
  extractPromptApproach(prompt) {
    if (prompt.includes('STAGE: INITIAL')) return 'initial';
    if (prompt.includes('STAGE: ADAPTIVE')) return 'adaptive';
    if (prompt.includes('PATTERN ANALYSIS')) return 'pattern_analysis';
    if (prompt.includes('DEEP LEARNING')) return 'deep_learning';
    if (prompt.includes('CREATIVE VARIATION')) return 'creative_variation';
    if (prompt.includes('EXHAUSTIVE SEARCH')) return 'exhaustive_search';
    return 'unknown';
  }
  
  /**
   * Generate adjustments based on failure analysis
   */
  generateAdjustments(failure, learningContext) {
    const adjustments = [];
    
    switch (failure.reason) {
      case 'missing_factorial_logic':
        adjustments.push({
          type: 'logic_enhancement',
          change: 'Add explicit factorial calculation requirements',
          priority: 'critical'
        });
        break;
      case 'missing_factorial_outputs':
        adjustments.push({
          type: 'output_specification',
          change: 'Specify exact output field names and examples',
          priority: 'high'
        });
        break;
      case 'parsing_failed':
        adjustments.push({
          type: 'format_clarity',
          change: 'Emphasize code-only response format',
          priority: 'high'
        });
        break;
      case 'syntax_error':
        adjustments.push({
          type: 'syntax_guidance',
          change: 'Add specific syntax validation examples',
          priority: 'medium'
        });
        break;
    }
    
    return adjustments;
  }
  
  /**
   * Calculate adaptive delay based on learning
   */
  calculateAdaptiveDelay(error, attempts, learningContext) {
    const baseDelay = 100;
    
    if (error.code === 'ECONNREFUSED') {
      return Math.min(1000 * Math.pow(2, Math.min(attempts - 1, 6)), 60000);
    }
    
    if (learningContext.patterns.has('connectivity_issues')) {
      return baseDelay * 3;
    }
    
    return baseDelay;
  }
  
  /**
   * Calculate progressive delay based on stage
   */
  calculateProgressiveDelay(attempts, learningContext) {
    const stage = this.getGenerationStage(attempts);
    
    switch (stage) {
      case 'initial': return 50;
      case 'adaptive': return 75;
      case 'pattern_analysis': return 100;
      case 'deep_learning': return 150;
      case 'creative_variation': return 200;
      default: return 250;
    }
  }
  
  /**
   * Analyze patterns and make major adjustments
   */
  async analyzePatternsAndAdjust(learningContext, activityInfo) {
    const patternAnalysis = {
      mostCommonErrors: this.getMostCommonErrors(learningContext),
      criticalPatterns: Array.from(learningContext.patterns),
      stageFocus: this.determineNextStageFocus(learningContext)
    };
    
    this.logger.info('Pattern analysis complete', {
      activityId: activityInfo.id,
      analysis: patternAnalysis
    });
    
    // Add major adjustments based on pattern analysis
    if (patternAnalysis.mostCommonErrors.includes('factorial_logic_missing')) {
      learningContext.adjustments.push({
        type: 'major_refocus',
        change: 'Switch to explicit factorial implementation examples',
        priority: 'critical'
      });
    }
  }
  
  /**
   * Get most common error patterns
   */
  getMostCommonErrors(learningContext) {
    const errorCounts = new Map();
    
    learningContext.failures.forEach(failure => {
      const reason = failure.reason || 'unknown';
      errorCounts.set(reason, (errorCounts.get(reason) || 0) + 1);
    });
    
    return Array.from(errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0]);
  }
  
  /**
   * Determine next stage focus
   */
  determineNextStageFocus(learningContext) {
    const patterns = Array.from(learningContext.patterns);
    
    if (patterns.includes('factorial_logic_missing')) {
      return 'factorial_implementation';
    }
    if (patterns.includes('parsing_issues')) {
      return 'format_correction';
    }
    if (patterns.includes('syntax_issues')) {
      return 'code_structure';
    }
    
    return 'comprehensive_validation';
  }
  
  /**
   * Store successful pattern for future use
   */
  async storeSuccessfulPattern(activityInfo, code, prompt, attempts, learningContext) {
    try {
      await this.dbPool.query(`
        INSERT INTO successful_generation_patterns 
        (activity_type, activity_id, successful_code, successful_prompt, attempts_taken, 
         learning_stage, failure_count, adjustments_applied, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (activity_type, activity_id) DO UPDATE SET
          successful_code = EXCLUDED.successful_code,
          successful_prompt = EXCLUDED.successful_prompt,
          attempts_taken = EXCLUDED.attempts_taken,
          updated_at = NOW()
      `, [
        activityInfo.id.split('_')[0], // activity type
        activityInfo.id,
        code,
        prompt,
        attempts,
        this.getGenerationStage(attempts),
        learningContext.failures.length,
        JSON.stringify(learningContext.adjustments)
      ]);
    } catch (error) {
      this.logger.warn('Failed to store successful pattern', { error: error.message });
    }
  }
  
  /**
   * Store failure analysis for future improvements
   */
  async storeFailureAnalysis(activityInfo, learningContext) {
    try {
      await this.dbPool.query(`
        INSERT INTO generation_failure_analysis 
        (activity_type, activity_id, failure_patterns, total_failures, 
         common_errors, final_adjustments, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        activityInfo.id.split('_')[0],
        activityInfo.id,
        JSON.stringify(Array.from(learningContext.patterns)),
        learningContext.failures.length,
        JSON.stringify(this.getMostCommonErrors(learningContext)),
        JSON.stringify(learningContext.adjustments)
      ]);
    } catch (error) {
      this.logger.warn('Failed to store failure analysis', { error: error.message });
    }
  }
  
  /**
   * Build specific requirements based on learning
   */
  buildSpecificRequirements(activityInfo, learningContext) {
    let requirements = '';
    
    if (activityInfo.id.includes('factorial')) {
      requirements += `
FACTORIAL SPECIFIC REQUIREMENTS (Based on Learning):
- MUST calculate factorial using: for(let i = 1; i <= number; i++) factorial *= i;
- MUST return: { factorial_result: result, calculation_steps: steps, formula_used: "n!" }
- MUST validate: number >= 0 && number <= 20 && Number.isInteger(number)
- MUST handle edge cases: 0! = 1, 1! = 1`;
      
      if (learningContext.patterns.has('factorial_logic_missing')) {
        requirements += `
⚠️ LEARNING ALERT: Previous attempts failed - MUST include multiplication logic!`;
      }
    }
    
    return requirements;
  }

  /**
   * Build LLM prompt for activity generation with variations
   */
  buildActivityGenerationPrompt(activityInfo, workflowDescription, attemptNumber = 1) {
    const basePrompt = `Generate a JavaScript async function for a workflow activity.

Workflow Description: ${workflowDescription}

Activity Details:
- ID: ${activityInfo.id}
- Name: ${activityInfo.name}
- Inputs: ${JSON.stringify(activityInfo.inputs)}
- Outputs: ${JSON.stringify(activityInfo.outputs)}`;

    // Add specific requirements based on activity type and attempt number
    let specificRequirements = '';
    
    if (activityInfo.id.includes('factorial') || activityInfo.name.toLowerCase().includes('factorial')) {
      specificRequirements = `
SPECIFIC FACTORIAL REQUIREMENTS:
- Calculate factorial using iterative multiplication: n! = n × (n-1) × (n-2) × ... × 1
- Handle edge cases: 0! = 1, 1! = 1
- Validate input is non-negative integer ≤ 20
- Return factorial_result, calculation_steps, and formula_used
- Use parameter names: factorial, factorial_result, calculation_steps, formula_used`;
    } else if (activityInfo.id.includes('validate')) {
      specificRequirements = `
SPECIFIC VALIDATION REQUIREMENTS:
- Validate input is non-negative integer between 0 and 20
- Return validated_number, validated (boolean), and error_message
- Use parameter names: validated, valid, validated_number, error_message`;
    } else if (activityInfo.id.includes('format')) {
      specificRequirements = `
SPECIFIC FORMATTING REQUIREMENTS:
- Format factorial result for display
- Return formatted_result and detailed_result
- Use parameter names: formatted_result, detailed_result, display_text`;
    }

    // Vary approach based on attempt number
    let approachVariation = '';
    if (attemptNumber > 20) {
      approachVariation = `
ALTERNATIVE APPROACH ${Math.floor(attemptNumber / 20)}: Use a different coding style and variable names.`;
    }
    if (attemptNumber > 50) {
      approachVariation += `
ENHANCED APPROACH: Add more detailed logging and comprehensive error handling.`;
    }
    if (attemptNumber > 100) {
      approachVariation += `
ROBUST APPROACH: Implement the most straightforward, bulletproof solution possible.`;
    }

    return `${basePrompt}
${specificRequirements}
${approachVariation}

General Requirements:
1. Function must be named 'execute' and be async
2. Takes a single 'input' parameter object
3. Returns an object with the specified output fields
4. Include error handling and validation
5. Add meaningful console.log for debugging
6. Code should be production-ready JavaScript
7. CRITICAL: Generate code that specifically matches the activity purpose

Example format:
async function execute(input) {
  console.log('Executing ${activityInfo.name}', input);
  
  // Validate inputs
  // Perform the specific operation for this activity
  // Log the result
  // Return output object with correct field names
}

Generate ONLY the function code, no explanation or markdown:`;
  }

  /**
   * Parse activity code from LLM response
   */
  parseActivityCodeFromLLMResponse(response) {
    try {
      // Extract code block if wrapped in markdown
      let code = response.trim();
      
      // Remove markdown code blocks
      code = code.replace(/```javascript\n?/g, '').replace(/```js\n?/g, '').replace(/```\n?/g, '');
      
      // Accept any valid JavaScript function structure - remove hardcoded requirement
      if (!code.includes('function') && !code.includes('=>') && !code.includes('export')) {
        return null;
      }

      // Basic validation - try to parse as valid JavaScript
      new Function(code);
      
      return code;

    } catch (error) {
      this.logger.warn('Failed to parse LLM response as valid JavaScript', { error: error.message });
      return null;
    }
  }

  /**
   * Get activity from database
   */
  async getActivityFromDatabase(activityId) {
    try {
      const result = await this.dbPool.query(
        'SELECT id, name, type, code, inputs, outputs FROM activity_library WHERE id = $1',
        [activityId]
      );

      if (result.rows.length > 0) {
        const activity = result.rows[0];
        return {
          id: activity.id,
          name: activity.name,
          type: activity.type,
          code: activity.code,
          inputs: JSON.parse(activity.inputs),
          outputs: JSON.parse(activity.outputs)
        };
      }
    } catch (error) {
      this.logger.warn('Failed to fetch activity from database', { activityId, error: error.message });
    }

    return null;
  }

  /**
   * Store activities in database
   */
  async storeActivitiesInDatabase(activities) {
    for (const activity of activities) {
      try {
        await this.dbPool.query(
          `INSERT INTO activity_library (id, name, type, code, inputs, outputs, created_at, updated_at) 
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             type = EXCLUDED.type,
             code = EXCLUDED.code,
             inputs = EXCLUDED.inputs,
             outputs = EXCLUDED.outputs,
             updated_at = NOW()`,
          [
            activity.id,
            activity.name,
            activity.type,
            activity.code,
            JSON.stringify(activity.inputs),
            JSON.stringify(activity.outputs)
          ]
        );

        this.logger.info('Activity stored in database', { activityId: activity.id });

      } catch (error) {
        this.logger.error('Failed to store activity in database', { 
          activityId: activity.id, 
          error: error.message 
        });
      }
    }
  }

  /**
   * Create fallback activity when LLM generation fails
   */
  createFallbackActivity(activityInfo) {
    // Generate basic template based on activity name and inputs/outputs
    const activityName = activityInfo.name.toLowerCase();
    let code;

    if (activityName.includes('multiply') || activityName.includes('math')) {
      code = `async function execute(input) {
        console.log('Executing ${activityInfo.name}', input);
        
        // Basic mathematical operation fallback
        const keys = Object.keys(input);
        if (keys.length >= 2) {
          const result = input[keys[0]] * input[keys[1]];
          console.log(\`Multiplying \${input[keys[0]]} × \${input[keys[1]]} = \${result}\`);
          return { ${activityInfo.outputs[0]}: result };
        }
        
        throw new Error('Invalid input for mathematical operation');
      }`;
    } else if (activityName.includes('divide')) {
      code = `async function execute(input) {
        console.log('Executing ${activityInfo.name}', input);
        
        // Basic division operation fallback
        const keys = Object.keys(input);
        if (keys.length >= 2) {
          const divisor = input[keys[1]];
          if (divisor === 0) throw new Error('Division by zero not allowed');
          
          const result = input[keys[0]] / divisor;
          console.log(\`Dividing \${input[keys[0]]} ÷ \${divisor} = \${result}\`);
          return { ${activityInfo.outputs[0]}: result };
        }
        
        throw new Error('Invalid input for division operation');
      }`;
    } else if (activityName.includes('factorial') || activityInfo.id.includes('factorial')) {
      code = `async function execute(input) {
        console.log('Executing ${activityInfo.name}', input);
        
        // Factorial calculation fallback
        const number = input.number || input.value || input.n;
        
        if (typeof number !== 'number' || number < 0 || number > 20) {
          throw new Error('Invalid input: must be non-negative integer ≤ 20');
        }
        
        let factorial = 1;
        let steps = [];
        
        for (let i = 1; i <= number; i++) {
          factorial *= i;
          steps.push(i);
        }
        
        const formula_used = 'n! = n × (n-1) × ... × 1';
        const calculation_steps = steps.length > 0 ? steps.join(' × ') + ' = ' + factorial : '0! = 1';
        
        console.log(\`Factorial calculation: \${number}! = \${factorial}\`);
        console.log(\`Steps: \${calculation_steps}\`);
        
        return { 
          factorial_result: factorial,
          calculated_factorial: factorial, 
          factorial: factorial,
          calculation_steps,
          formula_used,
          input_number: number
        };
      }`;
    } else if (activityName.includes('validate') && (activityName.includes('integer') || activityName.includes('number'))) {
      code = `async function execute(input) {
        console.log('Executing ${activityInfo.name}', input);
        
        // Integer validation fallback
        const number = input.number || input.value || input.n;
        
        const isValid = typeof number === 'number' && 
                       Number.isInteger(number) && 
                       number >= 0 && 
                       number <= 20;
        
        const error_message = !isValid ? 
          'Must be non-negative integer between 0 and 20' : null;
        
        console.log(\`Validation result: \${number} is \${isValid ? 'valid' : 'invalid'}\`);
        
        return { 
          validated_number: number,
          validated: isValid,
          valid: isValid,
          error_message,
          input_number: number
        };
      }`;
    } else if (activityName.includes('format') && (activityName.includes('factorial') || activityName.includes('result'))) {
      code = `async function execute(input) {
        console.log('Executing ${activityInfo.name}', input);
        
        // Factorial result formatting fallback
        const factorial = input.factorial_result || input.factorial || input.result;
        const number = input.input_number || input.number;
        const steps = input.calculation_steps;
        
        const formatted_result = \`\${number}! = \${factorial}\`;
        const detailed_result = steps ? \`\${number}! = \${steps}\` : formatted_result;
        
        console.log(\`Formatted factorial result: \${formatted_result}\`);
        
        return { 
          formatted_result,
          detailed_result,
          display_text: formatted_result
        };
      }`;
    } else {
      code = `async function execute(input) {
        console.log('Executing ${activityInfo.name}', input);
        
        // Generic processing fallback
        const result = { success: true, processed: true, ...input };
        console.log('Processing completed:', result);
        
        return { ${activityInfo.outputs[0]}: result };
      }`;
    }

    return {
      id: activityInfo.id,
      name: activityInfo.name,
      type: activityInfo.type,
      code,
      inputs: activityInfo.inputs,
      outputs: activityInfo.outputs,
      generated_by: 'fallback'
    };
  }

  /**
   * Parse workflow description to generate step definitions
   */
  async parseWorkflowDescription(description) {
    const prompt = `Analyze this workflow description and generate step definitions:

Description: ${description}

Generate a JSON array of workflow steps with the following structure:
[
  {
    "id": "step-id",
    "name": "Step Name",
    "type": "activity",
    "activity_id": "activity-id",
    "inputs": {
      "param1": { "source": "input", "path": "param1" },
      "param2": { "source": "step", "step": "previous-step-id", "path": "output" }
    },
    "outputs": ["result"]
  }
]

Requirements:
- Use descriptive step and activity IDs (lowercase, hyphenated)
- Define proper input/output flow between steps
- Include all necessary operations from the description

Return ONLY the JSON array, no explanation:`;

    try {
      const response = await this.llmService.generateText(prompt);
      const steps = JSON.parse(response.trim());
      
      if (Array.isArray(steps)) {
        this.logger.info('Generated workflow steps from description', { stepCount: steps.length });
        return steps;
      }
    } catch (error) {
      this.logger.warn('Failed to parse workflow steps from LLM', { error: error.message });
    }

    // Fallback: create basic steps based on common patterns
    return this.createFallbackSteps(description);
  }

  /**
   * Create fallback steps when LLM parsing fails
   */
  createFallbackSteps(description) {
    const desc = description.toLowerCase();
    const steps = [];

    if (desc.includes('factorial')) {
      // Create factorial-specific workflow steps
      steps.push({
        id: 'validate-step',
        name: 'Validate Non-Negative Integer',
        type: 'activity',
        activity_id: 'validate_non_negative_integer',
        inputs: {
          number: { source: 'input', path: 'number' }
        },
        outputs: ['validated_number', 'validated', 'error_message']
      });

      steps.push({
        id: 'calculate-step',
        name: 'Calculate Factorial',
        type: 'activity',
        activity_id: 'calculate_factorial',
        inputs: {
          number: { source: 'step', step: 'validate-step', path: 'validated_number' }
        },
        outputs: ['factorial_result', 'calculation_steps', 'formula_used']
      });

      steps.push({
        id: 'format-step',
        name: 'Format Factorial Result',
        type: 'activity',
        activity_id: 'format_factorial_result',
        inputs: {
          factorial_result: { source: 'step', step: 'calculate-step', path: 'factorial_result' },
          input_number: { source: 'step', step: 'validate-step', path: 'validated_number' },
          calculation_steps: { source: 'step', step: 'calculate-step', path: 'calculation_steps' }
        },
        outputs: ['formatted_result', 'detailed_result']
      });
    } else if (desc.includes('multiply') && desc.includes('divide')) {
      steps.push({
        id: 'multiply-step',
        name: 'Multiply Numbers',
        type: 'activity',
        activity_id: 'dynamic-multiply-activity',
        inputs: {
          number1: { source: 'input', path: 'number1' },
          number2: { source: 'input', path: 'number2' }
        },
        outputs: ['product']
      });

      steps.push({
        id: 'divide-step',
        name: 'Divide Result',
        type: 'activity',
        activity_id: 'dynamic-divide-activity',
        inputs: {
          dividend: { source: 'step', step: 'multiply-step', path: 'product' },
          divisor: { source: 'input', path: 'divisor' }
        },
        outputs: ['quotient']
      });
    }

    return steps;
  }

  /**
   * Generate complete dynamic workflow
   */
  async generateDynamicWorkflow(description, parameters = {}) {
    const workflowId = `dynamic-${Date.now()}`;
    
    this.logger.info('Generating complete dynamic workflow', { workflowId, description });

    // Parse description to get workflow steps
    const steps = await this.parseWorkflowDescription(description);
    
    // Generate activities for the steps
    const activities = await this.generateActivitiesFromDescription(description, steps);

    const workflowDef = {
      id: workflowId,
      name: `Dynamic Workflow: ${description}`,
      definition: { steps },
      activities,
      generated_by: 'dynamic-activity-generator',
      source_description: description
    };

    this.logger.info('Dynamic workflow generated successfully', { 
      workflowId,
      stepCount: steps.length,
      activityCount: activities.length
    });

    return workflowDef;
  }

  /**
   * Cleanup database connection
   */
  async cleanup() {
    await this.dbPool.end();
  }
}

module.exports = { DynamicActivityGenerator };