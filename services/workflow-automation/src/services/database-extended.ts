/**
 * Extended Database Service for Workflow Automation
 * Manages activity library, configuration schemas, and iterative context
 */

import { Pool, PoolClient } from 'pg';
import { createServiceLogger } from '../shared-utils-local';
import Redis from 'ioredis';

const logger = createServiceLogger('database-extended');

// Redis client for caching
const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

export interface ActivityDefinition {
  id: string;
  name: string;
  type: 'data-producer' | 'data-consumer' | 'processor' | 'integration' | 'validation';
  description: string;
  version: string;
  inputs: ParameterSchema[];
  outputs: ParameterSchema[];
  code: string;
  kafka_config?: KafkaActivityConfig;
  redis_config?: RedisActivityConfig;
  retry_policy?: RetryPolicy;
  metadata: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

export interface ParameterSchema {
  name: string;
  type: string;
  required: boolean;
  description: string;
  validation?: string;
  default_value?: any;
}

export interface KafkaActivityConfig {
  enabled: boolean;
  topics: {
    input?: string;
    output?: string;
    error?: string;
  };
  consumer_group?: string;
  producer_config?: Record<string, any>;
  serialization?: 'json' | 'avro' | 'protobuf';
}

export interface RedisActivityConfig {
  enabled: boolean;
  channels: {
    publish?: string[];
    subscribe?: string[];
  };
  keys: {
    pattern?: string;
    ttl?: number;
  };
  data_exchange_key?: string; // Key pattern for workflow data exchange
}

export interface RetryPolicy {
  initial_interval: string;
  maximum_attempts: number;
  backoff_coefficient: number;
  maximum_interval?: string;
  non_retryable_errors?: string[];
}

export interface WorkflowConfiguration {
  id: string;
  workflow_id: string;
  name: string;
  version: string;
  description: string;
  activities: string[]; // Activity IDs
  data_flow: DataFlowConfig;
  drag_drop_schema: any; // Schema for drag-drop editor
  test_cases: TestCase[];
  quality_metrics: QualityMetrics;
  created_at?: Date;
  updated_at?: Date;
}

export interface DataFlowConfig {
  connections: DataConnection[];
  kafka_topics?: string[];
  redis_keys?: string[];
  data_exchange_patterns: ExchangePattern[];
}

export interface DataConnection {
  from_activity: string;
  to_activity: string;
  data_mapping: Record<string, string>;
  transform?: string; // Optional transformation code
  via?: 'direct' | 'kafka' | 'redis';
  topic_or_key?: string;
}

export interface ExchangePattern {
  type: 'producer-consumer' | 'pub-sub' | 'request-reply' | 'scatter-gather';
  participants: string[];
  configuration: Record<string, any>;
}

export interface TestCase {
  id: string;
  name: string;
  description: string;
  input: any;
  expected_output: any;
  assertions: string[];
  status?: 'pending' | 'passed' | 'failed';
  execution_time?: number;
  error_message?: string;
}

export interface QualityMetrics {
  coverage: number;
  reliability: number;
  performance: number;
  maintainability: number;
  overall_score: number;
}

export interface IterationContext {
  workflow_id: string;
  iteration: number;
  requirements: string;
  improvements: string[];
  test_results: TestResult[];
  quality_scores: number[];
  learned_patterns: LearnedPattern[];
  configuration_evolution: any[];
}

export interface TestResult {
  test_case_id: string;
  iteration: number;
  passed: boolean;
  execution_time: number;
  error?: string;
  suggestions?: string[];
}

export interface LearnedPattern {
  pattern_type: string;
  description: string;
  frequency: number;
  success_rate: number;
  applicable_scenarios: string[];
}

export class ExtendedDatabaseService {
  private pool: Pool;
  private cachePrefix = 'wf-automation:';
  private contextCacheTTL = 3600; // 1 hour

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://temporal:temporal@postgres:5432/temporal',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.initializeTables();
  }

  /**
   * Initialize database tables for extended functionality
   */
  private async initializeTables(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Activity Library Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS activity_library (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL,
          description TEXT,
          version VARCHAR(20) DEFAULT '1.0.0',
          inputs JSONB,
          outputs JSONB,
          code TEXT,
          kafka_config JSONB,
          redis_config JSONB,
          retry_policy JSONB,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(name, version)
        )
      `);

      // Workflow Configurations Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS workflow_configurations (
          id VARCHAR(255) PRIMARY KEY,
          workflow_id VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          version VARCHAR(20) DEFAULT '1.0.0',
          description TEXT,
          activities TEXT[],
          data_flow JSONB,
          drag_drop_schema JSONB,
          test_cases JSONB,
          quality_metrics JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Iteration Context Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS iteration_contexts (
          id SERIAL PRIMARY KEY,
          workflow_id VARCHAR(255) NOT NULL,
          iteration INTEGER NOT NULL,
          requirements TEXT,
          improvements JSONB,
          test_results JSONB,
          quality_scores REAL[],
          learned_patterns JSONB,
          configuration_evolution JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(workflow_id, iteration)
        )
      `);

