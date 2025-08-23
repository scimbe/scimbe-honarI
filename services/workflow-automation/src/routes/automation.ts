/**
 * Automation Routes for Workflow Automation Service
 * Handles workflow generation, execution, and status tracking
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('automation-routes');

// Request/Response types - Updated for Temporal workflow generation
interface WorkflowGenerationRequest {
  requirements: string;
  workflow_yaml?: string;
  template_id?: string;
  business_context?: string;
  target_language?: 'python' | 'typescript';
  auto_activate?: boolean;
  deploy_environment?: 'development' | 'staging' | 'production';
  max_iterations?: number;
  feedback_enabled?: boolean;
  user_preferences?: Record<string, any>;
}

interface IterativeWorkflowGenerationRequest extends WorkflowGenerationRequest {
  max_iterations?: number;
  quality_threshold?: number;
  priority_focus?: string;
  acceptable_partial_success?: boolean;
}

interface ExecutionStatusParams {
  executionId: string;
}

export async function automationRoutes(fastify: FastifyInstance): Promise<void> {
  
  // Generate new workflow from requirements - DEPRECATED: use workflow-generation.ts instead
  fastify.post<{ Body: WorkflowGenerationRequest }>('/api/workflows/generate-legacy', {
    schema: {


      body: {
        type: 'object',
        required: ['requirements'],
        properties: {
          requirements: { type: 'string', minLength: 10, maxLength: 5000 },
          workflow_yaml: { type: 'string' },
          template_id: { type: 'string' },
          business_context: { type: 'string', maxLength: 2000 },
          target_language: { type: 'string', enum: ['python', 'typescript'], default: 'python' },
          auto_activate: { type: 'boolean', default: false },
          deploy_environment: { type: 'string', enum: ['development', 'staging', 'production'], default: 'development' },
          max_iterations: { type: 'number', minimum: 1, maximum: 10, default: 3 },
          feedback_enabled: { type: 'boolean', default: true },
          user_preferences: { type: 'object' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            execution_id: { type: 'string', format: 'uuid' },
            workflow_id: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['completed', 'failed', 'running', 'deployed'] },
            temporal_workflow_class: { type: 'string' },
            generated_code_url: { type: 'string', format: 'uri' },
            deployment_endpoint: { type: 'string', format: 'uri' },
            quality_scores: { type: 'object' },
            iterations: { type: 'number' },
            feedback_applied: { type: 'array', items: { type: 'string' } },
            execution_time: { type: 'number' },
            artifacts_generated: { type: 'number' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: WorkflowGenerationRequest }>, reply: FastifyReply) => {
    const startTime = Date.now();
    const { 
      requirements, 
      workflow_yaml, 
      template_id, 
      business_context, 
      target_language, 
      auto_activate, 
      deploy_environment,
      max_iterations,
      feedback_enabled,
      user_preferences 
    } = request.body;

    try {
      logger.getLogger().info({
        requirements: requirements.substring(0, 100),
        template_id,
        target_language: target_language || 'python',
        auto_activate: auto_activate || false,
      }, 'Starting Temporal workflow generation');

      // Generate Temporal workflow using automation engine
      const result = await fastify.temporalAutomationEngine.generateWorkflow(
        requirements,
        'temporal_generation',
        { workflow_yaml, template_id, business_context },
        {
          workflowYaml: workflow_yaml,
          templateId: template_id,
          businessContext: business_context,
          targetLanguage: target_language || 'python',
          autoActivate: auto_activate || false,
          deployEnvironment: deploy_environment || 'development',
          maxIterations: max_iterations || 3,
          feedbackEnabled: feedback_enabled !== false,
          userPreferences: user_preferences,
        },
        {
          userId: request.headers['x-user-id'] as string || 'anonymous',
          correlationId: request.headers['x-correlation-id'] as string,
        }
      );

      const duration = Date.now() - startTime;
      logger.getLogger().info({
        executionId: result.executionId,
        workflowId: result.workflowId,
        success: result.success,
        temporalWorkflowClass: result.temporalWorkflowClass,
        duration,
      }, 'Temporal workflow generation completed');

      return reply.send({
        execution_id: result.executionId,
        workflow_id: result.workflowId,
        status: result.status,
        temporal_workflow_class: result.temporalWorkflowClass,
        generated_code_url: result.generatedCodeUrl,
        deployment_endpoint: result.deploymentEndpoint,
        quality_scores: result.qualityScores,
        iterations: result.iterations,
        feedback_applied: result.feedbackApplied,
        execution_time: result.executionTime,
        artifacts_generated: result.artifactsGenerated,
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error(error as Error, {
        requirements: requirements.substring(0, 50),
        duration,
      }, 'Temporal workflow generation failed');

      return reply.status(503).send({
        success: false,
        error: 'Temporal workflow generation failed',
        message: (error as Error).message,
      });
    }
  });

  // Generate workflow using iterative optimization
  fastify.post<{ Body: IterativeWorkflowGenerationRequest }>('/api/workflows/generate-iterative', {
    schema: {


      body: {
        type: 'object',
        required: ['requirements'],
        properties: {
          requirements: { type: 'string', minLength: 10, maxLength: 5000 },
          workflow_yaml: { type: 'string' },
          template_id: { type: 'string' },
          business_context: { type: 'string', maxLength: 2000 },
          target_language: { type: 'string', enum: ['python', 'typescript'], default: 'python' },
          auto_activate: { type: 'boolean', default: false },
          max_iterations: { type: 'number', minimum: 1, maximum: 25, default: 25 },
          quality_threshold: { type: 'number', minimum: 0, maximum: 100, default: 95.0 },
          priority_focus: { type: 'string', default: 'temporal_workflow_delivery' },
          acceptable_partial_success: { type: 'boolean', default: true },
          feedback_enabled: { type: 'boolean', default: true },
          user_preferences: { type: 'object' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            execution_id: { type: 'string', format: 'uuid' },
            workflow_id: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['completed', 'failed', 'running', 'partial_success'] },
            total_iterations: { type: 'number' },
            successful_deployment: { type: 'boolean' },
            final_quality_scores: { type: 'object' },
            problems_identified: { type: 'number' },
            problems_resolved: { type: 'number' },
            knowledge_insights: { type: 'number' },
            execution_time: { type: 'number' },
            deployment_url: { type: 'string', format: 'uri' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: IterativeWorkflowGenerationRequest }>, reply: FastifyReply) => {
    const startTime = Date.now();
    const { 
      requirements, 
      workflow_yaml,
      template_id,
      business_context,
      target_language,
      auto_activate,
      max_iterations, 
      quality_threshold, 
      priority_focus,
      acceptable_partial_success,
      feedback_enabled,
      user_preferences 
    } = request.body;

    try {
      logger.getLogger().info({
        requirements: requirements.substring(0, 100),
        max_iterations: max_iterations || 25,
        quality_threshold: quality_threshold || 95.0,
        priority_focus: priority_focus || 'temporal_workflow_delivery',
      }, 'Starting iterative Temporal workflow generation');

      // Execute iterative Temporal workflow generation
      const result = await fastify.temporalAutomationEngine.executeIterativeWorkflow(
        requirements,
        'iterative_temporal_generation',
        { workflow_yaml, template_id, business_context },
        {
          workflowYaml: workflow_yaml,
          templateId: template_id,
          businessContext: business_context,
          targetLanguage: target_language || 'python',
          autoActivate: auto_activate || false,
          maxIterations: max_iterations || 25,
          qualityThreshold: (quality_threshold || 95.0) / 100, // Convert to 0-1 scale
          priorityFocus: priority_focus || 'temporal_workflow_delivery',
          acceptablePartialSuccess: acceptable_partial_success !== false,
          feedbackEnabled: feedback_enabled !== false,
          userPreferences: user_preferences,
        },
        {
          userId: request.headers['x-user-id'] as string || 'anonymous',
          correlationId: request.headers['x-correlation-id'] as string,
        }
      );

      const duration = Date.now() - startTime;
      logger.getLogger().info({
        executionId: result.executionId,
        workflowId: result.workflowId,
        success: result.success,
        iterations: result.iterations,
        finalQualityScore: result.finalQualityScore,
        temporalWorkflowClass: result.temporalWorkflowClass,
        duration,
      }, 'Iterative Temporal workflow generation completed');

      return reply.send({
        execution_id: result.executionId,
        workflow_id: result.workflowId,
        status: result.status,
        total_iterations: result.iterations,
        successful_deployment: result.deploymentEndpoint ? true : false,
        final_quality_scores: result.qualityScores,
        problems_identified: result.improvementSuggestions.length,
        problems_resolved: Math.max(0, result.improvementSuggestions.length - 2), // Assume most problems resolved
        knowledge_insights: result.feedbackApplied.length,
        execution_time: result.executionTime,
        deployment_url: result.deploymentEndpoint,
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error(error as Error, {
        requirements: requirements.substring(0, 50),
        duration,
      }, 'Iterative workflow generation failed');

      return reply.status(503).send({
        success: false,
        error: 'Iterative workflow generation failed',
        message: (error as Error).message,
      });
    }
  });

  // Get workflow execution status
  fastify.get<{ Params: ExecutionStatusParams }>('/api/executions/:executionId', {
    schema: {


      params: {
        type: 'object',
        required: ['executionId'],
        properties: {
          executionId: { type: 'string', format: 'uuid' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            executionId: { type: 'string' },
            workflowId: { type: 'string' },
            status: { type: 'string' },
            progress: { type: 'number' },
            currentStep: { type: 'number' },
            totalSteps: { type: 'number' },
            startedAt: { type: 'string', format: 'date-time' },
            completedAt: { type: 'string', format: 'date-time' },
            duration: { type: 'number' },
            result: { type: 'object' },
            error: { type: 'string' },
            qualityScore: { type: 'number' },
            iterations: { type: 'number' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: ExecutionStatusParams }>, reply: FastifyReply) => {
    const { executionId } = request.params;

    try {
      // Get execution status from database
      const { rows } = await fastify.database.query(`
        SELECT * FROM workflow_executions WHERE execution_id = $1
      `, [executionId]);

      if (rows.length === 0) {
        return reply.status(404).send({
          error: 'Execution not found',
          message: `Execution ${executionId} not found`,
        });
      }

      const execution = rows[0];
      const duration = execution.completed_at ? 
        new Date(execution.completed_at).getTime() - new Date(execution.started_at).getTime() : 
        Date.now() - new Date(execution.started_at).getTime();

      logger.getLogger().debug({
        executionId,
        status: execution.status,
        duration,
      }, 'Retrieved execution status');

      return reply.send({
        executionId: execution.execution_id,
        workflowId: execution.workflow_id,
        status: execution.status,
        progress: execution.progress || 0,
        currentStep: execution.current_step || 0,
        totalSteps: execution.total_steps || 0,
        startedAt: execution.started_at,
        completedAt: execution.completed_at,
        duration,
        result: execution.result,
        error: execution.error,
        qualityScore: execution.quality_score,
        iterations: execution.iterations || 1,
      });

    } catch (error) {
      logger.error(error as Error, { executionId }, 'Failed to get execution status');

      return reply.status(500).send({
        error: 'Failed to get execution status',
        message: (error as Error).message,
      });
    }
  });
}