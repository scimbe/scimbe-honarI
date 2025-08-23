/**
 * Model Performance Monitoring
 * Real-time monitoring and alerting for ML models in production
 */

import { EventEmitter } from 'events';
import { createServiceLogger } from '../../../services/workflow-automation/src/shared-utils-local';

const logger = createServiceLogger('model-performance-monitor');

export interface ModelMetrics {
  modelId: string;
  version: string;
  timestamp: Date;
  predictions: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  auc: number;
  latency: PerformanceMetrics;
  drift: DriftMetrics;
  quality: QualityMetrics;
  custom: Record<string, number>;
}

export interface PerformanceMetrics {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  min: number;
}

export interface DriftMetrics {
  dataDrift: number;
  conceptDrift: number;
  featureDrift: Record<string, number>;
  distributionShift: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface QualityMetrics {
  missingValues: number;
  outliers: number;
  inconsistentData: number;
  schemaViolations: number;
  qualityScore: number;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  metric: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  window: number; // time window in minutes
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  actions: AlertAction[];
}

export interface AlertAction {
  type: 'email' | 'slack' | 'webhook' | 'auto_rollback' | 'scale_down';
  config: Record<string, any>;
}

export interface Alert {
  id: string;
  ruleId: string;
  modelId: string;
  metric: string;
  value: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface ModelBaseline {
  modelId: string;
  version: string;
  metrics: ModelMetrics;
  featureStatistics: Record<string, FeatureStats>;
  createdAt: Date;
}

export interface FeatureStats {
  mean: number;
  std: number;
  min: number;
  max: number;
  nullCount: number;
  uniqueCount: number;
  distribution: number[];
}

export class ModelPerformanceMonitor extends EventEmitter {
  private metrics: Map<string, ModelMetrics[]> = new Map();
  private baselines: Map<string, ModelBaseline> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private redisClient: any,
    private database: any,
    private mlflowClient: any
  ) {
    super();
    this.initializeMonitoring();
  }

  /**
   * Register a model for monitoring
   */
  async registerModel(modelId: string, version: string, config?: any): Promise<void> {
    const key = `${modelId}:${version}`;
    
    if (this.monitoringIntervals.has(key)) {
      logger.warn('Model already registered for monitoring', { modelId, version });
      return;
    }

    // Create baseline from initial predictions
    await this.createBaseline(modelId, version);
    
    // Set up monitoring interval
    const interval = setInterval(() => {
      this.collectMetrics(modelId, version);
    }, 60000); // Collect metrics every minute
    
    this.monitoringIntervals.set(key, interval);
    
    logger.info('Model registered for monitoring', { modelId, version });
    this.emit('model:registered', { modelId, version });
  }

  /**
   * Unregister a model from monitoring
   */
  async unregisterModel(modelId: string, version: string): Promise<void> {
    const key = `${modelId}:${version}`;
    
    const interval = this.monitoringIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(key);
    }
    
    // Archive metrics
    await this.archiveMetrics(modelId, version);
    
    logger.info('Model unregistered from monitoring', { modelId, version });
    this.emit('model:unregistered', { modelId, version });
  }

  /**
   * Record prediction metrics
   */
  async recordPrediction(
    modelId: string,
    version: string,
    prediction: any,
    features: Record<string, any>,
    groundTruth?: any,
    latency?: number
  ): Promise<void> {
    const timestamp = new Date();
    
    // Store prediction for later analysis
    await this.storePrediction(modelId, version, {
      prediction,
      features,
      groundTruth,
      latency,
      timestamp
    });
    
    // Update real-time metrics
    await this.updateRealTimeMetrics(modelId, version, {
      prediction,
      features,
      groundTruth,
      latency,
      timestamp
    });
  }

  /**
   * Create alert rule
   */
  async createAlertRule(rule: Omit<AlertRule, 'id'>): Promise<string> {
    const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const alertRule: AlertRule = {
      ...rule,
      id: ruleId
    };
    
    this.alertRules.set(ruleId, alertRule);
    await this.saveAlertRule(alertRule);
    
    logger.info('Alert rule created', { ruleId, name: rule.name });
    this.emit('alert_rule:created', { ruleId, rule: alertRule });
    
    return ruleId;
  }