      // Data Exchange Log Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS data_exchange_log (
          id SERIAL PRIMARY KEY,
          source_workflow VARCHAR(255),
          target_workflow VARCHAR(255),
          activity_id VARCHAR(255),
          exchange_type VARCHAR(20),
          data_key VARCHAR(255),
          data_size INTEGER,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          status VARCHAR(20),
          error_message TEXT
        )
      `);

      // Configuration Schema Versions Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_versions (
          id SERIAL PRIMARY KEY,
          workflow_id VARCHAR(255),
          version VARCHAR(20),
          schema JSONB,
          changelog TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for performance
      await client.query('CREATE INDEX IF NOT EXISTS idx_activities_type ON activity_library(type)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_workflows_name ON workflow_configurations(name)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_iteration_workflow ON iteration_contexts(workflow_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_exchange_workflows ON data_exchange_log(source_workflow, target_workflow)');

      logger.info('Extended database tables initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize extended tables', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Store activity in library
   */
  async storeActivity(activity: ActivityDefinition): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        INSERT INTO activity_library (
          id, name, type, description, version, inputs, outputs, 
          code, kafka_config, redis_config, retry_policy, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (name, version) DO UPDATE SET
          description = EXCLUDED.description,
          inputs = EXCLUDED.inputs,
          outputs = EXCLUDED.outputs,
          code = EXCLUDED.code,
          kafka_config = EXCLUDED.kafka_config,
          redis_config = EXCLUDED.redis_config,
          retry_policy = EXCLUDED.retry_policy,
          metadata = EXCLUDED.metadata,
          updated_at = CURRENT_TIMESTAMP
      `, [
        activity.id,
        activity.name,
        activity.type,
        activity.description,
        activity.version,
        JSON.stringify(activity.inputs),
        JSON.stringify(activity.outputs),
        activity.code,
        JSON.stringify(activity.kafka_config),
        JSON.stringify(activity.redis_config),
        JSON.stringify(activity.retry_policy),
        JSON.stringify(activity.metadata)
      ]);

      // Invalidate cache
      await this.invalidateCache(`activities:${activity.type}`);
      
      logger.info(`Activity stored: ${activity.name} v${activity.version}`);
    } finally {
      client.release();
    }
  }

  /**
   * Get activities by type with caching
   */
  async getActivitiesByType(type: string): Promise<ActivityDefinition[]> {
    const cacheKey = `${this.cachePrefix}activities:${type}`;
    
    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM activity_library WHERE type = $1 ORDER BY created_at DESC',
        [type]
      );

      const activities = result.rows.map(row => ({
        ...row,
        inputs: row.inputs,
        outputs: row.outputs,
        kafka_config: row.kafka_config,
        redis_config: row.redis_config,
        retry_policy: row.retry_policy,
        metadata: row.metadata
      }));

      // Cache the result
      await redis.setex(cacheKey, 300, JSON.stringify(activities));

      return activities;
    } finally {
      client.release();
    }
  }

  /**
   * Store workflow configuration with schema
   */
  async storeWorkflowConfiguration(config: WorkflowConfiguration): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        INSERT INTO workflow_configurations (
          id, workflow_id, name, version, description, activities,
          data_flow, drag_drop_schema, test_cases, quality_metrics
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          activities = EXCLUDED.activities,
          data_flow = EXCLUDED.data_flow,
          drag_drop_schema = EXCLUDED.drag_drop_schema,
          test_cases = EXCLUDED.test_cases,
          quality_metrics = EXCLUDED.quality_metrics,
          updated_at = CURRENT_TIMESTAMP
      `, [
        config.id,
        config.workflow_id,
        config.name,
        config.version,
        config.description,
        config.activities,
        JSON.stringify(config.data_flow),
        JSON.stringify(config.drag_drop_schema),
        JSON.stringify(config.test_cases),
        JSON.stringify(config.quality_metrics)
      ]);

      // Store schema version
      await this.storeSchemaVersion(config.workflow_id, config.version, config.drag_drop_schema);

      logger.info(`Workflow configuration stored: ${config.name} v${config.version}`);
    } finally {
      client.release();
    }
  }

  /**
   * Store iteration context for learning
   */
  async storeIterationContext(context: IterationContext): Promise<void> {
    const cacheKey = `${this.cachePrefix}context:${context.workflow_id}`;
    
    const client = await this.pool.connect();
    try {
      await client.query(`
        INSERT INTO iteration_contexts (
          workflow_id, iteration, requirements, improvements,
          test_results, quality_scores, learned_patterns, configuration_evolution
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (workflow_id, iteration) DO UPDATE SET
          improvements = EXCLUDED.improvements,
          test_results = EXCLUDED.test_results,
          quality_scores = EXCLUDED.quality_scores,
          learned_patterns = EXCLUDED.learned_patterns,
          configuration_evolution = EXCLUDED.configuration_evolution
      `, [
        context.workflow_id,
        context.iteration,
        context.requirements,
        JSON.stringify(context.improvements),
        JSON.stringify(context.test_results),
        context.quality_scores,
        JSON.stringify(context.learned_patterns),
        JSON.stringify(context.configuration_evolution)
      ]);

      // Cache the context
      await redis.setex(cacheKey, this.contextCacheTTL, JSON.stringify(context));

      logger.info(`Iteration context stored: ${context.workflow_id} iteration ${context.iteration}`);
    } finally {
      client.release();
    }
  }

  /**
   * Get iteration context with learning history
   */
  async getIterationContext(workflowId: string): Promise<IterationContext[]> {
    const cacheKey = `${this.cachePrefix}context:${workflowId}`;
    
    // Check cache for latest context
    const cached = await redis.get(cacheKey);
    if (cached) {
      return [JSON.parse(cached)];
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM iteration_contexts WHERE workflow_id = $1 ORDER BY iteration DESC',
        [workflowId]
      );

      return result.rows.map(row => ({
        ...row,
        improvements: row.improvements,
        test_results: row.test_results,
        learned_patterns: row.learned_patterns,
        configuration_evolution: row.configuration_evolution
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Log data exchange between workflows
   */
  async logDataExchange(
    sourceWorkflow: string,
    targetWorkflow: string,
    activityId: string,
    exchangeType: 'kafka' | 'redis',
    dataKey: string,
    dataSize: number,
    status: 'success' | 'failed',
    error?: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        INSERT INTO data_exchange_log (
          source_workflow, target_workflow, activity_id,
          exchange_type, data_key, data_size, status, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        sourceWorkflow,
        targetWorkflow,
        activityId,
        exchangeType,
        dataKey,
        dataSize,
        status,
        error
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Store schema version for tracking evolution
   */
  private async storeSchemaVersion(
    workflowId: string,
    version: string,
    schema: any,
    changelog?: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        INSERT INTO schema_versions (workflow_id, version, schema, changelog)
        VALUES ($1, $2, $3, $4)
      `, [
        workflowId,
        version,
        JSON.stringify(schema),
        changelog || 'Initial version'
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Get reusable activities for workflow generation
   */
  async getReusableActivities(requirements: string[]): Promise<ActivityDefinition[]> {
    const client = await this.pool.connect();
    try {
      // Smart query to find relevant activities based on requirements
      const query = `
        SELECT * FROM activity_library
        WHERE 
          type IN ('data-producer', 'data-consumer', 'processor')
          AND (
            description ILIKE ANY($1)
            OR name ILIKE ANY($1)
            OR metadata->>'tags' ILIKE ANY($1)
          )
        ORDER BY 
          CASE 
            WHEN type = 'data-producer' THEN 1
            WHEN type = 'processor' THEN 2
            WHEN type = 'data-consumer' THEN 3
            ELSE 4
          END,
          created_at DESC
        LIMIT 20
      `;

      const searchTerms = requirements.map(req => `%${req}%`);
      const result = await client.query(query, [searchTerms]);

      return result.rows.map(row => ({
        ...row,
        inputs: row.inputs,
        outputs: row.outputs,
        kafka_config: row.kafka_config,
        redis_config: row.redis_config,
        retry_policy: row.retry_policy,
        metadata: row.metadata
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Invalidate cache
   */
  private async invalidateCache(pattern: string): Promise<void> {
    const keys = await redis.keys(`${this.cachePrefix}${pattern}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
    redis.disconnect();
  }
}

// Export singleton instance
export const extendedDb = new ExtendedDatabaseService();