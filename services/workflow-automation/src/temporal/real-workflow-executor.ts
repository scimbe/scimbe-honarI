/**
 * Real Temporal Workflow Executor
 * Actually creates, deploys, and executes workflows in Temporal
 */

import { Client, Connection, WorkflowHandle } from '@temporalio/client';
import { Worker, Runtime } from '@temporalio/worker';
import { FastifyBaseLogger } from 'fastify';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface RealWorkflowDeployment {
  workflowId: string;
  workflowType: string;
  taskQueue: string;
  workflowCode: string;
  status: 'created' | 'deployed' | 'running' | 'completed' | 'failed';
  executionUrl?: string;
  workflowHandle?: WorkflowHandle;
}

export class RealTemporalWorkflowExecutor {
  private client: Client | null = null;
  private worker: Worker | null = null;
  private connection: Connection | null = null;
  private logger: FastifyBaseLogger;
  private temporalAddress: string;
  private namespace: string;
  private deployedWorkflows: Map<string, RealWorkflowDeployment> = new Map();

  constructor(
    logger: FastifyBaseLogger,
    temporalAddress: string = 'localhost:7233',
    namespace: string = 'default'
  ) {
    this.logger = logger;
    this.temporalAddress = temporalAddress;
    this.namespace = namespace;
  }

  /**
   * Initialize connection to Temporal server
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info(`Connecting to Temporal at ${this.temporalAddress}`);
      
      this.connection = await Connection.connect({
        address: this.temporalAddress,
      });
      
      this.client = new Client({
        connection: this.connection,
        namespace: this.namespace,
      });

      this.logger.info('Successfully connected to Temporal server');
    } catch (error) {
      this.logger.error(`Failed to connect to Temporal: ${error}`);
      throw new Error(`Temporal connection failed: ${error}`);
    }
  }

  /**
   * Deploy and execute a generated workflow
   */
  async deployAndExecuteWorkflow(
    workflowCode: string,
    workflowName: string,
    input: any = {},
    options: {
      taskQueue?: string;
      timeout?: string;
      retryPolicy?: any;
    } = {}
  ): Promise<RealWorkflowDeployment> {
    if (!this.client) {
      await this.initialize();
    }

    const workflowId = `${workflowName}_${uuidv4()}`;
    const taskQueue = options.taskQueue || `task-queue-${workflowId}`;

    try {
      // 1. Create workflow file dynamically
      const workflowPath = await this.createWorkflowFile(workflowCode, workflowName, workflowId);
      
      // 2. Start worker for this workflow
      await this.startWorkerForWorkflow(workflowPath, taskQueue);
      
      // 3. Start workflow execution
      const workflowHandle = await this.client!.workflow.start(workflowName, {
        workflowId,
        taskQueue,
        args: [input],
        workflowExecutionTimeout: '10m',
        retry: options.retryPolicy || {
          maximumAttempts: 3,
        },
      });

      const deployment: RealWorkflowDeployment = {
        workflowId,
        workflowType: workflowName,
        taskQueue,
        workflowCode,
        status: 'running',
        executionUrl: this.getWorkflowUIUrl(workflowId),
        workflowHandle,
      };

      this.deployedWorkflows.set(workflowId, deployment);
      
      this.logger.info(`Workflow ${workflowId} deployed and started successfully`);
      this.logger.info(`View in Temporal UI: ${deployment.executionUrl}`);

      // Start monitoring the workflow
      this.monitorWorkflow(workflowHandle, workflowId);

      return deployment;

    } catch (error) {
      this.logger.error(`Failed to deploy workflow ${workflowId}: ${error}`);
      throw error;
    }
  }

  /**
   * Create actual workflow file from generated code
   */
  private async createWorkflowFile(
    workflowCode: string, 
    workflowName: string, 
    workflowId: string
  ): Promise<string> {
    const workflowsDir = path.join(__dirname, '../generated-workflows');
    
    // Ensure directory exists
    try {
      await fs.access(workflowsDir);
    } catch {
      await fs.mkdir(workflowsDir, { recursive: true });
    }

    // Transform generated code to proper Temporal workflow
    const executableCode = this.transformToExecutableWorkflow(workflowCode, workflowName);
    
    const workflowPath = path.join(workflowsDir, `${workflowId}.ts`);
    await fs.writeFile(workflowPath, executableCode);
    
    this.logger.info(`Created workflow file: ${workflowPath}`);
    return workflowPath;
  }

  /**
   * Transform AI-generated code to executable Temporal workflow
   */
  private transformToExecutableWorkflow(code: string, workflowName: string): string {
    // This is a simplified transformation - in production, you'd need more sophisticated parsing
    const workflowTemplate = `
import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';

const { 
  processPayment,
  checkInventory,
  createShipment,
  sendNotification,
  logEvent 
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  retry: {
    maximumAttempts: 3,
  },
});

${code}

// Export the workflow function
export { ${workflowName} };
`;

    return workflowTemplate;
  }

  /**
   * Start a worker for the specific workflow
   */
  private async startWorkerForWorkflow(workflowPath: string, taskQueue: string): Promise<void> {
    try {
      // Create activities file if it doesn't exist
      await this.createActivitiesFile();

      const worker = await Worker.create({
        connection: this.connection! as any,
        namespace: this.namespace,
        taskQueue,
        workflowsPath: path.dirname(workflowPath),
        activities: {},
      });

      // Start the worker
      await worker.runUntil(async () => {
        this.logger.info(`Worker started for task queue: ${taskQueue}`);
        // Keep worker running for demonstration
        await new Promise(resolve => setTimeout(resolve, 60000)); // Run for 1 minute
      });

    } catch (error) {
      this.logger.error(`Failed to start worker: ${error}`);
      throw error;
    }
  }

