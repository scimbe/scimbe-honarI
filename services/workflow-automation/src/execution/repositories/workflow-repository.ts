/**
 * Workflow Repository - Database access layer for workflow definitions
 * Handles all database operations related to workflow and activity definitions:
 * - Loading workflow definitions and metadata
 * - Retrieving activity configurations
 * - Managing workflow statistics and usage tracking
 * - Caching frequently accessed definitions
 */

import { createServiceLogger } from '../../shared-utils-local';

const logger = createServiceLogger('workflow-repository');

export interface WorkflowDefinition {
  id: string;
  workflow_id: string;
  name: string;
  description: string;
  class_name: string;
  python_code: string;
  input_schema?: any;
  output_schema?: any;
  status: string;
  created_at: Date;
  updated_at: Date;
  execution_count: number;
  success_rate: number;
}

export interface ActivityDefinition {
  id: string;
  workflow_id: string;
  name: string;
  function_name: string;
  description: string;
  javascript_code: string;
  input_schema?: any;
  output_schema?: any;
  timeout_seconds: number;
  retry_policy?: any;
  position: number;
  dependencies?: string[];
}

export interface WorkflowStats {
  execution_count: number;
  last_executed_at: Date;
  average_execution_time_ms: number;
  success_rate: number;
}

export class WorkflowRepository {
  private database: any;
  private cache: Map<string, any> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(database: any) {
    this.database = database;
  }

  /**
   * Get workflow definition by ID with caching
   */
  async getWorkflowDefinition(workflowId: string): Promise<WorkflowDefinition | null> {
    try {
      // Check cache first
      const cacheKey = `workflow:${workflowId}`;
      const cached = this.getCachedItem(cacheKey);
      if (cached) {
        logger.getLogger().debug('Workflow definition retrieved from cache', { workflowId });
        return cached;
      }

      const query = `
        SELECT 
          id, workflow_id, name, description, class_name, python_code,
          status, created_at, updated_at, execution_count, success_rate,
          form_schema as input_schema
        FROM workflows 
        WHERE workflow_id = $1 AND status = 'active'
      `;

      const { rows } = await this.database.query(query, [workflowId]);

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      const workflow: WorkflowDefinition = {
        id: row.id,
        workflow_id: row.workflow_id,
        name: row.name,
        description: row.description,
        class_name: row.class_name,
        python_code: row.python_code,
        input_schema: row.input_schema,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        execution_count: row.execution_count || 0,
        success_rate: row.success_rate || 0
      };

      // Cache the result
      this.setCachedItem(cacheKey, workflow);

      logger.getLogger().debug('Workflow definition retrieved from database', {
        workflowId,
        name: workflow.name
      });

      return workflow;

    } catch (error) {
      logger.error(error as Error, { workflowId }, 'Failed to get workflow definition');
      throw error;
    }
  }

  /**
   * Get all activities for a workflow
   */
  async getWorkflowActivities(workflowId: string): Promise<ActivityDefinition[]> {
    try {
      // Check cache first
      const cacheKey = `activities:${workflowId}`;
      const cached = this.getCachedItem(cacheKey);
      if (cached) {
        logger.getLogger().debug('Workflow activities retrieved from cache', { 
          workflowId,
          count: cached.length 
        });
        return cached;
      }

      const query = `
        SELECT 
          id, workflow_id, name, function_name, description, python_code as javascript_code,
          inputs as input_schema, outputs as output_schema, status
        FROM activities 
        WHERE workflow_id = $1 AND status = 'active'
        ORDER BY name
      `;

      const { rows } = await this.database.query(query, [workflowId]);

      const activities: ActivityDefinition[] = rows.map((row, index) => ({
        id: row.id,
        workflow_id: row.workflow_id,
        name: row.name,
        function_name: row.function_name,
        description: row.description || '',
        javascript_code: this.convertPythonToJavaScript(row.javascript_code),
        input_schema: row.input_schema,
        output_schema: row.output_schema,
        timeout_seconds: 300, // Default timeout
        position: index,
        dependencies: []
      }));

      // Cache the result
      this.setCachedItem(cacheKey, activities);

      logger.getLogger().debug('Workflow activities retrieved from database', {
        workflowId,
        count: activities.length,
        names: activities.map(a => a.name)
      });

      return activities;

    } catch (error) {
      logger.error(error as Error, { workflowId }, 'Failed to get workflow activities');
      throw error;
    }
  }

