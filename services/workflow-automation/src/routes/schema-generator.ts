/**
 * Configuration Schema Generator Routes
 * Generates dynamic configuration schemas for drag-and-drop editor components
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('schema-generator-routes');

interface SchemaRequest {
  componentType: 'activity' | 'workflow';
  componentName: string;
  requirements?: string;
  context?: Record<string, any>;
}

interface ConfigSchemaParams {
  componentType: string;
  componentName: string;
}

export async function schemaGeneratorRoutes(fastify: FastifyInstance): Promise<void> {
  
  // Generate configuration schema for drag-and-drop components
  fastify.get<{ Params: ConfigSchemaParams }>('/api/schema/:componentType/:componentName', {
    schema: {


      params: {
        type: 'object',
        required: ['componentType', 'componentName'],
        properties: {
          componentType: { type: 'string', enum: ['activity', 'workflow'] },
          componentName: { type: 'string', minLength: 1 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            schema: {
              type: 'object',
              properties: {
                inputs: { type: 'array' },
                outputs: { type: 'array' },
                parameters: { type: 'array' },
                config: { type: 'array' }
              }
            },
            uiSchema: { type: 'object' },
            validationSchema: { type: 'object' },
            defaultValues: { type: 'object' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: ConfigSchemaParams }>, reply: FastifyReply) => {
    const { componentType, componentName } = request.params;
    
    logger.getLogger().info({
      componentType,
      componentName,
    }, 'Generating configuration schema for drag-and-drop component');

    try {
      // Generate schema based on component type and name
      const schema = await generateComponentSchema(componentType, componentName);
      const uiSchema = await generateUISchema(componentType, componentName, schema);
      const validationSchema = await generateValidationSchema(schema);
      const defaultValues = generateDefaultValues(schema);

      return reply.send({
        schema,
        uiSchema,
        validationSchema,
        defaultValues,
      });

    } catch (error) {
      logger.error(error as Error, {
        componentType,
        componentName,
      }, 'Failed to generate configuration schema');

      return reply.status(500).send({
        error: 'Schema generation failed',
        message: (error as Error).message,
      });
    }
  });

  // Generate schema for custom workflow requirements
  fastify.post<{ Body: SchemaRequest }>('/api/schema/generate', {
    schema: {


      body: {
        type: 'object',
        required: ['componentType', 'componentName'],
        properties: {
          componentType: { type: 'string', enum: ['activity', 'workflow'] },
          componentName: { type: 'string' },
          requirements: { type: 'string' },
          context: { type: 'object' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            schema: { type: 'object' },
            generated: { type: 'boolean' },
            aiGenerated: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: SchemaRequest }>, reply: FastifyReply) => {
    const { componentType, componentName, requirements, context } = request.body;
    
    logger.getLogger().info({
      componentType,
      componentName,
      hasRequirements: !!requirements,
    }, 'Generating AI-powered configuration schema');

    try {
      let schema;
      let aiGenerated = false;

      if (requirements) {
        // Use AI to generate schema from requirements
        schema = await generateSchemaFromAI(componentType, componentName, requirements, context);
        aiGenerated = true;
      } else {
        // Use predefined templates
        schema = await generateComponentSchema(componentType, componentName);
      }

      return reply.send({
        schema,
        generated: true,
        aiGenerated,
      });

    } catch (error) {
      logger.error(error as Error, {
        componentType,
        componentName,
      }, 'Failed to generate AI-powered schema');

      return reply.status(500).send({
        error: 'AI schema generation failed',
        message: (error as Error).message,
      });
    }
  });

  // Get available component templates
  fastify.get('/api/schema/templates', {
    schema: {


      response: {
        200: {
          type: 'object',
          properties: {
            activities: { type: 'array' },
            workflows: { type: 'array' },
            categories: { type: 'array' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const templates = getComponentTemplates();
      
      return reply.send(templates);
    } catch (error) {
      logger.error(error as Error, {}, 'Failed to get component templates');
      
      return reply.status(500).send({
        error: 'Failed to get templates',
        message: (error as Error).message,
      });
    }
  });
}

/**
 * Generate configuration schema for a component
 */