  /**
   * Create activities file for workflows
   */
  private async createActivitiesFile(): Promise<void> {
    const activitiesCode = `
/**
 * Activities for generated workflows
 */

export async function processPayment(paymentData: any): Promise<{ success: boolean; transactionId: string }> {
  console.log('Processing payment:', paymentData);
  
  // Simulate payment processing
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return {
    success: true,
    transactionId: \`txn_\${Date.now()}\`
  };
}

export async function checkInventory(items: any[]): Promise<{ available: boolean; reservationId?: string }> {
  console.log('Checking inventory:', items);
  
  // Simulate inventory check
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return {
    available: true,
    reservationId: \`rsv_\${Date.now()}\`
  };
}

export async function createShipment(orderData: any): Promise<{ shipmentId: string; trackingNumber: string }> {
  console.log('Creating shipment:', orderData);
  
  // Simulate shipment creation
  await new Promise(resolve => setTimeout(resolve, 800));
  
  return {
    shipmentId: \`shp_\${Date.now()}\`,
    trackingNumber: \`TRK\${Date.now()}\`
  };
}

export async function sendNotification(notification: any): Promise<{ sent: boolean; messageId: string }> {
  console.log('Sending notification:', notification);
  
  // Simulate notification sending
  await new Promise(resolve => setTimeout(resolve, 300));
  
  return {
    sent: true,
    messageId: \`msg_\${Date.now()}\`
  };
}

export async function logEvent(event: any): Promise<void> {
  console.log('Logging event:', event);
  
  // Simulate event logging
  await new Promise(resolve => setTimeout(resolve, 100));
}

export async function processData(input: string): Promise<string> {
  console.log('Processing data:', input);
  
  // Simulate data processing
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return \`Processed: \${input} at \${new Date().toISOString()}\`;
}

export async function validateInput(input: any): Promise<boolean> {
  console.log('Validating input:', input);
  
  // Simulate validation
  await new Promise(resolve => setTimeout(resolve, 200));
  
  return true;
}
`;

    const activitiesPath = path.join(__dirname, '../generated-workflows/activities.ts');
    await fs.writeFile(activitiesPath, activitiesCode);
    this.logger.info('Created activities file');
  }

  /**
   * Monitor workflow execution
   */
  private async monitorWorkflow(workflowHandle: WorkflowHandle, workflowId: string): Promise<void> {
    try {
      const result = await workflowHandle.result();
      
      const deployment = this.deployedWorkflows.get(workflowId);
      if (deployment) {
        deployment.status = 'completed';
        this.deployedWorkflows.set(workflowId, deployment);
      }
      
      this.logger.info(`Workflow ${workflowId} completed successfully`);
      
    } catch (error) {
      const deployment = this.deployedWorkflows.get(workflowId);
      if (deployment) {
        deployment.status = 'failed';
        this.deployedWorkflows.set(workflowId, deployment);
      }
      
      this.logger.error(`Workflow ${workflowId} failed: ${error}`);
    }
  }

  /**
   * Create workflow chain execution
   */
  async executeWorkflowChain(
    workflows: Array<{
      name: string;
      code: string;
      input: any;
      dependencies?: string[];
    }>
  ): Promise<RealWorkflowDeployment[]> {
    const deployments: RealWorkflowDeployment[] = [];
    
    this.logger.info(`Starting workflow chain execution with ${workflows.length} workflows`);

    for (const workflow of workflows) {
      try {
        // Wait for dependencies to complete
        if (workflow.dependencies) {
          await this.waitForWorkflowCompletion(workflow.dependencies);
        }

        const deployment = await this.deployAndExecuteWorkflow(
          workflow.code,
          workflow.name,
          workflow.input
        );
        
        deployments.push(deployment);
        
        this.logger.info(`Workflow ${workflow.name} started in chain`);
        
      } catch (error) {
        this.logger.error(`Failed to start workflow ${workflow.name} in chain: ${error}`);
        throw error;
      }
    }

    return deployments;
  }

  /**
   * Wait for specific workflows to complete
   */
  private async waitForWorkflowCompletion(workflowIds: string[]): Promise<void> {
    const promises = workflowIds.map(async (workflowId) => {
      const deployment = this.deployedWorkflows.get(workflowId);
      if (deployment && deployment.workflowHandle) {
        await deployment.workflowHandle.result();
      }
    });

    await Promise.all(promises);
  }

  /**
   * Get Temporal UI URL for workflow
   */
  private getWorkflowUIUrl(workflowId: string): string {
    const baseUrl = this.temporalAddress.replace('7233', '8080'); // Temporal UI port
    return `http://${baseUrl}/namespaces/${this.namespace}/workflows/${workflowId}`;
  }

  /**
   * Get all deployed workflows
   */
  getDeployedWorkflows(): RealWorkflowDeployment[] {
    return Array.from(this.deployedWorkflows.values());
  }

  /**
   * Get workflow status
   */
  getWorkflowStatus(workflowId: string): RealWorkflowDeployment | null {
    return this.deployedWorkflows.get(workflowId) || null;
  }

  /**
   * Stop all workers and close connections
   */
  async shutdown(): Promise<void> {
    if (this.worker) {
      this.worker.shutdown();
    }
    
    if (this.client) {
      this.client.connection.close();
    }
    
    this.logger.info('Temporal executor shutdown complete');
  }
}