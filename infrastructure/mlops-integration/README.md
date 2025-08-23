# MLOps Integration Platform

A comprehensive MLOps platform providing experiment management, model performance monitoring, feature store integration, and workflow orchestration for production machine learning systems.

## 🚀 Features

### Core Components

- **🧪 Experiment Manager**: Advanced A/B testing and multivariate experimentation
- **📊 Performance Monitor**: Real-time model monitoring with drift detection
- **💾 Feature Store**: Feast-compatible feature management and serving
- **🔄 Data Exchange**: Redis/Kafka-based workflow data communication
- **🎯 MLOps Orchestrator**: Centralized coordination of all MLOps workflows

### Key Capabilities

- **Statistical A/B Testing**: Two-proportion z-tests with automatic significance detection
- **Real-time Monitoring**: Model accuracy, latency, drift, and data quality metrics
- **Feature Management**: Online/offline feature serving with statistics and validation
- **Automated Deployments**: Blue-green, canary, and rolling deployment strategies
- **Alert Management**: Multi-channel alerting with auto-rollback capabilities
- **Workflow Orchestration**: Scheduled and event-driven ML workflows

## 📦 Installation

```bash
npm install @honari/mlops-integration
```

## 🏗️ Quick Setup

```typescript
import { createMLOpsPlatform, DefaultConfigs } from '@honari/mlops-integration';

const mlops = createMLOpsPlatform({
  redis: {
    url: 'redis://localhost:6379',
    keyPrefix: 'mlops',
    ttl: 3600
  },
  database: postgresClient, // Your PostgreSQL client
  mlflow: {
    trackingUri: 'http://localhost:5000'
  },
  featureStore: {
    registryPath: './feature_repo',
    project: 'my_project'
  },
  monitoring: {
    metricsCollectionInterval: 60000,
    healthCheckInterval: 300000
  }
});
```

## 🧪 Experiment Management

### Create A/B Test

```typescript
const experimentId = await mlops.createABTest(
  'Homepage Button Test',
  { id: 'model_v1', version: '1.0' }, // Control
  { id: 'model_v2', version: '2.0' }, // Variant
  {
    trafficSplit: 20, // 20% to variant
    duration: 168, // 1 week
    targetMetrics: ['conversion_rate', 'revenue'],
    minimumSampleSize: 1000
  }
);

// Start the experiment
await mlops.experimentManager.startExperiment(experimentId);
```

### Route Traffic Through Experiments

```typescript
const result = await mlops.routeInferenceRequest({
  modelId: 'recommendation_model',
  features: { user_id: '123', item_category: 'electronics' },
  userId: 'user_123'
});

console.log('Prediction:', result.prediction);
console.log('Model used:', result.modelUsed);
console.log('Experiment:', result.experimentId);
```

## 📊 Model Performance Monitoring

### Register Model for Monitoring

```typescript
await mlops.performanceMonitor.registerModel('my_model', '1.0', {
  alertRules: DefaultConfigs.monitoring.alertRules
});
```

### Record Predictions

```typescript
await mlops.performanceMonitor.recordPrediction(
  'my_model',
  '1.0',
  { class: 'positive', probability: 0.87 }, // prediction
  { feature1: 1.2, feature2: 'category_a' }, // features
  'positive', // ground truth (optional)
  45 // latency in ms
);
```

### Create Alert Rules

```typescript
const ruleId = await mlops.performanceMonitor.createAlertRule({
  name: 'High Latency Alert',
  description: 'Alert when p95 latency exceeds 1 second',
  metric: 'latency_p95',
  condition: 'gt',
  threshold: 1000,
  window: 5,
  severity: 'high',
  enabled: true,
  actions: [
    {
      type: 'slack',
      config: { channel: '#ml-alerts' }
    }
  ]
});
```

## 💾 Feature Store Integration

### Define Feature Views

```typescript
const featureView = {
  name: 'user_features',
  entities: ['user_id'],
  features: [
    { name: 'age', dtype: 'int64', description: 'User age' },
    { name: 'location', dtype: 'string', description: 'User location' }
  ],
  source: {
    type: 'file',
    config: { path: 'data/user_features.parquet' },
    timestampField: 'created_at'
  },
  ttl: 3600,
  tags: { team: 'ml', environment: 'prod' },
  description: 'User demographic features',
  online: true,
  batch: true
};

await mlops.featureStore.apply({
  featureViews: [featureView]
});
```

### Retrieve Features