  /**
   * Get specific activity definition
   */
  async getActivityDefinition(activityId: string): Promise<ActivityDefinition | null> {
    try {
      const cacheKey = `activity:${activityId}`;
      const cached = this.getCachedItem(cacheKey);
      if (cached) {
        return cached;
      }

      const query = `
        SELECT 
          id, workflow_id, name, function_name, description, python_code as javascript_code,
          inputs as input_schema, outputs as output_schema, status
        FROM activities 
        WHERE id = $1 AND status = 'active'
      `;

      const { rows } = await this.database.query(query, [activityId]);

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      const activity: ActivityDefinition = {
        id: row.id,
        workflow_id: row.workflow_id,
        name: row.name,
        function_name: row.function_name,
        description: row.description || '',
        javascript_code: this.convertPythonToJavaScript(row.javascript_code),
        input_schema: row.input_schema,
        output_schema: row.output_schema,
        timeout_seconds: 300,
        position: 0,
        dependencies: []
      };

      this.setCachedItem(cacheKey, activity);
      return activity;

    } catch (error) {
      logger.error(error as Error, { activityId }, 'Failed to get activity definition');
      throw error;
    }
  }

  /**
   * Update workflow statistics after execution
   */
  async updateWorkflowStats(workflowId: string, stats: WorkflowStats): Promise<void> {
    try {
      const query = `
        UPDATE workflows 
        SET 
          execution_count = $1,
          last_executed_at = $2,
          average_execution_time_ms = $3,
          success_rate = $4,
          updated_at = NOW()
        WHERE workflow_id = $5
      `;

      await this.database.query(query, [
        stats.execution_count,
        stats.last_executed_at,
        stats.average_execution_time_ms,
        stats.success_rate,
        workflowId
      ]);

      // Invalidate cache
      this.invalidateCache(`workflow:${workflowId}`);

      logger.getLogger().debug('Workflow stats updated', {
        workflowId,
        executionCount: stats.execution_count,
        successRate: stats.success_rate
      });

    } catch (error) {
      logger.error(error as Error, { workflowId, stats }, 'Failed to update workflow stats');
      throw error;
    }
  }

  /**
   * Get all active workflows with pagination
   */
  async getActiveWorkflows(options: {
    limit?: number;
    offset?: number;
    search?: string;
    category?: string;
  } = {}): Promise<{ workflows: WorkflowDefinition[]; total: number }> {
    try {
      let whereClause = "WHERE status = 'active'";
      const values: any[] = [];
      let paramIndex = 1;

      if (options.search) {
        whereClause += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
        values.push(`%${options.search}%`);
        paramIndex++;
      }

      if (options.category) {
        whereClause += ` AND category = $${paramIndex}`;
        values.push(options.category);
        paramIndex++;
      }

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM workflows 
        ${whereClause}
      `;

      const { rows: countRows } = await this.database.query(countQuery, values);
      const total = parseInt(countRows[0].total);

      // Get workflows with pagination
      const limit = options.limit || 50;
      const offset = options.offset || 0;

      const workflowsQuery = `
        SELECT 
          id, workflow_id, name, description, class_name, python_code,
          status, created_at, updated_at, execution_count, success_rate
        FROM workflows 
        ${whereClause}
        ORDER BY updated_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      values.push(limit, offset);

      const { rows } = await this.database.query(workflowsQuery, values);

      const workflows: WorkflowDefinition[] = rows.map(row => ({
        id: row.id,
        workflow_id: row.workflow_id,
        name: row.name,
        description: row.description,
        class_name: row.class_name,
        python_code: row.python_code,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        execution_count: row.execution_count || 0,
        success_rate: row.success_rate || 0
      }));

      return { workflows, total };

    } catch (error) {
      logger.error(error as Error, { options }, 'Failed to get active workflows');
      throw error;
    }
  }

