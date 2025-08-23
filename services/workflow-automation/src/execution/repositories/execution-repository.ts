/**
 * Execution Repository - Database access layer for workflow executions
 * Handles all database operations related to workflow execution lifecycle:
 * - Creating and updating execution records
 * - Tracking execution progress and status
 * - Managing execution logs and metadata
 * - Query execution history and statistics
 */

import { createServiceLogger } from '../../shared-utils-local';

const logger = createServiceLogger('execution-repository');

export interface ExecutionData {
  execution_id: string;
  workflow_id: string;
  input_data: Record<string, any>;
  output_data?: Record<string, any>;
  status: string;
  started_at: Date;
  completed_at?: Date;
  duration_ms?: number;
  triggered_by: string;
  execution_context: Record<string, any>;
  error_type?: string;
  error_message?: string;
}

export interface ExecutionProgress {
  current_activity?: string;
  completed_activities: number;
  total_activities: number;
  percentage: number;
}

export interface ExecutionUpdate {
  status?: string;
  completed_at?: Date;
  duration_ms?: number;
  output_data?: Record<string, any>;
  error_type?: string;
  error_message?: string;
}

export interface LogEntry {
  id: string;
  execution_id: string;
  activity_name?: string;
  level: string;
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class ExecutionRepository {
  private database: any;

  constructor(database: any) {
    this.database = database;
  }

  /**
   * Create a new workflow execution record
   */
  async createExecution(executionData: ExecutionData): Promise<void> {
    try {
      const query = `
        INSERT INTO workflow_executions (
          execution_id, workflow_id, input_data, status, 
          started_at, triggered_by, execution_context
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      const values = [
        executionData.execution_id,
        executionData.workflow_id,
        JSON.stringify(executionData.input_data),
        executionData.status,
        executionData.started_at,
        executionData.triggered_by,
        JSON.stringify(executionData.execution_context)
      ];

      await this.database.query(query, values);

      logger.getLogger().info('Execution record created', {
        executionId: executionData.execution_id,
        workflowId: executionData.workflow_id,
        status: executionData.status
      });

    } catch (error) {
      logger.error(error as Error, {
        executionId: executionData.execution_id
      }, 'Failed to create execution record');
      throw error;
    }
  }

  /**
   * Get execution by ID
   */
  async getExecution(executionId: string): Promise<ExecutionData | null> {
    try {
      const query = `
        SELECT 
          execution_id, workflow_id, input_data, output_data,
          status, started_at, completed_at, duration_ms,
          triggered_by, execution_context, error_type, error_message
        FROM workflow_executions 
        WHERE execution_id = $1
      `;

      const { rows } = await this.database.query(query, [executionId]);

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      return {
        execution_id: row.execution_id,
        workflow_id: row.workflow_id,
        input_data: row.input_data,
        output_data: row.output_data,
        status: row.status,
        started_at: row.started_at,
        completed_at: row.completed_at,
        duration_ms: row.duration_ms,
        triggered_by: row.triggered_by,
        execution_context: row.execution_context,
        error_type: row.error_type,
        error_message: row.error_message
      };

    } catch (error) {
      logger.error(error as Error, { executionId }, 'Failed to get execution');
      throw error;
    }
  }

  /**
   * Update execution status
   */
  async updateExecutionStatus(executionId: string, status: string): Promise<void> {
    try {
      const query = `
        UPDATE workflow_executions 
        SET status = $1, updated_at = NOW()
        WHERE execution_id = $2
      `;

      await this.database.query(query, [status, executionId]);

      logger.getLogger().debug('Execution status updated', {
        executionId,
        status
      });

    } catch (error) {
      logger.error(error as Error, {
        executionId,
        status
      }, 'Failed to update execution status');
      throw error;
    }
  }

  /**
   * Update execution with multiple fields
   */
  async updateExecution(executionId: string, updates: ExecutionUpdate): Promise<void> {
    try {
      const setParts: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.status !== undefined) {
        setParts.push(`status = $${paramIndex++}`);
        values.push(updates.status);
      }

      if (updates.completed_at !== undefined) {
        setParts.push(`completed_at = $${paramIndex++}`);
        values.push(updates.completed_at);
      }

      if (updates.duration_ms !== undefined) {
        setParts.push(`duration_ms = $${paramIndex++}`);
        values.push(updates.duration_ms);
      }

      if (updates.output_data !== undefined) {
        setParts.push(`output_data = $${paramIndex++}`);
        values.push(JSON.stringify(updates.output_data));
      }

      if (updates.error_type !== undefined) {
        setParts.push(`error_type = $${paramIndex++}`);
        values.push(updates.error_type);
      }

      if (updates.error_message !== undefined) {
        setParts.push(`error_message = $${paramIndex++}`);
        values.push(updates.error_message);
      }

      if (setParts.length === 0) {
        return; // Nothing to update
      }

      setParts.push(`updated_at = NOW()`);
      values.push(executionId);

      const query = `
        UPDATE workflow_executions 
        SET ${setParts.join(', ')}
        WHERE execution_id = $${paramIndex}
      `;

      await this.database.query(query, values);

      logger.getLogger().debug('Execution updated', {
        executionId,
        updatedFields: Object.keys(updates)
      });

    } catch (error) {
      logger.error(error as Error, {
        executionId,
        updates
      }, 'Failed to update execution');
      throw error;
    }
  }

  /**
   * Update execution progress
   */
  async updateExecutionProgress(
    executionId: string,
    progress: ExecutionProgress
  ): Promise<void> {
    try {
      // Store progress in execution metadata or separate table
      // For now, we'll store it as JSON in a metadata field
      const query = `
        UPDATE workflow_executions 
        SET 
          current_activity = $1,
          execution_context = jsonb_set(
            COALESCE(execution_context, '{}'),
            '{progress}',
            $2::jsonb
          ),
          updated_at = NOW()
        WHERE execution_id = $3
      `;

      const progressJson = JSON.stringify({
        current_activity: progress.current_activity,
        completed_activities: progress.completed_activities,
        total_activities: progress.total_activities,
        percentage: progress.percentage,
        last_updated: new Date()
      });

      await this.database.query(query, [
        progress.current_activity || null,
        progressJson,
        executionId
      ]);

      logger.getLogger().debug('Execution progress updated', {
        executionId,
        progress
      });

    } catch (error) {
      logger.error(error as Error, {
        executionId,
        progress
      }, 'Failed to update execution progress');
      throw error;
    }
  }

  /**
   * Add execution log entry
   */
  async addExecutionLog(
    executionId: string,
    level: string,
    message: string,
    activityName?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO execution_logs (
          execution_id, activity_name, level, message, timestamp, metadata
        ) VALUES ($1, $2, $3, $4, NOW(), $5)
      `;

      await this.database.query(query, [
        executionId,
        activityName || null,
        level,
        message,
        metadata ? JSON.stringify(metadata) : null
      ]);

      logger.getLogger().debug('Execution log added', {
        executionId,
        level,
        activityName
      });

    } catch (error) {
      logger.error(error as Error, {
        executionId,
        level,
        message: message.substring(0, 100)
      }, 'Failed to add execution log');
      // Don't throw error for logging failures
    }
  }

  /**
   * Get execution logs with filtering
   */
  async getExecutionLogs(
    executionId: string,
    filters: {
      level?: string;
      activity?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ logs: LogEntry[]; total: number }> {
    try {
      let whereClause = 'WHERE execution_id = $1';
      const values: any[] = [executionId];
      let paramIndex = 2;

      if (filters.level) {
        whereClause += ` AND level = $${paramIndex++}`;
        values.push(filters.level);
      }

      if (filters.activity) {
        whereClause += ` AND activity_name = $${paramIndex++}`;
        values.push(filters.activity);
      }

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM execution_logs 
        ${whereClause}
      `;

      const { rows: countRows } = await this.database.query(countQuery, values);
      const total = parseInt(countRows[0].total);

      // Get logs with pagination
      const limit = filters.limit || 100;
      const offset = filters.offset || 0;

      const logsQuery = `
        SELECT id, execution_id, activity_name, level, message, timestamp, metadata
        FROM execution_logs 
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      values.push(limit, offset);

      const { rows: logRows } = await this.database.query(logsQuery, values);

      const logs: LogEntry[] = logRows.map(row => ({
        id: row.id,
        execution_id: row.execution_id,
        activity_name: row.activity_name,
        level: row.level,
        message: row.message,
        timestamp: row.timestamp,
        metadata: row.metadata
      }));

      return { logs, total };

    } catch (error) {
      logger.error(error as Error, {
        executionId,
        filters
      }, 'Failed to get execution logs');
      throw error;
    }
  }

  /**
   * Get executions with filtering and pagination
   */
  async getExecutions(filters: {
    workflow_id?: string;
    status?: string;
    triggered_by?: string;
    start_date?: Date;
    end_date?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ executions: ExecutionData[]; total: number }> {
    try {
      let whereClause = 'WHERE 1=1';
      const values: any[] = [];
      let paramIndex = 1;

      if (filters.workflow_id) {
        whereClause += ` AND workflow_id = $${paramIndex++}`;
        values.push(filters.workflow_id);
      }

      if (filters.status) {
        whereClause += ` AND status = $${paramIndex++}`;
        values.push(filters.status);
      }

      if (filters.triggered_by) {
        whereClause += ` AND triggered_by = $${paramIndex++}`;
        values.push(filters.triggered_by);
      }

      if (filters.start_date) {
        whereClause += ` AND started_at >= $${paramIndex++}`;
        values.push(filters.start_date);
      }

      if (filters.end_date) {
        whereClause += ` AND started_at <= $${paramIndex++}`;
        values.push(filters.end_date);
      }

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM workflow_executions 
        ${whereClause}
      `;

      const { rows: countRows } = await this.database.query(countQuery, values);
      const total = parseInt(countRows[0].total);

      // Get executions with pagination
      const limit = filters.limit || 50;
      const offset = filters.offset || 0;

      const executionsQuery = `
        SELECT 
          execution_id, workflow_id, input_data, output_data,
          status, started_at, completed_at, duration_ms,
          triggered_by, execution_context, error_type, error_message
        FROM workflow_executions 
        ${whereClause}
        ORDER BY started_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      values.push(limit, offset);

      const { rows } = await this.database.query(executionsQuery, values);

      const executions: ExecutionData[] = rows.map(row => ({
        execution_id: row.execution_id,
        workflow_id: row.workflow_id,
        input_data: row.input_data,
        output_data: row.output_data,
        status: row.status,
        started_at: row.started_at,
        completed_at: row.completed_at,
        duration_ms: row.duration_ms,
        triggered_by: row.triggered_by,
        execution_context: row.execution_context,
        error_type: row.error_type,
        error_message: row.error_message
      }));

      return { executions, total };

    } catch (error) {
      logger.error(error as Error, { filters }, 'Failed to get executions');
      throw error;
    }
  }

  /**
   * Get execution statistics
   */
  async getExecutionStats(workflowId?: string): Promise<{
    total_executions: number;
    successful_executions: number;
    failed_executions: number;
    running_executions: number;
    average_duration_ms: number;
    success_rate: number;
  }> {
    try {
      let whereClause = 'WHERE 1=1';
      const values: any[] = [];

      if (workflowId) {
        whereClause += ' AND workflow_id = $1';
        values.push(workflowId);
      }

      const query = `
        SELECT 
          COUNT(*) as total_executions,
          COUNT(*) FILTER (WHERE status = 'completed') as successful_executions,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_executions,
          COUNT(*) FILTER (WHERE status = 'running') as running_executions,
          AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as average_duration_ms
        FROM workflow_executions 
        ${whereClause}
      `;

      const { rows } = await this.database.query(query, values);
      const stats = rows[0];

      const total = parseInt(stats.total_executions) || 0;
      const successful = parseInt(stats.successful_executions) || 0;
      const successRate = total > 0 ? (successful / total) * 100 : 0;

      return {
        total_executions: total,
        successful_executions: successful,
        failed_executions: parseInt(stats.failed_executions) || 0,
        running_executions: parseInt(stats.running_executions) || 0,
        average_duration_ms: Math.round(parseFloat(stats.average_duration_ms) || 0),
        success_rate: Math.round(successRate * 100) / 100
      };

    } catch (error) {
      logger.error(error as Error, { workflowId }, 'Failed to get execution stats');
      throw error;
    }
  }
}