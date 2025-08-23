/**
 * Activity Parameter API Endpoints
 * RESTful API for managing session-based activity parameters
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import Redis from 'ioredis';
import { ActivityParameterManager, ParameterSearchOptions } from '../services/activity-parameter-manager';
import { createRedisConnection } from '../cache/redis';
import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('activity-parameter-api');

let redis: Redis | null = null;
let parameterManager: ActivityParameterManager | null = null;

// Initialize services
async function initializeServices(): Promise<void> {
  if (!redis) {
    const env = {
      REDIS_URL: process.env.REDIS_URL || 'redis://redis:6379',
    };
    redis = await createRedisConnection(env as any);
  }
  
  if (!parameterManager) {
    parameterManager = new ActivityParameterManager(redis);
  }
}

export async function activityParameterRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
): Promise<void> {
  
  /**
   * POST /sessions
   * Create a new session
   */
  fastify.post('/sessions', async (request, reply) => {
    try {
      await initializeServices();
      
      const { sessionId, userContext } = request.body as any;
      
      if (!sessionId) {
        return reply.status(400).send({
          success: false,
          error: 'sessionId is required'
        });
      }

      await parameterManager!.createSession(sessionId, userContext);
      
      reply.send({
        success: true,
        data: { sessionId },
        message: 'Session created successfully'
      });

    } catch (error) {
      logger.error(error as Error, request.body, 'Failed to create session');
      reply.status(500).send({
        success: false,
        error: 'Failed to create session',
        details: error.message
      });
    }
  });

  /**
   * POST /store
   * Store activity parameter
   */
  fastify.post('/store', async (request, reply) => {
    try {
      await initializeServices();
      
      const { sessionId, workflowId, parameterId, activityName, value, metadata } = request.body as any;
      
      if (!sessionId || !workflowId || !parameterId || !activityName) {
        return reply.status(400).send({
          success: false,
          error: 'sessionId, workflowId, parameterId, and activityName are required'
        });
      }

      await parameterManager!.storeActivityParameter(
        sessionId,
        workflowId,
        parameterId,
        activityName,
        value,
        metadata
      );
      
      reply.send({
        success: true,
        message: 'Parameter stored successfully'
      });

    } catch (error) {
      logger.error(error as Error, request.body, 'Failed to store parameter');
      reply.status(500).send({
        success: false,
        error: 'Failed to store parameter',
        details: error.message
      });
    }
  });

  /**
   * GET /resolve/:sessionId/:workflowId/:parameterId
   * Resolve parameter value deterministically
   */
  fastify.get('/resolve/:sessionId/:workflowId/:parameterId', async (request, reply) => {
    try {
      await initializeServices();
      
      const { sessionId, workflowId, parameterId } = request.params as any;
      
      const value = await parameterManager!.resolveParameter(sessionId, workflowId, parameterId);
      
      reply.send({
        success: true,
        data: {
          sessionId,
          workflowId,
          parameterId,
          value
        }
      });

    } catch (error) {
      logger.error(error as Error, request.params, 'Failed to resolve parameter');
      
      // Return specific error codes for deterministic failures
      if (error.name === 'ParameterNotFoundError') {
        return reply.status(404).send({
          success: false,
          error: 'Parameter not found',
          errorType: 'PARAMETER_NOT_FOUND',
          details: error.message
        });
      }
      
      if (error.name === 'SessionExpiredError') {
        return reply.status(410).send({
          success: false,
          error: 'Session expired',
          errorType: 'SESSION_EXPIRED',
          details: error.message
        });
      }
      
      reply.status(500).send({
        success: false,
        error: 'Failed to resolve parameter',
        details: error.message
      });
    }
  });

  /**
   * GET /workflow/:sessionId/:workflowId
   * Get all parameters for a workflow
   */
  fastify.get('/workflow/:sessionId/:workflowId', async (request, reply) => {
    try {
      await initializeServices();
      
      const { sessionId, workflowId } = request.params as any;
      
      const parameters = await parameterManager!.getWorkflowParameters(sessionId, workflowId);
      
      reply.send({
        success: true,
        data: {
          sessionId,
          workflowId,
          parameters,
          parameterCount: Object.keys(parameters).length
        }
      });

    } catch (error) {
      logger.error(error as Error, request.params, 'Failed to get workflow parameters');
      reply.status(500).send({
        success: false,
        error: 'Failed to get workflow parameters',
        details: error.message
      });
    }
  });

  /**
   * POST /search
   * Search parameters with filters
   */
  fastify.post('/search', async (request, reply) => {
    try {
      await initializeServices();
      
      const searchOptions: ParameterSearchOptions = request.body as any;
      
      const parameters = await parameterManager!.searchParameters(searchOptions);
      
      reply.send({
        success: true,
        data: {
          parameters,
          count: parameters.length,
          searchOptions
        }
      });

    } catch (error) {
      logger.error(error as Error, request.body, 'Failed to search parameters');
      reply.status(500).send({
        success: false,
        error: 'Failed to search parameters',
        details: error.message
      });
    }
  });

  /**
   * POST /store-results
   * Store multiple activity results
   */
  fastify.post('/store-results', async (request, reply) => {
    try {
      await initializeServices();
      
      const { sessionId, workflowId, activityName, results, metadata } = request.body as any;
      
      if (!sessionId || !workflowId || !activityName || !results) {
        return reply.status(400).send({
          success: false,
          error: 'sessionId, workflowId, activityName, and results are required'
        });
      }

      await parameterManager!.storeActivityResults(
        sessionId,
        workflowId,
        activityName,
        results,
        metadata
      );
      
      reply.send({
        success: true,
        data: {
          sessionId,
          workflowId,
          activityName,
          parameterCount: Object.keys(results).length
        },
        message: 'Activity results stored successfully'
      });

    } catch (error) {
      logger.error(error as Error, request.body, 'Failed to store activity results');
      reply.status(500).send({
        success: false,
        error: 'Failed to store activity results',
        details: error.message
      });
    }
  });

  /**
   * PUT /workflow-state/:sessionId/:workflowId
   * Update workflow state
   */
  fastify.put('/workflow-state/:sessionId/:workflowId', async (request, reply) => {
    try {
      await initializeServices();
      
      const { sessionId, workflowId } = request.params as any;
      const updates = request.body as any;
      
      await parameterManager!.updateWorkflowState(sessionId, workflowId, updates);
      
      reply.send({
        success: true,
        data: { sessionId, workflowId, updates },
        message: 'Workflow state updated successfully'
      });

    } catch (error) {
      logger.error(error as Error, { params: request.params, body: request.body }, 'Failed to update workflow state');
      reply.status(500).send({
        success: false,
        error: 'Failed to update workflow state',
        details: error.message
      });
    }
  });

  /**
   * POST /cleanup
   * Cleanup expired parameters
   */
  fastify.post('/cleanup', async (request, reply) => {
    try {
      await initializeServices();
      
      const deletedCount = await parameterManager!.cleanupExpiredParameters();
      
      reply.send({
        success: true,
        data: { deletedCount },
        message: `Cleaned up ${deletedCount} expired parameters`
      });

    } catch (error) {
      logger.error(error as Error, {}, 'Failed to cleanup expired parameters');
      reply.status(500).send({
        success: false,
        error: 'Failed to cleanup expired parameters',
        details: error.message
      });
    }
  });

  /**
   * GET /health
   * Health check endpoint
   */
  fastify.get('/health', async (request, reply) => {
    try {
      await initializeServices();
      
      // Test Redis connection
      await redis!.ping();
      
      reply.send({
        success: true,
        data: {
          redis: 'connected',
          parameterManager: 'initialized'
        },
        message: 'Activity Parameter Manager is healthy'
      });

    } catch (error) {
      logger.error(error as Error, {}, 'Health check failed');
      reply.status(500).send({
        success: false,
        error: 'Health check failed',
        details: error.message
      });
    }
  });
}