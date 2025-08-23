/**
 * AI Gateway types based on OpenAPI 3.1.0 specification
 */

import { z } from 'zod';

// ========================================================================
// CHAT TYPES
// ========================================================================

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'function']),
  content: z.string(),
  name: z.string().optional(),
  function_call: z.record(z.unknown()).optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z.object({
  model: z.string(),
  messages: z.array(ChatMessageSchema),
  stream: z.boolean().default(false),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().min(1).max(8000).default(1000),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const UsageInfoSchema = z.object({
  prompt_tokens: z.number().optional(),
  completion_tokens: z.number().optional(),
  total_tokens: z.number().optional(),
});

export type UsageInfo = z.infer<typeof UsageInfoSchema>;

export const ChatResponseSchema = z.object({
  response: z.string(),
  model: z.string(),
  created_at: z.string().datetime(),
  done: z.boolean(),
  usage: UsageInfoSchema.optional(),
  finish_reason: z.enum(['stop', 'length', 'function_call', 'content_filter']).optional(),
});

export type ChatResponse = z.infer<typeof ChatResponseSchema>;

// ========================================================================
// GENERATION TYPES
// ========================================================================

export const GenerateRequestSchema = z.object({
  model: z.string().optional(),
  prompt: z.string(),
  stream: z.boolean().default(false),
  options: z
    .object({
      temperature: z.number().optional(),
      max_tokens: z.number().optional(),
      top_p: z.number().optional(),
    })
    .optional(),
});

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export const GenerateResponseSchema = z.object({
  response: z.string(),
  model: z.string(),
  created_at: z.string().datetime(),
  done: z.boolean(),
  context: z.array(z.number()).optional(),
  total_duration: z.number().optional(),
  load_duration: z.number().optional(),
  prompt_eval_count: z.number().optional(),
  prompt_eval_duration: z.number().optional(),
  eval_count: z.number().optional(),
  eval_duration: z.number().optional(),
});

export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;

// ========================================================================
// CODE GENERATION TYPES
// ========================================================================

export const CodeGenerationRequestSchema = z.object({
  prompt: z.string(),
  language: z
    .enum(['python', 'javascript', 'typescript', 'java', 'go', 'rust', 'cpp'])
    .default('python'),
  framework: z.string().optional(),
  style_guide: z.enum(['pep8', 'airbnb', 'google', 'standard']).optional(),
  include_tests: z.boolean().default(false),
  include_documentation: z.boolean().default(true),
});

export type CodeGenerationRequest = z.infer<typeof CodeGenerationRequestSchema>;

export const CodeIssueSchema = z.object({
  line: z.number().optional(),
  column: z.number().optional(),
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  rule: z.string().optional(),
});

export type CodeIssue = z.infer<typeof CodeIssueSchema>;

export const StaticAnalysisResultSchema = z.object({
  errors: z.array(CodeIssueSchema).default([]),
  warnings: z.array(CodeIssueSchema).default([]),
  complexity_score: z.number().optional(),
  maintainability_index: z.number().optional(),
});

export type StaticAnalysisResult = z.infer<typeof StaticAnalysisResultSchema>;

export const CodeGenerationResponseSchema = z.object({
  code: z.string(),
  language: z.string(),
  prompt: z.string(),
  tests: z.string().optional(),
  documentation: z.string().optional(),
  quality_score: z.number().min(0).max(1).optional(),
  static_analysis: StaticAnalysisResultSchema.optional(),
});

export type CodeGenerationResponse = z.infer<typeof CodeGenerationResponseSchema>;

// ========================================================================
// WORKFLOW ROUTING TYPES
// ========================================================================

export const WorkflowRoutingRequestSchema = z.object({
  request: z.string(),
  context: z.record(z.unknown()).optional(),
  user_preferences: z.record(z.unknown()).optional(),
});

export type WorkflowRoutingRequest = z.infer<typeof WorkflowRoutingRequestSchema>;

export const WorkflowRoutingResponseSchema = z.object({
  status: z.enum(['routed', 'error']),
  workflow_used: z.string(),
  routing_confidence: z.number().min(0).max(1),
  user_input: z.string(),
  alternatives: z.array(z.string()).default([]),
});

export type WorkflowRoutingResponse = z.infer<typeof WorkflowRoutingResponseSchema>;

// ========================================================================
// AI MODEL TYPES
// ========================================================================

export const AIModelSchema = z.object({
  name: z.string(),
  size: z.number(),
  modified_at: z.string().datetime(),
  digest: z.string(),
  details: z
    .object({
      parameter_size: z.string().optional(),
      quantization_level: z.string().optional(),
    })
    .optional(),
});

export type AIModel = z.infer<typeof AIModelSchema>;

export const CurrentModelSchema = z.object({
  model: z.string(),
  available: z.boolean(),
  all_models: z.array(z.string()).default([]),
  provider_info: z.record(z.unknown()).optional(),
});

export type CurrentModel = z.infer<typeof CurrentModelSchema>;

// ========================================================================
// USAGE STATISTICS
// ========================================================================

export const UsageStatsSchema = z.object({
  total_requests: z.number(),
  successful_requests: z.number(),
  success_rate: z.number(),
  average_duration: z.number(),
  models_usage: z.record(z.number()),
});

export type UsageStats = z.infer<typeof UsageStatsSchema>;