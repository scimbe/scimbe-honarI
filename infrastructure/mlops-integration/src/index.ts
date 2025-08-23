/**
 * MLOps Integration - Main Export Module
 * Phase 3 Implementation - Complete MLOps Platform
 */

// Core Components
export { ExperimentManager } from './experiment-manager';
export { ModelPerformanceMonitor } from './model-performance-monitor';
export { DataExchangeSystem } from './data-exchange-system';
export { FeatureStoreClient } from './feature-store-client';
export { MLOpsOrchestrator } from './mlops-orchestrator';

// Types and Interfaces
export type {
  // Experiment Manager Types
  Experiment,
  ExperimentConfig,
  ExperimentVariant,
  ExperimentMetrics,
  VariantMetrics,
  ExperimentResults,
  ModelConfig,
  WorkflowConfig
} from './experiment-manager';

export type {
  // Performance Monitor Types
  ModelMetrics,
  PerformanceMetrics,
  DriftMetrics,
  QualityMetrics,
  AlertRule,
  AlertAction,
  Alert,
  ModelBaseline,
  FeatureStats
} from './model-performance-monitor';

export type {
  // Data Exchange Types
  DataExchangeConfig,
  DataMessage,
  DataChannel,
  ExchangeMetrics
} from './data-exchange-system';

export type {
  // Feature Store Types
  FeatureView,
  FeatureDefinition,
  DataSource,
  Entity,
  FeatureService,
  OnlineFeatureRequest,
  HistoricalFeatureRequest,
  FeatureVector,
  FeatureStatistics
} from './feature-store-client';

export type {
  // Orchestrator Types
  MLOpsConfig,
  DeploymentPipeline,
  DeploymentStage,
  PipelineMetrics,
  StageMetrics,
  MLOpsWorkflow,
  WorkflowConfig as OrchestratorWorkflowConfig,
  WorkflowMetrics,
  NotificationConfig
} from './mlops-orchestrator';

/**
 * Factory function to create a complete MLOps platform instance
 */
export function createMLOpsPlatform(config: {
  redis: {
    url: string;
    keyPrefix?: string;
    ttl?: number;
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
  monitoring?: {
    metricsCollectionInterval?: number;
    alertCheckInterval?: number;
    healthCheckInterval?: number;
  };
}) {
  const redisClient = require('redis').createClient({ url: config.redis.url });
  
  const mlflowClient = {
    // Placeholder for MLflow client initialization
    searchRuns: async () => [],
    logMetric: async () => {},
    logParam: async () => {}
  };

  const orchestratorConfig = {
    redis: {
      url: config.redis.url,
      keyPrefix: config.redis.keyPrefix || 'mlops',
      ttl: config.redis.ttl || 3600
    },
    database: config.database,
    mlflow: config.mlflow,
    featureStore: config.featureStore,
    monitoring: {
      metricsCollectionInterval: 60000,
      alertCheckInterval: 30000,
      healthCheckInterval: 300000,
      ...config.monitoring
    }
  };

  return new MLOpsOrchestrator(
    orchestratorConfig,
    redisClient,
    config.database,
    mlflowClient
  );
}

/**
 * Utility functions for MLOps operations
 */
export const MLOpsUtils = {
  /**
   * Validate experiment configuration
   */
  validateExperimentConfig: (config: any): boolean => {
    const requiredFields = ['trafficSplit', 'duration', 'significanceLevel'];
    return requiredFields.every(field => field in config);
  },

  /**
   * Calculate statistical significance
   */
  calculateSignificance: (
    controlConversions: number,
    controlTotal: number,
    variantConversions: number,
    variantTotal: number
  ): { pValue: number; significant: boolean } => {
    if (controlTotal === 0 || variantTotal === 0) {
      return { pValue: 1, significant: false };
    }

    const p1 = controlConversions / controlTotal;
    const p2 = variantConversions / variantTotal;
    const pooledP = (controlConversions + variantConversions) / (controlTotal + variantTotal);
    
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1/controlTotal + 1/variantTotal));
    const z = Math.abs(p2 - p1) / se;
    
    // Simple p-value calculation (normally distributed)
    const pValue = 2 * (1 - normalCDF(z));
    
    return {
      pValue,
      significant: pValue < 0.05
    };
  },

  /**
   * Generate feature store schema
   */
  generateFeatureSchema: (features: Record<string, any>): any => {
    const schema: any = {};
    
    for (const [name, value] of Object.entries(features)) {
      if (typeof value === 'number') {
        schema[name] = Number.isInteger(value) ? 'int64' : 'float64';
      } else if (typeof value === 'string') {
        schema[name] = 'string';
      } else if (typeof value === 'boolean') {
        schema[name] = 'bool';
      } else {
        schema[name] = 'bytes';
      }
    }
    
    return schema;
  },

  /**
   * Create deployment configuration
   */
  createDeploymentConfig: (strategy: 'blue_green' | 'canary' | 'rolling' = 'canary') => {
    const baseConfig = {
      validation: {
        enabled: true,
        metrics: ['accuracy', 'latency', 'error_rate'],
        thresholds: {
          accuracy: 0.85,
          latency: 1000,
          error_rate: 0.05
        }
      },
      rollback: {
        enabled: true,
        triggers: ['high_error_rate', 'performance_degradation']
      },
      notifications: []
    };

    switch (strategy) {
      case 'canary':
        return {
          ...baseConfig,
          strategy: 'canary' as const,
          canary: {
            initialTrafficPercentage: 10,
            incrementPercentage: 20,
            evaluationDuration: 300 // 5 minutes
          }
        };
      
      case 'blue_green':
        return {
          ...baseConfig,
          strategy: 'blue_green' as const,
          blueGreen: {
            warmupDuration: 180, // 3 minutes
            healthCheckTimeout: 60
          }
        };
      
      case 'rolling':
        return {
          ...baseConfig,
          strategy: 'rolling' as const,
          rolling: {
            batchSize: 3,
            batchDelay: 120 // 2 minutes
          }
        };
      
      default:
        return baseConfig;
    }
  }
};

// Normal CDF approximation for statistical calculations
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  
  return x > 0 ? 1 - prob : prob;
}

/**
 * Default configurations for quick setup
 */
export const DefaultConfigs = {
  experiment: {
    significanceLevel: 0.05,
    minimumSampleSize: 1000,
    maxRunTime: 168, // 1 week in hours
    autoStop: true
  },
  
  monitoring: {
    alertRules: [
      {
        name: 'High Error Rate',
        metric: 'error_rate',
        condition: 'gt' as const,
        threshold: 0.05,
        severity: 'critical' as const,
        window: 5
      },
      {
        name: 'High Latency',
        metric: 'latency_p95',
        condition: 'gt' as const,
        threshold: 1000,
        severity: 'warning' as const,
        window: 10
      },
      {
        name: 'Data Drift',
        metric: 'data_drift',
        condition: 'gt' as const,
        threshold: 0.7,
        severity: 'high' as const,
        window: 60
      }
    ]
  },
  
  featureStore: {
    onlineTTL: 3600, // 1 hour
    offlineRetention: 30 * 24 * 3600, // 30 days
    maxFeatureViews: 100,
    maxFeaturesPerView: 1000
  }
};

export default {
  createMLOpsPlatform,
  MLOpsUtils,
  DefaultConfigs
};