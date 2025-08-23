/**
 * LLM Service - Professional OpenAI Integration
 * Handles all LLM interactions for workflow generation
 */

import axios, { AxiosInstance } from 'axios';
import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('llm-service');

export interface LLMConfig {
  apiUrl: string;
  model: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
}

export interface WorkflowGenerationRequest {
  requirements: string;
  context?: {
    integrationType?: 'kafka' | 'redis' | 'both' | 'none';
    dataFormat?: 'json' | 'avro' | 'protobuf';
    errorHandling?: 'retry' | 'dlq' | 'compensate';
    testCases?: string[];
  };
  iteration?: number;
  previousFeedback?: string;
}

export interface GeneratedWorkflow {
  name: string;
  description: string;
  activities: Activity[];
  configuration: WorkflowConfiguration;
  testCases: TestCase[];
  qualityScore: number;
  code: string;
}

export interface Activity {
  name: string;
  type: string;
  description: string;
  inputs: Parameter[];
  outputs: Parameter[];
  implementation: string;
  retryPolicy?: RetryPolicy;
}

export interface Parameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  validation?: string;
}

export interface RetryPolicy {
  initialInterval: string;
  maximumAttempts: number;
  backoffCoefficient: number;
  maximumInterval?: string;
}

export interface WorkflowConfiguration {
  integrations: {
    kafka?: KafkaConfig;
    redis?: RedisConfig;
  };
  errorHandling: ErrorHandlingConfig;
  monitoring: MonitoringConfig;
}

export interface KafkaConfig {
  enabled: boolean;
  topics: {
    input?: string;
    output?: string;
    error?: string;
  };
  consumerGroup?: string;
  producerOptions?: Record<string, any>;
}

export interface RedisConfig {
  enabled: boolean;
  channels: {
    input?: string;
    output?: string;
    status?: string;
  };
  keyPrefix?: string;
  ttl?: number;
}

export interface ErrorHandlingConfig {
  strategy: 'retry' | 'dlq' | 'compensate' | 'circuit-breaker';
  maxRetries?: number;
  retryDelay?: number;
  deadLetterQueue?: string;
  compensationWorkflow?: string;
}

export interface MonitoringConfig {
  metricsEnabled: boolean;
  tracingEnabled: boolean;
  loggingLevel: string;
  alerting?: {
    errorThreshold: number;
    latencyThreshold: number;
  };
}

export interface TestCase {
  name: string;
  description: string;
  input: any;
  expectedOutput: any;
  assertions: string[];
}

export class LLMService {
  private client: AxiosInstance;
  private config: LLMConfig;