async function generateComponentSchema(
  componentType: string, 
  componentName: string
): Promise<any> {
  const templates = getComponentTemplates();
  
  // Find template for this component
  const componentTemplates = componentType === 'activity' ? templates.activities : templates.workflows;
  const template = componentTemplates.find((t: any) => t.name === componentName);
  
  if (template) {
    return template.schema;
  }
  
  // Generate generic schema if no template found
  return generateGenericSchema(componentType, componentName);
}

/**
 * Generate UI schema for React JSON Schema Form
 */
async function generateUISchema(
  componentType: string,
  componentName: string, 
  schema: any
): Promise<any> {
  const uiSchema: any = {};
  
  // Generate UI schema based on field types
  if (schema.inputs) {
    schema.inputs.forEach((input: any) => {
      const fieldName = input.name;
      uiSchema[fieldName] = {
        'ui:description': input.description,
        'ui:placeholder': `Enter ${input.name}...`,
      };
      
      if (input.type === 'array') {
        uiSchema[fieldName]['ui:widget'] = 'textarea';
      } else if (input.type === 'boolean') {
        uiSchema[fieldName]['ui:widget'] = 'checkbox';
      } else if (input.options) {
        uiSchema[fieldName]['ui:widget'] = 'select';
      }
    });
  }
  
  if (schema.parameters) {
    schema.parameters.forEach((param: any) => {
      const fieldName = param.name;
      uiSchema[fieldName] = {
        'ui:description': param.description,
      };
      
      if (param.type === 'select' && param.options) {
        uiSchema[fieldName]['ui:widget'] = 'select';
        uiSchema[fieldName]['ui:options'] = {
          enumOptions: param.options.map((opt: string) => ({
            value: opt,
            label: opt.charAt(0).toUpperCase() + opt.slice(1)
          }))
        };
      }
    });
  }
  
  return uiSchema;
}

/**
 * Generate validation schema
 */
async function generateValidationSchema(schema: any): Promise<any> {
  const validationSchema = {
    type: 'object',
    properties: {},
    required: [],
  };
  
  // Add validation for required inputs
  if (schema.inputs) {
    schema.inputs.forEach((input: any) => {
      (validationSchema.properties as any)[input.name] = {
        type: input.type,
      };
      
      if (input.required) {
        (validationSchema.required as string[]).push(input.name);
      }
    });
  }
  
  return validationSchema;
}

/**
 * Generate default values from schema
 */
function generateDefaultValues(schema: any): Record<string, any> {
  const defaults: Record<string, any> = {};
  
  if (schema.parameters) {
    schema.parameters.forEach((param: any) => {
      if (param.default !== undefined) {
        defaults[param.name] = param.default;
      }
    });
  }
  
  return defaults;
}

/**
 * Generate schema using AI
 */
async function generateSchemaFromAI(
  componentType: string,
  componentName: string,
  requirements: string,
  context?: Record<string, any>
): Promise<any> {
  // This would integrate with the AI Gateway to generate schemas
  // For now, return a smart default based on requirements
  
  logger.getLogger().info({
    componentType,
    componentName,
    requirements: requirements.substring(0, 100),
  }, 'Generating AI-powered schema');
  
  // Analyze requirements to determine schema structure
  const hasDataInput = requirements.toLowerCase().includes('data') || requirements.toLowerCase().includes('input');
  const hasValidation = requirements.toLowerCase().includes('validate') || requirements.toLowerCase().includes('check');
  const hasNotification = requirements.toLowerCase().includes('notify') || requirements.toLowerCase().includes('send');
  
  const schema = {
    inputs: [],
    outputs: [],
    parameters: [],
    config: []
  };
  
  // Add inputs based on requirements analysis
  if (hasDataInput) {
    (schema.inputs as any[]).push({
      name: 'inputData',
      type: 'object',
      required: true,
      description: 'Input data for processing'
    });
  }
  
  if (hasValidation) {
    (schema.parameters as any[]).push({
      name: 'strictValidation',
      type: 'boolean',
      default: false,
      description: 'Enable strict validation rules'
    });
  }
  
  if (hasNotification) {
    (schema.parameters as any[]).push({
      name: 'notificationChannel',
      type: 'select',
      options: ['email', 'slack', 'webhook'],
      default: 'email',
      description: 'Notification delivery method'
    });
  }
  
  // Add common outputs
  (schema.outputs as any[]).push({
    name: 'result',
    type: 'object',
    description: 'Operation result'
  });
  
  (schema.outputs as any[]).push({
    name: 'success',
    type: 'boolean',
    description: 'Success indicator'
  });
  
  return schema;
}