```typescript
// Online features for real-time serving
const features = await mlops.featureStore.getOnlineFeatures({
  features: ['user_features:age', 'user_features:location'],
  entities: { user_id: '123' }
});

// Historical features for training
const historicalFeatures = await mlops.featureStore.getHistoricalFeatures({
  features: ['user_features:age', 'user_features:location'],
  entityDf: [
    { user_id: '123', timestamp: '2023-01-01T00:00:00Z' },
    { user_id: '456', timestamp: '2023-01-01T00:00:00Z' }
  ]
});
```

## 🚀 Model Deployment

### Deploy with Automated Pipeline

```typescript
const deploymentId = await mlops.deployModel(
  'recommendation_model',
  '2.0',
  {
    strategy: 'canary',
    validation: {
      enabled: true,
      metrics: ['accuracy', 'latency', 'error_rate'],
      thresholds: { accuracy: 0.85, latency: 1000, error_rate: 0.05 }
    },
    rollback: {
      enabled: true,
      triggers: ['high_error_rate', 'performance_degradation']
    },
    notifications: [
      { type: 'slack', config: { channel: '#deployments' }, triggers: ['completed', 'failed'] }
    ]
  }
);
```

## 🔄 Data Exchange System

### Create Channels and Publish Data

```typescript
// Create data channels
await mlops.dataExchange.createChannel('model_predictions', 'stream');
await mlops.dataExchange.createChannel('feature_requests', 'queue');

// Publish data
await mlops.dataExchange.publish('model_predictions', {
  model_id: 'rec_model',
  prediction: { item_id: '456', score: 0.92 },
  timestamp: new Date()
}, {
  source: 'inference_service',
  workflowId: 'batch_scoring',
  stepId: 'prediction',
  type: 'prediction'
});

// Subscribe to data
await mlops.dataExchange.subscribe('model_predictions', async (message) => {
  console.log('Received prediction:', message.data);
  // Process the prediction
});
```

## 📈 Monitoring and Health Checks

### System Health Status

```typescript
const health = await mlops.getSystemHealth();
console.log('Overall status:', health.overall);
console.log('Component details:', health.components);
console.log('Recommendations:', health.recommendations);
```

### Dashboard Metrics

```typescript
const metrics = await mlops.getDashboardMetrics();
console.log('Active experiments:', metrics.experiments.running);
console.log('Active alerts:', metrics.monitoring.activeAlerts);
console.log('System uptime:', metrics.system.uptime);
```

## 🛠️ Advanced Configuration

### Custom Alert Actions

```typescript
// Auto-rollback on critical alerts
const alertRule = {
  name: 'Critical Performance Degradation',
  metric: 'accuracy',
  condition: 'lt',
  threshold: 0.7,
  severity: 'critical',
  actions: [
    { type: 'auto_rollback', config: {} },
    { type: 'webhook', config: { url: 'https://api.pagerduty.com/incidents' } }
  ]
};
```

### Feature Transformations

```typescript
const pipelineId = await mlops.featureStore.createTransformationPipeline(
  'user_engagement_features',
  'raw_user_events',
  [
    { type: 'aggregate', config: { groupBy: 'user_id', window: '7d' } },
    { type: 'window', config: { functions: ['count', 'avg'], feature: 'session_duration' } }
  ]
);
```

## 📚 API Reference

### Core Classes

- **`ExperimentManager`**: A/B testing and multivariate experiments
- **`ModelPerformanceMonitor`**: Real-time model monitoring and alerting
- **`FeatureStoreClient`**: Feature management and serving
- **`DataExchangeSystem`**: Workflow data communication
- **`MLOpsOrchestrator`**: Central coordination and orchestration

### Utility Functions

- **`MLOpsUtils.validateExperimentConfig`**: Validate experiment configurations
- **`MLOpsUtils.calculateSignificance`**: Statistical significance calculations
- **`MLOpsUtils.generateFeatureSchema`**: Auto-generate feature schemas
- **`MLOpsUtils.createDeploymentConfig`**: Generate deployment configurations

## 🔧 Development

### Prerequisites

- Node.js >= 18
- Redis >= 6
- PostgreSQL >= 12
- MLflow (optional)

### Setup

```bash
git clone https://github.com/honari/mlops-integration
cd mlops-integration
npm install
npm run build
```

### Testing

```bash
npm test
npm run test:watch
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run the test suite
6. Create a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Support

- 📧 Email: support@honari.dev
- 💬 Slack: [Join our community](https://honari.dev/slack)
- 📖 Docs: [Full Documentation](https://docs.honari.dev/mlops)
- 🐛 Issues: [GitHub Issues](https://github.com/honari/mlops-integration/issues)

---

**Built with ❤️ by the Honarī Team**