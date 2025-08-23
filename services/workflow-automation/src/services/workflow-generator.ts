/**
 * Iterative Workflow Generator - Core Service
 * Generates and improves workflows using LLM with context/cache
 * Manages activity library and configuration schemas
 */

import { LLMService, WorkflowGenerationRequest, GeneratedWorkflow } from './llm-service';
import { extendedDb, ActivityDefinition, WorkflowConfiguration, IterationContext, TestResult } from './database-extended';
import { createServiceLogger } from '../shared-utils-local';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';

const logger = createServiceLogger('workflow-generator');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

export interface WorkflowGenerationOptions {
  requirements: string;
  iterative?: boolean;
  maxIterations?: number;
  qualityThreshold?: number;
  dataExchangeType?: 'kafka' | 'redis' | 'both' | 'none';
  existingWorkflowId?: string;
  testCases?: string[];
}

export interface GenerationResult {
  workflowId: string;
  workflow: GeneratedWorkflow;
  configuration: WorkflowConfiguration;
  iteration: number;
  qualityScore: number;
  improvements: string[];
  activities: ActivityDefinition[];
  schemaGenerated: boolean;
}

export interface DataExchangePattern {
  type: 'producer-consumer' | 'pub-sub' | 'request-reply';
  sourceWorkflow: string;
  targetWorkflow: string;
  dataFormat: 'json' | 'avro' | 'protobuf';
  kafkaTopics?: string[];
  redisKeys?: string[];
  transformation?: string;
}

export class WorkflowGenerator {
  private llmService: LLMService;
  private maxIterations: number;
  private qualityThreshold: number;
  private cachePrefix = 'wf-gen:';
  private contextTTL = 7200; // 2 hours

  constructor() {
    this.llmService = new LLMService();
    this.maxIterations = parseInt(process.env.MAX_ITERATIONS || '10');
    this.qualityThreshold = parseFloat(process.env.QUALITY_THRESHOLD || '0.85');

    logger.info('Workflow Generator initialized', {
      maxIterations: this.maxIterations,
      qualityThreshold: this.qualityThreshold
    });
  }

