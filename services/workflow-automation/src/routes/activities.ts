/**
 * Activity Management Routes
 * Provides CRUD operations for activities that integrate with dynamic workflow system
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '../shared-utils-local';
import { Pool } from 'pg';

const logger = createServiceLogger('activity-routes');

// Database connection for activities
const dbPool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'temporal_ai_platform',
  user: process.env.DB_USER || 'temporal',
  password: process.env.DB_PASSWORD || 'temporal',
  ssl: false
});

export async function activityRoutes(fastify: FastifyInstance): Promise<void> {
  
  /**
   * Get all activities from activity_library
   */
  fastify.get('/api/activities', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await dbPool.query(`
        SELECT 
          id,
          name,
          type,
          description,
          version,
          category,
          inputs,
          outputs,
          code,
          language,
          metadata,
          tags,
          usage_count,
          quality_score,
          created_at,
          updated_at,
          created_by
        FROM activity_library 
        ORDER BY name ASC
      `);
      
      // Transform database format to frontend format
      const activities = result.rows.map(activity => ({
        id: activity.id,
        name: activity.name,
        type: activity.type,
        description: activity.description,
        version: activity.version,
        category: activity.category,
        inputs: activity.inputs,
        outputs: activity.outputs,
        code: activity.code,
        language: activity.language,
        metadata: activity.metadata,
        tags: activity.tags,
        usageCount: activity.usage_count,
        qualityScore: activity.quality_score,
        createdAt: activity.created_at,
        updatedAt: activity.updated_at,
        createdBy: activity.created_by
      }));

      logger.info('Retrieved activities from database', { count: activities.length });

      return reply.send({
        success: true,
        data: activities,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Failed to retrieve activities', { error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to retrieve activities',
        message: (error as Error).message,
        timestamp: Date.now()
      });
    }
  });

  /**
   * Get single activity by ID
   */
  fastify.get<{ Params: { id: string } }>('/api/activities/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    
    try {
      const result = await dbPool.query(`
        SELECT 
          id,
          name,
          type,
          description,
          version,
          category,
          inputs,
          outputs,
          code,
          language,
          metadata,
          tags,
          usage_count,
          quality_score,
          created_at,
          updated_at,
          created_by
        FROM activity_library 
        WHERE id = $1
      `, [id]);
      
      if (result.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Activity not found',
          activityId: id,
          timestamp: Date.now()
        });
      }
      
      const activity = result.rows[0];
      
      // Transform to frontend format
      const formattedActivity = {
        id: activity.id,
        name: activity.name,
        type: activity.type,
        description: activity.description,
        version: activity.version,
        category: activity.category,
        inputs: activity.inputs,
        outputs: activity.outputs,
        code: activity.code,
        language: activity.language,
        metadata: activity.metadata,
        tags: activity.tags,
        usageCount: activity.usage_count,
        qualityScore: activity.quality_score,
        createdAt: activity.created_at,
        updatedAt: activity.updated_at,
        createdBy: activity.created_by
      };

      logger.info('Retrieved activity by ID', { activityId: id, name: activity.name });

      return reply.send({
        success: true,
        data: formattedActivity,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Failed to retrieve activity', { activityId: id, error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to retrieve activity',
        message: (error as Error).message,
        activityId: id,
        timestamp: Date.now()
      });
    }
  });

  /**
   * Create new activity
   */
  fastify.post('/api/activities', {
    schema: {
      body: {
        type: 'object',
        required: ['id', 'name', 'code'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string' },
          description: { type: 'string' },
          version: { type: 'string' },
          category: { type: 'string' },
          inputs: { type: 'object' },
          outputs: { type: 'object' },
          code: { type: 'string' },
          language: { type: 'string' },
          metadata: { type: 'object' },
          tags: { type: 'array' },
          createdBy: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Body: { 
      id: string;
      name: string;
      type?: string;
      description?: string;
      version?: string;
      category?: string;
      inputs?: object;
      outputs?: object;
      code: string;
      language?: string;
      metadata?: object;
      tags?: string[];
      createdBy?: string;
    } 
  }>, reply: FastifyReply) => {
    const {
      id,
      name,
      type = 'custom',
      description = '',
      version = '1.0.0',
      category = 'user-defined',
      inputs = {},
      outputs = {},
      code,
      language = 'javascript',
      metadata = {},
      tags = [],
      createdBy = 'workflow-editor'
    } = request.body;
    
    try {
      const result = await dbPool.query(`
        INSERT INTO activity_library (
          id, name, type, description, version, category,
          inputs, outputs, code, language, metadata, tags,
          usage_count, quality_score, created_at, updated_at, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW(), $15
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          description = EXCLUDED.description,
          code = EXCLUDED.code,
          inputs = EXCLUDED.inputs,
          outputs = EXCLUDED.outputs,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING *
      `, [
        id, name, type, description, version, category,
        JSON.stringify(inputs), JSON.stringify(outputs), code, language,
        JSON.stringify(metadata), tags, 0, 0.0, createdBy
      ]);
      
      const createdActivity = result.rows[0];
      
      logger.info('Created/updated activity', { 
        activityId: id, 
        name: name,
        type: type 
      });

      return reply.status(201).send({
        success: true,
        data: {
          id: createdActivity.id,
          name: createdActivity.name,
          type: createdActivity.type,
          description: createdActivity.description,
          version: createdActivity.version,
          category: createdActivity.category,
          inputs: createdActivity.inputs,
          outputs: createdActivity.outputs,
          code: createdActivity.code,
          language: createdActivity.language,
          metadata: createdActivity.metadata,
          tags: createdActivity.tags,
          usageCount: createdActivity.usage_count,
          qualityScore: createdActivity.quality_score,
          createdAt: createdActivity.created_at,
          updatedAt: createdActivity.updated_at,
          createdBy: createdActivity.created_by
        },
        message: 'Activity created/updated successfully',
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Failed to create activity', { activityId: id, name, error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to create activity',
        message: (error as Error).message,
        activityId: id,
        timestamp: Date.now()
      });
    }
  });

  /**
   * Update existing activity
   */
  fastify.put<{ Params: { id: string } }>('/api/activities/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          description: { type: 'string' },
          code: { type: 'string' },
          inputs: { type: 'object' },
          outputs: { type: 'object' },
          metadata: { type: 'object' },
          tags: { type: 'array' }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Params: { id: string };
    Body: Partial<{
      name: string;
      type: string;
      description: string;
      code: string;
      inputs: object;
      outputs: object;
      metadata: object;
      tags: string[];
    }>;
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const updates = request.body;
    
    try {
      // Build dynamic UPDATE query
      const setClause = [];
      const values = [];
      let valueIndex = 1;
      
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          if (['inputs', 'outputs', 'metadata'].includes(key)) {
            setClause.push(`${key} = $${valueIndex}`);
            values.push(JSON.stringify(value));
          } else {
            setClause.push(`${key} = $${valueIndex}`);
            values.push(value);
          }
          valueIndex++;
        }
      }
      
      if (setClause.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'No updates provided',
          timestamp: Date.now()
        });
      }
      
      setClause.push(`updated_at = NOW()`);
      values.push(id);
      
      const result = await dbPool.query(`
        UPDATE activity_library 
        SET ${setClause.join(', ')}
        WHERE id = $${valueIndex}
        RETURNING *
      `, values);
      
      if (result.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Activity not found',
          activityId: id,
          timestamp: Date.now()
        });
      }
      
      const updatedActivity = result.rows[0];
      
      logger.info('Updated activity', { activityId: id, updates: Object.keys(updates) });

      return reply.send({
        success: true,
        data: {
          id: updatedActivity.id,
          name: updatedActivity.name,
          type: updatedActivity.type,
          description: updatedActivity.description,
          version: updatedActivity.version,
          category: updatedActivity.category,
          inputs: updatedActivity.inputs,
          outputs: updatedActivity.outputs,
          code: updatedActivity.code,
          language: updatedActivity.language,
          metadata: updatedActivity.metadata,
          tags: updatedActivity.tags,
          usageCount: updatedActivity.usage_count,
          qualityScore: updatedActivity.quality_score,
          createdAt: updatedActivity.created_at,
          updatedAt: updatedActivity.updated_at,
          createdBy: updatedActivity.created_by
        },
        message: 'Activity updated successfully',
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Failed to update activity', { activityId: id, error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to update activity',
        message: (error as Error).message,
        activityId: id,
        timestamp: Date.now()
      });
    }
  });

  /**
   * Delete activity
   */
  fastify.delete<{ Params: { id: string } }>('/api/activities/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    
    try {
      const result = await dbPool.query(`
        DELETE FROM activity_library 
        WHERE id = $1
        RETURNING id, name
      `, [id]);
      
      if (result.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Activity not found',
          activityId: id,
          timestamp: Date.now()
        });
      }
      
      const deletedActivity = result.rows[0];
      
      logger.info('Deleted activity', { activityId: id, name: deletedActivity.name });

      return reply.send({
        success: true,
        message: 'Activity deleted successfully',
        data: { id: deletedActivity.id, name: deletedActivity.name },
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Failed to delete activity', { activityId: id, error });
      return reply.status(500).send({
        success: false,
        error: 'Failed to delete activity',
        message: (error as Error).message,
        activityId: id,
        timestamp: Date.now()
      });
    }
  });

  /**
   * Health check for activity service
   */
  fastify.get('/api/activities/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await dbPool.query('SELECT COUNT(*) as count FROM activity_library');
      const activityCount = parseInt(result.rows[0].count);
      
      return reply.send({
        status: 'healthy',
        database: 'connected',
        activitiesCount: activityCount,
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