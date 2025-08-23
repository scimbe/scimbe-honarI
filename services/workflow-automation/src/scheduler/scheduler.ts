/**
 * Workflow Scheduler - Cron-based workflow scheduling and management
 * Handles recurring workflow executions and schedule management
 */

import { CronJob } from 'cron';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { createServiceLogger } from '../shared-utils-local';
import { AutomationDatabase } from '../database/connection';
import { AutomationEngine } from '../automation/engine';

const logger = createServiceLogger('workflow-scheduler');

export interface WorkflowSchedule {
  id: string;
  workflowId: string;
  name: string;
  cronExpression: string;
  timezone: string;
  isActive: boolean;
  lastExecution?: Date;
  nextExecution?: Date;
  executionCount: number;
  metadata?: Record<string, any>;
}

export interface ScheduleExecution {
  scheduleId: string;
  executionId: string;
  executedAt: Date;
  status: 'success' | 'failed';
  result?: any;
  error?: string;
}

export class WorkflowScheduler {
  private database: AutomationDatabase;
  private redis: Redis;
  private automationEngine: AutomationEngine;
  private cronJobs: Map<string, CronJob> = new Map();
  private initialized = false;

  constructor(
    database: AutomationDatabase,
    redis: Redis,
    automationEngine: AutomationEngine
  ) {
    this.database = database;
    this.redis = redis;
    this.automationEngine = automationEngine;
  }

