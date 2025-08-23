/**
 * Quality Routes for Workflow Automation Service
 * Handles quality assessment, criteria management, and quality reporting
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('quality-routes');

// Request/Response types
interface QualityAssessmentRequest {
  executionId: string;
  results: any;
  criteria?: {
    name: string;
    type: 'accuracy' | 'completeness' | 'relevance' | 'consistency' | 'format' | 'custom';
    description: string;
    threshold: number;
    weight: number;
  }[];
}

interface QualityHistoryQuery {
  executionId?: string;
  workflowId?: string;
  assessmentType?: string;
  minScore?: number;
  maxScore?: number;
  limit?: number;
  offset?: number;
  dateFrom?: string;
  dateTo?: string;
}

interface QualityCriteriaRequest {
  name: string;
  type: 'accuracy' | 'completeness' | 'relevance' | 'consistency' | 'format' | 'custom';
  description: string;
  threshold: number;
  weight: number;
  isDefault?: boolean;
  metadata?: Record<string, any>;
}

export async function qualityRoutes(fastify: FastifyInstance): Promise<void> {
  
  // Perform quality assessment
  fastify.post<{ Body: QualityAssessmentRequest }>('/api/quality/assess', {
    schema: {


      body: {
        type: 'object',
        required: ['executionId', 'results'],
        properties: {
          executionId: { type: 'string', format: 'uuid' },
          results: { type: 'object' },
          criteria: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'type', 'description', 'threshold', 'weight'],
              properties: {
                name: { type: 'string' },
                type: { type: 'string', enum: ['accuracy', 'completeness', 'relevance', 'consistency', 'format', 'custom'] },

                threshold: { type: 'number', minimum: 0, maximum: 1 },
                weight: { type: 'number', minimum: 0, maximum: 1 }
              }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            assessmentId: { type: 'string' },
            overallScore: { type: 'number' },
            passed: { type: 'boolean' },
            criteriaResults: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string' },
                  score: { type: 'number' },
                  weight: { type: 'number' },
                  passed: { type: 'boolean' },
                  details: { type: 'object' },
                  feedback: { type: 'string' }
                }
              }
            },
            feedback: { type: 'string' },
            suggestions: { type: 'array', items: { type: 'string' } },
            assessedAt: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: QualityAssessmentRequest }>, reply: FastifyReply) => {
    const startTime = Date.now();
    const { executionId, results, criteria } = request.body;

    try {
      // Get execution context
      const { rows: executionRows } = await fastify.database.query(`
        SELECT * FROM workflow_executions WHERE execution_id = $1
      `, [executionId]);

      if (executionRows.length === 0) {
        return reply.status(404).send({
          error: 'Execution not found',
          message: `Execution ${executionId} not found`,
        });
      }

      const execution = executionRows[0];

      // Use default criteria if none provided
      let qualityCriteria = criteria;
      if (!qualityCriteria || qualityCriteria.length === 0) {
        const { rows: defaultCriteria } = await fastify.database.query(`
          SELECT * FROM quality_criteria WHERE is_default = true
        `);
        qualityCriteria = defaultCriteria.map(c => ({
          name: c.name,
          type: c.type,

          threshold: c.threshold,
          weight: c.weight,
        }));
      }

      logger.getLogger().info({
        executionId,
        criteriaCount: qualityCriteria.length,
        resultsType: typeof results,
      }, 'Starting quality assessment');

      // Create execution context for quality controller
      const context = {
        executionId,
        workflowId: execution.workflow_id,
        inputData: execution.input_data,
        currentIteration: execution.iterations || 1,
        triggerSource: 'manual',
        triggerData: {},
        maxIterations: 25,
        metadata: {},
        qualityThreshold: 0.8,
        userId: request.headers['x-user-id'] as string || 'anonymous',
      };

      // Perform quality assessment
      const assessment = await fastify.qualityController.assessQuality(
        context,
        results,
        qualityCriteria
      );

      // Update execution with quality score
      await fastify.database.query(`
        UPDATE workflow_executions 
        SET quality_score = $1, quality_assessment = $2
        WHERE execution_id = $3
      `, [assessment.overallScore, JSON.stringify(assessment), executionId]);

      const duration = Date.now() - startTime;
      logger.getLogger().info({
        executionId,
        overallScore: assessment.overallScore,
        passed: assessment.passed,
        duration,
      }, 'Quality assessment completed');

      return reply.send({
        assessmentId: `${executionId}-${Date.now()}`,
        overallScore: assessment.overallScore,
        passed: assessment.passed,
        criteriaResults: assessment.criteriaResults,
        feedback: assessment.feedback,
        suggestions: assessment.suggestions,
        assessedAt: assessment.assessedAt,
      });

    } catch (error) {
      logger.error(error as Error, {
        executionId,
      }, 'Quality assessment failed');

      return reply.status(500).send({
        error: 'Quality assessment failed',
        message: (error as Error).message,
      });
    }
  });

  // Get quality assessment history
  fastify.get<{ Querystring: QualityHistoryQuery }>('/api/quality/history', {
    schema: {


      querystring: {
        type: 'object',
        properties: {
          executionId: { type: 'string' },
          workflowId: { type: 'string' },
          assessmentType: { type: 'string' },
          minScore: { type: 'number', minimum: 0, maximum: 1 },
          maxScore: { type: 'number', minimum: 0, maximum: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'number', minimum: 0, default: 0 },
          dateFrom: { type: 'string', format: 'date' },
          dateTo: { type: 'string', format: 'date' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            assessments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  executionId: { type: 'string' },
                  workflowId: { type: 'string' },
                  iteration: { type: 'number' },
                  assessmentType: { type: 'string' },
                  overallScore: { type: 'number' },
                  passed: { type: 'boolean' },
                  criteriaCount: { type: 'number' },
                  assessedAt: { type: 'string', format: 'date-time' },
                  assessor: { type: 'string' }
                }
              }
            },
            total: { type: 'number' },
            limit: { type: 'number' },
            offset: { type: 'number' },
            averageScore: { type: 'number' },
            passRate: { type: 'number' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: QualityHistoryQuery }>, reply: FastifyReply) => {
    const { 
      executionId, 
      workflowId, 
      assessmentType, 
      minScore, 
      maxScore, 
      limit = 20, 
      offset = 0,
      dateFrom,
      dateTo 
    } = request.query;

    try {
      let query = `
        SELECT 
          qa.*,
          jsonb_array_length(qa.criteria) as criteria_count
        FROM quality_assessments qa
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      // Add filters
      if (executionId) {
        query += ` AND qa.execution_id = $${paramIndex++}`;
        params.push(executionId);
      }

      if (workflowId) {
        query += ` AND qa.execution_id IN (
          SELECT execution_id FROM workflow_executions WHERE workflow_id = $${paramIndex++}
        )`;
        params.push(workflowId);
      }

      if (assessmentType) {
        query += ` AND qa.assessment_type = $${paramIndex++}`;
        params.push(assessmentType);
      }

      if (minScore !== undefined) {
        query += ` AND qa.overall_score >= $${paramIndex++}`;
        params.push(minScore);
      }

      if (maxScore !== undefined) {
        query += ` AND qa.overall_score <= $${paramIndex++}`;
        params.push(maxScore);
      }

      if (dateFrom) {
        query += ` AND qa.assessed_at >= $${paramIndex++}`;
        params.push(dateFrom);
      }

      if (dateTo) {
        query += ` AND qa.assessed_at <= $${paramIndex++}`;
        params.push(dateTo);
      }

      // Get total count and statistics
      const statsQuery = query.replace('SELECT qa.*, jsonb_array_length(qa.criteria) as criteria_count', 
        'SELECT COUNT(*) as total, AVG(qa.overall_score) as avg_score, AVG(CASE WHEN qa.passed THEN 1 ELSE 0 END) as pass_rate');
      
      const { rows: statsRows } = await fastify.database.query(statsQuery, params);
      const stats = statsRows[0];

      // Add ordering and pagination
      query += ` ORDER BY qa.assessed_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const { rows } = await fastify.database.query(query, params);

      const assessments = rows.map(row => ({
        id: row.id,
        executionId: row.execution_id,
        workflowId: row.workflow_id || 'unknown',
        iteration: row.iteration,
        assessmentType: row.assessment_type,
        overallScore: row.overall_score,
        passed: row.passed,
        criteriaCount: parseInt(row.criteria_count || '0'),
        assessedAt: row.assessed_at,
        assessor: row.assessor,
      }));

      logger.getLogger().info({
        resultCount: assessments.length,
        total: parseInt(stats.total || '0'),
        filters: { executionId, workflowId, assessmentType },
      }, 'Quality assessment history retrieved');

      return reply.send({
        assessments,
        total: parseInt(stats.total || '0'),
        limit,
        offset,
        averageScore: parseFloat(stats.avg_score || '0'),
        passRate: parseFloat(stats.pass_rate || '0'),
      });

    } catch (error) {
      logger.error(error as Error, {
        query: request.query,
      }, 'Failed to get quality assessment history');

      return reply.status(500).send({
        error: 'Failed to get quality assessment history',
        message: (error as Error).message,
      });
    }
  });

  // Get quality criteria templates
  fastify.get('/api/quality/criteria', {
    schema: {


      response: {
        200: {
          type: 'object',
          properties: {
            criteria: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  type: { type: 'string' },

                  threshold: { type: 'number' },
                  weight: { type: 'number' },
                  isDefault: { type: 'boolean' },
                  usageCount: { type: 'number' },
                  createdAt: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { rows } = await fastify.database.query(`
        SELECT 
          qc.*,
          COUNT(qa.id) as usage_count
        FROM quality_criteria qc
        LEFT JOIN quality_assessments qa ON qa.criteria::text LIKE '%' || qc.name || '%'
        GROUP BY qc.id, qc.name, qc.type, qc.description, qc.threshold, qc.weight, 
                 qc.is_default, qc.metadata, qc.created_at, qc.updated_at
        ORDER BY qc.is_default DESC, qc.created_at DESC
      `);

      const criteria = rows.map(row => ({
        id: row.id,
        name: row.name,
        type: row.type,

        threshold: row.threshold,
        weight: row.weight,
        isDefault: row.is_default,
        usageCount: parseInt(row.usage_count || '0'),
        createdAt: row.created_at,
      }));

      logger.getLogger().info({
        criteriaCount: criteria.length,
      }, 'Quality criteria retrieved');

      return reply.send({ criteria });

    } catch (error) {
      logger.error(error as Error, {}, 'Failed to get quality criteria');

      return reply.status(500).send({
        error: 'Failed to get quality criteria',
        message: (error as Error).message,
      });
    }
  });

  // Create new quality criteria
  fastify.post<{ Body: QualityCriteriaRequest }>('/api/quality/criteria', {
    schema: {


      body: {
        type: 'object',
        required: ['name', 'type', 'description', 'threshold', 'weight'],
        properties: {
          name: { type: 'string', minLength: 3, maxLength: 100 },
          type: { type: 'string', enum: ['accuracy', 'completeness', 'relevance', 'consistency', 'format', 'custom'] },

          threshold: { type: 'number', minimum: 0, maximum: 1 },
          weight: { type: 'number', minimum: 0, maximum: 1 },
          isDefault: { type: 'boolean', default: false },
          metadata: { type: 'object' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            criteriaId: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: QualityCriteriaRequest }>, reply: FastifyReply) => {
    const { name, type, description, threshold, weight, isDefault = false, metadata } = request.body;

    try {
      // Check if criteria with same name exists
      const { rows: existingRows } = await fastify.database.query(`
        SELECT id FROM quality_criteria WHERE name = $1
      `, [name]);

      if (existingRows.length > 0) {
        return reply.status(409).send({
          error: 'Criteria already exists',
          message: `Quality criteria with name '${name}' already exists`,
        });
      }

      // Insert new criteria
      const { rows } = await fastify.database.query(`
        INSERT INTO quality_criteria (name, type, description, threshold, weight, is_default, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [name, type, description, threshold, weight, isDefault, JSON.stringify(metadata || {})]);

      const criteriaId = rows[0].id;

      logger.getLogger().info({
        criteriaId,
        name,
        type,
        threshold,
        weight,
        isDefault,
      }, 'Quality criteria created');

      return reply.status(201).send({
        success: true,
        criteriaId,
        message: `Quality criteria '${name}' created successfully`,
      });

    } catch (error) {
      logger.error(error as Error, {
        name,
        type,
      }, 'Failed to create quality criteria');

      return reply.status(500).send({
        error: 'Failed to create quality criteria',
        message: (error as Error).message,
      });
    }
  });
}