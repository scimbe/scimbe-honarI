/**
 * MLOps Orchestrator - Central coordination for all MLOps components
 * Integrates Experiment Manager, Performance Monitor, Data Exchange, and Feature Store
 */

import { EventEmitter } from 'events';
import { createServiceLogger } from '../../../services/workflow-automation/src/shared-utils-local';
import { ExperimentManager, Experiment } from './experiment-manager';
import { ModelPerformanceMonitor } from './model-performance-monitor';
import { DataExchangeSystem } from './data-exchange-system';
import { FeatureStoreClient } from './feature-store-client';

const logger = createServiceLogger('mlops-orchestrator');

export interface MLOpsConfig {
  redis: {
    url: string;
    keyPrefix: string;
    ttl: number;
  };
  database: any;
  mlflow: {
    trackingUri: string;
    registryUri?: string;
  };
  featureStore: {
    registryPath: string;
    project: string;
  };
  monitoring: {
    metricsCollectionInterval: number;
    alertCheckInterval: number;
    healthCheckInterval: number;
  };
}

export interface DeploymentPipeline {
  id: string;
  name: string;
  modelId: string;
  version: string;
  stages: DeploymentStage[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  metrics: PipelineMetrics;
}

export interface DeploymentStage {
  name: string;
  type: 'validation' | 'canary' | 'ab_test' | 'full_deployment' | 'rollback';
  config: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
  results?: Record<string, any>;
}

export interface PipelineMetrics {
  totalDuration: number;
  stageMetrics: Record<string, StageMetrics>;
  overallSuccess: boolean;
  errors: string[];
  warnings: string[];
}

export interface StageMetrics {
  duration: number;
  success: boolean;
  errorMessage?: string;
  customMetrics: Record<string, number>;
}

export interface MLOpsWorkflow {
  id: string;
  name: string;
  type: 'training' | 'inference' | 'batch_scoring' | 'monitoring';
  config: WorkflowConfig;
  status: 'draft' | 'active' | 'paused' | 'completed';
  schedule?: string; // Cron expression
  nextRun?: Date;
  lastRun?: Date;
  metrics: WorkflowMetrics;
}

export interface WorkflowConfig {
  dataSource: string;
  featureView: string;
  modelConfig: Record<string, any>;
  outputDestination: string;
  notifications: NotificationConfig[];
}

export interface WorkflowMetrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageDuration: number;
  lastRunMetrics?: Record<string, any>;
}

export interface NotificationConfig {
  type: 'email' | 'slack' | 'webhook';
  config: Record<string, any>;
  triggers: string[];
}

export class MLOpsOrchestrator extends EventEmitter {
  private experimentManager: ExperimentManager;
  private performanceMonitor: ModelPerformanceMonitor;
  private dataExchange: DataExchangeSystem;
  private featureStore: FeatureStoreClient;
  
  private deploymentPipelines: Map<string, DeploymentPipeline> = new Map();
  private workflows: Map<string, MLOpsWorkflow> = new Map();
  private activeDeployments: Set<string> = new Set();
  
  private healthCheckInterval: NodeJS.Timeout;
  private workflowScheduler: NodeJS.Timeout;

  constructor(
    private config: MLOpsConfig,
    private redisClient: any,
    private database: any,
    private mlflowClient: any
  ) {
    super();
    
    this.initializeComponents();
    this.setupEventHandlers();
    this.startHealthMonitoring();
    this.startWorkflowScheduler();
  }

