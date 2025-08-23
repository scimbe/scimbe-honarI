/**
 * Activity Parameter Manager Service
 * Handles session-based parameter storage and resolution using Redis
 * Pattern: sessionID.workflowID.parameterID
 */

import Redis from 'ioredis';
import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('activity-parameter-manager');

export interface ActivityParameter {
  value: any;
  type: 'string' | 'number' | 'object' | 'array' | 'boolean';
  timestamp: number;
  activityName: string;
  workflowId: string;
  sessionId: string;
  metadata: {
    source: 'activity_output' | 'user_input' | 'system_generated';
    validation?: {
      required: boolean;
      type: string;
      min?: number;
      max?: number;
      pattern?: string;
    };
  };
  ttl: number;
}

export interface SessionMetadata {
  sessionId: string;
  createdAt: number;
  workflowIds: string[];
  status: 'active' | 'completed' | 'failed' | 'expired';
  userContext?: Record<string, any>;
}

export interface WorkflowState {
  workflowId: string;
  sessionId: string;
  currentActivity: string | null;
  executionStatus: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  errorMessage?: string;
  activitySequence: string[];
  completedActivities: string[];
}

export interface ParameterSearchOptions {
  sessionId?: string;
  workflowId?: string;
  activityName?: string;
  parameterType?: string;
  timeRange?: {
    from: number;
    to: number;
  };
}

export class ActivityParameterManager {
  private redis: Redis;
  private keyPrefix: string = 'workflow-params:';

  constructor(redis: Redis) {
    this.redis = redis;
    logger.getLogger().info('Activity Parameter Manager initialized');
  }

  /**
   * Store activity parameter result in Redis
   */
  async storeActivityParameter(
    sessionId: string,
    workflowId: string,
    parameterId: string,
    activityName: string,
    value: any,
    metadata?: Partial<ActivityParameter['metadata']>
  ): Promise<void> {
    try {
      const timestamp = Date.now();
      const parameter: ActivityParameter = {
        value,
        type: this.inferType(value),
        timestamp,
        activityName,
        workflowId,
        sessionId,
        metadata: {
          source: 'activity_output',
          ...metadata,
        },
        ttl: 86400, // 24 hours
      };

      const key = this.buildParameterKey(sessionId, workflowId, parameterId);
      
      // Store parameter with TTL
      await this.redis.setex(key, parameter.ttl, JSON.stringify(parameter));
      
      // Also store in activity results collection
      const activityResultKey = this.buildActivityResultKey(sessionId, workflowId, activityName);
      await this.redis.setex(activityResultKey, parameter.ttl, JSON.stringify({
        activityName,
        parameters: { [parameterId]: parameter },
        timestamp,
      }));

      logger.getLogger().info({
        sessionId,
        workflowId,
        parameterId,
        activityName,
        type: parameter.type,
      }, 'Activity parameter stored');

    } catch (error) {
      logger.error(error as Error, { sessionId, workflowId, parameterId }, 
        'Failed to store activity parameter');
      throw error;
    }
  }

  /**
   * Retrieve parameter value with deterministic resolution
   */
  async resolveParameter(
    sessionId: string,
    workflowId: string,
    parameterId: string
  ): Promise<any> {
    try {
      const key = this.buildParameterKey(sessionId, workflowId, parameterId);
      const parameterData = await this.redis.get(key);

      if (!parameterData) {
        throw new ParameterNotFoundError(
          `Parameter not found: ${sessionId}.${workflowId}.${parameterId}`
        );
      }

      const parameter: ActivityParameter = JSON.parse(parameterData);
      
      // Validate parameter hasn't expired
      if (parameter.timestamp + (parameter.ttl * 1000) < Date.now()) {
        throw new SessionExpiredError(
          `Parameter expired: ${sessionId}.${workflowId}.${parameterId}`
        );
      }

      logger.getLogger().debug({
        sessionId,
        workflowId,
        parameterId,
        type: parameter.type,
      }, 'Parameter resolved');

      return parameter.value;

    } catch (error) {
      if (error instanceof ParameterNotFoundError || error instanceof SessionExpiredError) {
        throw error;
      }
      logger.error(error as Error, { sessionId, workflowId, parameterId }, 
        'Failed to resolve parameter');
      throw new ParameterResolutionError(`Failed to resolve parameter: ${error.message}`);
    }
  }

  /**
   * Store multiple parameters from activity execution
   */
  async storeActivityResults(
    sessionId: string,
    workflowId: string,
    activityName: string,
    results: Record<string, any>,
    metadata?: Partial<ActivityParameter['metadata']>
  ): Promise<void> {
    try {
      const timestamp = Date.now();
      const parameterPromises: Promise<void>[] = [];

      // Store each result parameter individually
      for (const [parameterId, value] of Object.entries(results)) {
        parameterPromises.push(
          this.storeActivityParameter(
            sessionId,
            workflowId,
            parameterId,
            activityName,
            value,
            metadata
          )
        );
      }

      await Promise.all(parameterPromises);

      // Update workflow state
      await this.updateWorkflowState(sessionId, workflowId, {
        currentActivity: null,
        completedActivities: [activityName], // This should be appended
      });

      logger.getLogger().info({
        sessionId,
        workflowId,
        activityName,
        parameterCount: Object.keys(results).length,
      }, 'Activity results stored');

    } catch (error) {
      logger.error(error as Error, { sessionId, workflowId, activityName }, 
        'Failed to store activity results');
      throw error;
    }
  }