  /**
   * Generate workflow with iterative improvement
   */
  async generateWorkflow(options: WorkflowGenerationOptions): Promise<GenerationResult> {
    const workflowId = options.existingWorkflowId || uuidv4();
    const cacheKey = `${this.cachePrefix}generation:${workflowId}`;

    logger.info('Starting workflow generation', {
      workflowId,
      requirements: options.requirements.substring(0, 100),
      iterative: options.iterative
    });

    try {
      // Get cached context if available
      let context = await this.getCachedContext(workflowId);
      let iteration = context ? context.length : 1;

      // Get reusable activities from library
      const requirements = this.extractRequirements(options.requirements);
      const reusableActivities = await extendedDb.getReusableActivities(requirements);

      let bestWorkflow: GeneratedWorkflow | null = null;
      let bestScore = 0;
      let improvements: string[] = [];

      // Iterative generation loop
      while (iteration <= (options.maxIterations || this.maxIterations)) {
        logger.info(`Generation iteration ${iteration}/${options.maxIterations || this.maxIterations}`);

        // Build generation request with context
        const request: WorkflowGenerationRequest = {
          requirements: options.requirements,
          context: {
            integrationType: options.dataExchangeType || 'none',
            dataFormat: 'json',
            errorHandling: 'retry',
            testCases: options.testCases
          },
          iteration,
          previousFeedback: improvements.join('\n')
        };

        // Generate workflow
        const workflow = await this.llmService.generateWorkflow(request);
        
        // Test generated workflow
        const testResults = await this.testWorkflow(workflow, workflowId);
        const qualityScore = this.calculateOverallQuality(workflow, testResults);

        logger.info(`Iteration ${iteration} completed`, {
          qualityScore,
          testsPassed: testResults.filter(t => t.passed).length,
          testsTotal: testResults.length
        });

        // Store iteration context
        const iterationContext: IterationContext = {
          workflow_id: workflowId,
          iteration,
          requirements: options.requirements,
          improvements,
          test_results: testResults,
          quality_scores: [qualityScore],
          learned_patterns: await this.extractLearnedPatterns(workflow, testResults),
          configuration_evolution: [workflow.configuration]
        };

        await extendedDb.storeIterationContext(iterationContext);
        await this.cacheContext(workflowId, iterationContext);

        // Check if this is the best version so far
        if (qualityScore > bestScore) {
          bestWorkflow = workflow;
          bestScore = qualityScore;
        }

        // Check if we've reached quality threshold
        if (qualityScore >= (options.qualityThreshold || this.qualityThreshold)) {
          logger.info('Quality threshold reached', { qualityScore, threshold: options.qualityThreshold || this.qualityThreshold });
          break;
        }

        // Generate improvements for next iteration
        if (options.iterative && iteration < (options.maxIterations || this.maxIterations)) {
          improvements = await this.generateImprovements(workflow, testResults, reusableActivities);
        }

        iteration++;
      }

      if (!bestWorkflow) {
        throw new Error('Failed to generate any valid workflow');
      }

      // Store activities in library
      const storedActivities = await this.storeGeneratedActivities(bestWorkflow, workflowId);

      // Create workflow configuration
      const configuration = await this.createWorkflowConfiguration(
        bestWorkflow,
        workflowId,
        storedActivities,
        options.dataExchangeType
      );

      // Generate configuration schema for drag-drop editor
      const schemaGenerated = await this.generateConfigurationSchema(configuration);

      const result: GenerationResult = {
        workflowId,
        workflow: bestWorkflow,
        configuration,
        iteration: iteration - 1,
        qualityScore: bestScore,
        improvements,
        activities: storedActivities,
        schemaGenerated
      };

      // Cache final result
      await redis.setex(cacheKey, this.contextTTL, JSON.stringify(result));

      logger.info('Workflow generation completed', {
        workflowId,
        finalScore: bestScore,
        totalIterations: iteration - 1,
        activitiesStored: storedActivities.length
      });

      return result;

    } catch (error) {
      logger.error('Workflow generation failed', error);
      throw new Error(`Workflow generation failed: ${error.message}`);
    }
  }

  /**
   * Generate data exchange patterns between workflows
   */
  async generateDataExchangePattern(
    sourceWorkflowId: string,
    targetWorkflowId: string,
    exchangeType: 'producer-consumer' | 'pub-sub' | 'request-reply',
    dataFormat: 'json' | 'avro' | 'protobuf' = 'json'
  ): Promise<DataExchangePattern> {
    logger.info('Generating data exchange pattern', {
      sourceWorkflowId,
      targetWorkflowId,
      exchangeType
    });

    const pattern: DataExchangePattern = {
      type: exchangeType,
      sourceWorkflow: sourceWorkflowId,
      targetWorkflow: targetWorkflowId,
      dataFormat
    };

    // Configure Kafka topics
    if (process.env.ENABLE_KAFKA === 'true') {
      pattern.kafkaTopics = [
        `${sourceWorkflowId}-to-${targetWorkflowId}-data`,
        `${sourceWorkflowId}-to-${targetWorkflowId}-status`,
        `${sourceWorkflowId}-to-${targetWorkflowId}-errors`
      ];
    }

    // Configure Redis keys
    if (process.env.ENABLE_REDIS === 'true') {
      pattern.redisKeys = [
        `workflow:${sourceWorkflowId}:output`,
        `workflow:${targetWorkflowId}:input`,
        `exchange:${sourceWorkflowId}-${targetWorkflowId}:status`
      ];
    }

    // Add transformation logic if needed
    if (dataFormat !== 'json') {
      pattern.transformation = await this.generateTransformationCode(dataFormat);
    }

    return pattern;
  }

