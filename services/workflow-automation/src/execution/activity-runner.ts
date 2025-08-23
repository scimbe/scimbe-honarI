/**
 * Activity Runner - Executes individual workflow activities
 * Handles safe execution of JavaScript activity code with:
 * - Input/output validation
 * - Timeout management
 * - Error handling and recovery
 * - Resource limitation
 * - Logging and monitoring
 */

import { VM } from 'vm2';
import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('activity-runner');

export interface ActivityContext {
  execution_id: string;
  workflow_id: string;
  activity_position: number;
  previous_outputs: Record<string, any>;
  execution_config: any;
  logger: any;
}

export interface ActivityResult {
  success: boolean;
  output_data: Record<string, any>;
  execution_time_ms: number;
  logs: string[];
  error?: {
    type: string;
    message: string;
    stack_trace?: string;
  };
}

export interface ActivityDefinition {
  id: string;
  name: string;
  function_name: string;
  javascript_code: string;
  input_schema?: any;
  output_schema?: any;
  timeout_seconds: number;
  retry_policy?: any;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class ActivityRunner {
  private redis: any;
  private logger: any;
  private runningActivities: Map<string, any> = new Map();

  constructor(redis: any, logger: any) {
    this.redis = redis;
    this.logger = logger;
  }

  /**
   * Execute a single activity with full lifecycle management
   */
  async executeActivity(
    activityId: string,
    inputData: Record<string, any>,
    context: ActivityContext
  ): Promise<ActivityResult> {
    const startTime = Date.now();
    const logs: string[] = [];
    
    try {
      this.logger.info('Starting activity execution', {
        activityId,
        executionId: context.execution_id,
        inputKeys: Object.keys(inputData)
      });

      // 1. Load activity definition
      const activityDef = await this.loadActivityDefinition(activityId);
      if (!activityDef) {
        throw new Error(`Activity ${activityId} not found`);
      }

      // 2. Validate inputs
      const inputValidation = await this.validateInputs(activityDef, inputData);
      if (!inputValidation.valid) {
        throw new Error(`Input validation failed: ${inputValidation.errors.join(', ')}`);
      }

      // 3. Prepare execution environment
      const executionEnv = await this.prepareExecutionEnvironment(
        activityDef,
        inputData,
        context,
        logs
      );

      // 4. Execute activity code
      const executionResult = await this.executeActivityCode(
        activityDef,
        executionEnv,
        context
      );

      // 5. Validate outputs
      const outputValidation = await this.validateOutputs(
        activityDef,
        executionResult
      );
      if (!outputValidation.valid) {
        throw new Error(`Output validation failed: ${outputValidation.errors.join(', ')}`);
      }

      const duration = Date.now() - startTime;

      this.logger.info('Activity execution completed successfully', {
        activityId,
        executionId: context.execution_id,
        duration
      });

      return {
        success: true,
        output_data: executionResult,
        execution_time_ms: duration,
        logs
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Activity execution failed', {
        activityId,
        executionId: context.execution_id,
        error: (error as Error).message,
        duration
      });

      return {
        success: false,
        output_data: {},
        execution_time_ms: duration,
        logs,
        error: {
          type: this.classifyError(error as Error),
          message: (error as Error).message,
          stack_trace: (error as Error).stack
        }
      };
    }
  }

  /**
   * Cancel all running activities for an execution
   */
  async cancelActivities(executionId: string): Promise<void> {
    try {
      const activitiesToCancel = Array.from(this.runningActivities.entries())
        .filter(([key, _]) => key.startsWith(executionId))
        .map(([key, vm]) => ({ key, vm }));

      for (const { key, vm } of activitiesToCancel) {
        try {
          // Attempt to stop the VM
          if (vm && typeof vm.stop === 'function') {
            vm.stop();
          }
          this.runningActivities.delete(key);
        } catch (error) {
          this.logger.warn('Failed to stop activity VM', { key, error });
        }
      }

      this.logger.info('Cancelled activities for execution', {
        executionId,
        cancelledCount: activitiesToCancel.length
      });

    } catch (error) {
      this.logger.error('Failed to cancel activities', { executionId, error });
    }
  }

  /**
   * Private method: Load activity definition from database
   */
  private async loadActivityDefinition(activityId: string): Promise<ActivityDefinition | null> {
    try {
      // This would typically load from database
      // For now, return a mock implementation
      return {
        id: activityId,
        name: `Activity_${activityId}`,
        function_name: 'executeActivity',
        javascript_code: `
          function executeActivity(inputs, context) {
            // Mock activity execution
            const result = {
              processed: true,
              input_count: Object.keys(inputs).length,
              timestamp: new Date().toISOString(),
              execution_id: context.execution_id
            };
            
            // Log activity execution
            context.log('info', 'Activity executed successfully', result);
            
            return result;
          }
        `,
        timeout_seconds: 300,
        input_schema: {},
        output_schema: {}
      };
    } catch (error) {
      this.logger.error('Failed to load activity definition', { activityId, error });
      return null;
    }
  }

