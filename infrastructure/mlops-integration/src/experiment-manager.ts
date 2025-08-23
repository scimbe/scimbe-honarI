/**
 * Advanced Experiment Management and A/B Testing
 * MLOps Integration - Phase 3 Implementation
 */

import { EventEmitter } from 'events';
import { createServiceLogger } from '../../../services/workflow-automation/src/shared-utils-local';

const logger = createServiceLogger('experiment-manager');

export interface Experiment {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'running' | 'completed' | 'failed' | 'paused';
  type: 'ab_test' | 'multivariate' | 'canary' | 'blue_green';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  config: ExperimentConfig;
  variants: ExperimentVariant[];
  metrics: ExperimentMetrics;
  results?: ExperimentResults;
}

export interface ExperimentConfig {
  trafficSplit: Record<string, number>; // variant_id -> percentage
  duration: number; // in hours
  significanceLevel: number; // default 0.05
  minimumSampleSize: number;
  maxRunTime: number; // maximum runtime in hours
  autoStop: boolean; // auto-stop when significant result found
  targetMetrics: string[]; // metrics to track for significance
}

export interface ExperimentVariant {
  id: string;
  name: string;
  description: string;
  modelConfig: ModelConfig;
  workflowConfig: WorkflowConfig;
  isControl: boolean;
}

export interface ModelConfig {
  modelId: string;
  version: string;
  hyperparameters: Record<string, any>;
  featureSet: string[];
  preprocessingSteps: string[];
}

export interface WorkflowConfig {
  workflowId: string;
  version: string;
  activities: Record<string, any>;
  configuration: Record<string, any>;
}

export interface ExperimentMetrics {
  totalRequests: number;
  successRate: number;
  averageLatency: number;
  errorRate: number;
  customMetrics: Record<string, number>;
  variantMetrics: Record<string, VariantMetrics>;
}

export interface VariantMetrics {
  requests: number;
  conversions: number;
  conversionRate: number;
  latency: number;
  errors: number;
  customMetrics: Record<string, number>;
}

export interface ExperimentResults {
  winner?: string; // variant ID
  confidence: number;
  pValue: number;
  effect: number; // effect size
  significance: boolean;
  summary: string;
  recommendations: string[];
}

export class ExperimentManager extends EventEmitter {
  private experiments: Map<string, Experiment> = new Map();
  private runningExperiments: Set<string> = new Set();
  private metricsBuffer: Map<string, any[]> = new Map();

  constructor(private redisClient: any, private database: any) {
    super();
    this.initializeMetricsCollection();
  }

  /**
   * Create a new experiment
   */
  async createExperiment(experiment: Omit<Experiment, 'id' | 'createdAt' | 'metrics'>): Promise<string> {
    const experimentId = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newExperiment: Experiment = {
      ...experiment,
      id: experimentId,
      createdAt: new Date(),
      metrics: {
        totalRequests: 0,
        successRate: 0,
        averageLatency: 0,
        errorRate: 0,
        customMetrics: {},
        variantMetrics: {}
      }
    };

    // Validate experiment configuration
    this.validateExperiment(newExperiment);

    // Store in database
    await this.saveExperiment(newExperiment);
    
    this.experiments.set(experimentId, newExperiment);
    
    logger.info('Experiment created', { 
      experimentId, 
      name: experiment.name, 
      variants: experiment.variants.length 
    });

    this.emit('experiment:created', { experimentId, experiment: newExperiment });
    
    return experimentId;
  }

