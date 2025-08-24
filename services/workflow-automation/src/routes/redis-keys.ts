/**
 * Redis Keys API Endpoints
 * Provides Redis key discovery and autocompletion for workflow parameters
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import Redis from 'ioredis';
import { createRedisConnection } from '../cache/redis';
import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('redis-keys-api');

let redis: Redis | null = null;

// Initialize Redis connection
async function initializeRedis(): Promise<void> {
  if (!redis) {
    const env = {
      REDIS_URL: process.env.REDIS_URL || 'redis://redis:6379',
    };
    redis = await createRedisConnection(env as any);
  }
}

interface RedisKeyOption {
  key: string;
  type: string;
  description?: string;
  lastUpdated: number;
}

export async function redisKeysRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
): Promise<void> {
  
  /**
   * GET /keys
   * Get available Redis keys for a workflow with autocompletion data
   */
  fastify.get('/keys', async (request, reply) => {
    try {
      await initializeRedis();
      
      const { workflow: workflowId } = request.query as { workflow?: string };
      
      if (!workflowId) {
        return reply.status(400).send({
          success: false,
          error: 'workflow parameter is required'
        });
      }

      // Get all Redis keys matching the workflow pattern
      const workflowKeys = await redis!.keys(`${workflowId}.*`);
      const globalKeys = await redis!.keys('global.*');
      const systemKeys = await redis!.keys('system.*');
      
      // Combine all relevant keys
      const allKeys = [...workflowKeys, ...globalKeys, ...systemKeys];
      
      // Build key options with metadata
      const keyOptions: RedisKeyOption[] = await Promise.all(
        allKeys.map(async (key) => {
          try {
            const value = await redis!.get(key);
            const ttl = await redis!.ttl(key);
            
            // Determine type from value
            let type = 'string';
            let parsedValue = value;
            
            try {
              if (value) {
                parsedValue = JSON.parse(value);
                if (Array.isArray(parsedValue)) {
                  type = 'array';
                } else if (typeof parsedValue === 'object') {
                  type = 'object';
                } else if (typeof parsedValue === 'number') {
                  type = 'number';
                } else if (typeof parsedValue === 'boolean') {
                  type = 'boolean';
                }
              }
            } catch {
              // Keep as string if not JSON parseable
              if (value && !isNaN(Number(value))) {
                type = 'number';
              }
            }
            
            // Generate description based on key pattern
            let description = '';
            if (key.includes('.previous_result')) {
              description = 'Previous activity result';
            } else if (key.includes('.user_input')) {
              description = 'User provided input';
            } else if (key.includes('.validation_result')) {
              description = 'Validation output';
            } else if (key.startsWith('global.')) {
              description = 'Global system parameter';
            } else if (key.startsWith('system.')) {
              description = 'System configuration';
            } else if (key.includes('.output')) {
              description = 'Activity output parameter';
            } else if (key.includes('.input')) {
              description = 'Activity input parameter';
            } else {
              description = `${type} parameter`;
            }
            
            return {
              key,
              type,
              description,
              lastUpdated: Date.now() - (ttl > 0 ? (86400 - ttl) * 1000 : 0) // Estimate last update
            };
          } catch (error) {
            logger.warn(`Failed to get metadata for key ${key}:`, error);
            return {
              key,
              type: 'unknown',
              description: 'Unable to determine type',
              lastUpdated: Date.now()
            };
          }
        })
      );
      
      // Sort by relevance: workflow-specific keys first, then global
      keyOptions.sort((a, b) => {
        const aIsWorkflow = a.key.startsWith(`${workflowId}.`);
        const bIsWorkflow = b.key.startsWith(`${workflowId}.`);
        
        if (aIsWorkflow && !bIsWorkflow) return -1;
        if (!aIsWorkflow && bIsWorkflow) return 1;
        
        // Secondary sort by key name
        return a.key.localeCompare(b.key);
      });
      
      reply.send({
        success: true,
        data: {
          workflowId,
          keys: keyOptions,
          count: keyOptions.length
        },
        message: `Found ${keyOptions.length} Redis keys for workflow ${workflowId}`
      });

    } catch (error) {
      logger.error(error as Error, { query: request.query }, 'Failed to get Redis keys');
      reply.status(500).send({
        success: false,
        error: 'Failed to get Redis keys',
        details: error.message
      });
    }
  });

  /**
   * POST /keys/search
   * Search Redis keys with pattern matching
   */
  fastify.post('/keys/search', async (request, reply) => {
    try {
      await initializeRedis();
      
      const { pattern, workflowId, limit = 50 } = request.body as { 
        pattern: string; 
        workflowId?: string; 
        limit?: number;
      };
      
      if (!pattern) {
        return reply.status(400).send({
          success: false,
          error: 'pattern is required'
        });
      }

      // Build search patterns
      let searchPatterns = [pattern];
      
      if (workflowId) {
        // Add workflow-specific patterns
        searchPatterns = [
          `${workflowId}.${pattern}`,
          `${workflowId}.*${pattern}*`,
          pattern
        ];
      }
      
      // Get matching keys
      const matchingKeys = new Set<string>();
      
      for (const searchPattern of searchPatterns) {
        const keys = await redis!.keys(searchPattern);
        keys.forEach(key => matchingKeys.add(key));
      }
      
      // Limit results
      const limitedKeys = Array.from(matchingKeys).slice(0, limit);
      
      // Get metadata for matching keys
      const keyOptions: RedisKeyOption[] = await Promise.all(
        limitedKeys.map(async (key) => {
          try {
            const value = await redis!.get(key);
            let type = 'string';
            
            try {
              if (value) {
                const parsed = JSON.parse(value);
                type = Array.isArray(parsed) ? 'array' : typeof parsed;
              }
            } catch {
              if (value && !isNaN(Number(value))) {
                type = 'number';
              }
            }
            
            return {
              key,
              type,
              description: `Matches pattern: ${pattern}`,
              lastUpdated: Date.now()
            };
          } catch {
            return {
              key,
              type: 'unknown',
              description: 'Unable to determine type',
              lastUpdated: Date.now()
            };
          }
        })
      );
      
      reply.send({
        success: true,
        data: {
          pattern,
          workflowId,
          keys: keyOptions,
          count: keyOptions.length,
          totalFound: matchingKeys.size
        },
        message: `Found ${keyOptions.length} keys matching pattern "${pattern}"`
      });

    } catch (error) {
      logger.error(error as Error, { body: request.body }, 'Failed to search Redis keys');
      reply.status(500).send({
        success: false,
        error: 'Failed to search Redis keys',
        details: error.message
      });
    }
  });

  /**
   * GET /keys/value/:key
   * Get the value of a specific Redis key
   */
  fastify.get('/keys/value/:key', async (request, reply) => {
    try {
      await initializeRedis();
      
      const { key } = request.params as { key: string };
      
      // Decode URL-encoded key
      const decodedKey = decodeURIComponent(key);
      
      const value = await redis!.get(decodedKey);
      const ttl = await redis!.ttl(decodedKey);
      const exists = await redis!.exists(decodedKey);
      
      if (!exists) {
        return reply.status(404).send({
          success: false,
          error: 'Key not found',
          data: { key: decodedKey }
        });
      }
      
      // Parse value and determine type
      let parsedValue = value;
      let type = 'string';
      
      try {
        if (value) {
          parsedValue = JSON.parse(value);
          if (Array.isArray(parsedValue)) {
            type = 'array';
          } else if (typeof parsedValue === 'object') {
            type = 'object';
          } else {
            type = typeof parsedValue;
          }
        }
      } catch {
        if (value && !isNaN(Number(value))) {
          type = 'number';
          parsedValue = Number(value);
        }
      }
      
      reply.send({
        success: true,
        data: {
          key: decodedKey,
          value: parsedValue,
          rawValue: value,
          type,
          ttl,
          exists
        }
      });

    } catch (error) {
      logger.error(error as Error, { params: request.params }, 'Failed to get Redis key value');
      reply.status(500).send({
        success: false,
        error: 'Failed to get Redis key value',
        details: error.message
      });
    }
  });

  /**
   * GET /health
   * Health check for Redis connection
   */
  fastify.get('/health', async (request, reply) => {
    try {
      await initializeRedis();
      
      const pong = await redis!.ping();
      const info = await redis!.info('replication');
      
      reply.send({
        success: true,
        data: {
          redis: pong === 'PONG' ? 'connected' : 'error',
          info: info.split('\r\n')[1] // Get role info
        },
        message: 'Redis Keys API is healthy'
      });

    } catch (error) {
      logger.error(error as Error, {}, 'Redis health check failed');
      reply.status(500).send({
        success: false,
        error: 'Redis health check failed',
        details: error.message
      });
    }
  });
}