  /**
   * Get workflow execution history summary
   */
  async getWorkflowExecutionSummary(workflowId: string): Promise<{
    total_executions: number;
    recent_executions: number;
    success_rate: number;
    average_duration_ms: number;
    last_execution_date?: Date;
  }> {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_executions,
          COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '7 days') as recent_executions,
          (COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / NULLIF(COUNT(*), 0)) as success_rate,
          AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as average_duration_ms,
          MAX(started_at) as last_execution_date
        FROM workflow_executions 
        WHERE workflow_id = $1
      `;

      const { rows } = await this.database.query(query, [workflowId]);
      const stats = rows[0];

      return {
        total_executions: parseInt(stats.total_executions) || 0,
        recent_executions: parseInt(stats.recent_executions) || 0,
        success_rate: Math.round((parseFloat(stats.success_rate) || 0) * 100) / 100,
        average_duration_ms: Math.round(parseFloat(stats.average_duration_ms) || 0),
        last_execution_date: stats.last_execution_date
      };

    } catch (error) {
      logger.error(error as Error, { workflowId }, 'Failed to get workflow execution summary');
      throw error;
    }
  }

  /**
   * Search workflows by name or description
   */
  async searchWorkflows(searchTerm: string, limit: number = 20): Promise<WorkflowDefinition[]> {
    try {
      const query = `
        SELECT 
          id, workflow_id, name, description, class_name, python_code,
          status, created_at, updated_at, execution_count, success_rate
        FROM workflows 
        WHERE status = 'active' 
          AND (name ILIKE $1 OR description ILIKE $1)
        ORDER BY 
          CASE 
            WHEN name ILIKE $1 THEN 1 
            ELSE 2 
          END,
          execution_count DESC
        LIMIT $2
      `;

      const searchPattern = `%${searchTerm}%`;
      const { rows } = await this.database.query(query, [searchPattern, limit]);

      return rows.map(row => ({
        id: row.id,
        workflow_id: row.workflow_id,
        name: row.name,
        description: row.description,
        class_name: row.class_name,
        python_code: row.python_code,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        execution_count: row.execution_count || 0,
        success_rate: row.success_rate || 0
      }));

    } catch (error) {
      logger.error(error as Error, { searchTerm }, 'Failed to search workflows');
      throw error;
    }
  }

  /**
   * Private method: Convert Python activity code to JavaScript equivalent
   */
  private convertPythonToJavaScript(pythonCode: string): string {
    if (!pythonCode) {
      return `
        function executeActivity(inputs, context) {
          context.log('info', 'Activity executed with inputs', inputs);
          return {
            success: true,
            processed_at: new Date().toISOString(),
            input_keys: Object.keys(inputs)
          };
        }
      `;
    }

    // Basic Python to JavaScript conversion
    // This is a simplified conversion - in production you'd want more sophisticated mapping
    let jsCode = pythonCode
      .replace(/def\s+(\w+)\s*\([^)]*\):/g, 'function $1(inputs, context) {')
      .replace(/return\s+{/g, 'return {')
      .replace(/True/g, 'true')
      .replace(/False/g, 'false')
      .replace(/None/g, 'null')
      .replace(/#\s*(.*)/g, '// $1')
      .replace(/print\s*\(/g, 'context.log("info", ');

    // Ensure the function returns something
    if (!jsCode.includes('return')) {
      jsCode += '\n  return { success: true, processed: true };';
    }

    // Wrap in proper function if not already wrapped
    if (!jsCode.includes('function')) {
      jsCode = `
        function executeActivity(inputs, context) {
          ${jsCode}
        }
      `;
    }

    return jsCode;
  }

  /**
   * Private method: Cache management
   */
  private getCachedItem(key: string): any {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  private setCachedItem(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  private invalidateCache(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cached items
   */
  clearCache(): void {
    this.cache.clear();
    logger.getLogger().debug('Workflow repository cache cleared');
  }
}