/**
 * Local Shared Utilities
 * Replacement for @platform/shared to avoid dependency issues
 */

import pino from 'pino';
import { z } from 'zod';

// Logger setup
export function createServiceLogger(serviceName: string) {
  const logger = pino({
    name: serviceName,
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
  });

  return {
    getLogger: () => logger,
    info: (message: string, meta?: any) => logger.info(meta || {}, message),
    error: (error: Error, meta?: any, message?: string) => logger.error({ error: error.message, stack: error.stack, ...meta }, message || error.message),
    warn: (message: string, meta?: any) => logger.warn(meta || {}, message),
    debug: (message: string, meta?: any) => logger.debug(meta || {}, message),
  };
}

// Database connection utilities are now in ./database/connection.ts

// Environment configuration
export interface Environment {
  NODE_ENV: string;
  PORT: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  AI_GATEWAY_URL: string;
  TEMPORAL_WORKER_URL: string;
  LOG_LEVEL: string;
  CORS_ORIGIN: string;
}

export function getEnvironment(): Environment {
  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || '8092',
    DATABASE_URL: process.env.DATABASE_URL || '',
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    AI_GATEWAY_URL: process.env.AI_GATEWAY_URL || 'http://localhost:3000',
    TEMPORAL_WORKER_URL: process.env.TEMPORAL_WORKER_URL || 'http://localhost:7233',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  };
}

// Zod schema for environment validation
export const WorkflowAutomationEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('8092'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/workflow_automation'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  AI_GATEWAY_URL: z.string().default('http://host.docker.internal:4000/openai/v1'),
  TEMPORAL_WORKER_URL: z.string().default('http://localhost:7233'),
  TEMPORAL_ADDRESS: z.string().default('localhost:7233'),
  TEMPORAL_NAMESPACE: z.string().default('default'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ORIGIN: z.string().default('*'),
  MAX_CONCURRENT_EXECUTIONS: z.string().default('10'),
  DEFAULT_QUALITY_THRESHOLD: z.string().default('0.8'),
  ENABLE_ITERATIVE_MODE: z.string().default('true'),
  DEFAULT_COMPLEXITY: z.string().default('moderate'),
  EXECUTION_TIMEOUT: z.string().default('300000'),
  STEP_TIMEOUT: z.string().default('60000'),
  ENABLE_QUALITY_CHECKS: z.string().default('true'),
  DEFAULT_QUALITY_CRITERIA: z.string().default('accuracy,completeness,relevance')
});

export type WorkflowAutomationEnvironment = z.infer<typeof WorkflowAutomationEnvironmentSchema>;