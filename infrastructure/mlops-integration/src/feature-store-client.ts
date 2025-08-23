/**
 * Feast Feature Store Integration
 * Advanced feature management for MLOps workflows
 */

import { EventEmitter } from 'events';
import { createServiceLogger } from '../../../services/workflow-automation/src/shared-utils-local';

const logger = createServiceLogger('feature-store-client');

export interface FeatureView {
  name: string;
  entities: string[];
  features: FeatureDefinition[];
  source: DataSource;
  ttl: number; // Time to live in seconds
  tags: Record<string, string>;
  description: string;
  online: boolean;
  batch: boolean;
}

export interface FeatureDefinition {
  name: string;
  dtype: 'int64' | 'float64' | 'string' | 'bool' | 'bytes' | 'array';
  description: string;
  labels: Record<string, string>;
}

export interface DataSource {
  type: 'file' | 'bigquery' | 'redshift' | 'kafka' | 'kinesis' | 'snowflake';
  config: Record<string, any>;
  timestampField: string;
  createdTimestampColumn?: string;
}

export interface Entity {
  name: string;
  valueType: 'int64' | 'string';
  description: string;
  tags: Record<string, string>;
}

export interface FeatureService {
  name: string;
  features: string[]; // feature_view:feature_name format
  tags: Record<string, string>;
  description: string;
}

export interface OnlineFeatureRequest {
  featureService?: string;
  features?: string[];
  entities: Record<string, any>;
  fullFeatureNames?: boolean;
}

export interface HistoricalFeatureRequest {
  features: string[];
  entityDf: any; // DataFrame-like structure
  fullFeatureNames?: boolean;
}

export interface FeatureVector {
  entities: Record<string, any>;
  features: Record<string, any>;
  metadata: {
    timestamp: Date;
    sources: Record<string, string>;
    freshness: Record<string, number>;
  };
}

export interface FeatureStatistics {
  featureName: string;
  count: number;
  mean?: number;
  std?: number;
  min?: number;
  max?: number;
  nullCount: number;
  uniqueCount: number;
  topValues?: Array<{ value: any; count: number }>;
}

export class FeatureStoreClient extends EventEmitter {
  private featureViews: Map<string, FeatureView> = new Map();
  private entities: Map<string, Entity> = new Map();
  private featureServices: Map<string, FeatureService> = new Map();
  private onlineStore: any; // Redis client
  private offlineStore: any; // Database connection
  private registry: any; // Feature registry

  constructor(
    private config: {
      registryPath: string;
      onlineStore: any;
      offlineStore: any;
      project: string;
    }
  ) {
    super();
    this.onlineStore = config.onlineStore;
    this.offlineStore = config.offlineStore;
    this.initializeRegistry();
  }

  /**
   * Apply feature definitions to the registry
   */
  async apply(definitions: {
    entities?: Entity[];
    featureViews?: FeatureView[];
    featureServices?: FeatureService[];
  }): Promise<void> {
    try {
      // Apply entities
      if (definitions.entities) {
        for (const entity of definitions.entities) {
          await this.registerEntity(entity);
        }
      }

      // Apply feature views
      if (definitions.featureViews) {
        for (const featureView of definitions.featureViews) {
          await this.registerFeatureView(featureView);
        }
      }

      // Apply feature services
      if (definitions.featureServices) {
        for (const featureService of definitions.featureServices) {
          await this.registerFeatureService(featureService);
        }
      }

      // Materialize to online store
      await this.materializeToOnlineStore();

      logger.info('Feature definitions applied successfully', {
        entities: definitions.entities?.length || 0,
        featureViews: definitions.featureViews?.length || 0,
        featureServices: definitions.featureServices?.length || 0
      });

      this.emit('features:applied', { definitions });

    } catch (error) {
      logger.error(error as Error, 'Failed to apply feature definitions');
      throw error;
    }
  }

  /**
   * Get online features for real-time inference
   */
  async getOnlineFeatures(request: OnlineFeatureRequest): Promise<FeatureVector[]> {
    try {
      const { featureService, features, entities, fullFeatureNames = false } = request;
      
      let requestedFeatures: string[] = [];
      
      if (featureService) {
        const service = this.featureServices.get(featureService);
        if (!service) {
          throw new Error(`Feature service ${featureService} not found`);
        }
        requestedFeatures = service.features;
      } else if (features) {
        requestedFeatures = features;
      } else {
        throw new Error('Either featureService or features must be specified');
      }

      const results: FeatureVector[] = [];
      const entityKeys = Array.isArray(entities) ? entities : [entities];

      for (const entityKey of entityKeys) {
        const featureVector = await this.fetchOnlineFeatures(requestedFeatures, entityKey, fullFeatureNames);
        results.push(featureVector);
      }

      this.emit('features:online_retrieved', { 
        count: results.length, 
        features: requestedFeatures.length 
      });

      return results;

    } catch (error) {
      logger.error(error as Error, 'Failed to get online features');
      throw error;
    }
  }