  constructor(config?: LLMConfig) {
    this.config = config || {
      apiUrl: process.env.OPENAI_API_URL || 'http://host.docker.internal:4000/openai/v1',
      model: process.env.OPENAI_MODEL || 'vscode-lm-proxy',
      apiKey: process.env.OPENAI_API_KEY || 'sk-123456',
      temperature: 0.7,
      maxTokens: 4000
    };

    this.client = axios.create({
      baseURL: this.config.apiUrl,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    logger.info('LLM Service initialized', {
      apiUrl: this.config.apiUrl,
      model: this.config.model
    });
  }

  /**
   * Generate a workflow based on requirements
   */
  async generateWorkflow(request: WorkflowGenerationRequest): Promise<GeneratedWorkflow> {
    try {
      const prompt = this.buildWorkflowPrompt(request);
      
      logger.info('Generating workflow with LLM', {
        requirements: request.requirements.substring(0, 100),
        iteration: request.iteration || 1
      });

      const response = await this.client.post('/chat/completions', {
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        response_format: { type: 'json_object' }
      });

      const generatedContent = response.data.choices[0].message.content;
      const workflow = JSON.parse(generatedContent) as GeneratedWorkflow;

      // Validate and enhance the generated workflow
      workflow.qualityScore = this.calculateQualityScore(workflow, request);
      workflow.code = this.generateTemporalCode(workflow);

      logger.info('Workflow generated successfully', {
        name: workflow.name,
        activities: workflow.activities.length,
        qualityScore: workflow.qualityScore
      });

      return workflow;
    } catch (error) {
      logger.error('Failed to generate workflow', error);
      throw new Error(`Workflow generation failed: ${error.message}`);
    }
  }

  /**
   * Build optimized prompt for workflow generation
   */
  private buildWorkflowPrompt(request: WorkflowGenerationRequest): string {
    const { requirements, context, iteration = 1, previousFeedback } = request;

    let prompt = `Generate a production-ready Temporal workflow based on these requirements:

REQUIREMENTS:
${requirements}

CONTEXT:
- Integration Type: ${context?.integrationType || 'none'}
- Data Format: ${context?.dataFormat || 'json'}
- Error Handling: ${context?.errorHandling || 'retry'}
- Iteration: ${iteration}/10
${previousFeedback ? `\nPREVIOUS FEEDBACK:\n${previousFeedback}` : ''}

CONSTRAINTS:
1. Create modular, reusable activities
2. Include proper error handling and retry policies
3. Add comprehensive test cases
4. Include integration configurations if specified
5. Follow Temporal best practices
6. Ensure all activities are idempotent
7. Include proper logging and monitoring

${context?.integrationType === 'kafka' ? `
KAFKA INTEGRATION:
- Configure topics for input/output
- Handle consumer group management
- Include error topic for failed messages
- Implement exactly-once semantics where possible
` : ''}

${context?.integrationType === 'redis' ? `
REDIS INTEGRATION:
- Configure pub/sub channels
- Implement caching strategies
- Handle connection pooling
- Include TTL configurations
` : ''}

${context?.testCases ? `
TEST SCENARIOS TO COVER:
${context.testCases.map((tc, i) => `${i + 1}. ${tc}`).join('\n')}
` : ''}

OUTPUT FORMAT:
Return a JSON object with the complete workflow definition including all activities, configurations, and test cases.`;

    return prompt;
  }

  /**
   * Get system prompt for workflow generation
   */
  private getSystemPrompt(): string {
    return `You are an expert Temporal workflow architect and TypeScript developer. Your role is to generate production-ready, modular workflows with comprehensive activities and configurations.

KEY RESPONSIBILITIES:
1. Generate complete, executable Temporal workflows
2. Create reusable, well-documented activities
3. Implement proper error handling and retry strategies
4. Design comprehensive test cases
5. Configure integrations (Kafka/Redis) when requested
6. Follow SOLID principles and best practices
7. Ensure idempotency and fault tolerance

RESPONSE FORMAT:
Always return a valid JSON object with this structure:
{
  "name": "workflow-name",
  "description": "detailed description",
  "activities": [
    {
      "name": "activity-name",
      "type": "processing|validation|integration|notification",
      "description": "activity description",
      "inputs": [{"name": "param", "type": "string", "required": true, "description": "..."}],
      "outputs": [{"name": "result", "type": "any", "required": true, "description": "..."}],
      "implementation": "actual TypeScript code",
      "retryPolicy": {
        "initialInterval": "1s",
        "maximumAttempts": 3,
        "backoffCoefficient": 2
      }
    }
  ],
  "configuration": {
    "integrations": {
      "kafka": {"enabled": false, "topics": {}},
      "redis": {"enabled": false, "channels": {}}
    },
    "errorHandling": {
      "strategy": "retry",
      "maxRetries": 3
    },
    "monitoring": {
      "metricsEnabled": true,
      "tracingEnabled": true,
      "loggingLevel": "info"
    }
  },
  "testCases": [
    {
      "name": "test-name",
      "description": "test description",
      "input": {},
      "expectedOutput": {},
      "assertions": ["assertion1", "assertion2"]
    }
  ]
}`;
  }

  /**
   * Calculate quality score for generated workflow
   */
  private calculateQualityScore(workflow: GeneratedWorkflow, request: WorkflowGenerationRequest): number {
    let score = 0;
    const weights = {
      hasActivities: 0.2,
      hasTestCases: 0.2,
      hasErrorHandling: 0.15,
      hasIntegration: 0.15,
      hasDocumentation: 0.15,
      hasRetryPolicies: 0.15
    };

    // Check for activities
    if (workflow.activities && workflow.activities.length > 0) {
      score += weights.hasActivities;
    }

    // Check for test cases
    if (workflow.testCases && workflow.testCases.length > 0) {
      score += weights.hasTestCases * Math.min(workflow.testCases.length / 3, 1);
    }

    // Check for error handling
    if (workflow.configuration?.errorHandling) {
      score += weights.hasErrorHandling;
    }

    // Check for integration configuration
    if (request.context?.integrationType !== 'none') {
      const hasIntegration = 
        (request.context?.integrationType === 'kafka' && workflow.configuration?.integrations?.kafka?.enabled) ||
        (request.context?.integrationType === 'redis' && workflow.configuration?.integrations?.redis?.enabled);
      
      if (hasIntegration) {
        score += weights.hasIntegration;
      }
    } else {
      score += weights.hasIntegration; // Full score if no integration required
    }

    // Check for documentation
    const hasDocumentation = workflow.activities.every(a => 
      a.description && a.inputs.every(i => i.description) && a.outputs.every(o => o.description)
    );
    if (hasDocumentation) {
      score += weights.hasDocumentation;
    }

    // Check for retry policies
    const hasRetryPolicies = workflow.activities.some(a => a.retryPolicy);
    if (hasRetryPolicies) {
      score += weights.hasRetryPolicies;
    }

    return Math.round(score * 100) / 100;
  }

  /**
   * Generate executable Temporal code
   */
  private generateTemporalCode(workflow: GeneratedWorkflow): string {
    const code = `
import { proxyActivities, sleep } from '@temporalio/workflow';
import type * as activities from './activities';

const { ${workflow.activities.map(a => a.name).join(', ')} } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '1s',
    maximumAttempts: 3,
    backoffCoefficient: 2,
  },
});

export async function ${workflow.name}(input: any): Promise<any> {
  const results: any = {};
  
  try {
    ${workflow.activities.map((activity, index) => `
    // ${activity.description}
    results.${activity.name} = await ${activity.name}(${
      index === 0 ? 'input' : `results.${workflow.activities[index - 1].name}`
    });
    `).join('\n')}
    
    return {
      success: true,
      results,
      workflow: '${workflow.name}',
      timestamp: Date.now()
    };
  } catch (error) {
    throw new Error(\`Workflow ${workflow.name} failed: \${error.message}\`);
  }
}`;

    return code;
  }

  /**
   * Improve workflow based on feedback
   */
  async improveWorkflow(
    workflow: GeneratedWorkflow,
    feedback: string,
    iteration: number
  ): Promise<GeneratedWorkflow> {
    const request: WorkflowGenerationRequest = {
      requirements: workflow.description,
      context: {
        integrationType: workflow.configuration.integrations.kafka?.enabled ? 'kafka' :
                        workflow.configuration.integrations.redis?.enabled ? 'redis' : 'none',
        errorHandling: workflow.configuration.errorHandling.strategy as any
      },
      iteration,
      previousFeedback: feedback
    };

    return this.generateWorkflow(request);
  }

  /**
   * Generate text using LLM - for activity code generation
   */
  async generateText(prompt: string): Promise<string> {
    try {
      logger.info('Generating text with LLM', {
        promptLength: prompt.length
      });

      const response = await this.client.post('/chat/completions', {
        model: this.config.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens
      });

      const generatedContent = response.data.choices[0].message.content;
      
      logger.info('Text generated successfully', {
        responseLength: generatedContent?.length || 0
      });

      return generatedContent;
    } catch (error) {
      logger.error('Failed to generate text with LLM', error);
      throw new Error(`Text generation failed: ${error.message}`);
    }
  }

  /**
   * Phase 1: Plan workflow activities - analyze requirements and propose activity structure
   */
  async planWorkflowActivities(workflowSpec: any): Promise<any> {
    try {
      logger.info('🎯 PHASE 1: Planning workflow activities with LLM', {
        workflowName: workflowSpec.name,
        domain: workflowSpec.domain,
        requirements: workflowSpec.requirements?.substring(0, 200),
        inputs: workflowSpec.inputs,
        outputs: workflowSpec.outputs
      });

      const planningPrompt = `
You are a workflow planning expert. Analyze the following requirements and create a detailed plan for implementing this workflow.

WORKFLOW SPECIFICATION:
Name: ${workflowSpec.name}
Description: ${workflowSpec.description}
Requirements: ${workflowSpec.requirements}
Domain: ${workflowSpec.domain}
Inputs: ${JSON.stringify(workflowSpec.inputs, null, 2)}
Outputs: ${JSON.stringify(workflowSpec.outputs, null, 2)}
Tags: ${workflowSpec.tags?.join(', ')}

TASK: Create a detailed execution plan with specific activities.

RESPOND WITH JSON ONLY:
{
  "activityCount": <number of activities needed>,
  "activities": [
    {
      "id": "<unique_activity_id>",
      "name": "<descriptive_activity_name>",
      "type": "<activity_type: validation|calculation|processing|formatting>",
      "description": "<what this activity does>",
      "inputs": ["<input1>", "<input2>"],
      "outputs": ["<output1>", "<output2>"],
      "implementation_notes": "<specific implementation guidance>",
      "validation_rules": ["<rule1>", "<rule2>"],
      "error_cases": ["<error1>", "<error2>"]
    }
  ],
  "execution_flow": "<description of how activities connect>",
  "data_flow": "<description of data passing between activities>"
}

IMPORTANT: 
- For ${workflowSpec.domain} domain, create domain-specific activities
- Each activity should have a clear, single responsibility
- Plan 2-5 activities maximum for simplicity
- Use descriptive names that reflect the actual mathematical/business operation
- Include specific validation and error handling requirements
`;

      logger.info('📝 PLANNING PROMPT (first 500 chars):', {
        prompt: planningPrompt.substring(0, 500)
      });

      logger.info('🔌 Calling LLM API for planning:', {
        url: this.config.apiUrl,
        endpoint: '/chat/completions',
        model: this.config.model
      });

      const response = await this.client.post('/chat/completions', {
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a workflow planning expert. Respond only with valid JSON as specified.'
          },
          {
            role: 'user',
            content: planningPrompt
          }
        ],
        temperature: 0.3, // Lower temperature for more consistent planning
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      });

      logger.info('📥 LLM Planning Response received:', {
        status: response.status,
        hasContent: !!response.data?.choices?.[0]?.message?.content,
        contentLength: response.data?.choices?.[0]?.message?.content?.length
      });

      const planContent = response.data.choices[0].message.content;
      
      logger.info('📋 RAW LLM PLAN RESPONSE (first 1000 chars):', {
        content: planContent.substring(0, 1000)
      });

      const plan = JSON.parse(planContent);
      
      logger.info('✅ Workflow plan parsed successfully', {
        activityCount: plan.activityCount,
        activities: plan.activities?.map(a => ({ name: a.name, type: a.type, id: a.id })),
        executionFlow: plan.execution_flow?.substring(0, 200),
        dataFlow: plan.data_flow?.substring(0, 200)
      });

      return plan;
    } catch (error) {
      logger.error('❌ Failed to plan workflow activities', {
        error: error.message,
        stack: error.stack,
        response: error.response?.data
      });
      throw new Error(`Workflow planning failed: ${error.message}`);
    }
  }

