/**
 * Dynamic Workflow Endpoints for Revolutionary Workflow System
 * These endpoints handle communication with the dynamic workflow wrapper
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('dynamic-workflow-endpoints');

// Interface definitions for the dynamic workflow system
interface WorkflowStepRequest {
  workflowId: string;
  stepId: string;
  input: any;
  stepType: string;
  configuration: any;
  executionContext: {
    timestamp: number;
    activityTaskToken: string;
  };
}

interface WorkflowExecutionRequest {
  input: any;
  parentExecutionId?: string;
  executionContext: {
    timestamp: number;
    source: string;
  };
}

interface DataExchangeRequest {
  sourceWorkflow: string;
  targetWorkflow: string;
  data: any;
  channel: string;
  timestamp: number;
}

export async function dynamicWorkflowEndpoints(fastify: FastifyInstance): Promise<void> {
  
  /**
   * Execute a single workflow step
   */
  fastify.post<{ Body: WorkflowStepRequest }>('/api/workflows/execute-step', {
    schema: {
      body: {
        type: 'object',
        required: ['workflowId', 'stepId', 'input', 'stepType', 'configuration'],
        properties: {
          workflowId: { type: 'string' },
          stepId: { type: 'string' },
          input: { type: 'object' },
          stepType: { type: 'string' },
          configuration: { type: 'object' },
          executionContext: { type: 'object' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: WorkflowStepRequest }>, reply: FastifyReply) => {
    const { workflowId, stepId, input, stepType, configuration } = request.body;
    
    logger.info('Executing workflow step', { workflowId, stepId, stepType });
    
    try {
      // Use LLM service to dynamically execute the step based on type and configuration
      const llmService = fastify.llmService;
      
      // Generate step execution logic based on step type
      const stepResult = await executeStepByType(stepType, input, configuration, llmService);
      
      // Store execution result in database
      await fastify.extendedDb.storeStepExecution({
        workflowId,
        stepId,
        input,
        result: stepResult,
        timestamp: Date.now(),
        executionContext: request.body.executionContext
      });
      
      logger.info('Workflow step completed', { workflowId, stepId, result: stepResult });
      
      return reply.code(200).send({
        success: true,
        stepId,
        result: stepResult,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Workflow step failed', { workflowId, stepId, error });
      return reply.code(500).send({
        success: false,
        stepId,
        error: (error as Error).message,
        timestamp: Date.now()
      });
    }
  });

  /**
   * Get workflow definition
   */
  fastify.get<{ Params: { workflowId: string } }>('/api/workflows/:workflowId/definition', 
  async (request: FastifyRequest<{ Params: { workflowId: string } }>, reply: FastifyReply) => {
    const { workflowId } = request.params;
    
    logger.info('Loading workflow definition', { workflowId });
    
    try {
      // Generate workflow definition dynamically based on workflowId
      const workflowDefinition = await generateWorkflowDefinition(workflowId, fastify.llmService);
      
      logger.info('Workflow definition loaded', { workflowId, stepCount: workflowDefinition.steps.length });
      
      return reply.code(200).send(workflowDefinition);
      
    } catch (error) {
      logger.error('Failed to load workflow definition', { workflowId, error });
      return reply.code(404).send({
        error: 'Workflow definition not found',
        workflowId,
        message: (error as Error).message
      });
    }
  });

  /**
   * Execute complete workflow
   */
  fastify.post<{ 
    Params: { workflowId: string },
    Body: WorkflowExecutionRequest 
  }>('/api/workflows/:workflowId/execute', 
  async (request: FastifyRequest<{ 
    Params: { workflowId: string },
    Body: WorkflowExecutionRequest 
  }>, reply: FastifyReply) => {
    const { workflowId } = request.params;
    const { input, parentExecutionId, executionContext } = request.body;
    
    logger.info('Executing complete workflow', { workflowId, parentExecutionId });
    
    try {
      // Execute workflow through Temporal's external API
      const executionId = `exec_${workflowId}_${Date.now()}`;
      
      // Start workflow execution via Temporal client
      const workflowResult = await executeWorkflowViaTemporalClient(
        workflowId,
        input,
        executionId,
        fastify
      );
      
      logger.info('Workflow execution completed', { workflowId, executionId });
      
      return reply.code(200).send({
        success: true,
        workflowId,
        executionId,
        result: workflowResult,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Workflow execution failed', { workflowId, error });
      return reply.code(500).send({
        success: false,
        workflowId,
        error: (error as Error).message,
        timestamp: Date.now()
      });
    }
  });

  /**
   * Data exchange between workflows
   */
  fastify.post<{ Body: DataExchangeRequest }>('/api/workflows/data-exchange', {
    schema: {
      body: {
        type: 'object',
        required: ['sourceWorkflow', 'targetWorkflow', 'data', 'channel'],
        properties: {
          sourceWorkflow: { type: 'string' },
          targetWorkflow: { type: 'string' },
          data: { type: 'object' },
          channel: { type: 'string' },
          timestamp: { type: 'number' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: DataExchangeRequest }>, reply: FastifyReply) => {
    const { sourceWorkflow, targetWorkflow, data, channel } = request.body;
    
    logger.info('Processing data exchange', { sourceWorkflow, targetWorkflow, channel });
    
    try {
      // Store data exchange in Redis for workflow communication
      const redis = fastify.redis;
      const exchangeKey = `workflow_exchange:${sourceWorkflow}:${targetWorkflow}:${channel}`;
      
      await redis.setex(exchangeKey, 3600, JSON.stringify({
        sourceWorkflow,
        targetWorkflow,
        data,
        channel,
        timestamp: Date.now()
      }));
      
      // Notify target workflow if it's listening
      await redis.publish(`workflow_channel:${targetWorkflow}`, JSON.stringify({
        type: 'data_available',
        source: sourceWorkflow,
        channel,
        exchangeKey
      }));
      
      logger.info('Data exchange completed', { sourceWorkflow, targetWorkflow, channel });
      
      return reply.code(200).send({
        success: true,
        exchangeKey,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Data exchange failed', { sourceWorkflow, targetWorkflow, error });
      return reply.code(500).send({
        success: false,
        error: (error as Error).message
      });
    }
  });

  /**
   * Log workflow execution events
   */
  fastify.post('/api/workflows/execution-log', 
  async (request: FastifyRequest, reply: FastifyReply) => {
    const logData = request.body as any;
    
    logger.info('Logging workflow execution', logData);
    
    try {
      // Store execution log in database
      await fastify.extendedDb.storeExecutionLog({
        workflowId: logData.workflowId,
        stepId: logData.stepId,
        status: logData.status,
        result: logData.result,
        timestamp: logData.timestamp,
        activityContext: logData.activityContext
      });
      
      return reply.code(200).send({ success: true });
      
    } catch (error) {
      logger.warn('Failed to store execution log', { error });
      return reply.code(200).send({ success: false });
    }
  });

  /**
   * Get workflow execution status
   */
  fastify.get<{ Params: { executionId: string } }>('/api/workflows/execution/:executionId/status',
  async (request: FastifyRequest<{ Params: { executionId: string } }>, reply: FastifyReply) => {
    const { executionId } = request.params;
    
    try {
      // Check execution status in database
      const status = await fastify.extendedDb.getExecutionStatus(executionId);
      
      return reply.code(200).send(status);
      
    } catch (error) {
      return reply.code(404).send({
        error: 'Execution not found',
        executionId
      });
    }
  });

  /**
   * Create dynamic workflow definitions
   */
  fastify.post('/api/workflows/create-dynamic', 
  async (request: FastifyRequest, reply: FastifyReply) => {
    const workflowSpec = request.body as any;
    
    logger.info('Creating dynamic workflow', { workflowId: workflowSpec.workflowId });
    
    try {
      // Use LLM service to generate workflow definition
      const llmService = fastify.llmService;
      
      const prompt = `
        Create a workflow definition for: ${workflowSpec.description}
        
        Requirements:
        - Workflow ID: ${workflowSpec.workflowId}
        - Input Parameters: ${JSON.stringify(workflowSpec.inputParameters)}
        - Expected Output: ${JSON.stringify(workflowSpec.expectedOutput)}
        - Steps: ${JSON.stringify(workflowSpec.steps)}
        
        Generate a JSON workflow definition with steps, dependencies, and configuration.
      `;
      
      const workflowDefinition = await llmService.generateContent(prompt);
      
      // Store workflow definition
      await fastify.extendedDb.storeWorkflowDefinition(workflowSpec.workflowId, workflowDefinition);
      
      logger.info('Dynamic workflow created', { workflowId: workflowSpec.workflowId });
      
      return reply.code(201).send({
        success: true,
        workflowId: workflowSpec.workflowId,
        definition: workflowDefinition,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Failed to create dynamic workflow', { error });
      return reply.code(500).send({
        success: false,
        error: (error as Error).message
      });
    }
  });
}

/**
 * Execute step based on type using LLM service
 */
async function executeStepByType(
  stepType: string,
  input: any,
  configuration: any,
  llmService: any
): Promise<any> {
  switch (stepType) {
    case 'calculation':
      return executeCalculationStep(input, configuration);
    
    case 'data_transformation':
      return executeDataTransformationStep(input, configuration, llmService);
    
    case 'api_call':
      return executeApiCallStep(input, configuration);
    
    case 'condition':
      return executeConditionStep(input, configuration);
    
    case 'llm_processing':
      return executeLlmProcessingStep(input, configuration, llmService);
    
    default:
      throw new Error(`Unknown step type: ${stepType}`);
  }
}

/**
 * Step execution implementations
 */
async function executeCalculationStep(input: any, configuration: any): Promise<any> {
  const { operation, operands } = configuration;
  
  switch (operation) {
    case 'add':
      return { result: operands.reduce((sum: number, val: any) => sum + (input[val] || 0), 0) };
    case 'multiply':
      return { result: operands.reduce((product: number, val: any) => product * (input[val] || 1), 1) };
    case 'divide':
      const [dividend, divisor] = operands;
      return { result: (input[dividend] || 0) / (input[divisor] || 1) };
    default:
      throw new Error(`Unknown calculation operation: ${operation}`);
  }
}

async function executeDataTransformationStep(input: any, configuration: any, llmService: any): Promise<any> {
  const { transformationType, mapping } = configuration;
  
  if (transformationType === 'mapping') {
    const result: any = {};
    for (const [sourceKey, targetKey] of Object.entries(mapping)) {
      result[targetKey as string] = input[sourceKey];
    }
    return result;
  } else if (transformationType === 'llm_transform') {
    const prompt = `Transform this data: ${JSON.stringify(input)} according to: ${configuration.instructions}`;
    const transformed = await llmService.generateContent(prompt);
    return { transformed };
  }
  
  return input;
}

async function executeApiCallStep(input: any, configuration: any): Promise<any> {
  const { url, method, headers, body } = configuration;
  
  const response = await fetch(url, {
    method: method || 'GET',
    headers: headers || {},
    body: body ? JSON.stringify({ ...body, ...input }) : undefined,
  });
  
  if (!response.ok) {
    throw new Error(`API call failed: ${response.status}`);
  }
  
  return await response.json();
}

async function executeConditionStep(input: any, configuration: any): Promise<any> {
  const { condition, trueValue, falseValue } = configuration;
  
  // Simple condition evaluation
  const conditionResult = evaluateCondition(input, condition);
  
  return {
    conditionMet: conditionResult,
    result: conditionResult ? trueValue : falseValue
  };
}

async function executeLlmProcessingStep(input: any, configuration: any, llmService: any): Promise<any> {
  const { prompt, parameters } = configuration;
  
  const fullPrompt = prompt.replace(/\{(\w+)\}/g, (match: string, key: string) => {
    return input[key] || parameters[key] || match;
  });
  
  const llmResult = await llmService.generateContent(fullPrompt);
  
  return { llmResult };
}

/**
 * Generate workflow definition dynamically
 */
async function generateWorkflowDefinition(workflowId: string, llmService: any): Promise<any> {
  // Predefined workflow definitions for the demo
  const workflowDefinitions: Record<string, any> = {
    'add-numbers-workflow': {
      steps: [
        {
          id: 'add_step',
          type: 'calculation',
          configuration: {
            operation: 'add',
            operands: ['num1', 'num2']
          },
          dependencies: []
        },
        {
          id: 'cache_step',
          type: 'data_transformation',
          configuration: {
            transformationType: 'mapping',
            mapping: { result: 'cachedSum' }
          },
          dependencies: ['add_step']
        },
        {
          id: 'publish_step',
          type: 'api_call',
          configuration: {
            url: 'http://redis:6379',
            method: 'POST',
            operation: 'publish'
          },
          dependencies: ['cache_step']
        }
      ],
      metadata: {
        finalStep: 'publish_step',
        description: 'Add two numbers and publish result'
      }
    },
    'divide-number-workflow': {
      steps: [
        {
          id: 'receive_step',
          type: 'api_call',
          configuration: {
            url: 'http://redis:6379',
            method: 'GET',
            operation: 'subscribe'
          },
          dependencies: []
        },
        {
          id: 'divide_step',
          type: 'calculation',
          configuration: {
            operation: 'divide',
            operands: ['receivedNumber', 'divisor']
          },
          dependencies: ['receive_step']
        }
      ],
      metadata: {
        finalStep: 'divide_step',
        description: 'Receive number and divide by 2'
      }
    }
  };
  
  return workflowDefinitions[workflowId] || {
    steps: [],
    metadata: { description: 'Empty workflow definition' }
  };
}

/**
 * Execute workflow via Temporal client
 */
async function executeWorkflowViaTemporalClient(
  workflowId: string,
  input: any,
  executionId: string,
  fastify: FastifyInstance
): Promise<any> {
  // This would integrate with Temporal's client API
  // For now, return a mock result
  return {
    executionId,
    workflowId,
    status: 'completed',
    result: {
      message: `Workflow ${workflowId} executed successfully`,
      input,
      timestamp: Date.now()
    }
  };

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

/**
 * Simple condition evaluation
 */
function evaluateCondition(input: any, condition: string): boolean {
  // Simple condition parser - in production this would be more robust
  try {
    // Replace input variables in condition
    const evaluatedCondition = condition.replace(/\{(\w+)\}/g, (match, key) => {
      return input[key] !== undefined ? String(input[key]) : '0';
    });
    
    // Evaluate simple conditions like "5 > 3"
    return new Function(`return ${evaluatedCondition}`)();
  } catch {
    return false;
  }
}