  /**
   * Get historical features for training
   */
  async getHistoricalFeatures(request: HistoricalFeatureRequest): Promise<any[]> {
    try {
      const { features, entityDf, fullFeatureNames = false } = request;
      
      // Validate feature references
      for (const feature of features) {
        if (!this.validateFeatureReference(feature)) {
          throw new Error(`Invalid feature reference: ${feature}`);
        }
      }

      const results = await this.fetchHistoricalFeatures(features, entityDf, fullFeatureNames);
      
      logger.info('Historical features retrieved', {
        features: features.length,
        entities: Array.isArray(entityDf) ? entityDf.length : 1
      });

      this.emit('features:historical_retrieved', { 
        features: features.length,
        entities: Array.isArray(entityDf) ? entityDf.length : 1
      });

      return results;

    } catch (error) {
      logger.error(error as Error, 'Failed to get historical features');
      throw error;
    }
  }

  /**
   * Write features to online and offline stores
   */
  async writeToOnlineStore(featureViewName: string, df: any[]): Promise<void> {
    try {
      const featureView = this.featureViews.get(featureViewName);
      if (!featureView) {
        throw new Error(`Feature view ${featureViewName} not found`);
      }

      // Write to online store (Redis)
      for (const row of df) {
        await this.writeRowToOnlineStore(featureView, row);
      }

      logger.info('Features written to online store', {
        featureView: featureViewName,
        rows: df.length
      });

      this.emit('features:written_online', { featureView: featureViewName, count: df.length });

    } catch (error) {
      logger.error(error as Error, 'Failed to write features to online store');
      throw error;
    }
  }

  /**
   * Get feature statistics
   */
  async getFeatureStatistics(featureViewName: string, featureName?: string): Promise<FeatureStatistics[]> {
    try {
      const featureView = this.featureViews.get(featureViewName);
      if (!featureView) {
        throw new Error(`Feature view ${featureViewName} not found`);
      }

      const features = featureName ? [featureName] : featureView.features.map(f => f.name);
      const statistics: FeatureStatistics[] = [];

      for (const feature of features) {
        const stats = await this.calculateFeatureStatistics(featureViewName, feature);
        statistics.push(stats);
      }

      return statistics;

    } catch (error) {
      logger.error(error as Error, 'Failed to get feature statistics');
      throw error;
    }
  }

  /**
   * List all feature views
   */
  listFeatureViews(): FeatureView[] {
    return Array.from(this.featureViews.values());
  }

  /**
   * List all entities
   */
  listEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  /**
   * List all feature services
   */
  listFeatureServices(): FeatureService[] {
    return Array.from(this.featureServices.values());
  }

  /**
   * Validate feature store health
   */
  async validateFeatureStore(): Promise<{
    healthy: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // Check online store connectivity
      await this.onlineStore.ping();
    } catch (error) {
      issues.push('Online store not accessible');
      recommendations.push('Check Redis connection and configuration');
    }

    try {
      // Check offline store connectivity
      await this.offlineStore.query('SELECT 1');
    } catch (error) {
      issues.push('Offline store not accessible');
      recommendations.push('Check database connection and configuration');
    }

    // Check feature freshness
    for (const [name, featureView] of this.featureViews.entries()) {
      const freshness = await this.checkFeatureFreshness(name);
      if (freshness > featureView.ttl) {
        issues.push(`Feature view ${name} has stale data`);
        recommendations.push(`Refresh feature view ${name} or adjust TTL`);
      }
    }

