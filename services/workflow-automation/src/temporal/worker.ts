/**
 * Temporal Worker for Workflow Automation Service
 * Registers and executes workflows and activities
 */

import { NativeConnection, Worker } from '@temporalio/worker';
import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('temporal-worker');

// Import workflows
import { addNumbersWorkflow } from './workflows/add-numbers-workflow';
import { teamsWebhookWorkflow } from './workflows/teams-webhook-workflow';
import { githubMcpWorkflow } from './workflows/github-mcp-workflow';

// Import activities
import * as addNumbersActivities from './activities/add-numbers-activities';
import * as teamsWebhookActivities from './activities/teams-webhook-activities';
import * as githubMcpActivities from './activities/github-mcp-activities';

export interface TemporalWorkerConfig {
  temporalAddress?: string;
  namespace?: string;
  taskQueue?: string;
  maxConcurrentActivities?: number;
  maxConcurrentWorkflows?: number;
}

/**
 * Create and start Temporal worker
 */
export async function createTemporalWorker(config: TemporalWorkerConfig = {}): Promise<Worker> {
  const {
    temporalAddress = process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    namespace = process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue = process.env.TEMPORAL_TASK_QUEUE || 'workflow-automation',
    maxConcurrentActivities = 10,
    maxConcurrentWorkflows = 10
  } = config;

  try {
    logger.getLogger().info('Connecting to Temporal server...', {
      temporalAddress,
      namespace,
      taskQueue
    });

    // Create connection to Temporal server
    const connection = await NativeConnection.connect({
      address: temporalAddress,
    });

    // Create worker
    const worker = await Worker.create({
      connection,
      namespace,
      taskQueue,
      
      // Register all workflows
      workflowsPath: require.resolve('./workflows'),
      
      // Register all activities
      activities: {
        // Add Numbers Workflow Activities
        ...addNumbersActivities,
        
        // Teams Webhook Workflow Activities  
        ...teamsWebhookActivities,
        
        // GitHub MCP Workflow Activities
        ...githubMcpActivities,
      },
      
      // Worker configuration
      maxConcurrentActivityExecutions: maxConcurrentActivities,
      maxConcurrentWorkflowTaskExecutions: maxConcurrentWorkflows,
      
      // Logging configuration
      sinks: {
        defaultWorkerLogger: {
          log: (level: string, message: string, attrs?: any) => {
            logger.getLogger().info('Temporal worker log', { level, message, attrs });
          }
        }
      },
    });

    logger.getLogger().info('Temporal worker created successfully', {
      taskQueue,
      maxConcurrentActivities,
      maxConcurrentWorkflows
    });

    return worker;

  } catch (error) {
    logger.error(error as Error, {
      temporalAddress,
      namespace,
      taskQueue
    }, 'Failed to create Temporal worker');
    throw error;
  }
}

/**
 * Start the Temporal worker
 */
export async function startWorker(config: TemporalWorkerConfig = {}): Promise<void> {
  try {
    const worker = await createTemporalWorker(config);
    
    logger.getLogger().info('Starting Temporal worker...');
    
    // Start the worker
    await worker.run();
    
  } catch (error) {
    logger.error(error as Error, {}, 'Failed to start Temporal worker');
    throw error;
  }
}

// Start worker if this file is run directly
if (require.main === module) {
  startWorker()
    .then(() => {
      logger.getLogger().info('Temporal worker started successfully');
    })
    .catch((error) => {
      logger.error(error as Error, {}, 'Failed to start Temporal worker');
      process.exit(1);
    });
}