  /**
   * Phase 2: Generate individual activity code based on detailed specification
   */
  async generateActivityCode(activitySpec: any, workflowContext: any): Promise<string> {
    try {
      logger.info('🎯 PHASE 2: Generating individual activity code', {
        activityName: activitySpec.name,
        activityType: activitySpec.type,
        activityId: activitySpec.id,
        inputs: activitySpec.inputs,
        outputs: activitySpec.outputs,
        implementationNotes: activitySpec.implementation_notes
      });

      const codePrompt = `
Generate JavaScript code for this specific activity:

ACTIVITY SPECIFICATION:
Name: ${activitySpec.name}
Type: ${activitySpec.type}
Description: ${activitySpec.description}
Inputs: ${JSON.stringify(activitySpec.inputs)}
Outputs: ${JSON.stringify(activitySpec.outputs)}
Implementation Notes: ${activitySpec.implementation_notes}
Validation Rules: ${JSON.stringify(activitySpec.validation_rules)}
Error Cases: ${JSON.stringify(activitySpec.error_cases)}

WORKFLOW CONTEXT:
Domain: ${workflowContext.domain}
Requirements: ${workflowContext.requirements}

REQUIREMENTS:
1. Generate a JavaScript function that performs EXACTLY what is described
2. Function should be named based on the activity name
3. Include proper input validation as specified
4. Handle all mentioned error cases
5. Return outputs in the exact format specified
6. Add appropriate logging for debugging
7. Use modern JavaScript (ES6+)

RESPOND WITH JAVASCRIPT CODE ONLY (no markdown, no explanations):
`;

      logger.info('📝 CODE GENERATION PROMPT (first 500 chars):', {
        prompt: codePrompt.substring(0, 500)
      });

      logger.info('🔌 Calling LLM API for code generation:', {
        activityName: activitySpec.name,
        temperature: 0.1,
        maxTokens: 1500
      });

      const response = await this.client.post('/chat/completions', {
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a JavaScript code generator. Respond only with executable JavaScript code, no markdown formatting or explanations.'
          },
          {
            role: 'user',
            content: codePrompt
          }
        ],
        temperature: 0.1, // Very low temperature for consistent code generation
        max_tokens: 1500
      });

      logger.info('📥 LLM Code Response received:', {
        activityName: activitySpec.name,
        status: response.status,
        hasContent: !!response.data?.choices?.[0]?.message?.content,
        contentLength: response.data?.choices?.[0]?.message?.content?.length
      });

      const generatedCode = response.data.choices[0].message.content.trim();
      
      logger.info('📋 GENERATED CODE (first 500 chars):', {
        activityName: activitySpec.name,
        code: generatedCode.substring(0, 500)
      });

      return generatedCode;
    } catch (error) {
      logger.error('❌ Failed to generate activity code', {
        activityName: activitySpec.name,
        error: error.message,
        stack: error.stack,
        response: error.response?.data
      });
      throw new Error(`Activity code generation failed: ${error.message}`);
    }
  }
}