  /**
   * Deploy a model with automated pipeline
   */
  async deployModel(
    modelId: string,
    version: string,
    deploymentConfig: {
      strategy: 'blue_green' | 'canary' | 'rolling';
      validation: {
        enabled: boolean;
        metrics: string[];
        thresholds: Record<string, number>;
      };
      rollback: {
        enabled: boolean;
        triggers: string[];
      };
      notifications: NotificationConfig[];
    }
  ): Promise<string> {
    const pipelineId = `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const pipeline: DeploymentPipeline = {
      id: pipelineId,
      name: `Deploy ${modelId} v${version}`,
      modelId,
      version,
      stages: this.buildDeploymentStages(deploymentConfig),
      status: 'pending',
      createdAt: new Date(),
      metrics: {
        totalDuration: 0,
        stageMetrics: {},
        overallSuccess: false,
        errors: [],
        warnings: []
      }
    };

    this.deploymentPipelines.set(pipelineId, pipeline);
    
    logger.info('Deployment pipeline created', { pipelineId, modelId, version });
    
    // Start pipeline execution
    await this.executePipeline(pipelineId);
    
    return pipelineId;
  }

  /**
   * Create an A/B test experiment
   */
  async createABTest(
    name: string,
    controlModel: { id: string; version: string },
    variantModel: { id: string; version: string },
    config: {
      trafficSplit: number; // Percentage for variant
      duration: number; // Hours
      targetMetrics: string[];
      minimumSampleSize: number;
    }
  ): Promise<string> {
    const experimentConfig = {
      name,
      description: `A/B test comparing ${controlModel.id} v${controlModel.version} vs ${variantModel.id} v${variantModel.version}`,
      type: 'ab_test' as const,
      status: 'draft' as const,
      config: {
        trafficSplit: {
          control: 100 - config.trafficSplit,
          variant: config.trafficSplit
        },
        duration: config.duration,
        significanceLevel: 0.05,
        minimumSampleSize: config.minimumSampleSize,
        maxRunTime: config.duration,
        autoStop: true,
        targetMetrics: config.targetMetrics
      },
      variants: [
        {
          id: 'control',
          name: 'Control',
          description: `${controlModel.id} v${controlModel.version}`,
          modelConfig: {
            modelId: controlModel.id,
            version: controlModel.version,
            hyperparameters: {},
            featureSet: [],
            preprocessingSteps: []
          },
          workflowConfig: {
            workflowId: 'default',
            version: '1.0',
            activities: {},
            configuration: {}
          },
          isControl: true
        },
        {
          id: 'variant',
          name: 'Variant',
          description: `${variantModel.id} v${variantModel.version}`,
          modelConfig: {
            modelId: variantModel.id,
            version: variantModel.version,
            hyperparameters: {},
            featureSet: [],
            preprocessingSteps: []
          },
          workflowConfig: {
            workflowId: 'default',
            version: '1.0',
            activities: {},
            configuration: {}
          },
          isControl: false
        }
      ]
    };

    const experimentId = await this.experimentManager.createExperiment(experimentConfig);
    
    // Register models for monitoring
    await this.performanceMonitor.registerModel(controlModel.id, controlModel.version);
    await this.performanceMonitor.registerModel(variantModel.id, variantModel.version);
    
    logger.info('A/B test experiment created', { experimentId, name });
    
    return experimentId;
  }

  /**
   * Route inference requests through experiments and monitoring
   */
  async routeInferenceRequest(
    request: {
      modelId: string;
      version?: string;
      features: Record<string, any>;
      userId?: string;
      sessionId?: string;
    }
  ): Promise<{
    prediction: any;
    modelUsed: { id: string; version: string };
    experimentId?: string;
    variant?: string;
    latency: number;
  }> {
    const startTime = Date.now();
    
    try {
      // Check for active experiments involving this model
      const runningExperiments = this.experimentManager.getRunningExperiments();
      const relevantExperiment = runningExperiments.find(exp => 
        exp.variants.some(v => v.modelConfig.modelId === request.modelId)
      );

      let modelToUse = { id: request.modelId, version: request.version || 'latest' };
      let experimentId: string | undefined;
      let variant: string | undefined;

      if (relevantExperiment) {
        // Route through experiment
        variant = await this.experimentManager.routeTraffic(relevantExperiment.id, {
          userId: request.userId,
          sessionId: request.sessionId
        });
        
        const selectedVariant = relevantExperiment.variants.find(v => v.id === variant);
        if (selectedVariant) {
          modelToUse = {
            id: selectedVariant.modelConfig.modelId,
            version: selectedVariant.modelConfig.version
          };
          experimentId = relevantExperiment.id;
        }
      }

      // Get enhanced features from feature store
      const enhancedFeatures = await this.enhanceFeatures(request.features, modelToUse);
      
      // Make prediction (placeholder - actual implementation would call model serving)
      const prediction = await this.makePrediction(modelToUse, enhancedFeatures);
      
      const latency = Date.now() - startTime;
      
      // Record metrics
      if (experimentId && variant) {
        await this.experimentManager.recordMetric(experimentId, variant, 'request', {
          latency,
          features: enhancedFeatures
        });
      }
      
      // Record for performance monitoring
      await this.performanceMonitor.recordPrediction(
        modelToUse.id,
        modelToUse.version,
        prediction,
        enhancedFeatures,
        undefined, // groundTruth - would be set later when available
        latency
      );
      
      // Store in data exchange for further processing
      await this.dataExchange.publish('inference_requests', {
        prediction,
        modelUsed: modelToUse,
        experimentId,
        variant,
        latency,
        timestamp: new Date()
      }, {
        source: 'mlops_orchestrator',
        workflowId: 'inference',
        stepId: 'prediction',
        type: 'inference_result'
      });

      return {
        prediction,
        modelUsed: modelToUse,
        experimentId,
        variant,
        latency
      };

    } catch (error) {
      logger.error(error as Error, 'Failed to route inference request');
      throw error;
    }
  }

  /**
   * Create MLOps workflow
   */
  async createWorkflow(workflow: Omit<MLOpsWorkflow, 'id' | 'metrics'>): Promise<string> {
    const workflowId = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newWorkflow: MLOpsWorkflow = {
      ...workflow,
      id: workflowId,
      metrics: {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        averageDuration: 0
      }
    };

    this.workflows.set(workflowId, newWorkflow);
    await this.saveWorkflow(newWorkflow);
    
    logger.info('MLOps workflow created', { workflowId, name: workflow.name, type: workflow.type });
    
    return workflowId;
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<{
    overall: 'healthy' | 'degraded' | 'critical';
    components: Record<string, any>;
    recommendations: string[];
  }> {
    const components: Record<string, any> = {};
    const recommendations: string[] = [];

    // Check experiment manager
    const runningExperiments = this.experimentManager.getRunningExperiments();
    components.experimentManager = {
      status: 'healthy',
      runningExperiments: runningExperiments.length,
      totalExperiments: this.experimentManager.listExperiments().length
    };

    // Check performance monitor
    const activeAlerts = this.performanceMonitor.getActiveAlerts();
    components.performanceMonitor = {
      status: activeAlerts.length === 0 ? 'healthy' : 'warning',
      activeAlerts: activeAlerts.length,
      criticalAlerts: activeAlerts.filter(a => a.severity === 'critical').length
    };

    if (activeAlerts.length > 0) {
      recommendations.push('Review and resolve active performance alerts');
    }

    // Check data exchange system
    const exchangeMetrics = this.dataExchange.getMetrics();
    components.dataExchange = {
      status: exchangeMetrics.errorRate < 0.05 ? 'healthy' : 'warning',
      throughput: exchangeMetrics.throughput,
      errorRate: exchangeMetrics.errorRate,
      activeChannels: exchangeMetrics.activeChannels
    };

    // Check feature store
    const featureStoreHealth = await this.featureStore.validateFeatureStore();
    components.featureStore = {
      status: featureStoreHealth.healthy ? 'healthy' : 'critical',
      issues: featureStoreHealth.issues,
      featureViews: this.featureStore.listFeatureViews().length
    };

    recommendations.push(...featureStoreHealth.recommendations);

    // Determine overall status
    const componentStatuses = Object.values(components).map(c => c.status);
    let overall: 'healthy' | 'degraded' | 'critical' = 'healthy';
    
    if (componentStatuses.includes('critical')) {
      overall = 'critical';
    } else if (componentStatuses.includes('warning')) {
      overall = 'degraded';
    }

    return { overall, components, recommendations };
  }

  /**
   * Get comprehensive metrics dashboard
   */
  async getDashboardMetrics(): Promise<{
    experiments: any;
    monitoring: any;
    deployments: any;
    workflows: any;
    system: any;
  }> {
    const runningExperiments = this.experimentManager.getRunningExperiments();
    const activeAlerts = this.performanceMonitor.getActiveAlerts();
    const exchangeMetrics = this.dataExchange.getMetrics();
    
    return {
      experiments: {
        total: this.experimentManager.listExperiments().length,
        running: runningExperiments.length,
        completed: this.experimentManager.listExperiments().filter(e => e.status === 'completed').length
      },
      monitoring: {
        activeAlerts: activeAlerts.length,
        criticalAlerts: activeAlerts.filter(a => a.severity === 'critical').length,
        modelsMonitored: new Set(activeAlerts.map(a => a.modelId)).size
      },
      deployments: {
        active: this.activeDeployments.size,
        total: this.deploymentPipelines.size,
        successful: Array.from(this.deploymentPipelines.values()).filter(p => p.status === 'completed').length
      },
      workflows: {
        total: this.workflows.size,
        active: Array.from(this.workflows.values()).filter(w => w.status === 'active').length
      },
      system: {
        dataExchange: exchangeMetrics,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      }
    };
  }

  /**
   * Initialize all MLOps components
   */
  private initializeComponents(): void {
    this.experimentManager = new ExperimentManager(this.redisClient, this.database);
    
    this.performanceMonitor = new ModelPerformanceMonitor(
      this.redisClient,
      this.database,
      this.mlflowClient
    );
    
    this.dataExchange = new DataExchangeSystem(
      {
        redis: this.config.redis,
        persistence: { enabled: true, database: this.database }
      },
      this.redisClient
    );
    
    this.featureStore = new FeatureStoreClient({
      registryPath: this.config.featureStore.registryPath,
      onlineStore: this.redisClient,
      offlineStore: this.database,
      project: this.config.featureStore.project
    });

    // Create data exchange channels
    this.setupDataExchangeChannels();
    
    logger.info('MLOps components initialized successfully');
  }

  private setupDataExchangeChannels(): void {
    // Create channels for different data flows
    const channels = [
      { name: 'inference_requests', type: 'stream' as const },
      { name: 'model_predictions', type: 'pubsub' as const },
      { name: 'experiment_metrics', type: 'queue' as const },
      { name: 'monitoring_alerts', type: 'pubsub' as const },
      { name: 'feature_requests', type: 'queue' as const }
    ];

    channels.forEach(async (channel) => {
      try {
        await this.dataExchange.createChannel(channel.name, channel.type);
      } catch (error) {
        logger.error(error as Error, `Failed to create channel: ${channel.name}`);
      }
    });
  }

  private setupEventHandlers(): void {
    // Experiment events
    this.experimentManager.on('experiment:started', (event) => {
      logger.info('Experiment started', event);
      this.emit('experiment:started', event);
    });

    this.experimentManager.on('experiment:stopped', (event) => {
      logger.info('Experiment completed', event);
      this.emit('experiment:completed', event);
    });

    // Performance monitoring events
    this.performanceMonitor.on('alert:triggered', async (event) => {
      logger.warn('Performance alert triggered', event);
      
      // Publish alert to data exchange
      await this.dataExchange.publish('monitoring_alerts', event.alert, {
        source: 'performance_monitor',
        workflowId: 'monitoring',
        stepId: 'alert',
        type: 'alert'
      });
      
      this.emit('alert:triggered', event);
    });

    // Data exchange events
    this.dataExchange.on('message:published', (event) => {
      this.emit('data:published', event);
    });
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.getSystemHealth();
        
        if (health.overall === 'critical') {
          logger.error('System health critical', { health });
          this.emit('health:critical', health);
        } else if (health.overall === 'degraded') {
          logger.warn('System health degraded', { health });
          this.emit('health:degraded', health);
        }
        
      } catch (error) {
        logger.error(error as Error, 'Health check failed');
      }
    }, this.config.monitoring.healthCheckInterval);
  }

  private startWorkflowScheduler(): void {
    this.workflowScheduler = setInterval(async () => {
      const now = new Date();
      
      for (const workflow of this.workflows.values()) {
        if (workflow.status === 'active' && workflow.schedule && workflow.nextRun) {
          if (workflow.nextRun <= now) {
            await this.executeWorkflow(workflow.id);
          }
        }
      }
    }, 60000); // Check every minute
  }

  private buildDeploymentStages(config: any): DeploymentStage[] {
    const stages: DeploymentStage[] = [];

    if (config.validation.enabled) {
      stages.push({
        name: 'Model Validation',
        type: 'validation',
        config: config.validation,
        status: 'pending'
      });
    }

    if (config.strategy === 'canary') {
      stages.push({
        name: 'Canary Deployment',
        type: 'canary',
        config: { traffic: 10 },
        status: 'pending'
      });
    }

    stages.push({
      name: 'Full Deployment',
      type: 'full_deployment',
      config: {},
      status: 'pending'
    });

    return stages;
  }

  private async executePipeline(pipelineId: string): Promise<void> {
    const pipeline = this.deploymentPipelines.get(pipelineId);
    if (!pipeline) return;

    pipeline.status = 'running';
    pipeline.startedAt = new Date();
    this.activeDeployments.add(pipelineId);

    const startTime = Date.now();

    try {
      for (const stage of pipeline.stages) {
        await this.executeStage(pipeline, stage);
        
        if (stage.status === 'failed') {
          pipeline.status = 'failed';
          break;
        }
      }

      if (pipeline.stages.every(s => s.status === 'completed')) {
        pipeline.status = 'completed';
        pipeline.metrics.overallSuccess = true;
      }

    } catch (error) {
      logger.error(error as Error, 'Pipeline execution failed', { pipelineId });
      pipeline.status = 'failed';
      pipeline.metrics.errors.push((error as Error).message);
    }

    pipeline.completedAt = new Date();
    pipeline.metrics.totalDuration = Date.now() - startTime;
    this.activeDeployments.delete(pipelineId);

    logger.info('Pipeline execution completed', { 
      pipelineId, 
      status: pipeline.status,
      duration: pipeline.metrics.totalDuration 
    });

    this.emit('deployment:completed', { pipelineId, pipeline });
  }

  private async executeStage(pipeline: DeploymentPipeline, stage: DeploymentStage): Promise<void> {
    stage.status = 'running';
    stage.startedAt = new Date();
    
    const startTime = Date.now();
    
    try {
      // Stage-specific execution logic would go here
      await this.delay(1000); // Placeholder
      
      stage.status = 'completed';
      
    } catch (error) {
      stage.status = 'failed';
      throw error;
    } finally {
      stage.completedAt = new Date();
      
      const duration = Date.now() - startTime;
      pipeline.metrics.stageMetrics[stage.name] = {
        duration,
        success: stage.status === 'completed',
        errorMessage: stage.status === 'failed' ? 'Stage execution failed' : undefined,
        customMetrics: {}
      };
    }
  }

  private async enhanceFeatures(features: Record<string, any>, model: { id: string; version: string }): Promise<Record<string, any>> {
    // Get additional features from feature store
    try {
      const featureVector = await this.featureStore.getOnlineFeatures({
        features: [`${model.id}_features:*`],
        entities: features
      });
      
      return {
        ...features,
        ...featureVector[0]?.features || {}
      };
    } catch (error) {
      logger.warn('Failed to enhance features from feature store', { error: (error as Error).message });
      return features;
    }
  }

  private async makePrediction(model: { id: string; version: string }, features: Record<string, any>): Promise<any> {
    // Placeholder for actual model serving call
    // In a real implementation, this would call your model serving infrastructure
    return { prediction: Math.random(), confidence: 0.85 };
  }

  private async executeWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    const startTime = Date.now();
    workflow.lastRun = new Date();
    
    try {
      // Workflow execution logic
      logger.info('Executing workflow', { workflowId, name: workflow.name });
      
      workflow.metrics.totalRuns++;
      workflow.metrics.successfulRuns++;
      
    } catch (error) {
      workflow.metrics.failedRuns++;
      logger.error(error as Error, 'Workflow execution failed', { workflowId });
    }
    
    const duration = Date.now() - startTime;
    workflow.metrics.averageDuration = 
      (workflow.metrics.averageDuration + duration) / workflow.metrics.totalRuns;
    
    // Schedule next run
    if (workflow.schedule) {
      workflow.nextRun = this.calculateNextRun(workflow.schedule);
    }
  }

  private calculateNextRun(cronExpression: string): Date {
    // Simple cron parser - in production use a proper cron library
    const now = new Date();
    return new Date(now.getTime() + 60 * 60 * 1000); // Next hour
  }

  private async saveWorkflow(workflow: MLOpsWorkflow): Promise<void> {
    // Save workflow to database
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    if (this.workflowScheduler) {
      clearInterval(this.workflowScheduler);
    }
    
    logger.info('MLOps Orchestrator destroyed');
  }
}