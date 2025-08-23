/**
 * Workflow Routes for Workflow Automation Service
 * Handles workflow templates, listing, and configuration
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('workflow-routes');

// Request/Response types
interface WorkflowListQuery {
  category?: string;
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}

interface ConfigurationUpdateRequest {
  maxConcurrentExecutions?: number;
  defaultQualityThreshold?: number;
  enableIterativeMode?: boolean;
  defaultComplexity?: string;
  timeoutSettings?: {
    executionTimeout?: number;
    stepTimeout?: number;
  };
  qualitySettings?: {
    enableQualityChecks?: boolean;
    defaultCriteria?: string[];
  };
}

export async function workflowRoutes(fastify: FastifyInstance): Promise<void> {
  
  // List available workflow templates
  fastify.get<{ Querystring: WorkflowListQuery }>('/api/workflows', {
    schema: {


      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string' },

          search: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'number', minimum: 0, default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            workflows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },

                  category: { type: 'string' },

                  complexity: { type: 'string' },
                  estimatedDuration: { type: 'number' },
                  steps: { type: 'number' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                  usageCount: { type: 'number' },
                  averageQualityScore: { type: 'number' }
                }
              }
            },
            total: { type: 'number' },
            limit: { type: 'number' },
            offset: { type: 'number' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: WorkflowListQuery }>, reply: FastifyReply) => {
    const startTime = Date.now();
    const { category, tags, search, limit = 20, offset = 0 } = request.query;

    try {
      let query = `
        SELECT 
          w.*,
          COUNT(we.execution_id) as usage_count,
          AVG(we.quality_score) as average_quality_score
        FROM workflows w
        LEFT JOIN workflow_executions we ON w.workflow_id = we.workflow_id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      // Add filters
      if (category) {
        query += ` AND w.category = $${paramIndex++}`;
        params.push(category);
      }

      if (tags && tags.length > 0) {
        query += ` AND w.tags && $${paramIndex++}::text[]`;
        params.push(tags);
      }

      if (search) {
        query += ` AND (
          w.name ILIKE $${paramIndex++} OR 
          w.description ILIKE $${paramIndex++} OR
          array_to_string(w.tags, ' ') ILIKE $${paramIndex++}
        )`;
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }

      // Group by workflow fields
      query += ` 
        GROUP BY w.workflow_id, w.name, w.description, w.category, w.tags, 
                 w.complexity, w.estimated_duration, w.steps, w.created_at, w.updated_at
        ORDER BY w.created_at DESC
      `;

      // Get total count
      const countQuery = `
        SELECT COUNT(DISTINCT w.workflow_id) as total
        FROM workflows w
        WHERE 1=1
        ${category ? 'AND w.category = $1' : ''}
        ${tags && tags.length > 0 ? `AND w.tags && $${category ? 2 : 1}::text[]` : ''}
        ${search ? `AND (w.name ILIKE $${paramIndex - 2} OR w.description ILIKE $${paramIndex - 1})` : ''}
      `;
      
      const countParams = [];
      if (category) countParams.push(category);
      if (tags && tags.length > 0) countParams.push(tags);
      if (search) {
        countParams.push(`%${search}%`, `%${search}%`);
      }

      const { rows: countRows } = await fastify.database.query(countQuery, countParams);
      const total = parseInt(countRows[0]?.total || '0', 10);

      // Add pagination
      query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const { rows } = await fastify.database.query(query, params);

      const workflows = rows.map(row => ({
        id: row.workflow_id,
        name: row.name,

        category: row.category,

        complexity: row.complexity,
        estimatedDuration: row.estimated_duration,
        steps: row.steps,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        usageCount: parseInt(row.usage_count || '0', 10),
        averageQualityScore: parseFloat(row.average_quality_score || '0'),
      }));

      const duration = Date.now() - startTime;
      logger.getLogger().info({
        resultCount: workflows.length,
        total,
        filters: { category, tags, search },
        duration,
      }, 'Workflow templates listed');

      return reply.send({
        workflows,
        total,
        limit,
        offset,
      });

    } catch (error) {
      logger.error(error as Error, {
        query: request.query,
      }, 'Failed to list workflow templates');

      return reply.status(500).send({
        error: 'Failed to list workflow templates',
        message: (error as Error).message,
      });
    }
  });

  // Get current system configuration
  fastify.get('/api/config', {
    schema: {


      response: {
        200: {
          type: 'object',
          properties: {
            maxConcurrentExecutions: { type: 'number' },
            defaultQualityThreshold: { type: 'number' },
            enableIterativeMode: { type: 'boolean' },
            defaultComplexity: { type: 'string' },
            timeoutSettings: {
              type: 'object',
              properties: {
                executionTimeout: { type: 'number' },
                stepTimeout: { type: 'number' }
              }
            },
            qualitySettings: {
              type: 'object',
              properties: {
                enableQualityChecks: { type: 'boolean' },
                defaultCriteria: { type: 'array', items: { type: 'string' } }
              }
            },
            systemStats: {
              type: 'object',
              properties: {
                totalExecutions: { type: 'number' },
                activeExecutions: { type: 'number' },
                avgExecutionTime: { type: 'number' },
                successRate: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get system statistics
      const { rows: statsRows } = await fastify.database.query(`
        SELECT 
          COUNT(*) as total_executions,
          COUNT(*) FILTER (WHERE status = 'running') as active_executions,
          AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_execution_time,
          (COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / NULLIF(COUNT(*), 0)) as success_rate
        FROM workflow_executions
        WHERE started_at >= NOW() - INTERVAL '30 days'
      `);

      const stats = statsRows[0];

      const configuration = {
        maxConcurrentExecutions: parseInt(process.env.MAX_CONCURRENT_EXECUTIONS || '10'),
        defaultQualityThreshold: parseFloat(process.env.DEFAULT_QUALITY_THRESHOLD || '0.8'),
        enableIterativeMode: process.env.ENABLE_ITERATIVE_MODE === 'true',
        defaultComplexity: process.env.DEFAULT_COMPLEXITY || 'moderate',
        timeoutSettings: {
          executionTimeout: parseInt(process.env.EXECUTION_TIMEOUT || '300000'), // 5 minutes
          stepTimeout: parseInt(process.env.STEP_TIMEOUT || '60000'), // 1 minute
        },
        qualitySettings: {
          enableQualityChecks: process.env.ENABLE_QUALITY_CHECKS !== 'false',
          defaultCriteria: (process.env.DEFAULT_QUALITY_CRITERIA || 'accuracy,completeness,relevance').split(','),
        },
        systemStats: {
          totalExecutions: parseInt(stats.total_executions || '0'),
          activeExecutions: parseInt(stats.active_executions || '0'),
          avgExecutionTime: parseFloat(stats.avg_execution_time || '0'),
          successRate: parseFloat(stats.success_rate || '0'),
        },
      };

      logger.getLogger().info({
        activeExecutions: configuration.systemStats.activeExecutions,
        successRate: configuration.systemStats.successRate,
      }, 'Configuration retrieved');

      return reply.send(configuration);

    } catch (error) {
      logger.error(error as Error, {}, 'Failed to get configuration');

      return reply.status(500).send({
        error: 'Failed to get configuration',
        message: (error as Error).message,
      });
    }
  });

  // Update system configuration
  fastify.post<{ Body: ConfigurationUpdateRequest }>('/api/config', {
    schema: {


      body: {
        type: 'object',
        properties: {
          maxConcurrentExecutions: { type: 'number', minimum: 1, maximum: 100 },
          defaultQualityThreshold: { type: 'number', minimum: 0, maximum: 1 },
          enableIterativeMode: { type: 'boolean' },
          defaultComplexity: { type: 'string', enum: ['simple', 'moderate', 'complex', 'expert'] },
          timeoutSettings: {
            type: 'object',
            properties: {
              executionTimeout: { type: 'number', minimum: 10000, maximum: 3600000 },
              stepTimeout: { type: 'number', minimum: 5000, maximum: 300000 }
            }
          },
          qualitySettings: {
            type: 'object',
            properties: {
              enableQualityChecks: { type: 'boolean' },
              defaultCriteria: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            updatedFields: { type: 'array', items: { type: 'string' } },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: ConfigurationUpdateRequest }>, reply: FastifyReply) => {
    const updates = request.body;
    const updatedFields: string[] = [];

    try {
      // Log the configuration update
      logger.getLogger().info({
        userId: request.headers['x-user-id'] || 'anonymous',
        updates: Object.keys(updates),
      }, 'Configuration update requested');

      // Store configuration updates in database
      const configData = {
        updated_at: new Date(),
        updated_by: request.headers['x-user-id'] as string || 'anonymous',
        changes: updates,
      };

      await fastify.database.query(`
        INSERT INTO system_configurations (config_type, config_data, updated_at, updated_by)
        VALUES ($1, $2, $3, $4)
      `, ['workflow-automation', JSON.stringify(configData), configData.updated_at, configData.updated_by]);

      // Validate and track field updates
      if (updates.maxConcurrentExecutions !== undefined) {
        updatedFields.push('maxConcurrentExecutions');
      }
      if (updates.defaultQualityThreshold !== undefined) {
        updatedFields.push('defaultQualityThreshold');
      }
      if (updates.enableIterativeMode !== undefined) {
        updatedFields.push('enableIterativeMode');
      }
      if (updates.defaultComplexity !== undefined) {
        updatedFields.push('defaultComplexity');
      }
      if (updates.timeoutSettings !== undefined) {
        updatedFields.push('timeoutSettings');
      }
      if (updates.qualitySettings !== undefined) {
        updatedFields.push('qualitySettings');
      }

      logger.getLogger().info({
        updatedFields,
        userId: request.headers['x-user-id'] || 'anonymous',
      }, 'Configuration updated successfully');

      return reply.send({
        success: true,
        updatedFields,
        message: `Configuration updated successfully. ${updatedFields.length} fields modified.`,
      });

    } catch (error) {
      logger.error(error as Error, {
        updates: Object.keys(updates),
      }, 'Failed to update configuration');

      return reply.status(500).send({
        success: false,
        error: 'Failed to update configuration',
        message: (error as Error).message,
      });
    }
  });

  // Delete a workflow
  fastify.delete<{ Params: { workflowId: string } }>('/api/workflows/:workflowId', {
    schema: {

      params: {
        type: 'object',
        required: ['workflowId'],
        properties: {
          workflowId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            workflowId: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { workflowId: string } }>, reply: FastifyReply) => {
    const { workflowId } = request.params;
    const startTime = Date.now();

    try {
      logger.getLogger().info('Deleting workflow', { workflowId });

      // Check if workflow exists
      const { rows: workflowRows } = await fastify.database.query(
        'SELECT workflow_id, name FROM automation_workflows WHERE workflow_id = $1',
        [workflowId]
      );

      if (workflowRows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'WORKFLOW_NOT_FOUND',
          message: `Workflow ${workflowId} not found`
        });
      }

      const workflowName = workflowRows[0].name;

      // Delete related data in order (foreign key constraints)
      await fastify.database.query('DELETE FROM editor_component_usage WHERE workflow_id = $1', [workflowId]);
      await fastify.database.query('DELETE FROM workflow_editor_components WHERE schema_id IN (SELECT schema_id FROM editor_configuration_schemas WHERE workflow_id = $1)', [workflowId]);
      await fastify.database.query('DELETE FROM editor_configuration_schemas WHERE workflow_id = $1', [workflowId]);
      await fastify.database.query('DELETE FROM automation_metrics WHERE workflow_id = $1', [workflowId]);
      await fastify.database.query('DELETE FROM automation_jobs WHERE execution_id IN (SELECT execution_id FROM automation_executions WHERE workflow_id = $1)', [workflowId]);
      await fastify.database.query('DELETE FROM quality_assessments WHERE execution_id IN (SELECT execution_id FROM automation_executions WHERE workflow_id = $1)', [workflowId]);
      await fastify.database.query('DELETE FROM automation_step_executions WHERE execution_id IN (SELECT execution_id FROM automation_executions WHERE workflow_id = $1)', [workflowId]);
      await fastify.database.query('DELETE FROM automation_executions WHERE workflow_id = $1', [workflowId]);
      await fastify.database.query('DELETE FROM workflow_schedules WHERE workflow_id = $1', [workflowId]);
      await fastify.database.query('DELETE FROM generated_workflows WHERE workflow_id = $1', [workflowId]);
      
      // Finally delete the workflow itself
      const { rowCount } = await fastify.database.query('DELETE FROM automation_workflows WHERE workflow_id = $1', [workflowId]);

      if (rowCount === 0) {
        return reply.status(404).send({
          success: false,
          error: 'WORKFLOW_NOT_FOUND',
          message: `Workflow ${workflowId} not found`
        });
      }

      const duration = Date.now() - startTime;

      logger.getLogger().info('Workflow deleted successfully', {
        workflowId,
        workflowName,
        duration
      });

      return reply.send({
        success: true,
        message: `Workflow "${workflowName}" deleted successfully`,
        workflowId: workflowId
      });

    } catch (error) {
      logger.error(error as Error, {
        workflowId
      }, 'Failed to delete workflow');

      return reply.status(500).send({
        success: false,
        error: 'DELETE_WORKFLOW_FAILED',
        message: (error as Error).message
      });
    }
  });

  // Get generated workflows for editors (both Activity Editor and Enhanced Workflow Editor)
  fastify.get('/api/workflows/generated', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'number', minimum: 0, default: 0 },
          language: { type: 'string' },
          search: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            workflows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  requirements: { type: 'string' },
                  targetLanguage: { type: 'string' },
                  workflowClass: { type: 'string' },
                  category: { type: 'string' },
                  createdAt: { type: 'string' },
                  qualityScore: { type: 'number' },
                  deploymentStatus: { type: 'string' }
                }
              }
            },
            total: { type: 'number' },
            activities: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  category: { type: 'string' },
                  inputs: { type: 'array', items: { type: 'string' } },
                  outputs: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Querystring: { 
      limit?: number; 
      offset?: number; 
      language?: string; 
      search?: string; 
    } 
  }>, reply: FastifyReply) => {
    const { limit = 20, offset = 0, language, search } = request.query;

    try {
      // Build query for generated workflows
      let query = `
        SELECT 
          workflow_id as id,
          temporal_workflow_class as name,
          requirements as description,
          requirements,
          target_language as "targetLanguage",
          temporal_workflow_class as "workflowClass",
          'AI Generated' as category,
          created_at as "createdAt",
          quality_score as "qualityScore",
          deployment_status as "deploymentStatus"
        FROM generated_workflows
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (language) {
        query += ` AND target_language = $${paramIndex}`;
        params.push(language);
        paramIndex++;
      }

      if (search) {
        query += ` AND (requirements ILIKE $${paramIndex} OR temporal_workflow_class ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const { rows: workflows } = await fastify.database.query(query, params);

      // Get total count
      let countQuery = `SELECT COUNT(*) as total FROM generated_workflows WHERE 1=1`;
      const countParams: any[] = [];
      let countParamIndex = 1;

      if (language) {
        countQuery += ` AND target_language = $${countParamIndex}`;
        countParams.push(language);
        countParamIndex++;
      }

      if (search) {
        countQuery += ` AND (requirements ILIKE $${countParamIndex} OR temporal_workflow_class ILIKE $${countParamIndex})`;
        countParams.push(`%${search}%`);
      }

      const { rows: countRows } = await fastify.database.query(countQuery, countParams);
      const total = parseInt(countRows[0].total);

      // Get available activities from activity library
      const activitiesQuery = `
        SELECT 
          name,
          description,
          category,
          inputs,
          outputs
        FROM activity_library
        ORDER BY category, name
        LIMIT 50
      `;

      let activities: any[] = [];
      try {
        const { rows: activityRows } = await fastify.database.query(activitiesQuery);
        activities = activityRows;
      } catch (activityError) {
        // If activity_library table doesn't exist, provide default activities
        activities = [
          { name: 'SendEmail', description: 'Send email notification', category: 'Communication', inputs: ['to', 'subject', 'body'], outputs: ['messageId'] },
          { name: 'ProcessPayment', description: 'Process payment transaction', category: 'Finance', inputs: ['amount', 'paymentMethod'], outputs: ['transactionId', 'status'] },
          { name: 'ValidateData', description: 'Validate input data', category: 'Data', inputs: ['data', 'schema'], outputs: ['isValid', 'errors'] },
          { name: 'CallWebservice', description: 'Call external web service', category: 'Integration', inputs: ['url', 'method', 'headers'], outputs: ['response', 'statusCode'] },
          { name: 'TransformData', description: 'Transform data format', category: 'Data', inputs: ['inputData', 'transformation'], outputs: ['outputData'] },
          { name: 'GenerateReport', description: 'Generate PDF report', category: 'Reports', inputs: ['template', 'data'], outputs: ['reportUrl'] },
          { name: 'SaveToDatabase', description: 'Save data to database', category: 'Database', inputs: ['table', 'data'], outputs: ['recordId'] },
          { name: 'FetchFromAPI', description: 'Fetch data from API', category: 'Integration', inputs: ['endpoint', 'params'], outputs: ['data'] }
        ];
      }

      logger.getLogger().info({
        workflowCount: workflows.length,
        activityCount: activities.length,
        total,
        limit,
        offset
      }, 'Retrieved generated workflows and activities for editors');

      return reply.send({
        success: true,
        workflows,
        total,
        activities
      });

    } catch (error) {
      logger.error(error as Error, 'Failed to retrieve generated workflows for editors');

      return reply.status(500).send({
        success: false,
        error: 'FAILED_TO_RETRIEVE_WORKFLOWS',
        message: (error as Error).message,
        workflows: [],
        total: 0,
        activities: []
      });
    }
  });
}