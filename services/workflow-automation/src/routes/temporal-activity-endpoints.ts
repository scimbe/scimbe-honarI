/**
 * Temporal Activity Endpoints
 * Provides database-driven activities for the DynamicWorkflowWrapper
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '../shared-utils-local';
import { Pool } from 'pg';

const logger = createServiceLogger('temporal-activity-endpoints');

// Database connection for activities
const dbPool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'temporal',
  user: process.env.DB_USER || 'temporal',
  password: process.env.DB_PASSWORD || 'temporal',
  ssl: false
});

export async function temporalActivityEndpoints(fastify: FastifyInstance): Promise<void> {
  
  /**
   * Load Workflow Definition from Database
   */
  fastify.post('/api/temporal/loadWorkflowDefinition', {
    schema: {
      body: {
        type: 'object',
        required: ['workflowDefinitionId'],
        properties: {
          workflowDefinitionId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: { workflowDefinitionId: string } }>, reply: FastifyReply) => {
    const { workflowDefinitionId } = request.body;
    
    logger.info('Loading workflow definition from database', { workflowDefinitionId });
    
    try {
      const result = await dbPool.query(
        'SELECT id, name, definition FROM workflow_definitions WHERE id = $1',
        [workflowDefinitionId]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Workflow definition not found: ${workflowDefinitionId}`);
      }
      
      const workflow = result.rows[0];
      
      logger.info('Workflow definition loaded successfully', { 
        workflowId: workflow.id, 
        name: workflow.name 
      });
      
      return reply.send(workflow);
      
    } catch (error) {
      logger.error('Failed to load workflow definition', { workflowDefinitionId, error });
      return reply.status(500).send({
        error: 'Failed to load workflow definition',
        message: (error as Error).message,
        workflowDefinitionId
      });
    }
  });

  /**
   * Execute Activity from Database
   */
  fastify.post('/api/temporal/executeActivity', {
    schema: {
      body: {
        type: 'object',
        required: ['activityId', 'input'],
        properties: {
          activityId: { type: 'string' },
          input: { type: 'object' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: { activityId: string; input: any } }>, reply: FastifyReply) => {
    const { activityId, input } = request.body;
    
    logger.info('Executing activity from database', { activityId, input });
    
    try {
      // Load activity from database
      const activityResult = await dbPool.query(
        'SELECT id, name, code, inputs, outputs FROM activity_library WHERE id = $1',
        [activityId]
      );
      
      if (activityResult.rows.length === 0) {
        throw new Error(`Activity not found: ${activityId}`);
      }
      
      const activity = activityResult.rows[0];
      logger.info('Activity loaded from database', { 
        activityId: activity.id, 
        name: activity.name 
      });
      
      // Execute the activity code dynamically
      let result;
      if (activity.code.includes('async function execute')) {
        // Handle async function format
        const executeFunction = new Function(
          'input', 
          `${activity.code}; return execute(input);`
        );
        result = await executeFunction(input);
      } else {
        // Handle direct code execution
        const executeFunction = new Function('input', `return (${activity.code})(input);`);
        result = await executeFunction(input);
      }
      
      logger.info('Activity executed successfully', { 
        activityId, 
        result 
      });
      
      return reply.send(result);
      
    } catch (error) {
      logger.error('Activity execution failed', { activityId, input, error });
      return reply.status(500).send({
        error: 'Activity execution failed',
        message: (error as Error).message,
        activityId
      });
    }
  });

  /**
   * Log Execution to Database
   */
  fastify.post('/api/temporal/logExecution', {
    schema: {
      body: {
        type: 'object',
        required: ['workflowId', 'stepId', 'status', 'result', 'timestamp'],
        properties: {
          workflowId: { type: 'string' },
          stepId: { type: 'string' },
          status: { type: 'string' },
          result: { type: 'object' },
          timestamp: { type: 'number' }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Body: { 
      workflowId: string; 
      stepId: string; 
      status: string; 
      result: any; 
      timestamp: number 
    } 
  }>, reply: FastifyReply) => {
    const { workflowId, stepId, status, result, timestamp } = request.body;
    
    logger.info('Logging workflow execution', { workflowId, stepId, status });
    
    try {
      // For now, just log to console - could be extended to store in database
      logger.info('Workflow step logged', {
        workflowId,
        stepId,
        status,
        result,
        timestamp: new Date(timestamp).toISOString()
      });
      
      return reply.send({ success: true });
      
    } catch (error) {
      logger.warn('Failed to log execution', { workflowId, stepId, error });
      return reply.send({ success: false });
    }
  });

  /**
   * Health check for temporal activities
   */
  fastify.get('/api/temporal/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check database connection
      await dbPool.query('SELECT 1');
      
      return reply.send({
        status: 'healthy',
        database: 'connected',
        timestamp: Date.now()
      });
    } catch (error) {
      return reply.status(503).send({
        status: 'unhealthy',
        database: 'disconnected',
        error: (error as Error).message,
        timestamp: Date.now()
      });
    }
  });
}