  /**
   * Private method: Validate activity inputs
   */
  private async validateInputs(
    activityDef: ActivityDefinition,
    inputData: Record<string, any>
  ): Promise<ValidationResult> {
    try {
      // Basic validation - in production would use JSON Schema
      if (!inputData || typeof inputData !== 'object') {
        return {
          valid: false,
          errors: ['Input data must be an object']
        };
      }

      // Additional schema validation would go here
      if (activityDef.input_schema) {
        // Validate against JSON Schema
        // For now, just check if required fields exist
      }

      return {
        valid: true,
        errors: []
      };

    } catch (error) {
      return {
        valid: false,
        errors: [`Validation error: ${(error as Error).message}`]
      };
    }
  }

  /**
   * Private method: Validate activity outputs
   */
  private async validateOutputs(
    activityDef: ActivityDefinition,
    outputData: any
  ): Promise<ValidationResult> {
    try {
      // Basic validation
      if (outputData === null || outputData === undefined) {
        return {
          valid: false,
          errors: ['Activity must return output data']
        };
      }

      // Additional schema validation would go here
      if (activityDef.output_schema) {
        // Validate against JSON Schema
      }

      return {
        valid: true,
        errors: []
      };

    } catch (error) {
      return {
        valid: false,
        errors: [`Output validation error: ${(error as Error).message}`]
      };
    }
  }

  /**
   * Private method: Prepare execution environment
   */
  private async prepareExecutionEnvironment(
    activityDef: ActivityDefinition,
    inputData: Record<string, any>,
    context: ActivityContext,
    logs: string[]
  ): Promise<any> {
    return {
      inputs: inputData,
      context: {
        execution_id: context.execution_id,
        workflow_id: context.workflow_id,
        activity_position: context.activity_position,
        previous_outputs: context.previous_outputs,
        log: (level: string, message: string, metadata?: any) => {
          const logEntry = `[${level.toUpperCase()}] ${message}`;
          logs.push(logEntry);
          this.logger.info('Activity log', {
            executionId: context.execution_id,
            activityId: activityDef.id,
            level,
            message,
            metadata
          });
        }
      },
      // Helper functions available to activities
      helpers: {
        formatDate: (date: Date) => date.toISOString(),
        generateId: () => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
        fetch: this.createSafeFetch()
      }
    };
  }

  /**
   * Private method: Execute activity code in sandboxed environment
   */
  private async executeActivityCode(
    activityDef: ActivityDefinition,
    executionEnv: any,
    context: ActivityContext
  ): Promise<any> {
    const vmKey = `${context.execution_id}_${activityDef.id}`;
    
    try {
      // Create sandboxed VM with security restrictions
      const vm = new VM({
        timeout: (activityDef.timeout_seconds || 300) * 1000,
        sandbox: {
          ...executionEnv,
          console: {
            log: (...args: any[]) => executionEnv.context.log('info', args.join(' ')),
            error: (...args: any[]) => executionEnv.context.log('error', args.join(' ')),
            warn: (...args: any[]) => executionEnv.context.log('warn', args.join(' '))
          },
          setTimeout,
          clearTimeout,
          setInterval,
          clearInterval,
          Date,
          Math,
          JSON,
          Promise
        },
        wasm: false,
        eval: false,
        require: false
      });

      // Store VM reference for potential cancellation
      this.runningActivities.set(vmKey, vm);

      // Execute the activity code
      const code = `
        ${activityDef.javascript_code}
        
        // Execute the main function
        ${activityDef.function_name}(inputs, context);
      `;

      const result = await vm.run(code);

      // Clean up VM reference
      this.runningActivities.delete(vmKey);

      return result;

    } catch (error) {
      // Clean up VM reference on error
      this.runningActivities.delete(vmKey);
      
      if ((error as Error).message.includes('Script execution timed out')) {
        throw new Error(`Activity execution timed out after ${activityDef.timeout_seconds} seconds`);
      }
      
      throw error;
    }
  }

  /**
   * Private method: Create safe fetch function for activities
   */
  private createSafeFetch(): (url: string, options?: any) => Promise<any> {
    return async (url: string, options: any = {}) => {
      // Implement safe HTTP requests with restrictions
      const allowedDomains = process.env.ALLOWED_DOMAINS?.split(',') || [];
      
      try {
        const urlObj = new URL(url);
        
        // Check if domain is allowed
        if (allowedDomains.length > 0 && !allowedDomains.includes(urlObj.hostname)) {
          throw new Error(`Domain ${urlObj.hostname} is not in allowed domains list`);
        }

        // Basic fetch implementation (would use a more robust HTTP client in production)
        const response = await fetch(url, {
          ...options,
          timeout: 30000, // 30 second timeout
          headers: {
            'User-Agent': 'Workflow-Activity-Runner/1.0',
            ...options.headers
          }
        });

        return {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          json: () => response.json(),
          text: () => response.text()
        };

      } catch (error) {
        throw new Error(`HTTP request failed: ${(error as Error).message}`);
      }
    };
  }

  /**
   * Private method: Classify errors for proper handling
   */
  private classifyError(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'TIMEOUT_ERROR';
    }
    
    if (message.includes('validation')) {
      return 'VALIDATION_ERROR';
    }
    
    if (message.includes('network') || message.includes('fetch')) {
      return 'NETWORK_ERROR';
    }
    
    if (message.includes('memory') || message.includes('out of memory')) {
      return 'MEMORY_ERROR';
    }
    
    if (message.includes('permission') || message.includes('unauthorized')) {
      return 'PERMISSION_ERROR';
    }
    
    return 'ACTIVITY_ERROR';
  }
}