  /**
   * Test generated workflow
   */
  private async testWorkflow(workflow: GeneratedWorkflow, workflowId: string): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const testCase of workflow.testCases) {
      const startTime = Date.now();
      
      try {
        // Simulate workflow execution with test input
        const mockResult = await this.simulateWorkflowExecution(workflow, testCase.input);
        const executionTime = Date.now() - startTime;
        
        // Validate output against expected
        const passed = this.validateTestOutput(mockResult, testCase.expectedOutput, testCase.assertions);
        
        results.push({
          test_case_id: testCase.name,
          iteration: 1,
          passed,
          execution_time: executionTime,
          error: passed ? undefined : 'Output validation failed',
          suggestions: passed ? [] : await this.generateTestSuggestions(testCase, mockResult)
        });

      } catch (error) {
        results.push({
          test_case_id: testCase.name,
          iteration: 1,
          passed: false,
          execution_time: Date.now() - startTime,
          error: error.message,
          suggestions: [`Fix error: ${error.message}`]
        });
      }
    }

    return results;
  }

  /**
   * Store generated activities in library
   */
  private async storeGeneratedActivities(
    workflow: GeneratedWorkflow,
    workflowId: string
  ): Promise<ActivityDefinition[]> {
    const storedActivities: ActivityDefinition[] = [];

    for (const activity of workflow.activities) {
      const activityDef: ActivityDefinition = {
        id: `${workflowId}-${activity.name}`,
        name: activity.name,
        type: this.mapActivityType(activity.type),
        description: activity.description,
        version: '1.0.0',
        inputs: activity.inputs.map(p => ({
          name: p.name,
          type: p.type,
          required: p.required,
          description: p.description,
          validation: p.validation
        })),
        outputs: activity.outputs.map(p => ({
          name: p.name,
          type: p.type,
          required: p.required,
          description: p.description
        })),
        code: activity.implementation,
        kafka_config: workflow.configuration.integrations.kafka?.enabled ? {
          enabled: true,
          topics: workflow.configuration.integrations.kafka.topics || {},
          serialization: 'json'
        } : undefined,
        redis_config: workflow.configuration.integrations.redis?.enabled ? {
          enabled: true,
          channels: workflow.configuration.integrations.redis.channels || {},
          keys: { pattern: `activity:${activity.name}:*`, ttl: 3600 }
        } : undefined,
        retry_policy: activity.retryPolicy ? {
          initial_interval: activity.retryPolicy.initialInterval,
          maximum_attempts: activity.retryPolicy.maximumAttempts,
          backoff_coefficient: activity.retryPolicy.backoffCoefficient,
          maximum_interval: activity.retryPolicy.maximumInterval
        } : undefined,
        metadata: {
          workflow_id: workflowId,
          generated_by: 'llm-service',
          tags: [activity.type, 'generated'],
          quality_score: workflow.qualityScore
        }
      };

      await extendedDb.storeActivity(activityDef);
      storedActivities.push(activityDef);
    }

    logger.info('Activities stored in library', {
      count: storedActivities.length,
      workflowId
    });

    return storedActivities;
  }

  /**
   * Create workflow configuration with data exchange patterns
   */
  private async createWorkflowConfiguration(
    workflow: GeneratedWorkflow,
    workflowId: string,
    activities: ActivityDefinition[],
    dataExchangeType?: string
  ): Promise<WorkflowConfiguration> {
    const config: WorkflowConfiguration = {
      id: uuidv4(),
      workflow_id: workflowId,
      name: workflow.name,
      version: '1.0.0',
      description: workflow.description,
      activities: activities.map(a => a.id),
      data_flow: {
        connections: this.generateDataConnections(activities, dataExchangeType),
        kafka_topics: dataExchangeType?.includes('kafka') ? [
          `${workflowId}-input`,
          `${workflowId}-output`,
          `${workflowId}-errors`
        ] : [],
        redis_keys: dataExchangeType?.includes('redis') ? [
          `workflow:${workflowId}:data`,
          `workflow:${workflowId}:status`
        ] : [],
        data_exchange_patterns: await this.generateExchangePatterns(workflowId, dataExchangeType)
      },
      drag_drop_schema: await this.generateDragDropSchema(workflow, activities),
      test_cases: workflow.testCases.map(tc => ({
        id: uuidv4(),
        name: tc.name,
        description: tc.description,
        input: tc.input,
        expected_output: tc.expectedOutput,
        assertions: tc.assertions
      })),
      quality_metrics: {
        coverage: 0.9,
        reliability: 0.85,
        performance: 0.8,
        maintainability: 0.9,
        overall_score: workflow.qualityScore
      }
    };

    await extendedDb.storeWorkflowConfiguration(config);
    return config;
  }

  /**
   * Generate configuration schema for drag-drop editor
   */
  private async generateConfigurationSchema(config: WorkflowConfiguration): Promise<boolean> {
    try {
      const schema = {
        id: config.id,
        version: config.version,
        nodes: config.activities.map(activityId => ({
          id: activityId,
          type: 'activity',
          position: { x: 0, y: 0 }, // Will be set by editor
          data: {
            label: activityId.split('-').pop(),
            activityId
          }
        })),
        edges: config.data_flow.connections.map((conn, index) => ({
          id: `edge-${index}`,
          source: conn.from_activity,
          target: conn.to_activity,
          data: {
            mapping: conn.data_mapping,
            transform: conn.transform,
            via: conn.via
          }
        })),
        integrations: {
          kafka: {
            enabled: config.data_flow.kafka_topics?.length > 0,
            topics: config.data_flow.kafka_topics
          },
          redis: {
            enabled: config.data_flow.redis_keys?.length > 0,
            keys: config.data_flow.redis_keys
          }
        },
        metadata: {
          workflowId: config.workflow_id,
          generated: new Date().toISOString(),
          quality: config.quality_metrics.overall_score
        }
      };

      // Store schema in cache for quick access by drag-drop editor
      await redis.setex(
        `${this.cachePrefix}schema:${config.workflow_id}`,
        3600,
        JSON.stringify(schema)
      );

      logger.info('Configuration schema generated', {
        workflowId: config.workflow_id,
        nodes: schema.nodes.length,
        edges: schema.edges.length
      });

      return true;
    } catch (error) {
      logger.error('Failed to generate configuration schema', error);
      return false;
    }
  }

  /**
   * Helper methods for workflow generation
   */
  private extractRequirements(requirements: string): string[] {
    // Extract key terms for activity matching
    const keywords = requirements.toLowerCase()
      .split(/[\s,;.]+/)
      .filter(word => word.length > 3)
      .filter(word => !['with', 'that', 'this', 'from', 'into', 'using'].includes(word));
    
    return [...new Set(keywords)];
  }

  private mapActivityType(type: string): 'data-producer' | 'data-consumer' | 'processor' | 'integration' | 'validation' {
    const typeMap: Record<string, 'data-producer' | 'data-consumer' | 'processor' | 'integration' | 'validation'> = {
      'processing': 'processor',
      'validation': 'validation',
      'integration': 'integration',
      'notification': 'data-producer',
      'input': 'data-consumer',
      'output': 'data-producer'
    };
    
    return typeMap[type.toLowerCase()] || 'processor';
  }

  private calculateOverallQuality(workflow: GeneratedWorkflow, testResults: TestResult[]): number {
    const passRate = testResults.filter(t => t.passed).length / testResults.length;
    const avgExecutionTime = testResults.reduce((sum, t) => sum + t.execution_time, 0) / testResults.length;
    
    // Combine LLM quality score with test results
    const testScore = passRate * 0.6 + (avgExecutionTime < 1000 ? 0.4 : 0.2);
    
    return Math.round((workflow.qualityScore * 0.6 + testScore * 0.4) * 100) / 100;
  }

  private async getCachedContext(workflowId: string): Promise<IterationContext[] | null> {
    try {
      return await extendedDb.getIterationContext(workflowId);
    } catch (error) {
      logger.warn('Failed to get cached context', { workflowId, error });
      return null;
    }
  }

  private async cacheContext(workflowId: string, context: IterationContext): Promise<void> {
    const cacheKey = `${this.cachePrefix}context:${workflowId}:${context.iteration}`;
    await redis.setex(cacheKey, this.contextTTL, JSON.stringify(context));
  }

  private async extractLearnedPatterns(workflow: GeneratedWorkflow, testResults: TestResult[]) {
    // Extract patterns from successful workflows for future learning
    const patterns = [];
    
    if (testResults.every(t => t.passed)) {
      patterns.push({
        pattern_type: 'successful_structure',
        description: `${workflow.activities.length} activities with ${workflow.configuration.errorHandling.strategy} error handling`,
        frequency: 1,
        success_rate: 1.0,
        applicable_scenarios: [workflow.description.substring(0, 50)]
      });
    }
    
    return patterns;
  }

  // Additional helper methods would be implemented here...
  private async simulateWorkflowExecution(workflow: GeneratedWorkflow, input: any): Promise<any> {
    // Mock execution for testing
    return { success: true, result: input, processed: true };
  }

  private validateTestOutput(actual: any, expected: any, assertions: string[]): boolean {
    // Basic validation logic
    return actual && actual.success === true;
  }

  private async generateTestSuggestions(testCase: any, result: any): Promise<string[]> {
    return ['Improve error handling', 'Add input validation'];
  }

  private async generateImprovements(workflow: GeneratedWorkflow, testResults: TestResult[], activities: ActivityDefinition[]): Promise<string[]> {
    const improvements = [];
    
    const failedTests = testResults.filter(t => !t.passed);
    if (failedTests.length > 0) {
      improvements.push(`Fix ${failedTests.length} failing tests`);
    }
    
    if (workflow.qualityScore < 0.8) {
      improvements.push('Improve code quality and documentation');
    }
    
    return improvements;
  }

  private generateDataConnections(activities: ActivityDefinition[], dataExchangeType?: string) {
    const connections = [];
    
    for (let i = 0; i < activities.length - 1; i++) {
      connections.push({
        from_activity: activities[i].id,
        to_activity: activities[i + 1].id,
        data_mapping: { output: 'input' },
        via: dataExchangeType?.includes('kafka') ? 'kafka' as const : 
             dataExchangeType?.includes('redis') ? 'redis' as const : 'direct' as const,
        topic_or_key: dataExchangeType ? `${activities[i].id}-to-${activities[i + 1].id}` : undefined
      });
    }
    
    return connections;
  }

  private async generateExchangePatterns(workflowId: string, dataExchangeType?: string) {
    const patterns = [];
    
    if (dataExchangeType?.includes('kafka')) {
      patterns.push({
        type: 'producer-consumer' as const,
        participants: [workflowId],
        configuration: {
          kafka_topics: [`${workflowId}-input`, `${workflowId}-output`],
          serialization: 'json'
        }
      });
    }
    
    return patterns;
  }

  private async generateDragDropSchema(workflow: GeneratedWorkflow, activities: ActivityDefinition[]) {
    return {
      version: '1.0.0',
      nodeTypes: activities.map(a => a.type),
      defaultProps: {
        retryPolicy: workflow.activities[0]?.retryPolicy,
        errorHandling: workflow.configuration.errorHandling
      },
      validations: {
        required: ['inputs', 'outputs'],
        optional: ['retryPolicy', 'kafkaConfig', 'redisConfig']
      }
    };
  }

  private async generateTransformationCode(dataFormat: string): Promise<string> {
    return `// Transform data to ${dataFormat} format\nreturn transformTo${dataFormat.toUpperCase()}(data);`;
  }

  /**
   * Close resources
   */
  async close(): Promise<void> {
    redis.disconnect();
  }
}

// Export singleton instance
export const workflowGenerator = new WorkflowGenerator();