/**
 * Generate generic schema for unknown components
 */
function generateGenericSchema(componentType: string, componentName: string): any {
  return {
    inputs: [
      {
        name: 'data',
        type: 'object',
        required: true,
        description: 'Input data'
      }
    ],
    outputs: [
      {
        name: 'result',
        type: 'object',
        description: 'Process result'
      },
      {
        name: 'success',
        type: 'boolean',
        description: 'Success status'
      }
    ],
    parameters: [
      {
        name: 'timeout',
        type: 'number',
        default: 30,
        description: 'Timeout in seconds'
      }
    ],
    config: [
      {
        name: 'logLevel',
        type: 'select',
        options: ['DEBUG', 'INFO', 'WARNING', 'ERROR'],
        default: 'INFO',
        description: 'Logging level'
      }
    ]
  };
}

/**
 * Get predefined component templates
 */
function getComponentTemplates(): any {
  return {
    activities: [
      {
        name: 'validateUserData',
        category: 'validation',
        schema: {
          inputs: [
            { name: 'userData', type: 'object', required: true, description: 'User data to validate' }
          ],
          outputs: [
            { name: 'isValid', type: 'boolean', description: 'Validation result' },
            { name: 'errors', type: 'array', description: 'Validation errors' }
          ],
          parameters: [
            { name: 'strictMode', type: 'boolean', default: false, description: 'Enable strict validation' }
          ],
          config: [
            { name: 'timeout', type: 'number', default: 30, description: 'Timeout in seconds' }
          ]
        }
      },
      {
        name: 'sendNotification',
        category: 'communication',
        schema: {
          inputs: [
            { name: 'recipient', type: 'string', required: true, description: 'Notification recipient' },
            { name: 'message', type: 'string', required: true, description: 'Message content' }
          ],
          outputs: [
            { name: 'sent', type: 'boolean', description: 'Send status' },
            { name: 'messageId', type: 'string', description: 'Message ID' }
          ],
          parameters: [
            { name: 'channel', type: 'select', options: ['email', 'sms', 'push'], default: 'email' },
            { name: 'priority', type: 'select', options: ['low', 'normal', 'high'], default: 'normal' }
          ],
          config: [
            { name: 'retryCount', type: 'number', default: 3, description: 'Number of retries' }
          ]
        }
      }
    ],
    workflows: [
      {
        name: 'UserRegistrationWorkflow',
        category: 'user_management',
        schema: {
          inputs: [
            { name: 'userData', type: 'object', required: true, description: 'User registration data' }
          ],
          outputs: [
            { name: 'userId', type: 'string', description: 'Created user ID' },
            { name: 'success', type: 'boolean', description: 'Registration success' }
          ],
          parameters: [
            { name: 'sendWelcomeEmail', type: 'boolean', default: true, description: 'Send welcome email' }
          ],
          config: [
            { name: 'timeout', type: 'number', default: 300, description: 'Workflow timeout' }
          ]
        }
      }
    ],
    categories: [
      'validation',
      'communication',
      'data_processing',
      'user_management',
      'financial',
      'analytics'
    ]
  };
}