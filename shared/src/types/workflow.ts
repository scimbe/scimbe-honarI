/**
 * Core workflow types based on OpenAPI 3.1.0 specification
 */

import { z } from 'zod';

// ========================================================================
// ENUMS AND CONSTANTS
// ========================================================================

export const WorkflowCategory = z.enum([
  'ai',
  'data',
  'automation',
  'integration',
  'monitoring',
  'testing',
]);

export const WorkflowStatus = z.enum([
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'TERMINATED',
  'TIMED_OUT',
]);

export const ModelStage = z.enum([
  'development',
  'staging',
  'production',
  'archived',
]);

export const AIProvider = z.enum([
  'openai',
  'anthropic',
  'local',
  'azure',
  'aws',
  'google',
]);

// ========================================================================
// RETRY POLICY
// ========================================================================

export const RetryPolicySchema = z.object({
  initial_interval: z.string().regex(/^\d+[smh]$/).default('1s'),
  backoff_coefficient: z.number().min(1.0).default(2.0),
  maximum_interval: z.string().regex(/^\d+[smh]$/).default('5m'),
  maximum_attempts: z.number().min(1).default(3),
  non_retryable_error_types: z.array(z.string()).optional(),
});

export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

// ========================================================================
// ACTIVITY DEFINITIONS
// ========================================================================

export const ActivityDefinitionSchema = z.object({
  name: z.string(),
  function: z.string(),
  retry_policy: RetryPolicySchema.optional(),
  timeout: z.string().regex(/^\d+[smh]$/).optional(),
  input_schema: z.record(z.unknown()).optional(),
  output_schema: z.record(z.unknown()).optional(),
});

export type ActivityDefinition = z.infer<typeof ActivityDefinitionSchema>;

// ========================================================================
// SIGNAL AND QUERY DEFINITIONS
// ========================================================================

export const SignalDefinitionSchema = z.object({
  name: z.string(),
  input_schema: z.record(z.unknown()).optional(),
  description: z.string().optional(),
});

export type SignalDefinition = z.infer<typeof SignalDefinitionSchema>;

export const QueryDefinitionSchema = z.object({
  name: z.string(),
  output_schema: z.record(z.unknown()).optional(),
  description: z.string().optional(),
});

export type QueryDefinition = z.infer<typeof QueryDefinitionSchema>;

// ========================================================================
// TEMPORAL WORKFLOW CONFIG
// ========================================================================

export const TemporalWorkflowConfigSchema = z.object({
  workflow_type: z.string(),
  task_queue: z.string(),
  activities: z.array(ActivityDefinitionSchema).default([]),
  signals: z.array(SignalDefinitionSchema).default([]),
  queries: z.array(QueryDefinitionSchema).default([]),
  retry_policy: RetryPolicySchema.optional(),
  timeout: z.string().regex(/^\d+[smh]$/).optional(),
  cron_schedule: z.string().optional(),
});

export type TemporalWorkflowConfig = z.infer<typeof TemporalWorkflowConfigSchema>;

// ========================================================================
// AI INTERFACE CONFIG
// ========================================================================

export const RateLimitConfigSchema = z.object({
  requests_per_minute: z.number().min(1).optional(),
  requests_per_hour: z.number().min(1).optional(),
  requests_per_day: z.number().min(1).optional(),
  token_limit_per_minute: z.number().min(1).optional(),
  cost_limit_per_day: z.number().min(0).optional(),
});

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

export const CostOptimizationConfigSchema = z.object({
  enable_model_switching: z.boolean().default(true),
  cost_thresholds: z
    .object({
      daily: z.number().optional(),
      monthly: z.number().optional(),
    })
    .optional(),
  model_cost_ranking: z.record(z.number()).optional(),
  automatic_downgrade: z.boolean().default(false),
});

export type CostOptimizationConfig = z.infer<typeof CostOptimizationConfigSchema>;

export const AIInterfaceConfigSchema = z.object({
  provider: AIProvider,
  model: z.string().optional(),
  endpoint: z.string().url().optional(),
  parameters: z.record(z.unknown()).optional(),
  fallback_providers: z.array(z.string()).default([]),
  rate_limits: RateLimitConfigSchema.optional(),
  cost_optimization: CostOptimizationConfigSchema.optional(),
});

export type AIInterfaceConfig = z.infer<typeof AIInterfaceConfigSchema>;

// ========================================================================
// WORKFLOW DEFINITION (MAIN SCHEMA)
// ========================================================================

export const WorkflowDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().max(1000).optional(),
  category: WorkflowCategory,
  tags: z.array(z.string()).default([]),
  temporal_workflow: TemporalWorkflowConfigSchema,
  ai_interface: AIInterfaceConfigSchema.optional(),
  web_editor_config: z.record(z.unknown()).optional(),
  mlops_metadata: z.record(z.unknown()).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  created_by: z.string(),
  complexity_score: z.number().min(1).max(100),
  success_rate: z.number().min(0).max(1),
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

// ========================================================================
// EXECUTION TYPES
// ========================================================================

export const WorkflowExecutionResultSchema = z.object({
  status: z.enum(['completed', 'failed', 'running']),
  workflow_id: z.string(),
  workflow_type: z.string(),
  input: z.record(z.unknown()).optional(),
  result: z.record(z.unknown()).optional(),
  temporal_url: z.string().url().optional(),
  execution_time: z.number().optional(),
  error: z.string().optional(),
});

export type WorkflowExecutionResult = z.infer<typeof WorkflowExecutionResultSchema>;

// ========================================================================
// HEALTH STATUS TYPES
// ========================================================================

export const HealthStatusSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.number(),
  dependencies: z.record(z.string()).optional(),
  version: z.string().optional(),
  uptime: z.number().optional(),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

// ========================================================================
// ERROR RESPONSE
// ========================================================================

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime().optional(),
  request_id: z.string().optional(),
  documentation_url: z.string().url().optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;