/**
 * Redis Connection for Workflow Automation Service
 * Handles caching, job queues, and session management
 */

import Redis from 'ioredis';
import { createServiceLogger, WorkflowAutomationEnvironment } from '../shared-utils-local';

const logger = createServiceLogger('workflow-automation-redis');

/**
 * Create Redis connection for Workflow Automation Service
 */
export async function createRedisConnection(env: WorkflowAutomationEnvironment): Promise<Redis> {
  try {
    const redisUrl = env.REDIS_URL || 'redis://localhost:6379';
    
    const redisConfig = {
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keyPrefix: 'workflow-automation:',
    };

    const redis = new Redis(redisUrl, redisConfig);

    // Test the connection
    await redis.connect();
    await redis.ping();

    logger.getLogger().info({
      redisUrl: redisUrl.replace(/\/\/(.*):(.*)@/, '//$1:***@'), // Hide password
    }, 'Redis connection established');

    // Set up event handlers
    redis.on('connect', () => {
      logger.getLogger().debug('Redis connected');
    });

    redis.on('ready', () => {
      logger.getLogger().debug('Redis ready');
    });

    redis.on('error', (error) => {
      logger.error(error, {}, 'Redis error');
    });

    redis.on('close', () => {
      logger.getLogger().debug('Redis connection closed');
    });

    redis.on('reconnecting', () => {
      logger.getLogger().debug('Redis reconnecting');
    });

    return redis;

  } catch (error) {
    logger.error(error as Error, {}, 'Failed to create Redis connection');
    throw error;
  }
}