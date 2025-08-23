/**
 * Job Queue - Redis-based job queue for workflow automation
 * Handles background processing, scheduling, and job management
 */

import Bull from 'bull';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('job-queue');

export interface AutomationJob {
  id: string;
  type: string;
  priority: number;
  payload: any;
  attempts: number;
  maxAttempts: number;
  delay?: number;
  executionId?: string;
  workflowId?: string;
}

export interface JobResult {
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
  completedAt: Date;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export class JobQueue {
  private redis: Redis;
  private queues: Map<string, Bull.Queue> = new Map();
  private initialized = false;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Initialize job queue system
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Create default queues
      await this.createQueue('workflow-execution', {
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      });

      await this.createQueue('quality-assessment', {
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 25,
          attempts: 2,
        },
      });

      await this.createQueue('data-processing', {
        defaultJobOptions: {
          removeOnComplete: 200,
          removeOnFail: 100,
          attempts: 5,
        },
      });

      await this.createQueue('ai-tasks', {
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
        },
      });

      this.initialized = true;
      logger.getLogger().info({
        queueCount: this.queues.size,
      }, 'Job queue system initialized successfully');

    } catch (error) {
      logger.error(error as Error, {}, 'Failed to initialize job queue system');
      throw error;
    }
  }

  /**
   * Create a new queue
   */
  async createQueue(name: string, options: Bull.QueueOptions = {}): Promise<Bull.Queue> {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queue = new Bull(name, {
      redis: {
        host: this.redis.options.host,
        port: this.redis.options.port,
        password: this.redis.options.password,
      },
      ...options,
    });

    // Set up event handlers
    queue.on('completed', (job, result) => {
      logger.getLogger().info({
        queueName: name,
        jobId: job.id,
        jobType: job.data.type,
        duration: Date.now() - job.processedOn!,
      }, 'Job completed successfully');
    });

    queue.on('failed', (job, err) => {
      logger.error(err, {
        queueName: name,
        jobId: job.id,
        jobType: job.data.type,
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts,
      }, 'Job failed');
    });

    queue.on('stalled', (job) => {
      logger.warn({
        queueName: name,
        jobId: job.id,
        jobType: job.data.type,
      }, 'Job stalled');
    });

    this.queues.set(name, queue);
    
    logger.getLogger().info({ queueName: name }, 'Queue created successfully');
    return queue;
  }

  /**
   * Add job to queue
   */
  async addJob(
    queueName: string,
    jobType: string,
    payload: any,
    options: {
      priority?: number;
      delay?: number;
      attempts?: number;
      executionId?: string;
      workflowId?: string;
    } = {}
  ): Promise<string> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    const jobId = uuidv4();
    const jobData: AutomationJob = {
      id: jobId,
      type: jobType,
      priority: options.priority || 0,
      payload,
      attempts: 0,
      maxAttempts: options.attempts || 3,
      delay: options.delay,
      executionId: options.executionId,
      workflowId: options.workflowId,
    };

    try {
      const job = await queue.add(jobType, jobData, {
        jobId,
        priority: options.priority,
        delay: options.delay,
        attempts: options.attempts,
      });

      logger.getLogger().info({
        queueName,
        jobId,
        jobType,
        priority: options.priority,
        delay: options.delay,
      }, 'Job added to queue');

      return jobId;

    } catch (error) {
      logger.error(error as Error, {
        queueName,
        jobType,
      }, 'Failed to add job to queue');
      throw error;
    }
  }

  /**
   * Process jobs in a queue
   */
  async processJobs(
    queueName: string,
    processor: (job: AutomationJob) => Promise<any>,
    concurrency: number = 1
  ): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    queue.process('*', concurrency, async (job) => {
      const startTime = Date.now();
      const jobData = job.data as AutomationJob;

      logger.getLogger().info({
        queueName,
        jobId: job.id,
        jobType: jobData.type,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts,
      }, 'Processing job');

      try {
        const result = await processor(jobData);
        const duration = Date.now() - startTime;

        logger.getLogger().info({
          queueName,
          jobId: job.id,
          jobType: jobData.type,
          duration,
        }, 'Job processed successfully');

        return result;

      } catch (error) {
        const duration = Date.now() - startTime;
        
        logger.error(error as Error, {
          queueName,
          jobId: job.id,
          jobType: jobData.type,
          duration,
          attempt: job.attemptsMade + 1,
        }, 'Job processing failed');

        throw error;
      }
    });

    logger.getLogger().info({
      queueName,
      concurrency,
    }, 'Job processor registered');
  }

  /**
   * Get job by ID
   */
  async getJob(queueName: string, jobId: string): Promise<AutomationJob | null> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        return null;
      }

      return job.data as AutomationJob;

    } catch (error) {
      logger.error(error as Error, {
        queueName,
        jobId,
      }, 'Failed to get job');
      throw error;
    }
  }

  /**
   * Cancel job
   */
  async cancelJob(queueName: string, jobId: string): Promise<boolean> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        return false;
      }

      await job.remove();
      
      logger.getLogger().info({
        queueName,
        jobId,
      }, 'Job cancelled successfully');

      return true;

    } catch (error) {
      logger.error(error as Error, {
        queueName,
        jobId,
      }, 'Failed to cancel job');
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<QueueStats> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      };

    } catch (error) {
      logger.error(error as Error, { queueName }, 'Failed to get queue stats');
      throw error;
    }
  }

  /**
   * Get jobs by status
   */
  async getJobsByStatus(
    queueName: string,
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed',
    start: number = 0,
    end: number = -1
  ): Promise<AutomationJob[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    try {
      let jobs: Bull.Job[];

      switch (status) {
        case 'waiting':
          jobs = await queue.getWaiting(start, end);
          break;
        case 'active':
          jobs = await queue.getActive(start, end);
          break;
        case 'completed':
          jobs = await queue.getCompleted(start, end);
          break;
        case 'failed':
          jobs = await queue.getFailed(start, end);
          break;
        case 'delayed':
          jobs = await queue.getDelayed(start, end);
          break;
        default:
          throw new Error(`Invalid status: ${status}`);
      }

      return jobs.map(job => job.data as AutomationJob);

    } catch (error) {
      logger.error(error as Error, {
        queueName,
        status,
      }, 'Failed to get jobs by status');
      throw error;
    }
  }

  /**
   * Retry failed job
   */
  async retryJob(queueName: string, jobId: string): Promise<boolean> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        return false;
      }

      await job.retry();
      
      logger.getLogger().info({
        queueName,
        jobId,
      }, 'Job retried successfully');

      return true;

    } catch (error) {
      logger.error(error as Error, {
        queueName,
        jobId,
      }, 'Failed to retry job');
      throw error;
    }
  }

  /**
   * Clean completed and failed jobs
   */
  async cleanQueue(
    queueName: string,
    grace: number = 5000,
    limit: number = 100
  ): Promise<number> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    try {
      const [completedCount, failedCount] = await Promise.all([
        queue.clean(grace, 'completed', limit),
        queue.clean(grace, 'failed', limit),
      ]);

      const totalCleaned = completedCount + failedCount;
      
      logger.getLogger().info({
        queueName,
        completedCleaned: completedCount,
        failedCleaned: failedCount,
        totalCleaned,
      }, 'Queue cleaned successfully');

      return totalCleaned;

    } catch (error) {
      logger.error(error as Error, { queueName }, 'Failed to clean queue');
      throw error;
    }
  }

  /**
   * Pause queue
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    await queue.pause();
    logger.getLogger().info({ queueName }, 'Queue paused');
  }

  /**
   * Resume queue
   */
  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    await queue.resume();
    logger.getLogger().info({ queueName }, 'Queue resumed');
  }

  /**
   * Get all queue names
   */
  getQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Close all queues
   */
  async close(): Promise<void> {
    for (const [name, queue] of this.queues) {
      try {
        await queue.close();
        logger.getLogger().info({ queueName: name }, 'Queue closed');
      } catch (error) {
        logger.error(error as Error, { queueName: name }, 'Failed to close queue');
      }
    }

    this.queues.clear();
    this.initialized = false;
    logger.getLogger().info('All queues closed');
  }
}