  /**
   * Initialize scheduler and load active schedules
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Load and start active schedules
      await this.loadActiveSchedules();

      // Set up cleanup job for old executions
      this.setupCleanupJob();

      this.initialized = true;
      logger.getLogger().info({
        activeSchedules: this.cronJobs.size,
      }, 'Workflow scheduler initialized successfully');

    } catch (error) {
      logger.error(error as Error, {}, 'Failed to initialize workflow scheduler');
      throw error;
    }
  }

  /**
   * Create a new workflow schedule
   */
  async createSchedule(
    workflowId: string,
    name: string,
    cronExpression: string,
    options: {
      timezone?: string;
      isActive?: boolean;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<string> {
    try {
      // Validate cron expression
      this.validateCronExpression(cronExpression);

      // Calculate next execution
      const nextExecution = this.calculateNextExecution(cronExpression, options.timezone);

      const scheduleId = uuidv4();
      const schedule: WorkflowSchedule = {
        id: scheduleId,
        workflowId,
        name,
        cronExpression,
        timezone: options.timezone || 'UTC',
        isActive: options.isActive !== false,
        nextExecution,
        executionCount: 0,
        metadata: options.metadata,
      };

      // Save to database
      await this.saveSchedule(schedule);

      // Start the cron job if active
      if (schedule.isActive) {
        await this.startSchedule(scheduleId);
      }

      logger.getLogger().info({
        scheduleId,
        workflowId,
        cronExpression,
        nextExecution,
      }, 'Workflow schedule created');

      return scheduleId;

    } catch (error) {
      logger.error(error as Error, {
        workflowId,
        cronExpression,
      }, 'Failed to create workflow schedule');
      throw error;
    }
  }

  /**
   * Update an existing schedule
   */
  async updateSchedule(
    scheduleId: string,
    updates: {
      name?: string;
      cronExpression?: string;
      timezone?: string;
      isActive?: boolean;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      const schedule = await this.getSchedule(scheduleId);
      if (!schedule) {
        throw new Error(`Schedule not found: ${scheduleId}`);
      }

      // Validate cron expression if updated
      if (updates.cronExpression) {
        this.validateCronExpression(updates.cronExpression);
      }

      // Update schedule object
      const updatedSchedule = { ...schedule, ...updates };

      // Recalculate next execution if cron or timezone changed
      if (updates.cronExpression || updates.timezone) {
        updatedSchedule.nextExecution = this.calculateNextExecution(
          updatedSchedule.cronExpression,
          updatedSchedule.timezone
        );
      }

      // Save updates to database
      await this.saveSchedule(updatedSchedule);

      // Restart cron job if necessary
      if (updates.cronExpression || updates.timezone || updates.isActive !== undefined) {
        await this.stopSchedule(scheduleId);
        if (updatedSchedule.isActive) {
          await this.startSchedule(scheduleId);
        }
      }

      logger.getLogger().info({
        scheduleId,
        updates: Object.keys(updates),
      }, 'Workflow schedule updated');

    } catch (error) {
      logger.error(error as Error, { scheduleId }, 'Failed to update workflow schedule');
      throw error;
    }
  }

  /**
   * Delete a schedule
   */
  async deleteSchedule(scheduleId: string): Promise<void> {
    try {
      // Stop the cron job
      await this.stopSchedule(scheduleId);

      // Delete from database
      await this.database.query(`
        DELETE FROM workflow_schedules WHERE schedule_id = $1
      `, [scheduleId]);

      logger.getLogger().info({ scheduleId }, 'Workflow schedule deleted');

    } catch (error) {
      logger.error(error as Error, { scheduleId }, 'Failed to delete workflow schedule');
      throw error;
    }
  }

  /**
   * Start a schedule (activate cron job)
   */
  async startSchedule(scheduleId: string): Promise<void> {
    try {
      const schedule = await this.getSchedule(scheduleId);
      if (!schedule) {
        throw new Error(`Schedule not found: ${scheduleId}`);
      }

      if (!schedule.isActive) {
        throw new Error(`Schedule is not active: ${scheduleId}`);
      }

      // Stop existing job if running
      if (this.cronJobs.has(scheduleId)) {
        this.cronJobs.get(scheduleId)!.stop();
        this.cronJobs.delete(scheduleId);
      }

      // Create new cron job
      const cronJob = new CronJob(
        schedule.cronExpression,
        () => this.executeScheduledWorkflow(schedule),
        null,
        false,
        schedule.timezone
      );

      cronJob.start();
      this.cronJobs.set(scheduleId, cronJob);

      logger.getLogger().info({
        scheduleId,
        cronExpression: schedule.cronExpression,
        timezone: schedule.timezone,
      }, 'Schedule started');

    } catch (error) {
      logger.error(error as Error, { scheduleId }, 'Failed to start schedule');
      throw error;
    }
  }

  /**
   * Stop a schedule (deactivate cron job)
   */
  async stopSchedule(scheduleId: string): Promise<void> {
    if (this.cronJobs.has(scheduleId)) {
      this.cronJobs.get(scheduleId)!.stop();
      this.cronJobs.delete(scheduleId);
      
      logger.getLogger().info({ scheduleId }, 'Schedule stopped');
    }
  }

  /**
   * Execute a scheduled workflow
   */
  private async executeScheduledWorkflow(schedule: WorkflowSchedule): Promise<void> {
    const executionStart = Date.now();

    try {
      logger.getLogger().info({
        scheduleId: schedule.id,
        workflowId: schedule.workflowId,
        scheduleName: schedule.name,
      }, 'Executing scheduled workflow');

      // Execute the workflow
      const result = await this.automationEngine.executeWorkflow(
        schedule.workflowId,
        'schedule',
        { scheduleId: schedule.id, scheduleName: schedule.name },
        schedule.metadata || {},
        {
          userId: 'scheduler',
        }
      );

      // Update execution count and last execution time
      await this.updateScheduleExecution(schedule.id, 'success', result);

      const duration = Date.now() - executionStart;
      logger.getLogger().info({
        scheduleId: schedule.id,
        workflowId: schedule.workflowId,
        success: result.success,
        duration,
      }, 'Scheduled workflow execution completed');

    } catch (error) {
      const duration = Date.now() - executionStart;
      
      logger.error(error as Error, {
        scheduleId: schedule.id,
        workflowId: schedule.workflowId,
        duration,
      }, 'Scheduled workflow execution failed');

      // Update with failure
      await this.updateScheduleExecution(schedule.id, 'failed', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get schedule by ID
   */
  async getSchedule(scheduleId: string): Promise<WorkflowSchedule | null> {
    try {
      const { rows } = await this.database.query(`
        SELECT * FROM workflow_schedules WHERE schedule_id = $1
      `, [scheduleId]);

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      return {
        id: row.schedule_id,
        workflowId: row.workflow_id,
        name: row.name,
        cronExpression: row.cron_expression,
        timezone: row.timezone,
        isActive: row.is_active,
        lastExecution: row.last_execution,
        nextExecution: row.next_execution,
        executionCount: row.execution_count,
      };

    } catch (error) {
      logger.error(error as Error, { scheduleId }, 'Failed to get schedule');
      throw error;
    }
  }

  /**
   * List schedules with optional filters
   */
  async listSchedules(filters: {
    workflowId?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ schedules: WorkflowSchedule[]; total: number }> {
    try {
      let query = 'SELECT * FROM workflow_schedules WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (filters.workflowId) {
        query += ` AND workflow_id = $${paramIndex++}`;
        params.push(filters.workflowId);
      }

      if (filters.isActive !== undefined) {
        query += ` AND is_active = $${paramIndex++}`;
        params.push(filters.isActive);
      }

      // Get total count
      const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
      const { rows: countRows } = await this.database.query(countQuery, params);
      const total = parseInt(countRows[0].count, 10);

      // Add pagination
      query += ' ORDER BY created_at DESC';
      if (filters.limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(filters.limit);
      }
      if (filters.offset) {
        query += ` OFFSET $${paramIndex++}`;
        params.push(filters.offset);
      }

      const { rows } = await this.database.query(query, params);
      
      const schedules: WorkflowSchedule[] = rows.map(row => ({
        id: row.schedule_id,
        workflowId: row.workflow_id,
        name: row.name,
        cronExpression: row.cron_expression,
        timezone: row.timezone,
        isActive: row.is_active,
        lastExecution: row.last_execution,
        nextExecution: row.next_execution,
        executionCount: row.execution_count,
      }));

      return { schedules, total };

    } catch (error) {
      logger.error(error as Error, { filters }, 'Failed to list schedules');
      throw error;
    }
  }

  /**
   * Get schedule execution history
   */
  async getExecutionHistory(
    scheduleId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ScheduleExecution[]> {
    try {
      // This would query a schedule_executions table in a full implementation
      // For now, return mock data
      return [];

    } catch (error) {
      logger.error(error as Error, { scheduleId }, 'Failed to get execution history');
      throw error;
    }
  }

  /**
   * Get scheduler statistics
   */
  async getStats(): Promise<{
    totalSchedules: number;
    activeSchedules: number;
    runningJobs: number;
    recentExecutions: number;
  }> {
    try {
      const { rows } = await this.database.query(`
        SELECT 
          COUNT(*) as total_schedules,
          COUNT(*) FILTER (WHERE is_active = true) as active_schedules
        FROM workflow_schedules
      `);

      const stats = rows[0];
      
      return {
        totalSchedules: parseInt(stats.total_schedules, 10),
        activeSchedules: parseInt(stats.active_schedules, 10),
        runningJobs: this.cronJobs.size,
        recentExecutions: 0, // Would be calculated from execution history
      };

    } catch (error) {
      logger.error(error as Error, {}, 'Failed to get scheduler stats');
      throw error;
    }
  }

  // Helper methods

  /**
   * Load active schedules from database
   */
  private async loadActiveSchedules(): Promise<void> {
    try {
      const { schedules } = await this.listSchedules({ isActive: true });
      
      for (const schedule of schedules) {
        try {
          await this.startSchedule(schedule.id);
        } catch (error) {
          logger.error(error as Error, {
            scheduleId: schedule.id,
          }, 'Failed to start schedule during initialization');
        }
      }

      logger.getLogger().info({
        loadedSchedules: schedules.length,
      }, 'Active schedules loaded');

    } catch (error) {
      logger.error(error as Error, {}, 'Failed to load active schedules');
      throw error;
    }
  }

  /**
   * Validate cron expression
   */
  private validateCronExpression(cronExpression: string): void {
    try {
      // Basic validation - create a test cron job
      const testJob = new CronJob(cronExpression, () => {}, null, false);
      testJob.stop(); // Immediately stop the test job
    } catch (error) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }
  }

  /**
   * Calculate next execution time
   */
  private calculateNextExecution(cronExpression: string, timezone?: string): Date {
    try {
      const cronJob = new CronJob(cronExpression, () => {}, null, false, timezone);
      const nextDate = cronJob.nextDates();
      cronJob.stop();
      const firstDate = Array.isArray(nextDate) ? nextDate[0] : nextDate;
      return firstDate ? firstDate.toJSDate() : new Date();
    } catch (error) {
      throw new Error(`Failed to calculate next execution: ${(error as Error).message}`);
    }
  }

  /**
   * Save schedule to database
   */
  private async saveSchedule(schedule: WorkflowSchedule): Promise<void> {
    await this.database.query(`
      INSERT INTO workflow_schedules (
        schedule_id, workflow_id, name, cron_expression, timezone,
        is_active, next_execution, execution_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (schedule_id)
      DO UPDATE SET
        workflow_id = EXCLUDED.workflow_id,
        name = EXCLUDED.name,
        cron_expression = EXCLUDED.cron_expression,
        timezone = EXCLUDED.timezone,
        is_active = EXCLUDED.is_active,
        next_execution = EXCLUDED.next_execution,
        execution_count = EXCLUDED.execution_count
    `, [
      schedule.id,
      schedule.workflowId,
      schedule.name,
      schedule.cronExpression,
      schedule.timezone,
      schedule.isActive,
      schedule.nextExecution,
      schedule.executionCount,
    ]);
  }

  /**
   * Update schedule execution info
   */
  private async updateScheduleExecution(
    scheduleId: string,
    status: 'success' | 'failed',
    result: any
  ): Promise<void> {
    try {
      // Calculate next execution
      const schedule = await this.getSchedule(scheduleId);
      if (!schedule) return;

      const nextExecution = this.calculateNextExecution(
        schedule.cronExpression,
        schedule.timezone
      );

      await this.database.query(`
        UPDATE workflow_schedules
        SET last_execution = NOW(),
            next_execution = $1,
            execution_count = execution_count + 1
        WHERE schedule_id = $2
      `, [nextExecution, scheduleId]);

    } catch (error) {
      logger.error(error as Error, { scheduleId }, 'Failed to update schedule execution');
    }
  }

  /**
   * Setup cleanup job for old executions
   */
  private setupCleanupJob(): void {
    // Run cleanup daily at 2 AM
    const cleanupJob = new CronJob('0 2 * * *', async () => {
      try {
        // Clean up old execution records (older than 30 days)
        // This would be implemented with a schedule_executions table
        logger.getLogger().info('Running scheduled cleanup of old executions');
      } catch (error) {
        logger.error(error as Error, {}, 'Cleanup job failed');
      }
    }, null, true, 'UTC');

    logger.getLogger().info('Cleanup job scheduled');
  }

  /**
   * Shutdown scheduler
   */
  async shutdown(): Promise<void> {
    // Stop all cron jobs
    for (const [scheduleId, cronJob] of this.cronJobs) {
      cronJob.stop();
      logger.getLogger().debug({ scheduleId }, 'Cron job stopped');
    }

    this.cronJobs.clear();
    this.initialized = false;
    
    logger.getLogger().info('Workflow scheduler shutdown completed');
  }
}