  /**
   * Update alert rule
   */
  async updateAlertRule(ruleId: string, updates: Partial<AlertRule>): Promise<void> {
    const rule = this.alertRules.get(ruleId);
    if (!rule) {
      throw new Error(`Alert rule ${ruleId} not found`);
    }
    
    Object.assign(rule, updates);
    await this.saveAlertRule(rule);
    
    logger.info('Alert rule updated', { ruleId });
    this.emit('alert_rule:updated', { ruleId, rule });
  }

  /**
   * Get model metrics
   */
  getModelMetrics(modelId: string, version: string, timeRange?: { start: Date; end: Date }): ModelMetrics[] {
    const key = `${modelId}:${version}`;
    const metrics = this.metrics.get(key) || [];
    
    if (!timeRange) {
      return metrics;
    }
    
    return metrics.filter(m => 
      m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
    );
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(modelId?: string): Alert[] {
    const alerts = Array.from(this.activeAlerts.values());
    
    if (modelId) {
      return alerts.filter(alert => alert.modelId === modelId);
    }
    
    return alerts;
  }

  /**
   * Get model health status
   */
  async getModelHealth(modelId: string, version: string): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    score: number;
    issues: string[];
    recommendations: string[];
  }> {
    const key = `${modelId}:${version}`;
    const recentMetrics = this.getModelMetrics(modelId, version, {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      end: new Date()
    });
    
    if (recentMetrics.length === 0) {
      return {
        status: 'critical',
        score: 0,
        issues: ['No metrics available'],
        recommendations: ['Check if model is receiving traffic']
      };
    }
    
    const latestMetrics = recentMetrics[recentMetrics.length - 1];
    const baseline = this.baselines.get(key);
    
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;
    
    // Check accuracy degradation
    if (baseline && latestMetrics.accuracy < baseline.metrics.accuracy * 0.9) {
      issues.push('Accuracy degraded significantly');
      recommendations.push('Investigate data drift or retrain model');
      score -= 30;
    }
    
    // Check latency
    if (latestMetrics.latency.p95 > 1000) {
      issues.push('High latency detected');
      recommendations.push('Optimize model inference or scale resources');
      score -= 20;
    }
    
    // Check drift
    if (latestMetrics.drift.severity === 'critical') {
      issues.push('Critical data drift detected');
      recommendations.push('Immediate model retraining required');
      score -= 40;
    } else if (latestMetrics.drift.severity === 'high') {
      issues.push('High data drift detected');
      recommendations.push('Consider model retraining');
      score -= 25;
    }
    
    // Check data quality
    if (latestMetrics.quality.qualityScore < 0.8) {
      issues.push('Poor data quality');
      recommendations.push('Implement data validation and cleaning');
      score -= 15;
    }
    
    // Determine status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (score < 60) {
      status = 'critical';
    } else if (score < 80) {
      status = 'warning';
    }
    
