/**
 * Generic and Stable Redis Validation System
 * Provides safe Redis operations with proper error handling and validation
 */

import Redis from 'ioredis';
import { RegexParser } from './regex-parser';

export interface RedisValidationOptions {
  keyPrefix?: string;
  ttl?: number;
  maxKeyLength?: number;
  maxValueSize?: number;
  compressionThreshold?: number;
}

export interface StoredParameter {
  value: any;
  type: string;
  activityName: string;
  activityId: string;
  workflowId: string;
  sessionId: string;
  timestamp: number;
  compressed?: boolean;
}

export class RedisValidator {
  private redis: Redis;
  private options: Required<RedisValidationOptions>;

  constructor(redis: Redis, options: RedisValidationOptions = {}) {
    this.redis = redis;
    this.options = {
      keyPrefix: options.keyPrefix || 'temporal:workflow:',
      ttl: options.ttl || 3600, // 1 hour default
      maxKeyLength: options.maxKeyLength || 250,
      maxValueSize: options.maxValueSize || 1024 * 1024, // 1MB
      compressionThreshold: options.compressionThreshold || 1024, // 1KB
      ...options
    };
  }

  /**
   * Safely store workflow parameter in Redis with validation
   */
  async storeParameter(
    sessionId: string,
    workflowId: string,
    parameterName: string,
    value: any,
    metadata: {
      activityName: string;
      activityId: string;
    }
  ): Promise<boolean> {
    try {
      // Validate inputs
      if (!this.isValidIdentifier(sessionId)) {
        throw new Error(`Invalid session ID: ${sessionId}`);
      }
      
      if (!this.isValidIdentifier(workflowId)) {
        throw new Error(`Invalid workflow ID: ${workflowId}`);
      }
      
      if (!this.isValidParameterName(parameterName)) {
        throw new Error(`Invalid parameter name: ${parameterName}`);
      }

      // Create Redis key
      const redisKey = this.buildKey(sessionId, workflowId, parameterName);
      
      // Validate key length
      if (redisKey.length > this.options.maxKeyLength) {
        throw new Error(`Redis key too long: ${redisKey.length} > ${this.options.maxKeyLength}`);
      }

      // Prepare stored data
      const storedData: StoredParameter = {
        value,
        type: typeof value,
        activityName: metadata.activityName,
        activityId: metadata.activityId,
        workflowId,
        sessionId,
        timestamp: Date.now()
      };

      // Serialize and compress if needed
      let serialized = JSON.stringify(storedData);
      
      if (serialized.length > this.options.maxValueSize) {
        throw new Error(`Value too large: ${serialized.length} > ${this.options.maxValueSize}`);
      }

      // Store with TTL
      await this.redis.setex(redisKey, this.options.ttl, serialized);
      
      console.log(`💾 REDIS: Stored ${parameterName} = ${value} for activity ${metadata.activityName} (key: ${redisKey})`);
      return true;
      
    } catch (error) {
      console.error(`❌ REDIS: Failed to store parameter ${parameterName}:`, error);
      return false;
    }
  }

  /**
   * Safely retrieve workflow parameter from Redis
   */
  async getParameter(
    sessionId: string,
    workflowId: string,
    parameterName: string
  ): Promise<StoredParameter | null> {
    try {
      const redisKey = this.buildKey(sessionId, workflowId, parameterName);
      const rawValue = await this.redis.get(redisKey);
      
      if (!rawValue) {
        return null;
      }

      const parsed: StoredParameter = JSON.parse(rawValue);
      
      // Validate structure
      if (!this.isValidStoredParameter(parsed)) {
        console.warn(`⚠️ REDIS: Invalid parameter structure for ${parameterName}`);
        return null;
      }

      return parsed;
      
    } catch (error) {
      console.error(`❌ REDIS: Failed to get parameter ${parameterName}:`, error);
      return null;
    }
  }

  /**
   * Get all parameters for a workflow session
   */
  async getAllParameters(
    sessionId: string,
    workflowId: string
  ): Promise<Record<string, StoredParameter>> {
    try {
      const pattern = this.buildKey(sessionId, workflowId, '*');
      const keys = await this.redis.keys(pattern);
      const parameters: Record<string, StoredParameter> = {};
      
      for (const key of keys) {
        try {
          const rawValue = await this.redis.get(key);
          if (rawValue) {
            const parsed: StoredParameter = JSON.parse(rawValue);
            if (this.isValidStoredParameter(parsed)) {
              const paramName = this.extractParameterName(key);
              if (paramName) {
                parameters[paramName] = parsed;
              }
            }
          }
        } catch (e) {
          console.warn(`⚠️ REDIS: Failed to parse parameter from key ${key}:`, e);
        }
      }
      
      console.log(`🔗 REDIS: Found ${Object.keys(parameters).length} parameters for workflow ${workflowId}`);
      return parameters;
      
    } catch (error) {
      console.error(`❌ REDIS: Failed to get all parameters for workflow ${workflowId}:`, error);
      return {};
    }
  }

