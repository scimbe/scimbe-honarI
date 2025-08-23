/**
 * Shared utilities for workflow automation service
 * Standalone version without workspace dependencies
 */

import pino from 'pino';
import { z } from 'zod';

export function createServiceLogger(service: string) {
  const logger = pino({
    name: service,
    level: 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
  });

  return {
    getLogger: () => logger,
    error: (error: Error, context: any = {}, message?: string) => {
      logger.error({ error: error.message, stack: error.stack, ...context }, message || error.message);
    }
  };
}

export const WorkflowAutomationEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3004'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/workflow_automation'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  TEMPORAL_ADDRESS: z.string().default('localhost:7233'),
  TEMPORAL_NAMESPACE: z.string().default('default'),
  AI_ENDPOINT: z.string().default('http://host.docker.internal:4000/openai/v1/chat/completions'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type WorkflowAutomationEnvironment = z.infer<typeof WorkflowAutomationEnvironmentSchema>;