    return { status, score: Math.max(0, score), issues, recommendations };
  }

  /**
   * Create baseline from historical data
   */
  private async createBaseline(modelId: string, version: string): Promise<void> {
    try {
      // Collect baseline metrics from MLflow
      const runs = await this.mlflowClient.searchRuns({
        experiment_ids: [modelId],
        filter: `params.version = "${version}"`,
        max_results: 1
      });
      
      if (runs.length === 0) {
        logger.warn('No MLflow runs found for baseline creation', { modelId, version });
        return;
      }
      
      const run = runs[0];
      const metrics = run.data.metrics;
      
      const baseline: ModelBaseline = {
        modelId,
        version,
        metrics: {
          modelId,
          version,
          timestamp: new Date(),
          predictions: 0,
          accuracy: metrics.accuracy || 0,
          precision: metrics.precision || 0,
          recall: metrics.recall || 0,
          f1Score: metrics.f1_score || 0,
          auc: metrics.auc || 0,
          latency: { avg: 0, p50: 0, p95: 0, p99: 0, max: 0, min: 0 },
          drift: { 
            dataDrift: 0, 
            conceptDrift: 0, 
            featureDrift: {}, 
            distributionShift: 0,
            severity: 'low'
          },
          quality: {
            missingValues: 0,
            outliers: 0,
            inconsistentData: 0,
            schemaViolations: 0,
            qualityScore: 1.0
          },
          custom: {}
        },
        featureStatistics: {},
        createdAt: new Date()
      };
      
      const key = `${modelId}:${version}`;
      this.baselines.set(key, baseline);
      
      await this.saveBaseline(baseline);
      
      logger.info('Baseline created', { modelId, version });
      
    } catch (error) {
      logger.error(error as Error, 'Failed to create baseline', { modelId, version });
    }
  }

  /**
   * Collect metrics for a model
   */
  private async collectMetrics(modelId: string, version: string): Promise<void> {
    try {
      const key = `${modelId}:${version}`;
      
      // Get recent predictions from Redis
      const predictions = await this.getRecentPredictions(modelId, version);
      
      if (predictions.length === 0) {
        return;
      }
      
      // Calculate metrics
      const metrics = await this.calculateMetrics(modelId, version, predictions);
      
      // Store metrics
      if (!this.metrics.has(key)) {
        this.metrics.set(key, []);
      }
      
      this.metrics.get(key)!.push(metrics);
      
      // Keep only last 1000 metrics in memory
      const metricsArray = this.metrics.get(key)!;
      if (metricsArray.length > 1000) {
        metricsArray.splice(0, metricsArray.length - 1000);
      }
      
      // Save to database
      await this.saveMetrics(metrics);
      
      // Check alert rules
      await this.checkAlertRules(metrics);
      
      this.emit('metrics:collected', { modelId, version, metrics });
      
    } catch (error) {
      logger.error(error as Error, 'Failed to collect metrics', { modelId, version });
    }
  }

  /**
   * Calculate metrics from predictions
   */
  private async calculateMetrics(
    modelId: string, 
    version: string, 
    predictions: any[]
  ): Promise<ModelMetrics> {
    const timestamp = new Date();
    const predictionCount = predictions.length;
    
    // Calculate performance metrics
    const latencies = predictions
      .filter(p => p.latency !== undefined)
      .map(p => p.latency)
      .sort((a, b) => a - b);
    
    const latencyMetrics: PerformanceMetrics = {
      avg: latencies.length > 0 ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length : 0,
      p50: latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0,
      p95: latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0,
      p99: latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0,
      max: latencies.length > 0 ? Math.max(...latencies) : 0,
      min: latencies.length > 0 ? Math.min(...latencies) : 0
    };
    
    // Calculate accuracy metrics (if ground truth available)
    const predictionsWithTruth = predictions.filter(p => p.groundTruth !== undefined);
    let accuracy = 0;
    let precision = 0;
    let recall = 0;
    let f1Score = 0;
    let auc = 0;
    
    if (predictionsWithTruth.length > 0) {
      const results = this.calculateClassificationMetrics(predictionsWithTruth);
      accuracy = results.accuracy;
      precision = results.precision;
      recall = results.recall;
      f1Score = results.f1Score;
      auc = results.auc;
    }
    
    // Calculate drift metrics
    const driftMetrics = await this.calculateDriftMetrics(modelId, version, predictions);
    
    // Calculate quality metrics
    const qualityMetrics = this.calculateQualityMetrics(predictions);
    
    return {
      modelId,
      version,
      timestamp,
      predictions: predictionCount,
      accuracy,
      precision,
      recall,
      f1Score,
      auc,
      latency: latencyMetrics,
      drift: driftMetrics,
      quality: qualityMetrics,
      custom: {}
    };
  }

  /**
   * Calculate classification metrics
   */
  private calculateClassificationMetrics(predictions: any[]): {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    auc: number;
  } {
    let truePositives = 0;
    let falsePositives = 0;
    let trueNegatives = 0;
    let falseNegatives = 0;
    
    for (const pred of predictions) {
      const predicted = pred.prediction;
      const actual = pred.groundTruth;
      
      if (predicted === 1 && actual === 1) truePositives++;
      else if (predicted === 1 && actual === 0) falsePositives++;
      else if (predicted === 0 && actual === 0) trueNegatives++;
      else if (predicted === 0 && actual === 1) falseNegatives++;
    }
    
    const accuracy = (truePositives + trueNegatives) / predictions.length;
    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
    
    // Simplified AUC calculation
    const auc = accuracy; // In practice, you'd calculate ROC curve
    
    return { accuracy, precision, recall, f1Score, auc };
  }

  /**
   * Calculate drift metrics
   */
  private async calculateDriftMetrics(
    modelId: string, 
    version: string, 
    predictions: any[]
  ): Promise<DriftMetrics> {
    const key = `${modelId}:${version}`;
    const baseline = this.baselines.get(key);
    
    if (!baseline || predictions.length === 0) {
      return {
        dataDrift: 0,
        conceptDrift: 0,
        featureDrift: {},
        distributionShift: 0,
        severity: 'low'
      };
    }
    
    // Calculate feature drift
    const featureDrift: Record<string, number> = {};
    const features = predictions[0].features || {};
    
    for (const feature in features) {
      // Simplified drift calculation using Jensen-Shannon divergence
      const currentValues = predictions.map(p => p.features[feature]).filter(v => v !== undefined);
      const drift = this.calculateJSDivergence(currentValues, baseline.featureStatistics[feature]);
      featureDrift[feature] = drift;
    }
    
    const avgFeatureDrift = Object.values(featureDrift).reduce((sum, d) => sum + d, 0) / 
                          Object.keys(featureDrift).length || 0;
    
    // Determine severity
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (avgFeatureDrift > 0.8) severity = 'critical';
    else if (avgFeatureDrift > 0.6) severity = 'high';
    else if (avgFeatureDrift > 0.4) severity = 'medium';
    
    return {
      dataDrift: avgFeatureDrift,
      conceptDrift: 0, // Would require more sophisticated analysis
      featureDrift,
      distributionShift: avgFeatureDrift,
      severity
    };
  }

  /**
   * Calculate quality metrics
   */
  private calculateQualityMetrics(predictions: any[]): QualityMetrics {
    if (predictions.length === 0) {
      return {
        missingValues: 0,
        outliers: 0,
        inconsistentData: 0,
        schemaViolations: 0,
        qualityScore: 1.0
      };
    }
    
    let missingValues = 0;
    let outliers = 0;
    let schemaViolations = 0;
    
    for (const pred of predictions) {
      const features = pred.features || {};
      
      // Count missing values
      for (const value of Object.values(features)) {
        if (value === null || value === undefined || value === '') {
          missingValues++;
        }
      }
      
      // Simple outlier detection (values > 3 standard deviations)
      // This is a simplified implementation
      
      // Schema validation
      if (!this.validateSchema(features)) {
        schemaViolations++;
      }
    }
    
    const totalFeatures = predictions.length * Object.keys(predictions[0].features || {}).length;
    const missingRate = totalFeatures > 0 ? missingValues / totalFeatures : 0;
    const outlierRate = predictions.length > 0 ? outliers / predictions.length : 0;
    const violationRate = predictions.length > 0 ? schemaViolations / predictions.length : 0;
    
    const qualityScore = Math.max(0, 1 - missingRate - outlierRate - violationRate);
    
    return {
      missingValues,
      outliers,
      inconsistentData: 0,
      schemaViolations,
      qualityScore
    };
  }

  /**
   * Simplified Jensen-Shannon divergence calculation
   */
  private calculateJSDivergence(current: number[], baseline: FeatureStats | undefined): number {
    if (!baseline || current.length === 0) {
      return 0;
    }
    
    // Simplified implementation - in practice, you'd use proper distribution comparison
    const currentMean = current.reduce((sum, v) => sum + v, 0) / current.length;
    const drift = Math.abs(currentMean - baseline.mean) / (baseline.std || 1);
    
    return Math.min(1, drift);
  }

  /**
   * Validate feature schema
   */
  private validateSchema(features: Record<string, any>): boolean {
    // Simplified schema validation
    // In practice, you'd use a proper schema validation library
    return true;
  }

  /**
   * Check alert rules against current metrics
   */
  private async checkAlertRules(metrics: ModelMetrics): Promise<void> {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;
      
      const shouldAlert = this.evaluateAlertRule(rule, metrics);
      
      if (shouldAlert) {
        await this.triggerAlert(rule, metrics);
      }
    }
  }

  /**
   * Evaluate if alert rule should trigger
   */
  private evaluateAlertRule(rule: AlertRule, metrics: ModelMetrics): boolean {
    let value: number;
    
    // Get metric value
    switch (rule.metric) {
      case 'accuracy':
        value = metrics.accuracy;
        break;
      case 'latency_p95':
        value = metrics.latency.p95;
        break;
      case 'data_drift':
        value = metrics.drift.dataDrift;
        break;
      case 'quality_score':
        value = metrics.quality.qualityScore;
        break;
      default:
        value = metrics.custom[rule.metric] || 0;
    }
    
    // Evaluate condition
    switch (rule.condition) {
      case 'gt':
        return value > rule.threshold;
      case 'gte':
        return value >= rule.threshold;
      case 'lt':
        return value < rule.threshold;
      case 'lte':
        return value <= rule.threshold;
      case 'eq':
        return Math.abs(value - rule.threshold) < 0.001;
      default:
        return false;
    }
  }

  /**
   * Trigger alert
   */
  private async triggerAlert(rule: AlertRule, metrics: ModelMetrics): Promise<void> {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: Alert = {
      id: alertId,
      ruleId: rule.id,
      modelId: metrics.modelId,
      metric: rule.metric,
      value: this.getMetricValue(metrics, rule.metric),
      threshold: rule.threshold,
      severity: rule.severity,
      message: `${rule.name}: ${rule.metric} is ${this.getMetricValue(metrics, rule.metric)} (threshold: ${rule.threshold})`,
      timestamp: new Date(),
      resolved: false
    };
    
    this.activeAlerts.set(alertId, alert);
    await this.saveAlert(alert);
    
    // Execute alert actions
    for (const action of rule.actions) {
      await this.executeAlertAction(action, alert, metrics);
    }
    
    logger.warn('Alert triggered', { alertId, rule: rule.name, metric: rule.metric });
    this.emit('alert:triggered', { alertId, alert, rule, metrics });
  }

  /**
   * Get metric value by name
   */
  private getMetricValue(metrics: ModelMetrics, metricName: string): number {
    switch (metricName) {
      case 'accuracy':
        return metrics.accuracy;
      case 'latency_p95':
        return metrics.latency.p95;
      case 'data_drift':
        return metrics.drift.dataDrift;
      case 'quality_score':
        return metrics.quality.qualityScore;
      default:
        return metrics.custom[metricName] || 0;
    }
  }

  /**
   * Execute alert action
   */
  private async executeAlertAction(action: AlertAction, alert: Alert, metrics: ModelMetrics): Promise<void> {
    try {
      switch (action.type) {
        case 'email':
          await this.sendEmailAlert(action.config, alert);
          break;
        case 'slack':
          await this.sendSlackAlert(action.config, alert);
          break;
        case 'webhook':
          await this.sendWebhookAlert(action.config, alert, metrics);
          break;
        case 'auto_rollback':
          await this.executeAutoRollback(alert, metrics);
          break;
        case 'scale_down':
          await this.executeScaleDown(alert, metrics);
          break;
      }
    } catch (error) {
      logger.error(error as Error, 'Failed to execute alert action', { 
        action: action.type, 
        alertId: alert.id 
      });
    }
  }

  /**
   * Send email alert (placeholder)
   */
  private async sendEmailAlert(config: any, alert: Alert): Promise<void> {
    logger.info('Email alert sent', { alertId: alert.id, to: config.to });
  }

  /**
   * Send Slack alert (placeholder)
   */
  private async sendSlackAlert(config: any, alert: Alert): Promise<void> {
    logger.info('Slack alert sent', { alertId: alert.id, channel: config.channel });
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(config: any, alert: Alert, metrics: ModelMetrics): Promise<void> {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      },
      body: JSON.stringify({
        alert,
        metrics,
        timestamp: new Date().toISOString()
      })
    });
    
    if (!response.ok) {
      throw new Error(`Webhook alert failed: ${response.status}`);
    }
    
    logger.info('Webhook alert sent', { alertId: alert.id, url: config.url });
  }

  /**
   * Execute auto rollback
   */
  private async executeAutoRollback(alert: Alert, metrics: ModelMetrics): Promise<void> {
    logger.warn('Auto rollback triggered', { 
      alertId: alert.id, 
      modelId: metrics.modelId,
      version: metrics.version 
    });
    
    // Implementation would trigger rollback to previous version
    this.emit('auto_rollback:triggered', { alert, metrics });
  }

  /**
   * Execute scale down
   */
  private async executeScaleDown(alert: Alert, metrics: ModelMetrics): Promise<void> {
    logger.warn('Scale down triggered', { 
      alertId: alert.id, 
      modelId: metrics.modelId,
      version: metrics.version 
    });
    
    // Implementation would scale down model instances
    this.emit('scale_down:triggered', { alert, metrics });
  }

  /**
   * Helper methods for data persistence
   */
  private async getRecentPredictions(modelId: string, version: string): Promise<any[]> {
    const key = `predictions:${modelId}:${version}`;
    const predictionStrings = await this.redisClient.lrange(key, 0, 1000);
    return predictionStrings.map((p: string) => JSON.parse(p));
  }

  private async storePrediction(modelId: string, version: string, prediction: any): Promise<void> {
    const key = `predictions:${modelId}:${version}`;
    await this.redisClient.lpush(key, JSON.stringify(prediction));
    await this.redisClient.ltrim(key, 0, 10000); // Keep last 10k predictions
  }

  private async updateRealTimeMetrics(modelId: string, version: string, data: any): Promise<void> {
    // Update real-time metrics in Redis
    const key = `realtime:${modelId}:${version}`;
    await this.redisClient.hset(key, {
      last_prediction: Date.now(),
      total_predictions: await this.redisClient.hincrby(key, 'total_predictions', 1)
    });
  }

  private async saveMetrics(metrics: ModelMetrics): Promise<void> {
    // Save to database (implementation depends on your database schema)
  }

  private async saveAlertRule(rule: AlertRule): Promise<void> {
    // Save to database (implementation depends on your database schema)
  }

  private async saveAlert(alert: Alert): Promise<void> {
    // Save to database (implementation depends on your database schema)
  }

  private async saveBaseline(baseline: ModelBaseline): Promise<void> {
    // Save to database (implementation depends on your database schema)
  }

  private async archiveMetrics(modelId: string, version: string): Promise<void> {
    // Archive metrics to long-term storage
  }

  private initializeMonitoring(): void {
    logger.info('Model Performance Monitor initialized');
    
    // Set up periodic cleanup
    setInterval(() => {
      this.cleanupOldData();
    }, 60 * 60 * 1000); // Cleanup every hour
  }

  private async cleanupOldData(): Promise<void> {
    // Clean up old metrics, alerts, and predictions
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    // Remove old metrics from memory
    for (const [key, metricsArray] of this.metrics.entries()) {
      const filteredMetrics = metricsArray.filter(m => m.timestamp > cutoffDate);
      this.metrics.set(key, filteredMetrics);
    }
    
    // Resolve old alerts
    for (const [alertId, alert] of this.activeAlerts.entries()) {
      if (alert.timestamp < cutoffDate && !alert.resolved) {
        alert.resolved = true;
        alert.resolvedAt = new Date();
        await this.saveAlert(alert);
        this.activeAlerts.delete(alertId);
      }
    }
  }
}