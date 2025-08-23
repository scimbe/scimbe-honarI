/**
 * HTTP Server for Temporal Worker
 * Provides REST API for workflow deployment and management
 */

import Fastify, { FastifyInstance } from 'fastify';
import { createServiceLogger } from './utils/logger';
import { Worker } from '@temporalio/worker';
import { v4 as uuidv4 } from 'uuid';
import { Client } from 'pg';

const logger = createServiceLogger('temporal-worker-http');

interface DeployWorkflowRequest {
  workflowId: string;
  workflowCode: string;
  supportingFiles: string[];
  language: 'python' | 'typescript';
  environment: string;
  autoStart?: boolean;
}

interface DeployWorkflowResponse {
  success: boolean;
  endpoint: string;
  workflowId: string;
  deploymentId: string;
  message: string;
}

export class TemporalWorkerHttpServer {
  private server: FastifyInstance;
  private worker: Worker | null = null;
  private deployedWorkflows: Map<string, any> = new Map();

  constructor(worker?: Worker) {
    this.worker = worker || null;
    this.server = Fastify({
      logger: {
        level: process.env.LOG_LEVEL || 'info',
      },
    });

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check
    this.server.get('/health', async (request, reply) => {
      return {
        status: 'healthy',
        service: 'temporal-worker-http',
        worker_status: this.worker ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
      };
    });

    // Database connectivity test
    this.server.get('/db-test', async (request, reply) => {
      try {
        const client = new Client({
          host: process.env.POSTGRES_HOST || 'temporal-postgres',
          port: parseInt(process.env.POSTGRES_PORT || '5432'),
          database: process.env.POSTGRES_DB || 'temporal',
          user: process.env.POSTGRES_USER || 'temporal',
          password: process.env.POSTGRES_PASSWORD || 'temporal',
        });

        await client.connect();
        
        // Test basic connectivity
        const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
        
        // Test if our custom tables exist
        const tablesResult = await client.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name IN ('dynamic_workflow_definitions', 'workflow_execution_logs', 'workflow_data_exchange')
          ORDER BY table_name
        `);

        await client.end();

        return {
          status: 'success',
          database_connection: 'ok',
          postgres_version: result.rows[0].pg_version,
          current_time: result.rows[0].current_time,
          custom_tables: tablesResult.rows.map(row => row.table_name),
          message: 'Database connectivity test successful'
        };

      } catch (error) {
        logger.error('Database connectivity test failed', error);
        
        return reply.code(500).send({
          status: 'error',
          database_connection: 'failed',
          error: (error as Error).message,
          message: 'Database connectivity test failed'
        });
      }
    });

    // Deploy workflow endpoint
    this.server.post<{ Body: DeployWorkflowRequest }>('/temporal-worker/deploy', {
      schema: {
        body: {
          type: 'object',
          required: ['workflowId', 'workflowCode', 'language'],
          properties: {
            workflowId: { type: 'string' },
            workflowCode: { type: 'string' },
            supportingFiles: { type: 'array', items: { type: 'string' } },
            language: { type: 'string', enum: ['python', 'typescript'] },
            environment: { type: 'string' },
            autoStart: { type: 'boolean', default: false },
          },
        },
      },
    }, async (request, reply) => {
      try {
        const {
          workflowId,
          workflowCode,
          supportingFiles = [],
          language,
          environment = 'development',
          autoStart = false,
        } = request.body;

        logger.info('Deploying workflow', {
          workflowId,
          language,
          environment,
          autoStart,
          codeLength: workflowCode.length,
          supportingFilesCount: supportingFiles.length,
        });

        // For now, simulate deployment by storing the workflow metadata
        // In a full implementation, this would compile and load the workflow dynamically
        const deploymentId = uuidv4();
        const deploymentTime = new Date().toISOString();

        const deployment = {
          workflowId,
          deploymentId,
          workflowCode,
          supportingFiles,
          language,
          environment,
          deployedAt: deploymentTime,
          status: 'deployed',
          endpoint: `http://temporal-worker:8081/workflows/${workflowId}`,
        };

        // Store deployment metadata
        this.deployedWorkflows.set(workflowId, deployment);

        logger.info('Workflow deployed successfully', {
          workflowId,
          deploymentId,
          endpoint: deployment.endpoint,
        });

        const response: DeployWorkflowResponse = {
          success: true,
          endpoint: deployment.endpoint,
          workflowId,
          deploymentId,
          message: `Workflow ${workflowId} deployed successfully to ${environment} environment`,
        };

        return reply.code(200).send(response);

      } catch (error) {
        logger.error('Failed to deploy workflow', error);

        return reply.code(500).send({
          success: false,
          error: 'Failed to deploy workflow',
          message: (error as Error).message,
        });
      }
    });

    // Get deployed workflows
    this.server.get('/workflows', async (request, reply) => {
      const workflows = Array.from(this.deployedWorkflows.values());
      return {
        workflows,
        count: workflows.length,
      };
    });

    // Get specific workflow
    this.server.get<{ Params: { workflowId: string } }>('/workflows/:workflowId', async (request, reply) => {
      const { workflowId } = request.params;
      const workflow = this.deployedWorkflows.get(workflowId);

      if (!workflow) {
        return reply.code(404).send({
          error: 'Workflow not found',
          workflowId,
        });
      }

      return workflow;
    });

    // Delete deployed workflow
    this.server.delete<{ Params: { workflowId: string } }>('/workflows/:workflowId', async (request, reply) => {
      const { workflowId } = request.params;
      const existed = this.deployedWorkflows.delete(workflowId);

      if (!existed) {
        return reply.code(404).send({
          error: 'Workflow not found',
          workflowId,
        });
      }

      logger.info('Workflow undeployed', { workflowId });

      return {
        success: true,
        message: `Workflow ${workflowId} undeployed successfully`,
      };
    });

    // Workflow execution endpoint (placeholder)
    this.server.post<{ 
      Params: { workflowId: string },
      Body: { input?: any, options?: any }
    }>('/workflows/:workflowId/execute', async (request, reply) => {
      const { workflowId } = request.params;
      const { input = {}, options = {} } = request.body;

      const workflow = this.deployedWorkflows.get(workflowId);
      if (!workflow) {
        return reply.code(404).send({
          error: 'Workflow not found',
          workflowId,
        });
      }

      // In a full implementation, this would start a Temporal workflow execution
      const executionId = uuidv4();
      
      logger.info('Workflow execution started', {
        workflowId,
        executionId,
        input,
      });

      return {
        success: true,
        executionId,
        workflowId,
        status: 'started',
        message: 'Workflow execution started successfully',
      };
    });
  }

  async start(port: number = 8081, host: string = '0.0.0.0'): Promise<void> {
    try {
      await this.server.listen({ port, host });
      logger.info(`Temporal Worker HTTP Server started on ${host}:${port}`);
    } catch (error) {
      logger.error('Failed to start HTTP server', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.server.close();
      logger.info('Temporal Worker HTTP Server stopped');
    } catch (error) {
      logger.error('Failed to stop HTTP server', error);
      throw error;
    }
  }

  getDeployedWorkflows(): Map<string, any> {
    return this.deployedWorkflows;
  }
}