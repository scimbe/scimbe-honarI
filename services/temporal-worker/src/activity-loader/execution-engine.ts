/**
 * Secure Activity Execution Engine
 * Provides sandboxed execution environment for dynamic activities
 */

import { VM } from 'vm2';
import { ActivityDefinition, ActivityExecutionContext, ActivityExecutionResult, ResourceLimits } from './types';
import { createServiceLogger } from '../utils/logger';

const logger = createServiceLogger('execution-engine');

export class ActivityExecutionEngine {
  private defaultTimeout: number;
  private defaultMemoryLimit: number;
  private sandboxed: boolean;

  constructor(options: {
    defaultTimeout: number;
    defaultMemoryLimit: number;
    sandboxed: boolean;
  }) {
    this.defaultTimeout = options.defaultTimeout;
    this.defaultMemoryLimit = options.defaultMemoryLimit;
    this.sandboxed = options.sandboxed;
  }

  /**
   * Execute activity with full security and monitoring
   */
  async executeActivity(
    activity: ActivityDefinition,
    context: ActivityExecutionContext
  ): Promise<ActivityExecutionResult> {
    const startTime = Date.now();
    let memoryUsed = 0;

    try {
      logger.info('Executing activity:', { 
        activityId: activity.id,
        name: activity.name,
        type: activity.type,
        attempt: context.attempt
      });

      // Validate inputs against schema
      if (activity.inputSchema) {
        this.validateInput(context.input, activity.inputSchema);
      }

      let result: any;

      // Execute based on activity type
      switch (activity.type) {
        case 'javascript':
        case 'typescript':
          result = await this.executeJavaScript(activity, context);
          break;
        case 'http':
          result = await this.executeHttpRequest(activity, context);
          break;
        case 'sql':
          result = await this.executeSqlQuery(activity, context);
          break;
        case 'python':
          result = await this.executePython(activity, context);
          break;
        case 'shell':
          result = await this.executeShellCommand(activity, context);
          break;
        default:
          throw new Error(`Unsupported activity type: ${activity.type}`);
      }

      // Validate output against schema
      if (activity.outputSchema) {
        this.validateOutput(result, activity.outputSchema);
      }

      const executionTime = Date.now() - startTime;
      
      logger.info('Activity executed successfully:', {
        activityId: activity.id,
        executionTime,
        outputSize: JSON.stringify(result).length
      });

      return {
        success: true,
        result,
        metadata: {
          executionTime,
          memoryUsed,
          outputSize: JSON.stringify(result).length,
          attempt: context.attempt,
          timestamp: Date.now()
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Activity execution failed:', {
        activityId: activity.id,
        error: errorMessage,
        executionTime,
        attempt: context.attempt
      });

      return {
        success: false,
        error: errorMessage,
        metadata: {
          executionTime,
          memoryUsed,
          outputSize: 0,
          attempt: context.attempt,
          timestamp: Date.now()
        }
      };
    }
  }

