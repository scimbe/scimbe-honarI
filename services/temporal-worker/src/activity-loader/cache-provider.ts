/**
 * Redis Cache Provider for Activity Loading
 * High-performance caching layer for activity definitions and execution results
 */

import Redis from 'ioredis';
import { ActivityDefinition, WorkflowDefinition, CacheEntry, ActivityLoaderConfig } from './types';
import { createServiceLogger } from '../utils/logger';

const logger = createServiceLogger('cache-provider');

export class CacheProvider {
  private redis: Redis;
  private config: ActivityLoaderConfig['cache'];
  private keyPrefix: string;

  constructor(redisConfig: ActivityLoaderConfig['redis'], cacheConfig: ActivityLoaderConfig['cache']) {
    this.config = cacheConfig;
    this.keyPrefix = redisConfig.keyPrefix || 'temporal:activity-loader:';

    this.redis = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db || 0,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    // Handle Redis events
    this.redis.on('connect', () => {
      logger.info('Redis cache connected');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis cache error:', error);
    });
  }

  /**
   * Get activity definition from cache
   */
  async getActivityDefinition(idOrName: string): Promise<ActivityDefinition | null> {
    try {
      const key = this.getActivityKey(idOrName);
      const cached = await this.redis.get(key);
      
      if (!cached) {
        logger.debug('Activity cache miss:', { idOrName });
        return null;
      }

      const entry: CacheEntry<ActivityDefinition> = JSON.parse(cached);
      
      // Check TTL
      if (Date.now() - entry.timestamp > entry.ttl) {
        logger.debug('Activity cache expired:', { idOrName });
        await this.redis.del(key);
        return null;
      }

      logger.debug('Activity cache hit:', { idOrName });
      return entry.data;
      
    } catch (error) {
      logger.error('Failed to get activity from cache:', { idOrName, error });
      return null;
    }
  }

  /**
   * Store activity definition in cache
   */
  async setActivityDefinition(activity: ActivityDefinition): Promise<void> {
    try {
      const entry: CacheEntry<ActivityDefinition> = {
        data: activity,
        timestamp: Date.now(),
        ttl: this.config.activityTtl,
        version: activity.version
      };

      const key = this.getActivityKey(activity.id);
      await this.redis.setex(
        key, 
        Math.ceil(this.config.activityTtl / 1000), 
        JSON.stringify(entry)
      );

      // Also cache by name if different from ID
      if (activity.name !== activity.id) {
        const nameKey = this.getActivityKey(activity.name);
        await this.redis.setex(
          nameKey,
          Math.ceil(this.config.activityTtl / 1000),
          JSON.stringify(entry)
        );
      }

      logger.debug('Cached activity definition:', { 
        id: activity.id, 
        name: activity.name,
        version: activity.version 
      });
      
    } catch (error) {
      logger.error('Failed to cache activity definition:', { activity: activity.id, error });
    }
  }

  /**
   * Get workflow definition from cache
   */
  async getWorkflowDefinition(idOrName: string): Promise<WorkflowDefinition | null> {
    try {
      const key = this.getWorkflowKey(idOrName);
      const cached = await this.redis.get(key);
      
      if (!cached) {
        logger.debug('Workflow cache miss:', { idOrName });
        return null;
      }

      const entry: CacheEntry<WorkflowDefinition> = JSON.parse(cached);
      
      // Check TTL
      if (Date.now() - entry.timestamp > entry.ttl) {
        logger.debug('Workflow cache expired:', { idOrName });
        await this.redis.del(key);
        return null;
      }

      logger.debug('Workflow cache hit:', { idOrName });
      return entry.data;
      
    } catch (error) {
      logger.error('Failed to get workflow from cache:', { idOrName, error });
      return null;
    }
  }

  /**
   * Store workflow definition in cache
   */
  async setWorkflowDefinition(workflow: WorkflowDefinition): Promise<void> {
    try {
      const entry: CacheEntry<WorkflowDefinition> = {
        data: workflow,
        timestamp: Date.now(),
        ttl: this.config.workflowTtl,
        version: workflow.version
      };

      const key = this.getWorkflowKey(workflow.id);
      await this.redis.setex(
        key,
        Math.ceil(this.config.workflowTtl / 1000),
        JSON.stringify(entry)
      );

      // Also cache by name if different from ID
      if (workflow.name !== workflow.id) {
        const nameKey = this.getWorkflowKey(workflow.name);
        await this.redis.setex(
          nameKey,
          Math.ceil(this.config.workflowTtl / 1000),
          JSON.stringify(entry)
        );
      }

      logger.debug('Cached workflow definition:', { 
        id: workflow.id, 
        name: workflow.name,
        version: workflow.version 
      });
      
    } catch (error) {
      logger.error('Failed to cache workflow definition:', { workflow: workflow.id, error });
    }
  }

