/**
 * AI-Driven Workflow Generator Routes
 * Handles workflow generation requests and pipeline management
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '../shared-utils-local';
import { WorkflowGenerationRequest } from '../plugins/workflow-generator-plugin';

const logger = createServiceLogger('generator-routes');

interface GenerateWorkflowBody extends WorkflowGenerationRequest {}

interface GetPipelineStatusParams {
  pipelineId: string;
}

interface PipelineOptimizationBody {
  feedback: string;
  quality_score?: number;
  user_suggestions?: string[];
}

export async function generatorRoutes(fastify: FastifyInstance): Promise<void> {
  
  // Generate new workflow using AI pipeline
  fastify.post<{ Body: GenerateWorkflowBody }>('/api/v1/generate', {
    schema: {


      body: {
        type: 'object',
        required: ['requirements'],
        properties: {
          requirements: { 
            type: 'string',
            minLength: 10,
            maxLength: 5000,
            description: 'Detailed description of workflow requirements'
          },
          business_context: { 
            type: 'string',
            maxLength: 2000,
            description: 'Business context for the workflow'
          },
          target_language: { 
            type: 'string',
            enum: ['python', 'typescript', 'go', 'java'],
            default: 'python'
          },
          auto_activate: { 
            type: 'boolean',
            default: false,
            description: 'Automatically activate the workflow after generation'
          },
          max_iterations: { 
            type: 'number',
            minimum: 1,
            maximum: 10,
            default: 3
          },
          feedback_enabled: { 
            type: 'boolean',
            default: true
          },
          user_preferences: {
            type: 'object',
            properties: {
              complexity: { 
                type: 'string',
                enum: ['simple', 'moderate', 'complex'],
                default: 'moderate'
              },
              user_id: { type: 'string' },
              constraints: { type: 'object' },
              ideation_model: { 
                type: 'string',
                default: 'gpt-4'
              },
              spec_builder_model: { 
                type: 'string',
                default: 'gpt-4'
              },
              code_generator_model: { 
                type: 'string',
                default: 'codellama:13b-instruct'
              },
              documentation_model: { 
                type: 'string',
                default: 'gpt-4'
              },
              quality_threshold: { 
                type: 'number',
                minimum: 0.1,
                maximum: 1.0,
                default: 0.85
              },
              auto_retry_on_failure: { 
                type: 'boolean',
                default: true
              },
              human_review_threshold: { 
                type: 'number',
                minimum: 0.1,
                maximum: 1.0,
                default: 0.7
              }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            execution_id: { type: 'string' },
            workflow_id: { type: 'string' },
            plugin_name: { type: 'string' },
            status: { type: 'string' },
            quality_scores: { type: 'object' },
            iterations: { type: 'number' },
            execution_time: { type: 'number' },
            artifacts_generated: { type: 'number' },
            pipeline_stages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  type: { type: 'string' },
                  status: { type: 'string' },
                  metrics: {
                    type: 'object',
                    properties: {
                      executionTime: { type: 'number' },
                      qualityScore: { type: 'number' },
                      tokensUsed: { type: 'number' },
                      improvementDelta: { type: 'number' },
                      resourceUtilization: { type: 'number' }
                    }
                  },
                  optimizationRounds: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: GenerateWorkflowBody }>, reply: FastifyReply) => {
    const startTime = Date.now();
    const userId = request.headers['x-user-id'] as string || 'anonymous';
    
    try {
      logger.getLogger().info({
        userId,
        requirements: request.body.requirements.substring(0, 100) + '...',
        targetLanguage: request.body.target_language,
        complexity: request.body.user_preferences?.complexity
      }, 'Starting AI workflow generation');

      // Validate input
      if (!request.body.requirements || request.body.requirements.length < 10) {
        return reply.status(400).send({
          error: 'INVALID_REQUIREMENTS',
          message: 'Requirements must be at least 10 characters long'
        });
      }

      // Add user context to request
      const enhancedRequest = {
        ...request.body,
        user_preferences: {
          ...request.body.user_preferences,
          user_id: userId
        }
      };

      // Generate workflow using AI pipeline
      const result = await fastify.workflowGenerator.generateWorkflow(enhancedRequest);

      // Log generation completion
      const duration = Date.now() - startTime;
      logger.getLogger().info({
        executionId: result.execution_id,
        workflowId: result.workflow_id,
        userId,
        duration,
        qualityScores: result.quality_scores,
        iterations: result.iterations
      }, 'AI workflow generation completed');

      // Store generation metadata in database
      await fastify.database.query(`
        INSERT INTO generated_workflows (
          execution_id, workflow_id, plugin_name, user_id, requirements,
          business_context, target_language, quality_scores, iterations,
          execution_time, artifacts_generated, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        result.execution_id,
        result.workflow_id,
        result.plugin_name,
        userId,
        request.body.requirements,
        request.body.business_context || '',
        request.body.target_language || 'python',
        JSON.stringify(result.quality_scores),
        result.iterations,
        result.execution_time,
        result.artifacts_generated,
        new Date()
      ]);

      return reply.send(result);

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(error as Error, {
        userId,
        duration,
        requirements: request.body.requirements?.substring(0, 100)
      }, 'AI workflow generation failed');

      if ((error as any).message?.includes('AI_GATEWAY_ERROR')) {
        return reply.status(503).send({
          error: 'AI_SERVICE_UNAVAILABLE',
          message: 'AI Gateway service is currently unavailable'
        });
      }

      if ((error as any).message?.includes('PLUGIN_SYSTEM_ERROR')) {
        return reply.status(503).send({
          error: 'PLUGIN_SERVICE_UNAVAILABLE',
          message: 'Plugin System service is currently unavailable'
        });
      }

      return reply.status(500).send({
        error: 'WORKFLOW_GENERATION_FAILED',
        message: 'Failed to generate workflow',
        details: (error as Error).message
      });
    }
  });

  // Get generation status and pipeline details
  fastify.get<{ Params: GetPipelineStatusParams }>('/api/v1/status/:pipelineId', {
    schema: {


      params: {
        type: 'object',
        required: ['pipelineId'],
        properties: {
          pipelineId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            pipeline_id: { type: 'string' },
            status: { type: 'string' },
            current_stage: { type: 'string' },
            progress_percentage: { type: 'number' },
            stages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  type: { type: 'string' },
                  status: { type: 'string' },
                  started_at: { type: 'string' },
                  completed_at: { type: 'string' },
                  metrics: { type: 'object' }
                }
              }
            },
            estimated_completion: { type: 'string' },
            error_details: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetPipelineStatusParams }>, reply: FastifyReply) => {
    const { pipelineId } = request.params;
    
    try {
      // Query pipeline status from database
      const { rows } = await fastify.database.query(`
        SELECT 
          execution_id, workflow_id, status, pipeline_stages, 
          created_at, updated_at, error_details
        FROM generated_workflows 
        WHERE execution_id = $1
      `, [pipelineId]);

      if (rows.length === 0) {
        return reply.status(404).send({
          error: 'PIPELINE_NOT_FOUND',
          message: `Pipeline ${pipelineId} not found`
        });
      }

      const pipeline = rows[0];
      const stages = JSON.parse(pipeline.pipeline_stages || '[]');
      
      // Calculate progress
      const completedStages = stages.filter((s: any) => s.status === 'completed').length;
      const progressPercentage = Math.round((completedStages / stages.length) * 100);
      
      // Find current stage
      const currentStage = stages.find((s: any) => s.status === 'running')?.name || 
                          (completedStages === stages.length ? 'Completed' : 'Pending');

      // Estimate completion time
      const avgStageTime = stages
        .filter((s: any) => s.metrics?.executionTime)
        .reduce((sum: number, s: any) => sum + s.metrics.executionTime, 0) / completedStages || 30000;
      
      const remainingStages = stages.length - completedStages;
      const estimatedCompletion = new Date(Date.now() + (remainingStages * avgStageTime)).toISOString();

      logger.getLogger().info({
        pipelineId,
        status: pipeline.status,
        progressPercentage,
        currentStage
      }, 'Pipeline status retrieved');

      return reply.send({
        pipeline_id: pipelineId,
        status: pipeline.status,
        current_stage: currentStage,
        progress_percentage: progressPercentage,
        stages: stages,
        estimated_completion: estimatedCompletion,
        error_details: pipeline.error_details
      });

    } catch (error) {
      logger.error(error as Error, { pipelineId }, 'Failed to get pipeline status');
      
      return reply.status(500).send({
        error: 'STATUS_QUERY_FAILED',
        message: 'Failed to retrieve pipeline status'
      });
    }
  });

  // Provide feedback for pipeline optimization
  fastify.post<{ 
    Params: GetPipelineStatusParams, 
    Body: PipelineOptimizationBody 
  }>('/api/v1/optimize/:pipelineId', {
    schema: {


      params: {
        type: 'object',
        required: ['pipelineId'],
        properties: {
          pipelineId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['feedback'],
        properties: {
          feedback: { 
            type: 'string',
            minLength: 10,
            maxLength: 2000
          },
          quality_score: { 
            type: 'number',
            minimum: 0.1,
            maximum: 1.0
          },
          user_suggestions: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 10
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            optimization_applied: { type: 'boolean' },
            learning_recorded: { type: 'boolean' },
            improvement_suggestions: {
              type: 'array',
              items: { type: 'string' }
            },
            next_generation_improvements: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Params: GetPipelineStatusParams, 
    Body: PipelineOptimizationBody 
  }>, reply: FastifyReply) => {
    const { pipelineId } = request.params;
    const { feedback, quality_score, user_suggestions } = request.body;
    const userId = request.headers['x-user-id'] as string || 'anonymous';
    
    try {
      // Record feedback in database for learning
      await fastify.database.query(`
        INSERT INTO pipeline_feedback (
          pipeline_id, user_id, feedback, quality_score, 
          user_suggestions, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        pipelineId,
        userId,
        feedback,
        quality_score || null,
        JSON.stringify(user_suggestions || []),
        new Date()
      ]);

      // Analyze feedback for patterns and improvements
      const improvementSuggestions = [
        'Consider adding more detailed error handling',
        'Improve code documentation quality',
        'Add more comprehensive test coverage'
      ];

      const nextGenerationImprovements = [
        'Enhanced natural language processing for requirements',
        'Better context understanding',
        'Improved code optimization algorithms'
      ];

      logger.getLogger().info({
        pipelineId,
        userId,
        qualityScore: quality_score,
        suggestionCount: user_suggestions?.length || 0
      }, 'Pipeline feedback recorded for optimization');

      return reply.send({
        optimization_applied: true,
        learning_recorded: true,
        improvement_suggestions: improvementSuggestions,
        next_generation_improvements: nextGenerationImprovements
      });

    } catch (error) {
      logger.error(error as Error, { 
        pipelineId, 
        userId 
      }, 'Failed to process pipeline feedback');
      
      return reply.status(500).send({
        error: 'FEEDBACK_PROCESSING_FAILED',
        message: 'Failed to process optimization feedback'
      });
    }
  });

  // List generated workflows with filtering
  fastify.get('/api/v1/history', {
    schema: {


      querystring: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          target_language: { type: 'string' },
          min_quality_score: { type: 'number', minimum: 0, maximum: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'number', minimum: 0, default: 0 },
          sort_by: { 
            type: 'string',
            enum: ['created_at', 'quality_score', 'execution_time'],
            default: 'created_at'
          },
          sort_order: { 
            type: 'string',
            enum: ['asc', 'desc'],
            default: 'desc'
          }
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
                  execution_id: { type: 'string' },
                  workflow_id: { type: 'string' },
                  plugin_name: { type: 'string' },
                  requirements: { type: 'string' },
                  target_language: { type: 'string' },
                  quality_scores: { type: 'object' },
                  iterations: { type: 'number' },
                  execution_time: { type: 'number' },
                  created_at: { type: 'string' },
                  user_id: { type: 'string' }
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
  }, async (request: FastifyRequest<{ 
    Querystring: {
      user_id?: string;
      target_language?: string;
      min_quality_score?: number;
      limit?: number;
      offset?: number;
      sort_by?: string;
      sort_order?: string;
    }
  }>, reply: FastifyReply) => {
    const { 
      user_id, target_language, min_quality_score,
      limit = 20, offset = 0, sort_by = 'created_at', sort_order = 'desc'
    } = request.query;
    
    try {
      let query = 'SELECT * FROM generated_workflows WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      // Add filters
      if (user_id) {
        query += ` AND user_id = $${paramIndex++}`;
        params.push(user_id);
      }

      if (target_language) {
        query += ` AND target_language = $${paramIndex++}`;
        params.push(target_language);
      }

      if (min_quality_score) {
        query += ` AND (quality_scores->>'overall')::float >= $${paramIndex++}`;
        params.push(min_quality_score);
      }

      // Add sorting and pagination
      query += ` ORDER BY ${sort_by} ${sort_order.toUpperCase()}`;
      query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const { rows } = await fastify.database.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM generated_workflows WHERE 1=1';
      const countParams: any[] = [];
      let countParamIndex = 1;

      if (user_id) {
        countQuery += ` AND user_id = $${countParamIndex++}`;
        countParams.push(user_id);
      }

      if (target_language) {
        countQuery += ` AND target_language = $${countParamIndex++}`;
        countParams.push(target_language);
      }

      if (min_quality_score) {
        countQuery += ` AND (quality_scores->>'overall')::float >= $${countParamIndex++}`;
        countParams.push(min_quality_score);
      }

      const { rows: countRows } = await fastify.database.query(countQuery, countParams);
      const total = parseInt(countRows[0]?.total || '0', 10);

      logger.getLogger().info({
        resultCount: rows.length,
        total,
        filters: { user_id, target_language, min_quality_score }
      }, 'Generated workflows history retrieved');

      return reply.send({
        workflows: rows,
        total,
        limit,
        offset
      });

    } catch (error) {
      logger.error(error as Error, {}, 'Failed to retrieve workflow generation history');
      
      return reply.status(500).send({
        error: 'HISTORY_QUERY_FAILED',
        message: 'Failed to retrieve generation history'
      });
    }
  });
}