  /**
   * Execute JavaScript/TypeScript activity in sandboxed environment
   */
  private async executeJavaScript(
    activity: ActivityDefinition,
    context: ActivityExecutionContext
  ): Promise<any> {
    if (!this.sandboxed) {
      // Non-sandboxed execution for trusted environments
      return this.executeJavaScriptUnsafe(activity, context);
    }

    const timeout = activity.timeout || this.defaultTimeout;
    const memoryLimit = activity.resources?.memory ? this.parseMemoryLimit(activity.resources.memory) : this.defaultMemoryLimit;

    const vm = new VM({
      timeout,
      sandbox: {
        // Provide safe global objects
        console: {
          log: (...args: any[]) => logger.debug('Activity console.log:', args),
          error: (...args: any[]) => logger.warn('Activity console.error:', args),
          warn: (...args: any[]) => logger.warn('Activity console.warn:', args),
        },
        JSON,
        Math,
        Date,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        // Activity context
        input: context.input,
        previousResults: context.previousResults || {},
        configuration: context.configuration || {},
        metadata: context.metadata || {},
      },
      // Security restrictions
      eval: false,
      wasm: false,
      fixAsync: true,
    });

    try {
      // Wrap the activity code in a function if it's not already
      let code = activity.implementation;
      
      // Check if code defines a function
      const functionMatch = code.match(/(?:function\s+(\w+)|const\s+(\w+)\s*=|(?:export\s+)?(?:async\s+)?function\s+(\w+))/);
      const functionName = functionMatch?.[1] || functionMatch?.[2] || functionMatch?.[3];

      if (!functionName) {
        // Wrap in anonymous function
        code = `
          (function() {
            ${code}
          })()
        `;
      } else {
        // Call the defined function
        code = `
          ${code}
          
          // Call the function with provided input
          if (typeof ${functionName} === 'function') {
            ${functionName}(input, previousResults, configuration);
          } else {
            throw new Error('Function ${functionName} is not defined or not a function');
          }
        `;
      }

      const result = await vm.run(code);
      return result;

    } catch (error) {
      if (error instanceof Error && error.message?.includes('Script execution timed out')) {
        throw new Error(`Activity execution timed out after ${timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Execute JavaScript without sandboxing (for trusted environments)
   */
  private async executeJavaScriptUnsafe(
    activity: ActivityDefinition,
    context: ActivityExecutionContext
  ): Promise<any> {
    // Create execution context
    const executionContext = {
      input: context.input,
      previousResults: context.previousResults || {},
      configuration: context.configuration || {},
      metadata: context.metadata || {},
      console: {
        log: (...args: any[]) => logger.debug('Activity console.log:', args),
        error: (...args: any[]) => logger.warn('Activity console.error:', args),
        warn: (...args: any[]) => logger.warn('Activity console.warn:', args),
      },
      JSON,
      Math,
      Date,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
    };

    // Create function with the activity code
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const func = new AsyncFunction(
      'input', 'previousResults', 'configuration', 'metadata', 'console', 'JSON', 'Math', 'Date', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
      activity.implementation
    );

    // Execute with timeout
    const timeout = activity.timeout || this.defaultTimeout;
    
    return Promise.race([
      func(
        executionContext.input,
        executionContext.previousResults,
        executionContext.configuration,
        executionContext.metadata,
        executionContext.console,
        executionContext.JSON,
        executionContext.Math,
        executionContext.Date,
        executionContext.parseInt,
        executionContext.parseFloat,
        executionContext.isNaN,
        executionContext.isFinite
      ),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Activity execution timed out after ${timeout}ms`));
        }, timeout);
      })
    ]);
  }

  /**
   * Execute HTTP request activity
   */
  private async executeHttpRequest(
    activity: ActivityDefinition,
    context: ActivityExecutionContext
  ): Promise<any> {
    // Use native fetch if available (Node.js 18+)
    let fetch: any;
    if (globalThis.fetch) {
      fetch = globalThis.fetch;
    } else {
      // Fallback to node-fetch for older Node.js versions
      const nodeFetch = await import('node-fetch');
      fetch = nodeFetch.default;
    }
    
    // Parse HTTP configuration from implementation
    let httpConfig: any;
    try {
      httpConfig = JSON.parse(activity.implementation);
    } catch (error) {
      throw new Error('Invalid HTTP configuration JSON in activity implementation');
    }

    // Replace template variables in configuration
    const processedConfig = this.processTemplate(httpConfig, {
      input: context.input,
      previousResults: context.previousResults || {},
      configuration: context.configuration || {}
    });

    const timeout = activity.timeout || this.defaultTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(processedConfig.url, {
        method: processedConfig.method || 'GET',
        headers: processedConfig.headers || {},
        body: processedConfig.body ? JSON.stringify(processedConfig.body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      let result: any;

      if (contentType.includes('application/json')) {
        result = await response.json();
      } else if (contentType.includes('text/')) {
        result = await response.text();
      } else {
        result = await response.arrayBuffer();
      }

      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        data: result
      };

    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Execute SQL query activity
   */
  private async executeSqlQuery(
    activity: ActivityDefinition,
    context: ActivityExecutionContext
  ): Promise<any> {
    // This would require database connection configuration
    // For now, throw not implemented
    throw new Error('SQL activity execution not implemented - requires database configuration');
  }

  /**
   * Execute Python activity
   */
  private async executePython(
    activity: ActivityDefinition,
    context: ActivityExecutionContext
  ): Promise<any> {
    // This would require Python runtime integration
    // For now, throw not implemented
    throw new Error('Python activity execution not implemented - requires Python runtime');
  }

  /**
   * Execute shell command activity
   */
  private async executeShellCommand(
    activity: ActivityDefinition,
    context: ActivityExecutionContext
  ): Promise<any> {
    // This would be potentially dangerous and requires careful sandboxing
    // For now, throw not implemented
    throw new Error('Shell activity execution not implemented - security concerns');
  }

  /**
   * Validate input against JSON schema
   */
  private validateInput(input: any, schema: Record<string, any>): void {
    // Basic validation - in production, use a proper JSON schema validator
    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required) {
        if (!(field in input)) {
          throw new Error(`Missing required input field: ${field}`);
        }
      }
    }
  }

  /**
   * Validate output against JSON schema
   */
  private validateOutput(output: any, schema: Record<string, any>): void {
    // Basic validation - in production, use a proper JSON schema validator
    if (schema.type && typeof output !== schema.type) {
      throw new Error(`Output type mismatch: expected ${schema.type}, got ${typeof output}`);
    }
  }

  /**
   * Process template variables in configuration
   */
  private processTemplate(obj: any, context: Record<string, any>): any {
    if (typeof obj === 'string') {
      return obj.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        const keys = path.trim().split('.');
        let value = context;
        for (const key of keys) {
          value = value?.[key];
        }
        return value !== undefined ? String(value) : match;
      });
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.processTemplate(item, context));
    } else if (obj && typeof obj === 'object') {
      const processed: any = {};
      for (const [key, value] of Object.entries(obj)) {
        processed[key] = this.processTemplate(value, context);
      }
      return processed;
    } else {
      return obj;
    }
  }

  /**
   * Parse memory limit string to bytes
   */
  private parseMemoryLimit(limit: string): number {
    const units: Record<string, number> = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
    };

    const match = limit.match(/^(\d+)\s*([A-Z]*B?)$/i);
    if (!match) return this.defaultMemoryLimit;

    const value = parseInt(match[1]);
    const unit = (match[2] || 'B').toUpperCase();
    
    return value * (units[unit] || 1);
  }
}