  /**
   * Get all parameters for a workflow
   */
  async getWorkflowParameters(sessionId: string, workflowId: string): Promise<Record<string, any>> {
    try {
      const pattern = this.buildParameterKey(sessionId, workflowId, '*');
      const keys = await this.redis.keys(pattern);
      
      const parameters: Record<string, any> = {};
      
      if (keys.length > 0) {
        const values = await this.redis.mget(...keys);
        
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const value = values[i];
          if (key && value) {
            const parameterId = key.split('.').pop() || '';
            const parameter: ActivityParameter = JSON.parse(value);
            parameters[parameterId] = parameter.value;
          }
        }
      }

      return parameters;

    } catch (error) {
      logger.error(error as Error, { sessionId, workflowId }, 
        'Failed to get workflow parameters');
      throw error;
    }
  }

  /**
   * Search parameters with filters
   */
  async searchParameters(options: ParameterSearchOptions): Promise<ActivityParameter[]> {
    try {
      let pattern = `${this.keyPrefix}`;
      
      if (options.sessionId) {
        pattern += `${options.sessionId}.`;
        if (options.workflowId) {
          pattern += `${options.workflowId}.`;
          pattern += '*';
        } else {
          pattern += '*.*';
        }
      } else {
        pattern += '*.*.*';
      }

      const keys = await this.redis.keys(pattern);
      const parameters: ActivityParameter[] = [];

      if (keys.length > 0) {
        const values = await this.redis.mget(...keys);
        
        for (let i = 0; i < keys.length; i++) {
          const value = values[i];
          if (value) {
            const parameter: ActivityParameter = JSON.parse(value);
            
            // Apply filters
            if (options.activityName && parameter.activityName !== options.activityName) {
              continue;
            }
            
            if (options.parameterType && parameter.type !== options.parameterType) {
              continue;
            }
            
            if (options.timeRange) {
              if (parameter.timestamp < options.timeRange.from || 
                  parameter.timestamp > options.timeRange.to) {
                continue;
              }
            }
            
            parameters.push(parameter);
          }
        }
      }

      return parameters.sort((a, b) => b.timestamp - a.timestamp);

    } catch (error) {
      logger.error(error as Error, options, 'Failed to search parameters');
      throw error;
    }
  }

  /**
   * Create or update session metadata
   */
  async createSession(sessionId: string, userContext?: Record<string, any>): Promise<void> {
    try {
      const metadata: SessionMetadata = {
        sessionId,
        createdAt: Date.now(),
        workflowIds: [],
        status: 'active',
        userContext,
      };

      const key = `${this.keyPrefix}session:${sessionId}:metadata`;
      await this.redis.setex(key, 86400, JSON.stringify(metadata)); // 24 hours

      logger.getLogger().info({ sessionId }, 'Session created');

    } catch (error) {
      logger.error(error as Error, { sessionId }, 'Failed to create session');
      throw error;
    }
  }

  /**
   * Update workflow state
   */
  async updateWorkflowState(
    sessionId: string,
    workflowId: string,
    updates: Partial<WorkflowState>
  ): Promise<void> {
    try {
      const key = `${this.keyPrefix}session:${sessionId}:workflow:${workflowId}:state`;
      const existingData = await this.redis.get(key);
      
      let state: WorkflowState;
      if (existingData) {
        state = { ...JSON.parse(existingData), ...updates };
      } else {
        state = {
          workflowId,
          sessionId,
          currentActivity: null,
          executionStatus: 'pending',
          startedAt: Date.now(),
          activitySequence: [],
          completedActivities: [],
          ...updates,
        };
      }

      // Handle array merging for completedActivities
      if (updates.completedActivities) {
        const existing = state.completedActivities || [];
        state.completedActivities = [...new Set([...existing, ...updates.completedActivities])];
      }

      await this.redis.setex(key, 172800, JSON.stringify(state)); // 48 hours

    } catch (error) {
      logger.error(error as Error, { sessionId, workflowId }, 
        'Failed to update workflow state');
      throw error;
    }
  }

  /**
   * Clean up expired parameters
   */
  async cleanupExpiredParameters(): Promise<number> {
    try {
      const pattern = `${this.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);
      let deletedCount = 0;

      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        if (ttl === -2) { // Key doesn't exist
          deletedCount++;
        }
      }

      logger.getLogger().info({ deletedCount }, 'Expired parameters cleaned up');
      return deletedCount;

    } catch (error) {
      logger.error(error as Error, {}, 'Failed to cleanup expired parameters');
      throw error;
    }
  }

  // Private helper methods

  private buildParameterKey(sessionId: string, workflowId: string, parameterId: string): string {
    return `${this.keyPrefix}${sessionId}.${workflowId}.${parameterId}`;
  }

  private buildActivityResultKey(sessionId: string, workflowId: string, activityName: string): string {
    return `${this.keyPrefix}session:${sessionId}:workflow:${workflowId}:results:${activityName}`;
  }

  private inferType(value: any): ActivityParameter['type'] {
    if (value === null || value === undefined) return 'string';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'string';
  }
}

// Custom Error Classes
export class ParameterNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParameterNotFoundError';
  }
}

export class SessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export class ParameterResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParameterResolutionError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionNotFoundError';
  }
}

export class ParameterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParameterValidationError';
  }
}