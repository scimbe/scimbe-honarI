/**
 * Database Provider for Activity Loading
 * Handles all database operations for activity and workflow definitions
 */

import { Pool, Client } from 'pg';
import { ActivityDefinition, WorkflowDefinition, ActivityLoaderConfig } from './types';
import { createServiceLogger } from '../utils/logger';

const logger = createServiceLogger('database-provider');

export class DatabaseProvider {
  private pool: Pool;
  private config: ActivityLoaderConfig['database'];

  constructor(config: ActivityLoaderConfig['database']) {
    this.config = config;
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
      max: config.poolSize || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Database pool error:', err);
    });
  }

  /**
   * Get activity definition by ID or name
   */
  async getActivityDefinition(idOrName: string): Promise<ActivityDefinition | null> {
    const client = await this.pool.connect();
    
    try {
      logger.debug('Fetching activity definition:', { idOrName });
      
      const query = `
        SELECT 
          id, name, version, type, description, 
          code as implementation, inputs as input_schema, outputs as output_schema,
          timeout_config->>'startToCloseTimeout' as timeout, retry_policy, metadata,
          created_at, updated_at
        FROM activity_library 
        WHERE id = $1 OR name = $1
        ORDER BY version DESC, created_at DESC
        LIMIT 1
      `;
      
      const result = await client.query(query, [idOrName]);
      
      if (result.rows.length === 0) {
        logger.warn('Activity definition not found:', { idOrName });
        return null;
      }

      const row = result.rows[0];
      return this.mapRowToActivityDefinition(row);
      
    } catch (error) {
      logger.error('Failed to fetch activity definition:', { idOrName, error });
      throw new Error(`Database error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      client.release();
    }
  }

  /**
   * Get multiple activity definitions by IDs
   */
  async getActivityDefinitions(ids: string[]): Promise<ActivityDefinition[]> {
    if (ids.length === 0) return [];
    
    const client = await this.pool.connect();
    
    try {
      logger.debug('Fetching multiple activity definitions:', { count: ids.length });
      
      const query = `
        SELECT 
          id, name, version, type, description,
          code as implementation, inputs as input_schema, outputs as output_schema,
          timeout_config->>'startToCloseTimeout' as timeout, retry_policy, metadata,
          created_at, updated_at
        FROM activity_library 
        WHERE id = ANY($1)
        ORDER BY version DESC, created_at DESC
      `;
      
      const result = await client.query(query, [ids]);
      return result.rows.map(row => this.mapRowToActivityDefinition(row));
      
    } catch (error) {
      logger.error('Failed to fetch activity definitions:', { ids, error });
      throw new Error(`Database error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      client.release();
    }
  }

  /**
   * Get workflow definition by ID or name
   */
  async getWorkflowDefinition(idOrName: string): Promise<WorkflowDefinition | null> {
    const client = await this.pool.connect();
    
    try {
      logger.debug('Fetching workflow definition:', { idOrName });
      
      const query = `
        SELECT 
          wd.id, wd.name, wd.description, wd.activities, wd.configuration,
          wd.input_data, wd.redis_keys, wd.created_at
        FROM workflow_definitions wd
        WHERE wd.id = $1 OR wd.name = $1
        ORDER BY wd.created_at DESC
        LIMIT 1
      `;
      
      const result = await client.query(query, [idOrName]);
      
      if (result.rows.length === 0) {
        logger.warn('Workflow definition not found:', { idOrName });
        return null;
      }

      const row = result.rows[0];
      const activities = typeof row.activities === 'string' 
        ? JSON.parse(row.activities) 
        : (row.activities || []);
      
      // Extract activity references and steps from the activities JSON
      const activityRefs = Array.isArray(activities) ? activities.map((act: any, index: number) => ({
        id: act.id || `activity-${index}`,
        name: act.name || act.id || `Activity ${index + 1}`,
        type: act.type || 'javascript',
        configuration: act.configuration || {},
        dependencies: act.dependencies || [],
        required: act.required !== false,
        parallel: act.parallel || false
      })) : [];

      // Create steps from activities
      const steps = activityRefs.map((ref: any, index: number) => ({
        id: `step-${index + 1}`,
        name: ref.name,
        activityId: ref.id,
        dependencies: index > 0 ? [`step-${index}`] : [],
        parallel: ref.parallel
      }));

      return {
        id: row.id,
        name: row.name,
        version: '1.0.0', // Default version since column doesn't exist
        activities: activityRefs,
        steps: steps,
        metadata: {
          description: row.description,
          configuration: row.configuration,
          inputData: row.input_data,
          redisKeys: row.redis_keys
        }
      };
      
    } catch (error) {
      logger.error('Failed to fetch workflow definition:', { idOrName, error });
      throw new Error(`Database error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      client.release();
    }
  }

  /**
   * Search activities by criteria
   */
  async searchActivities(criteria: {
    name?: string;
    type?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<ActivityDefinition[]> {
    const client = await this.pool.connect();
    
    try {
      let query = `
        SELECT 
          id, name, version, type, description,
          code as implementation, inputs as input_schema, outputs as output_schema,
          timeout_config->>'startToCloseTimeout' as timeout, retry_policy, metadata,
          created_at, updated_at
        FROM activity_library 
        WHERE 1=1
      `;
      
      const params: any[] = [];
      let paramIndex = 1;

      if (criteria.name) {
        query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
        params.push(`%${criteria.name}%`);
        paramIndex++;
      }

      if (criteria.type) {
        query += ` AND type = $${paramIndex}`;
        params.push(criteria.type);
        paramIndex++;
      }

      if (criteria.tags && criteria.tags.length > 0) {
        query += ` AND metadata->>'tags' ?| $${paramIndex}`;
        params.push(criteria.tags);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC`;
      
      if (criteria.limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(criteria.limit);
        paramIndex++;
      }
      
      if (criteria.offset) {
        query += ` OFFSET $${paramIndex}`;
        params.push(criteria.offset);
        paramIndex++;
      }
      
      const result = await client.query(query, params);
      return result.rows.map(row => this.mapRowToActivityDefinition(row));
      
    } catch (error) {
      logger.error('Failed to search activities:', { criteria, error });
      throw new Error(`Database error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      client.release();
    }
  }

  /**
   * Store activity execution result
   */
  async storeExecutionResult(params: {
    sessionId: string;
    workflowId: string;
    activityId: string;
    activityName: string;
    input: any;
    output: any;
    success: boolean;
    error?: string;
    executionTime: number;
    attempt: number;
  }): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        INSERT INTO activity_executions 
        (session_id, workflow_id, activity_id, activity_name, input, output, success, error, execution_time, attempt, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (session_id, workflow_id, activity_id, attempt) 
        DO UPDATE SET 
          output = EXCLUDED.output,
          success = EXCLUDED.success,
          error = EXCLUDED.error,
          execution_time = EXCLUDED.execution_time,
          updated_at = NOW()
      `;
      
      await client.query(query, [
        params.sessionId,
        params.workflowId,
        params.activityId,
        params.activityName,
        JSON.stringify(params.input),
        JSON.stringify(params.output),
        params.success,
        params.error,
        params.executionTime,
        params.attempt
      ]);
      
      logger.debug('Stored execution result:', { 
        activityName: params.activityName,
        success: params.success,
        executionTime: params.executionTime
      });
      
    } catch (error) {
      logger.error('Failed to store execution result:', { params, error });
      // Don't throw - this is for auditing purposes
    } finally {
      client.release();
    }
  }

  /**
   * Get execution history for a workflow
   */
  async getExecutionHistory(sessionId: string, workflowId: string): Promise<any[]> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT *
        FROM activity_executions 
        WHERE session_id = $1 AND workflow_id = $2
        ORDER BY created_at ASC
      `;
      
      const result = await client.query(query, [sessionId, workflowId]);
      return result.rows.map(row => ({
        ...row,
        input: typeof row.input === 'string' ? JSON.parse(row.input) : row.input,
        output: typeof row.output === 'string' ? JSON.parse(row.output) : row.output
      }));
      
    } catch (error) {
      logger.error('Failed to get execution history:', { sessionId, workflowId, error });
      return [];
    } finally {
      client.release();
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database connection pool closed');
  }

  private mapRowToActivityDefinition(row: any): ActivityDefinition {
    return {
      id: row.id,
      name: row.name,
      version: row.version || '1.0.0',
      type: row.type || 'javascript',
      description: row.description,
      implementation: row.implementation,
      inputSchema: typeof row.input_schema === 'string' 
        ? JSON.parse(row.input_schema) 
        : row.input_schema,
      outputSchema: typeof row.output_schema === 'string' 
        ? JSON.parse(row.output_schema) 
        : row.output_schema,
      timeout: row.timeout,
      retryPolicy: typeof row.retry_policy === 'string' 
        ? JSON.parse(row.retry_policy) 
        : row.retry_policy,
      resources: row.metadata?.resource_limits || null,
      metadata: typeof row.metadata === 'string' 
        ? JSON.parse(row.metadata) 
        : row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}