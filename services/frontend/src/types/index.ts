import { Edge } from 'reactflow';

export interface WorkflowNode {
  id: string;
  type: 'start' | 'end' | 'activity' | 'condition' | 'loop' | 'switch' | 'parallel' | 'join' | 'subworkflow';
  position: { x: number; y: number };
  data: NodeData;
}

export interface NodeData {
  label: string;
  description?: string;
  config?: NodeConfig;
  activityType?: string;
  workflowType?: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
}

export interface NodeConfig {
  [key: string]: unknown;
}

export interface WorkflowEdge extends Omit<Edge, 'data'> {
  data?: EdgeData;
}

export interface EdgeData {
  condition?: string;
  priority?: number;
}

export interface WorkflowChain {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: ChainMetadata;
  created_at?: string;
  updated_at?: string;
}

export interface ChainMetadata {
  version?: string;
  author?: string;
  tags?: string[];
  lastModified?: string;
}

export interface ActivityType {
  id: string;
  name: string;
  type: string;
  description?: string;
  version?: string;
  inputs: string[];
  outputs: string[];
  code?: string;
  kafka_config?: Record<string, unknown>;
  redis_config?: Record<string, unknown>;
  retry_policy?: RetryPolicy;
  metadata?: Record<string, unknown>;
}

export interface WorkflowTemplate {
  template_id: string;
  name: string;
  description?: string;
  category: string;
  tags: string[];
  yaml_pattern: string;
  code_template: string;
  supported_languages: string[];
  complexity_score: number;
  success_rate: number;
  usage_count: number;
  is_active: boolean;
}

export interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  default?: unknown;
  description?: string;
  validation?: ValidationRule[];
}

export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'pattern' | 'custom';
  value?: unknown;
  message?: string;
}

export interface RetryPolicy {
  maxAttempts?: number;
  initialInterval?: string;
  maxInterval?: string;
  backoffCoefficient?: number;
}

export interface ExecutionLog {
  id: string;
  chain_id: string;
  execution_id: string;
  node_id?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  start_time?: string;
  end_time?: string;
  input_data?: Record<string, unknown>;
  output_data?: Record<string, unknown>;
  error_message?: string;
  metadata?: Record<string, unknown>;
  // API actual fields
  workflow_id?: string;
  step_id?: string;
  log_level?: string;
  message?: string;
  details?: Record<string, unknown>;
  timestamp?: string;
  created_at?: string;
  execution_time_ms?: number;
  memory_usage_mb?: number;
  cpu_usage_percent?: number;
  error_code?: string;
  stack_trace?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}