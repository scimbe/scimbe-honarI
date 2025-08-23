/**
 * Generic Activity Loader Types
 * Provides type-safe interfaces for dynamic activity loading and execution
 */

export interface ActivityDefinition {
  id: string;
  name: string;
  version: string;
  type: 'javascript' | 'typescript' | 'python' | 'http' | 'sql' | 'shell';
  description?: string;
  implementation: string;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  timeout?: number;
  retryPolicy?: RetryPolicy;
  resources?: ResourceLimits;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialInterval: number;
  backoffCoefficient: number;
  maximumInterval: number;
  nonRetryableErrors?: string[];
}

export interface ResourceLimits {
  cpu?: string;
  memory?: string;
  timeout?: number;
  maxConcurrency?: number;
}

export interface ActivityExecutionContext {
  sessionId: string;
  workflowId: string;
  activityId: string;
  activityName: string;
  runId?: string;
  attempt: number;
  input: any;
  configuration?: Record<string, any>;
  previousResults?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ActivityExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  metadata?: {
    executionTime: number;
    memoryUsed?: number;
    outputSize?: number;
    attempt: number;
    timestamp: number;
  };
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  activities: ActivityReference[];
  steps: WorkflowStep[];
  metadata?: Record<string, any>;
}

export interface ActivityReference {
  id: string;
  name: string;
  type: string;
  configuration?: Record<string, any>;
  dependencies: string[];
  required: boolean;
  parallel?: boolean;
}

export interface WorkflowStep {
  id: string;
  name: string;
  activityId: string;
  dependencies: string[];
  condition?: string;
  parallel?: boolean;
  retryPolicy?: RetryPolicy;
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  version?: string;
}

export interface ActivityLoaderConfig {
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
    poolSize?: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  };
  cache: {
    activityTtl: number;
    workflowTtl: number;
    resultTtl: number;
    maxSize: number;
  };
  execution: {
    defaultTimeout: number;
    maxMemory: number;
    maxCpuTime: number;
    sandboxed: boolean;
  };
  logging: {
    level: string;
    includeSource: boolean;
    includeMetrics: boolean;
  };
}

export interface ExecutionMetrics {
  activityName: string;
  executionTime: number;
  memoryUsed: number;
  cacheHit: boolean;
  attempt: number;
  success: boolean;
  errorType?: string;
  timestamp: number;
}