  /**
   * Start an experiment
   */
  async startExperiment(experimentId: string): Promise<void> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'draft') {
      throw new Error(`Cannot start experiment in status: ${experiment.status}`);
    }

    // Update experiment status
    experiment.status = 'running';
    experiment.startedAt = new Date();
    
    // Initialize variant metrics
    for (const variant of experiment.variants) {
      experiment.metrics.variantMetrics[variant.id] = {
        requests: 0,
        conversions: 0,
        conversionRate: 0,
        latency: 0,
        errors: 0,
        customMetrics: {}
      };
    }

    await this.saveExperiment(experiment);
    this.runningExperiments.add(experimentId);
    
    // Set up auto-stop timer if configured
    if (experiment.config.autoStop) {
      this.scheduleAutoStop(experimentId);
    }

    // Set up maximum runtime timer
    this.scheduleMaxRuntimeStop(experimentId);

    logger.info('Experiment started', { experimentId, name: experiment.name });
    this.emit('experiment:started', { experimentId, experiment });
  }

  /**
   * Stop an experiment
   */
  async stopExperiment(experimentId: string, reason: string = 'manual'): Promise<void> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'running') {
      throw new Error(`Cannot stop experiment in status: ${experiment.status}`);
    }

    // Calculate final results
    const results = await this.calculateExperimentResults(experiment);
    
    experiment.status = 'completed';
    experiment.completedAt = new Date();
    experiment.results = results;

    await this.saveExperiment(experiment);
    this.runningExperiments.delete(experimentId);

    logger.info('Experiment stopped', { 
      experimentId, 
      reason, 
      duration: experiment.completedAt.getTime() - experiment.startedAt!.getTime(),
      winner: results.winner 
    });

    this.emit('experiment:stopped', { experimentId, experiment, reason, results });
  }

  /**
   * Route traffic to appropriate variant based on experiment configuration
   */
  async routeTraffic(experimentId: string, requestContext: any): Promise<string> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'running') {
      throw new Error(`No running experiment found: ${experimentId}`);
    }

    // Determine variant based on traffic split
    const variant = this.selectVariant(experiment, requestContext);
    
    // Record traffic routing
    await this.recordMetric(experimentId, variant.id, 'request', {
      timestamp: Date.now(),
      context: requestContext
    });

    return variant.id;
  }

  /**
   * Record experiment metrics
   */
  async recordMetric(experimentId: string, variantId: string, metricType: string, data: any): Promise<void> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'running') {
      return;
    }

    const key = `${experimentId}:${variantId}:${metricType}`;
    if (!this.metricsBuffer.has(key)) {
      this.metricsBuffer.set(key, []);
    }

    this.metricsBuffer.get(key)!.push({
      timestamp: Date.now(),
      ...data
    });

    // Update real-time metrics
    await this.updateMetrics(experimentId, variantId, metricType, data);

    // Check for early stopping conditions
    if (experiment.config.autoStop) {
      await this.checkAutoStopConditions(experimentId);
    }
  }

  /**
   * Get experiment status and metrics
   */
  getExperiment(experimentId: string): Experiment | undefined {
    return this.experiments.get(experimentId);
  }

  /**
   * List all experiments
   */
  listExperiments(): Experiment[] {
    return Array.from(this.experiments.values());
  }

  /**
   * Get running experiments
   */
  getRunningExperiments(): Experiment[] {
    return Array.from(this.runningExperiments)
      .map(id => this.experiments.get(id)!)
      .filter(Boolean);
  }

  /**
   * Validate experiment configuration
   */
  private validateExperiment(experiment: Experiment): void {
    // Check traffic split adds up to 100%
    const totalTraffic = Object.values(experiment.config.trafficSplit)
      .reduce((sum, pct) => sum + pct, 0);
    
    if (Math.abs(totalTraffic - 100) > 0.01) {
      throw new Error(`Traffic split must add up to 100%, got ${totalTraffic}%`);
    }

    // Check all variants have traffic allocation
    for (const variant of experiment.variants) {
      if (!(variant.id in experiment.config.trafficSplit)) {
        throw new Error(`Variant ${variant.id} missing traffic allocation`);
      }
    }

    // Validate significance level
    if (experiment.config.significanceLevel <= 0 || experiment.config.significanceLevel >= 1) {
      throw new Error('Significance level must be between 0 and 1');
    }
  }

  /**
   * Select variant based on traffic split and request context
   */
  private selectVariant(experiment: Experiment, requestContext: any): ExperimentVariant {
    // Use consistent hashing for user assignment
    const userId = requestContext.userId || requestContext.sessionId || 'anonymous';
    const hash = this.hashString(userId + experiment.id);
    const randomValue = (hash % 10000) / 100; // 0-99.99

    let cumulative = 0;
    for (const variant of experiment.variants) {
      cumulative += experiment.config.trafficSplit[variant.id];
      if (randomValue < cumulative) {
        return variant;
      }
    }

    // Fallback to control variant
    return experiment.variants.find(v => v.isControl) || experiment.variants[0];
  }

  /**
   * Simple hash function for consistent user assignment
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Update experiment metrics
   */
  private async updateMetrics(experimentId: string, variantId: string, metricType: string, data: any): Promise<void> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return;

    const variantMetrics = experiment.metrics.variantMetrics[variantId];
    
    switch (metricType) {
      case 'request':
        variantMetrics.requests++;
        experiment.metrics.totalRequests++;
        break;
        
      case 'conversion':
        variantMetrics.conversions++;
        variantMetrics.conversionRate = variantMetrics.conversions / variantMetrics.requests;
        break;
        
      case 'latency':
        // Moving average
        const alpha = 0.1;
        variantMetrics.latency = alpha * data.latency + (1 - alpha) * variantMetrics.latency;
        break;
        
      case 'error':
        variantMetrics.errors++;
        break;
        
      default:
        if (data.value !== undefined) {
          variantMetrics.customMetrics[metricType] = data.value;
        }
    }

    // Update overall metrics
    this.updateOverallMetrics(experiment);
  }

  /**
   * Update overall experiment metrics
   */
  private updateOverallMetrics(experiment: Experiment): void {
    const variants = Object.values(experiment.metrics.variantMetrics);
    
    experiment.metrics.successRate = variants.length > 0 ? 
      variants.reduce((sum, v) => sum + v.conversionRate, 0) / variants.length : 0;
      
    experiment.metrics.averageLatency = variants.length > 0 ?
      variants.reduce((sum, v) => sum + v.latency, 0) / variants.length : 0;
      
    const totalErrors = variants.reduce((sum, v) => sum + v.errors, 0);
    experiment.metrics.errorRate = experiment.metrics.totalRequests > 0 ?
      totalErrors / experiment.metrics.totalRequests : 0;
  }

  /**
   * Check if experiment should be stopped early
   */
  private async checkAutoStopConditions(experimentId: string): Promise<void> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || !experiment.config.autoStop) return;

    // Check if minimum sample size reached
    if (experiment.metrics.totalRequests < experiment.config.minimumSampleSize) {
      return;
    }

    // Calculate current statistical significance
    const results = await this.calculateExperimentResults(experiment);
    
    if (results.significance && results.confidence >= (1 - experiment.config.significanceLevel)) {
      await this.stopExperiment(experimentId, 'auto_stop_significant_result');
    }
  }

  /**
   * Schedule automatic stop at maximum runtime
   */
  private scheduleMaxRuntimeStop(experimentId: string): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return;

    setTimeout(async () => {
      if (this.runningExperiments.has(experimentId)) {
        await this.stopExperiment(experimentId, 'max_runtime_reached');
      }
    }, experiment.config.maxRunTime * 60 * 60 * 1000); // Convert hours to milliseconds
  }

  /**
   * Schedule auto-stop check
   */
  private scheduleAutoStop(experimentId: string): void {
    const checkInterval = 60000; // Check every minute
    
    const intervalId = setInterval(async () => {
      if (!this.runningExperiments.has(experimentId)) {
        clearInterval(intervalId);
        return;
      }
      
      await this.checkAutoStopConditions(experimentId);
    }, checkInterval);
  }

  /**
   * Calculate experiment results using statistical analysis
   */
  private async calculateExperimentResults(experiment: Experiment): Promise<ExperimentResults> {
    const variants = experiment.variants;
    const controlVariant = variants.find(v => v.isControl);
    
    if (!controlVariant) {
      throw new Error('No control variant found');
    }

    const controlMetrics = experiment.metrics.variantMetrics[controlVariant.id];
    let bestVariant = controlVariant;
    let bestConversionRate = controlMetrics.conversionRate;
    let maxConfidence = 0;
    let maxPValue = 1;
    let maxEffect = 0;

    // Compare each variant against control
    for (const variant of variants) {
      if (variant.isControl) continue;
      
      const variantMetrics = experiment.metrics.variantMetrics[variant.id];
      
      // Perform two-proportion z-test
      const { pValue, confidence, effect } = this.twoProportionZTest(
        controlMetrics.conversions,
        controlMetrics.requests,
        variantMetrics.conversions,
        variantMetrics.requests
      );
      
      if (variantMetrics.conversionRate > bestConversionRate && 
          confidence > maxConfidence) {
        bestVariant = variant;
        bestConversionRate = variantMetrics.conversionRate;
        maxConfidence = confidence;
        maxPValue = pValue;
        maxEffect = effect;
      }
    }

    const isSignificant = maxPValue < experiment.config.significanceLevel;
    
    return {
      winner: bestVariant.id,
      confidence: maxConfidence,
      pValue: maxPValue,
      effect: maxEffect,
      significance: isSignificant,
      summary: this.generateResultSummary(experiment, bestVariant, maxConfidence, maxEffect),
      recommendations: this.generateRecommendations(experiment, bestVariant, isSignificant)
    };
  }

  /**
   * Two-proportion z-test for statistical significance
   */
  private twoProportionZTest(
    successes1: number, 
    total1: number, 
    successes2: number, 
    total2: number
  ): { pValue: number; confidence: number; effect: number } {
    
    if (total1 === 0 || total2 === 0) {
      return { pValue: 1, confidence: 0, effect: 0 };
    }

    const p1 = successes1 / total1;
    const p2 = successes2 / total2;
    const pooledP = (successes1 + successes2) / (total1 + total2);
    
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1/total1 + 1/total2));
    const z = Math.abs(p2 - p1) / se;
    
    // Calculate p-value (two-tailed test)
    const pValue = 2 * (1 - this.normalCDF(z));
    
    // Calculate confidence level
    const confidence = 1 - pValue;
    
    // Effect size (difference in conversion rates)
    const effect = p2 - p1;
    
    return { pValue, confidence, effect };
  }

  /**
   * Normal cumulative distribution function approximation
   */
  private normalCDF(x: number): number {
    // Abramowitz and Stegun approximation
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    
    return x > 0 ? 1 - prob : prob;
  }

  /**
   * Generate result summary
   */
  private generateResultSummary(
    experiment: Experiment, 
    winner: ExperimentVariant, 
    confidence: number, 
    effect: number
  ): string {
    const winnerMetrics = experiment.metrics.variantMetrics[winner.id];
    const effectPercent = (effect * 100).toFixed(2);
    const confidencePercent = (confidence * 100).toFixed(1);
    
    return `Variant "${winner.name}" ${winner.isControl ? 'performed as expected' : 'outperformed control'} ` +
           `with ${winnerMetrics.conversionRate.toFixed(3)} conversion rate ` +
           `(${effectPercent > '0' ? '+' : ''}${effectPercent}% ${effect > 0 ? 'improvement' : 'decrease'}) ` +
           `at ${confidencePercent}% confidence level.`;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    experiment: Experiment, 
    winner: ExperimentVariant, 
    isSignificant: boolean
  ): string[] {
    const recommendations: string[] = [];
    
    if (isSignificant) {
      recommendations.push(`Deploy variant "${winner.name}" to 100% of traffic`);
      recommendations.push('Monitor key metrics closely for the first 24-48 hours after rollout');
    } else {
      recommendations.push('No statistically significant difference found');
      recommendations.push('Consider running the experiment longer or increasing sample size');
      recommendations.push('Review test design and target metrics');
    }
    
    // Performance recommendations
    const winnerMetrics = experiment.metrics.variantMetrics[winner.id];
    if (winnerMetrics.latency > 1000) {
      recommendations.push('Consider optimizing performance - latency is above 1 second');
    }
    
    if (winnerMetrics.errors > 0) {
      recommendations.push('Investigate and resolve errors before full deployment');
    }
    
    return recommendations;
  }

  /**
   * Save experiment to database
   */
  private async saveExperiment(experiment: Experiment): Promise<void> {
    try {
      const query = `
        INSERT INTO experiments (
          id, name, description, status, type, config, variants, metrics, results, 
          created_at, started_at, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          metrics = EXCLUDED.metrics,
          results = EXCLUDED.results,
          started_at = EXCLUDED.started_at,
          completed_at = EXCLUDED.completed_at,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      await this.database.query(query, [
        experiment.id,
        experiment.name,
        experiment.description,
        experiment.status,
        experiment.type,
        JSON.stringify(experiment.config),
        JSON.stringify(experiment.variants),
        JSON.stringify(experiment.metrics),
        JSON.stringify(experiment.results || null),
        experiment.createdAt,
        experiment.startedAt || null,
        experiment.completedAt || null
      ]);
      
    } catch (error) {
      logger.error(error as Error, 'Failed to save experiment to database');
    }
  }

  /**
   * Initialize metrics collection
   */
  private initializeMetricsCollection(): void {
    // Flush metrics buffer every 30 seconds
    setInterval(() => {
      this.flushMetricsBuffer();
    }, 30000);
  }

  /**
   * Flush metrics buffer to persistent storage
   */
  private async flushMetricsBuffer(): Promise<void> {
    for (const [key, metrics] of this.metricsBuffer.entries()) {
      if (metrics.length === 0) continue;
      
      try {
        // Store in Redis for real-time access
        await this.redisClient.lpush(`metrics:${key}`, ...metrics.map(m => JSON.stringify(m)));
        await this.redisClient.ltrim(`metrics:${key}`, 0, 1000); // Keep last 1000 metrics
        
        // Clear buffer
        this.metricsBuffer.set(key, []);
        
      } catch (error) {
        logger.error(error as Error, `Failed to flush metrics for ${key}`);
      }
    }
  }
}