/**
 * Activity Loader Configuration
 * Environment-based configuration for the Generic Activity Loader
 */

import { ActivityLoaderConfig } from './activity-loader/types';

export function createActivityLoaderConfig(): ActivityLoaderConfig {
  return {
    database: {
      host: process.env.DATABASE_HOST || 'postgres',
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      database: process.env.DATABASE_NAME || 'temporal_ai_platform',
      user: process.env.DATABASE_USER || 'temporal',
      password: process.env.DATABASE_PASSWORD || 'temporal',
      ssl: process.env.DATABASE_SSL === 'true',
      poolSize: parseInt(process.env.DATABASE_POOL_SIZE || '20')
    },
    redis: {
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'temporal:activity-loader:'
    },
    cache: {
      activityTtl: parseInt(process.env.CACHE_ACTIVITY_TTL || '3600000'), // 1 hour
      workflowTtl: parseInt(process.env.CACHE_WORKFLOW_TTL || '1800000'), // 30 minutes
      resultTtl: parseInt(process.env.CACHE_RESULT_TTL || '600000'), // 10 minutes
      maxSize: parseInt(process.env.CACHE_MAX_SIZE || '1000')
    },
    execution: {
      defaultTimeout: parseInt(process.env.EXECUTION_DEFAULT_TIMEOUT || '30000'), // 30 seconds
      maxMemory: parseInt(process.env.EXECUTION_MAX_MEMORY || '134217728'), // 128MB
      maxCpuTime: parseInt(process.env.EXECUTION_MAX_CPU_TIME || '10000'), // 10 seconds
      sandboxed: process.env.EXECUTION_SANDBOXED !== 'false' // true by default
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      includeSource: process.env.LOG_INCLUDE_SOURCE === 'true',
      includeMetrics: process.env.LOG_INCLUDE_METRICS === 'true'
    }
  };
}