  /**
   * Store execution result temporarily
   */
  async storeExecutionResult(
    sessionId: string, 
    workflowId: string, 
    activityId: string, 
    result: any
  ): Promise<void> {
    try {
      const key = this.getExecutionResultKey(sessionId, workflowId, activityId);
      const entry = {
        result,
        timestamp: Date.now()
      };

      await this.redis.setex(
        key,
        Math.ceil(this.config.resultTtl / 1000),
        JSON.stringify(entry)
      );

      logger.debug('Stored execution result:', { sessionId, workflowId, activityId });
      
    } catch (error) {
      logger.error('Failed to store execution result:', { 
        sessionId, workflowId, activityId, error 
      });
    }
  }

  /**
   * Get execution result
   */
  async getExecutionResult(
    sessionId: string, 
    workflowId: string, 
    activityId: string
  ): Promise<any | null> {
    try {
      const key = this.getExecutionResultKey(sessionId, workflowId, activityId);
      const cached = await this.redis.get(key);
      
      if (!cached) return null;

      const entry = JSON.parse(cached);
      return entry.result;
      
    } catch (error) {
      logger.error('Failed to get execution result:', { 
        sessionId, workflowId, activityId, error 
      });
      return null;
    }
  }

  /**
   * Store activity parameter with pattern-based key
   */
  async storeActivityParameter(
    sessionId: string,
    workflowId: string,
    parameterName: string,
    value: any,
    metadata?: any
  ): Promise<void> {
    try {
      const key = this.getParameterKey(sessionId, workflowId, parameterName);
      const entry = {
        value,
        metadata: metadata || {},
        timestamp: Date.now()
      };

      await this.redis.setex(
        key,
        Math.ceil(this.config.resultTtl / 1000),
        JSON.stringify(entry)
      );

      logger.debug('Stored activity parameter:', { 
        sessionId, workflowId, parameterName, type: typeof value 
      });
      
    } catch (error) {
      logger.error('Failed to store activity parameter:', { 
        sessionId, workflowId, parameterName, error 
      });
    }
  }

  /**
   * Get activity parameter
   */
  async getActivityParameter(
    sessionId: string,
    workflowId: string,
    parameterName: string
  ): Promise<any | null> {
    try {
      const key = this.getParameterKey(sessionId, workflowId, parameterName);
      const cached = await this.redis.get(key);
      
      if (!cached) return null;

      const entry = JSON.parse(cached);
      return entry.value;
      
    } catch (error) {
      logger.error('Failed to get activity parameter:', { 
        sessionId, workflowId, parameterName, error 
      });
      return null;
    }
  }

  /**
   * Get all parameters for a workflow execution
   */
  async getAllParameters(sessionId: string, workflowId: string): Promise<Record<string, any>> {
    try {
      const pattern = this.getParameterKey(sessionId, workflowId, '*');
      const keys = await this.redis.keys(pattern);
      
      if (keys.length === 0) return {};

      const values = await this.redis.mget(keys);
      const result: Record<string, any> = {};

      keys.forEach((key, index) => {
        if (values[index]) {
          try {
            const entry = JSON.parse(values[index]!);
            const paramName = key.split(':').pop()!;
            result[paramName] = entry.value;
          } catch (e) {
            logger.warn('Failed to parse cached parameter:', { key });
          }
        }
      });

      logger.debug('Retrieved all parameters:', { 
        sessionId, workflowId, count: Object.keys(result).length 
      });
      
      return result;
      
    } catch (error) {
      logger.error('Failed to get all parameters:', { sessionId, workflowId, error });
      return {};
    }
  }

  /**
   * Clear cache entries by pattern
   */
  async clearByPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}${pattern}`);
      if (keys.length === 0) return 0;

      const deleted = await this.redis.del(...keys);
      logger.info('Cleared cache entries:', { pattern, deleted });
      return deleted;
      
    } catch (error) {
      logger.error('Failed to clear cache by pattern:', { pattern, error });
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<Record<string, any>> {
    try {
      const info = await this.redis.info('memory');
      const keyspace = await this.redis.info('keyspace');
      
      return {
        connected: this.redis.status === 'ready',
        memoryUsed: this.extractInfoValue(info, 'used_memory'),
        totalKeys: this.extractKeyspaceValue(keyspace),
        timestamp: Date.now()
      };
      
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      return { connected: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.disconnect();
    logger.info('Redis cache connection closed');
  }

  private getActivityKey(idOrName: string): string {
    return `${this.keyPrefix}activity:${idOrName}`;
  }

  private getWorkflowKey(idOrName: string): string {
    return `${this.keyPrefix}workflow:${idOrName}`;
  }

  private getExecutionResultKey(sessionId: string, workflowId: string, activityId: string): string {
    return `${this.keyPrefix}result:${sessionId}:${workflowId}:${activityId}`;
  }

  private getParameterKey(sessionId: string, workflowId: string, parameterName: string): string {
    return `${this.keyPrefix}param:${sessionId}:${workflowId}:${parameterName}`;
  }

  private extractInfoValue(info: string, key: string): string | null {
    const match = info.match(new RegExp(`${key}:(.+)`));
    return match?.[1]?.trim() || null;
  }

  private extractKeyspaceValue(keyspace: string): number {
    const match = keyspace.match(/keys=(\d+)/);
    return match?.[1] ? parseInt(match[1]) : 0;
  }
}