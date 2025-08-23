/**
 * Environment configuration utilities for all services
 */

import { z } from 'zod';

// ========================================================================
// BASE ENVIRONMENT SCHEMA
// ========================================================================

export const BaseEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: z.string().transform(Number).refine((n) => n > 0 && n < 65536).default('3000'),
  HOST: z.string().default('0.0.0.0'),

  // Database Configuration
  DATABASE_URL: z.string().url(),
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.string().transform(Number).default('5432'),
  POSTGRES_USER: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DB: z.string(),

  // Redis Configuration
  REDIS_URL: z.string().url(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default('6379'),
  REDIS_PASSWORD: z.string().optional(),

  // Temporal Configuration
  TEMPORAL_ADDRESS: z.string().default('localhost:7233'),
  TEMPORAL_NAMESPACE: z.string().default('default'),
  TEMPORAL_TASK_QUEUE: z.string().default('temporal-ai-platform'),

  // AI Provider Configuration
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_ENDPOINT: z.string().url().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),

  // MLOps Configuration
  MLFLOW_TRACKING_URI: z.string().url().default('http://localhost:5000'),
  MLFLOW_S3_ENDPOINT_URL: z.string().url().optional(),
  MLFLOW_ARTIFACT_ROOT: z.string().default('s3://mlflow-artifacts'),

  // Monitoring Configuration
  PROMETHEUS_ENDPOINT: z.string().url().default('http://localhost:9090'),
  JAEGER_ENDPOINT: z.string().url().default('http://localhost:14268'),
  GRAFANA_URL: z.string().url().default('http://localhost:3000'),

  // Security Configuration
  JWT_SECRET: z.string().optional(),
  API_KEY_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),

  // Health Check Configuration
  HEALTH_CHECK_TIMEOUT: z.string().transform(Number).default('5000'),
  HEALTH_CHECK_INTERVAL: z.string().transform(Number).default('30000'),
});

export type BaseEnvironment = z.infer<typeof BaseEnvironmentSchema>;
export type AIGatewayEnvironment = z.infer<typeof AIGatewayEnvironmentSchema>;
export type TemporalWorkerEnvironment = z.infer<typeof TemporalWorkerEnvironmentSchema>;

// ========================================================================
// SERVICE-SPECIFIC CONFIGURATIONS
// ========================================================================

/**
 * AI Gateway specific environment
 */
export const AIGatewayEnvironmentSchema = BaseEnvironmentSchema.extend({
  AI_GATEWAY_PORT: z.string().transform(Number).default('8090'),
  DEFAULT_AI_PROVIDER: z.enum(['openai', 'anthropic', 'local', 'azure', 'aws', 'google']).default('local'),
  DEFAULT_AI_MODEL: z.string().default('llama2'),
  MAX_CONCURRENT_REQUESTS: z.string().transform(Number).default('100'),
  REQUEST_TIMEOUT_MS: z.string().transform(Number).default('30000'),
  ENABLE_CACHING: z.string().transform((s) => s.toLowerCase() === 'true').default('true'),
  CACHE_TTL_SECONDS: z.string().transform(Number).default('300'),
});

/**
 * Temporal Worker specific environment
 */
export const TemporalWorkerEnvironmentSchema = BaseEnvironmentSchema.extend({
  TEMPORAL_WORKER_PORT: z.string().transform(Number).default('8081'),
  TEMPORAL_HOST: z.string().default('localhost'),
  TEMPORAL_PORT: z.string().transform(Number).default('7233'),
  MAX_CONCURRENT_ACTIVITIES: z.string().transform(Number).default('10'),
  MAX_CONCURRENT_WORKFLOWS: z.string().transform(Number).default('5'),
  MAX_CONCURRENT_WORKFLOW_EXECUTIONS: z.string().transform(Number).default('50'),
  MAX_CONCURRENT_ACTIVITY_EXECUTIONS: z.string().transform(Number).default('100'),
  WORKER_IDENTITY: z.string().default('temporal-ai-worker'),
  STICKY_QUEUE_TIMEOUT: z.string().default('10s'),
  AI_GATEWAY_URL: z.string().url().default('http://localhost:8090'),
});

/**
 * MCP Server specific environment
 */
export const MCPServerEnvironmentSchema = BaseEnvironmentSchema.extend({
  MCP_SERVER_PORT: z.string().transform(Number).default('8091'),
  MCP_DATABASE_URL: z.string().url(),
});

/**
 * Workflow Automation specific environment
 */
export const WorkflowAutomationEnvironmentSchema = BaseEnvironmentSchema.extend({
  WORKFLOW_AUTOMATION_PORT: z.string().transform(Number).default('8092'),
  MAX_ITERATIONS: z.string().transform(Number).default('25'),
  QUALITY_THRESHOLD: z.string().transform(Number).default('95'),
});

/**
 * Web Editor specific environment
 */
export const WebEditorEnvironmentSchema = BaseEnvironmentSchema.extend({
  WEB_EDITOR_PORT: z.string().transform(Number).default('3001'),
  ENABLE_AI_SUGGESTIONS: z.string().transform((s) => s.toLowerCase() === 'true').default('true'),
  ENABLE_SEMANTIC_SEARCH: z.string().transform((s) => s.toLowerCase() === 'true').default('true'),
});

/**
 * Health Monitor specific environment
 */
export const HealthMonitorEnvironmentSchema = BaseEnvironmentSchema.extend({
  HEALTH_MONITOR_PORT: z.string().transform(Number).default('8888'),
  MONITOR_INTERVAL_MS: z.string().transform(Number).default('30000'),
  ALERT_THRESHOLD_FAILURES: z.string().transform(Number).default('3'),
});

// ========================================================================
// CONFIGURATION LOADING UTILITIES
// ========================================================================

/**
 * Load and validate environment configuration
 */
export function loadEnvironment<T extends z.ZodSchema>(
  schema: T,
  env: Record<string, string | undefined> = process.env
): z.infer<T> {
  try {
    return schema.parse(env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingFields = error.issues
        .filter((issue) => issue.code === 'invalid_type' && issue.received === 'undefined')
        .map((issue) => issue.path.join('.'));

      const invalidFields = error.issues
        .filter((issue) => issue.code !== 'invalid_type' || issue.received !== 'undefined')
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`);

      let errorMessage = 'Environment configuration validation failed:\n';

      if (missingFields.length > 0) {
        errorMessage += `Missing required fields: ${missingFields.join(', ')}\n`;
      }

      if (invalidFields.length > 0) {
        errorMessage += `Invalid fields: ${invalidFields.join(', ')}\n`;
      }

      throw new Error(errorMessage);
    }
    throw error;
  }
}

/**
 * Get database connection configuration
 */
export function getDatabaseConfig(env: BaseEnvironment): {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  url: string;
} {
  return {
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    username: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB,
    url: env.DATABASE_URL,
  };
}

/**
 * Get Redis connection configuration
 */
export function getRedisConfig(env: BaseEnvironment): {
  host: string;
  port: number;
  password?: string;
  url: string;
} {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
    url: env.REDIS_URL,
  };
}

/**
 * Get Temporal connection configuration
 */
export function getTemporalConfig(env: BaseEnvironment): {
  address: string;
  namespace: string;
  taskQueue: string;
} {
  return {
    address: env.TEMPORAL_ADDRESS,
    namespace: env.TEMPORAL_NAMESPACE,
    taskQueue: env.TEMPORAL_TASK_QUEUE,
  };
}

/**
 * Check if running in production
 */
export function isProduction(env: BaseEnvironment): boolean {
  return env.NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(env: BaseEnvironment): boolean {
  return env.NODE_ENV === 'development';
}