    return {
      healthy: issues.length === 0,
      issues,
      recommendations
    };
  }

  /**
   * Create feature transformation pipeline
   */
  async createTransformationPipeline(
    name: string,
    sourceFeatureView: string,
    transformations: Array<{
      type: 'aggregate' | 'window' | 'join' | 'filter';
      config: Record<string, any>;
    }>
  ): Promise<string> {
    const pipelineId = `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store pipeline configuration
    const pipeline = {
      id: pipelineId,
      name,
      sourceFeatureView,
      transformations,
      createdAt: new Date()
    };

    await this.storePipelineConfig(pipeline);
    
    logger.info('Transformation pipeline created', { pipelineId, name });
    
    return pipelineId;
  }

  /**
   * Execute feature transformation pipeline
   */
  async executePipeline(pipelineId: string, inputData: any[]): Promise<any[]> {
    const pipeline = await this.loadPipelineConfig(pipelineId);
    
    let data = inputData;
    
    for (const transformation of pipeline.transformations) {
      data = await this.applyTransformation(transformation, data);
    }
    
    logger.info('Pipeline executed', { pipelineId, inputRows: inputData.length, outputRows: data.length });
    
    return data;
  }

  /**
   * Private helper methods
   */
  private async initializeRegistry(): Promise<void> {
    try {
      // Load existing feature definitions from registry
      await this.loadFromRegistry();
      
      logger.info('Feature store registry initialized', {
        featureViews: this.featureViews.size,
        entities: this.entities.size,
        featureServices: this.featureServices.size
      });
      
    } catch (error) {
      logger.error(error as Error, 'Failed to initialize feature store registry');
      throw error;
    }
  }

  private async registerEntity(entity: Entity): Promise<void> {
    this.entities.set(entity.name, entity);
    await this.saveToRegistry('entity', entity);
  }

  private async registerFeatureView(featureView: FeatureView): Promise<void> {
    this.featureViews.set(featureView.name, featureView);
    await this.saveToRegistry('feature_view', featureView);
  }

  private async registerFeatureService(featureService: FeatureService): Promise<void> {
    this.featureServices.set(featureService.name, featureService);
    await this.saveToRegistry('feature_service', featureService);
  }

  private async fetchOnlineFeatures(
    features: string[], 
    entities: Record<string, any>, 
    fullFeatureNames: boolean
  ): Promise<FeatureVector> {
    const result: FeatureVector = {
      entities,
      features: {},
      metadata: {
        timestamp: new Date(),
        sources: {},
        freshness: {}
      }
    };

    for (const featureRef of features) {
      const [featureViewName, featureName] = featureRef.split(':');
      const featureView = this.featureViews.get(featureViewName);
      
      if (!featureView) {
        logger.warn('Feature view not found', { featureViewName });
        continue;
      }

      // Build Redis key for the feature
      const entityKey = this.buildEntityKey(featureView, entities);
      const redisKey = `${this.config.project}:${featureViewName}:${entityKey}`;
      
      try {
        const featureData = await this.onlineStore.hget(redisKey, featureName);
        
        if (featureData) {
          const parsedData = JSON.parse(featureData);
          const key = fullFeatureNames ? featureRef : featureName;
          
          result.features[key] = parsedData.value;
          result.metadata.sources[key] = featureViewName;
          result.metadata.freshness[key] = Date.now() - parsedData.timestamp;
        }
        
      } catch (error) {
        logger.error(error as Error, 'Failed to fetch online feature', { featureRef });
      }
    }

    return result;
  }

  private async fetchHistoricalFeatures(
    features: string[], 
    entityDf: any[], 
    fullFeatureNames: boolean
  ): Promise<any[]> {
    const results: any[] = [];
    
    // Group features by feature view for efficient querying
    const featuresByView = this.groupFeaturesByView(features);
    
    for (const entityRow of entityDf) {
      const resultRow = { ...entityRow };
      
      for (const [featureViewName, featureNames] of featuresByView.entries()) {
        const featureView = this.featureViews.get(featureViewName);
        if (!featureView) continue;
        
        const historicalData = await this.queryHistoricalData(
          featureView, 
          featureNames, 
          entityRow
        );
        
        for (const [featureName, value] of Object.entries(historicalData)) {
          const key = fullFeatureNames ? `${featureViewName}:${featureName}` : featureName;
          resultRow[key] = value;
        }
      }
      
      results.push(resultRow);
    }
    
    return results;
  }

  private async writeRowToOnlineStore(featureView: FeatureView, row: Record<string, any>): Promise<void> {
    const entityKey = this.buildEntityKey(featureView, row);
    const redisKey = `${this.config.project}:${featureView.name}:${entityKey}`;
    
    const featureData: Record<string, string> = {};
    
    for (const feature of featureView.features) {
      if (row[feature.name] !== undefined) {
        featureData[feature.name] = JSON.stringify({
          value: row[feature.name],
          timestamp: Date.now()
        });
      }
    }
    
    await this.onlineStore.hmset(redisKey, featureData);
    
    // Set TTL if configured
    if (featureView.ttl > 0) {
      await this.onlineStore.expire(redisKey, featureView.ttl);
    }
  }

  private buildEntityKey(featureView: FeatureView, entities: Record<string, any>): string {
    return featureView.entities.map(entityName => entities[entityName]).join('__');
  }

  private validateFeatureReference(featureRef: string): boolean {
    const parts = featureRef.split(':');
    if (parts.length !== 2) return false;
    
    const [featureViewName, featureName] = parts;
    const featureView = this.featureViews.get(featureViewName);
    
    return featureView?.features.some(f => f.name === featureName) || false;
  }

  private groupFeaturesByView(features: string[]): Map<string, string[]> {
    const grouped = new Map<string, string[]>();
    
    for (const featureRef of features) {
      const [featureViewName, featureName] = featureRef.split(':');
      
      if (!grouped.has(featureViewName)) {
        grouped.set(featureViewName, []);
      }
      
      grouped.get(featureViewName)!.push(featureName);
    }
    
    return grouped;
  }

  private async calculateFeatureStatistics(featureViewName: string, featureName: string): Promise<FeatureStatistics> {
    const query = `
      SELECT 
        COUNT(*) as count,
        AVG(CASE WHEN ${featureName} IS NOT NULL THEN ${featureName} END) as mean,
        STDDEV(CASE WHEN ${featureName} IS NOT NULL THEN ${featureName} END) as std,
        MIN(${featureName}) as min,
        MAX(${featureName}) as max,
        COUNT(CASE WHEN ${featureName} IS NULL THEN 1 END) as null_count,
        COUNT(DISTINCT ${featureName}) as unique_count
      FROM ${featureViewName}
    `;
    
    const result = await this.offlineStore.query(query);
    const stats = result.rows[0];
    
    return {
      featureName,
      count: parseInt(stats.count),
      mean: stats.mean ? parseFloat(stats.mean) : undefined,
      std: stats.std ? parseFloat(stats.std) : undefined,
      min: stats.min ? parseFloat(stats.min) : undefined,
      max: stats.max ? parseFloat(stats.max) : undefined,
      nullCount: parseInt(stats.null_count),
      uniqueCount: parseInt(stats.unique_count)
    };
  }

  private async checkFeatureFreshness(featureViewName: string): Promise<number> {
    // Check the age of the most recent feature data
    const key = `${this.config.project}:${featureViewName}:*`;
    const keys = await this.onlineStore.keys(key);
    
    if (keys.length === 0) return Infinity;
    
    let minAge = Infinity;
    
    for (const redisKey of keys.slice(0, 10)) { // Sample first 10 keys
      const featureData = await this.onlineStore.hgetall(redisKey);
      
      for (const data of Object.values(featureData)) {
        try {
          const parsed = JSON.parse(data as string);
          const age = Date.now() - parsed.timestamp;
          minAge = Math.min(minAge, age / 1000); // Convert to seconds
        } catch (error) {
          // Skip invalid data
        }
      }
    }
    
    return minAge;
  }

  private async materializeToOnlineStore(): Promise<void> {
    // Materialize features from offline to online store
    for (const [name, featureView] of this.featureViews.entries()) {
      if (!featureView.online) continue;
      
      logger.info('Materializing feature view to online store', { name });
      
      // This would typically involve reading from the offline store and writing to online store
      // Implementation depends on specific data source configuration
    }
  }

  private async loadFromRegistry(): Promise<void> {
    // Load feature definitions from persistent registry
    // Implementation depends on registry storage (file, database, etc.)
  }

  private async saveToRegistry(type: string, definition: any): Promise<void> {
    // Save feature definition to persistent registry
    // Implementation depends on registry storage
  }

  private async queryHistoricalData(
    featureView: FeatureView, 
    featureNames: string[], 
    entityRow: Record<string, any>
  ): Promise<Record<string, any>> {
    // Query historical feature data from offline store
    // Implementation depends on data source type and configuration
    return {};
  }

  private async storePipelineConfig(pipeline: any): Promise<void> {
    // Store transformation pipeline configuration
  }

  private async loadPipelineConfig(pipelineId: string): Promise<any> {
    // Load transformation pipeline configuration
    return {};
  }

  private async applyTransformation(transformation: any, data: any[]): Promise<any[]> {
    // Apply transformation to data
    // Implementation depends on transformation type
    return data;
  }
}