  /**
   * Store multiple parameters efficiently (batch operation)
   */
  async storeParameters(
    sessionId: string,
    workflowId: string,
    parameters: Record<string, any>,
    metadata: {
      activityName: string;
      activityId: string;
    }
  ): Promise<string[]> {
    const pipeline = this.redis.pipeline();
    const successfulKeys: string[] = [];
    
    try {
      for (const [paramName, value] of Object.entries(parameters)) {
        // Skip metadata fields
        if (['timestamp', 'validated', '_metadata'].includes(paramName)) continue;
        
        const redisKey = this.buildKey(sessionId, workflowId, paramName);
        
        const storedData: StoredParameter = {
          value,
          type: typeof value,
          activityName: metadata.activityName,
          activityId: metadata.activityId,
          workflowId,
          sessionId,
          timestamp: Date.now()
        };
        
        const serialized = JSON.stringify(storedData);
        
        if (serialized.length <= this.options.maxValueSize && redisKey.length <= this.options.maxKeyLength) {
          pipeline.setex(redisKey, this.options.ttl, serialized);
          successfulKeys.push(paramName);
        } else {
          console.warn(`⚠️ REDIS: Skipping parameter ${paramName} (too large)`);
        }
      }
      
      await pipeline.exec();
      console.log(`💾 REDIS: Batch stored ${successfulKeys.length} parameters`);
      return successfulKeys;
      
    } catch (error) {
      console.error('❌ REDIS: Batch store failed:', error);
      return [];
    }
  }

  /**
   * Clean up expired or invalid parameters
   */
  async cleanup(sessionId?: string, workflowId?: string): Promise<number> {
    try {
      const pattern = sessionId && workflowId 
        ? this.buildKey(sessionId, workflowId, '*')
        : `${this.options.keyPrefix}*`;
        
      const keys = await this.redis.keys(pattern);
      let deletedCount = 0;
      
      for (const key of keys) {
        try {
          const rawValue = await this.redis.get(key);
          if (!rawValue) {
            continue;
          }
          
          const parsed: StoredParameter = JSON.parse(rawValue);
          
          // Check if parameter is too old or invalid
          const age = Date.now() - parsed.timestamp;
          const maxAge = this.options.ttl * 1000; // Convert to milliseconds
          
          if (age > maxAge || !this.isValidStoredParameter(parsed)) {
            await this.redis.del(key);
            deletedCount++;
          }
        } catch (e) {
          // Invalid data, delete it
          await this.redis.del(key);
          deletedCount++;
        }
      }
      
      console.log(`🧹 REDIS: Cleaned up ${deletedCount} invalid/expired parameters`);
      return deletedCount;
      
    } catch (error) {
      console.error('❌ REDIS: Cleanup failed:', error);
      return 0;
    }
  }

  /**
   * Get Redis health and statistics
   */
  async getHealthStatus(): Promise<{
    connected: boolean;
    keyCount: number;
    memoryUsed: string;
    uptime: number;
  }> {
    try {
      const info = await this.redis.info('memory');
      const keyspace = await this.redis.info('keyspace');
      const server = await this.redis.info('server');
      
      const memoryUsed = RegexParser.parseRedisInfo(info, 'used_memory_human') || 'unknown';
      const keyCount = this.parseKeyCount(keyspace);
      const uptime = parseInt(RegexParser.parseRedisInfo(server, 'uptime_in_seconds') || '0');
      
      return {
        connected: this.redis.status === 'ready',
        keyCount,
        memoryUsed,
        uptime
      };
      
    } catch (error) {
      return {
        connected: false,
        keyCount: 0,
        memoryUsed: 'unknown',
        uptime: 0
      };
    }
  }

  // Private helper methods

  private buildKey(sessionId: string, workflowId: string, parameterName: string): string {
    return `${this.options.keyPrefix}${sessionId}.${workflowId}.${parameterName}`;
  }

  private extractParameterName(key: string): string | null {
    const parts = key.replace(this.options.keyPrefix, '').split('.');
    return parts.length >= 3 ? parts[2] : null;
  }

  private isValidIdentifier(id: string): boolean {
    return /^[a-zA-Z0-9_-]{1,100}$/.test(id);
  }

  private isValidParameterName(name: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
  }

  private isValidStoredParameter(data: any): data is StoredParameter {
    return (
      typeof data === 'object' &&
      data !== null &&
      typeof data.value !== 'undefined' &&
      typeof data.type === 'string' &&
      typeof data.activityName === 'string' &&
      typeof data.activityId === 'string' &&
      typeof data.workflowId === 'string' &&
      typeof data.sessionId === 'string' &&
      typeof data.timestamp === 'number'
    );
  }

  private parseKeyCount(keyspace: string): number {
    const match = keyspace.match(/keys=(\d+)/);
    return match?.[1] ? parseInt(match[1]) : 0;
  }
}