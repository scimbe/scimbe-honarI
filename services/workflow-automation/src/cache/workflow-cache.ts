/**
 * Multi-Level Caching System for AI Workflow Generation
 * Implements L1 (Memory), L2 (Redis), L3 (Database) caching strategy
 */

import { FastifyBaseLogger } from 'fastify';
import Redis from 'ioredis';
import { LRUCache } from 'lru-cache';
import { WorkflowGenerationRequest } from '../plugins/workflow-generator-plugin';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
  source: 'L1' | 'L2' | 'L3';
}

export interface WorkflowCacheMetrics {
  l1Hits: number;
  l2Hits: number;
  l3Hits: number;
  misses: number;
  evictions: number;
  totalRequests: number;
  averageResponseTime: number;
}

/**
 * L1 Cache - In-Memory LRU Cache
 */
export class L1Cache {
  private cache: LRUCache<string, CacheEntry<any>>;
  private metrics: WorkflowCacheMetrics;

  constructor(maxSize: number = 1000, ttl: number = 300000) { // 5 minutes default TTL
    this.cache = new LRUCache({
      max: maxSize,
      ttl,
      updateAgeOnGet: true,
      dispose: () => this.metrics.evictions++
    });

    this.metrics = {
      l1Hits: 0,
      l2Hits: 0,
      l3Hits: 0,
      misses: 0,
      evictions: 0,
      totalRequests: 0,
      averageResponseTime: 0
    };
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    const entry = this.cache.get(key) as CacheEntry<T>;
    if (entry) {
      entry.hits++;
      this.metrics.l1Hits++;
      this.updateResponseTime(Date.now() - startTime);
      return entry;
    }

    this.metrics.misses++;
    this.updateResponseTime(Date.now() - startTime);
    return null;
  }

  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || 300000,
      hits: 0,
      source: 'L1'
    };

    this.cache.set(key, entry, { ttl });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  getMetrics(): WorkflowCacheMetrics {
    return { ...this.metrics };
  }

  private updateResponseTime(responseTime: number): void {
    const currentAvg = this.metrics.averageResponseTime;
    const totalRequests = this.metrics.totalRequests;
    this.metrics.averageResponseTime = (currentAvg * (totalRequests - 1) + responseTime) / totalRequests;
  }
}

/**
 * L2 Cache - Redis Distributed Cache
 */
export class L2Cache {
  private redis: Redis;
  private logger: FastifyBaseLogger;
  private keyPrefix: string = 'workflow_cache:';

  constructor(redis: Redis, logger: FastifyBaseLogger) {
    this.redis = redis;
    this.logger = logger;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const fullKey = this.keyPrefix + key;
      const cached = await this.redis.get(fullKey);
      
      if (cached) {
        const entry = JSON.parse(cached) as CacheEntry<T>;
        entry.hits++;
        entry.source = 'L2';
        
        // Update hit count in Redis
        await this.redis.setex(fullKey, Math.floor(entry.ttl / 1000), JSON.stringify(entry));
        
        this.logger.debug({ key, hits: entry.hits }, 'L2 cache hit');
        return entry;
      }

      return null;
    } catch (error) {
      this.logger.error({ error, key }, 'L2 cache get error');
      return null;
    }
  }

  async set<T>(key: string, data: T, ttl: number = 900): Promise<void> {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl: ttl * 1000,
        hits: 0,
        source: 'L2'
      };

      const fullKey = this.keyPrefix + key;
      await this.redis.setex(fullKey, ttl, JSON.stringify(entry));
      
      this.logger.debug({ key, ttl }, 'L2 cache set');
    } catch (error) {
      this.logger.error({ error, key }, 'L2 cache set error');
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(this.keyPrefix + key);
    } catch (error) {
      this.logger.error({ error, key }, 'L2 cache delete error');
    }
  }

  async clear(pattern?: string): Promise<void> {
    try {
      const searchPattern = this.keyPrefix + (pattern || '*');
      const keys = await this.redis.keys(searchPattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.info({ keysDeleted: keys.length }, 'L2 cache cleared');
      }
    } catch (error) {
      this.logger.error({ error, pattern }, 'L2 cache clear error');
    }
  }

  async getKeys(pattern?: string): Promise<string[]> {
    try {
      const searchPattern = this.keyPrefix + (pattern || '*');
      const keys = await this.redis.keys(searchPattern);
      return keys.map(key => key.replace(this.keyPrefix, ''));
    } catch (error) {
      this.logger.error({ error, pattern }, 'L2 cache getKeys error');
      return [];
    }
  }
}

/**
 * L3 Cache - Database Persistent Cache
 */
export class L3Cache {
  private database: any;
  private logger: FastifyBaseLogger;

  constructor(database: any, logger: FastifyBaseLogger) {
    this.database = database;
    this.logger = logger;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const { rows } = await this.database.query(`
        SELECT data, created_at, ttl_seconds, hits 
        FROM workflow_cache 
        WHERE cache_key = $1 
        AND (created_at + INTERVAL '1 second' * ttl_seconds) > NOW()
      `, [key]);

      if (rows.length > 0) {
        const row = rows[0];
        const entry: CacheEntry<T> = {
          data: row.data,
          timestamp: new Date(row.created_at).getTime(),
          ttl: row.ttl_seconds * 1000,
          hits: row.hits + 1,
          source: 'L3'
        };

        // Update hit count
        await this.database.query(`
          UPDATE workflow_cache 
          SET hits = hits + 1, last_accessed = NOW() 
          WHERE cache_key = $1
        `, [key]);

        this.logger.debug({ key, hits: entry.hits }, 'L3 cache hit');
        return entry;
      }

      return null;
    } catch (error) {
      this.logger.error({ error, key }, 'L3 cache get error');
      return null;
    }
  }

  async set<T>(key: string, data: T, ttl: number = 3600): Promise<void> {
    try {
      await this.database.query(`
        INSERT INTO workflow_cache (cache_key, data, ttl_seconds, created_at, last_accessed, hits)
        VALUES ($1, $2, $3, NOW(), NOW(), 0)
        ON CONFLICT (cache_key) DO UPDATE SET
          data = EXCLUDED.data,
          ttl_seconds = EXCLUDED.ttl_seconds,
          created_at = NOW(),
          last_accessed = NOW(),
          hits = 0
      `, [key, JSON.stringify(data), ttl]);

      this.logger.debug({ key, ttl }, 'L3 cache set');
    } catch (error) {
      this.logger.error({ error, key }, 'L3 cache set error');
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.database.query('DELETE FROM workflow_cache WHERE cache_key = $1', [key]);
    } catch (error) {
      this.logger.error({ error, key }, 'L3 cache delete error');
    }
  }

  async clear(pattern?: string): Promise<void> {
    try {
      if (pattern) {
        await this.database.query(
          'DELETE FROM workflow_cache WHERE cache_key LIKE $1', 
          [`%${pattern}%`]
        );
      } else {
        await this.database.query('DELETE FROM workflow_cache');
      }
    } catch (error) {
      this.logger.error({ error, pattern }, 'L3 cache clear error');
    }
  }

  async cleanup(): Promise<void> {
    try {
      const { rows } = await this.database.query(`
        DELETE FROM workflow_cache 
        WHERE (created_at + INTERVAL '1 second' * ttl_seconds) < NOW()
        RETURNING cache_key
      `);

      this.logger.info({ expiredKeys: rows.length }, 'L3 cache cleanup completed');
    } catch (error) {
      this.logger.error({ error }, 'L3 cache cleanup error');
    }
  }
}

/**
 * Multi-Level Cache Manager
 * Coordinates L1, L2, and L3 caches with intelligent cache-aside strategy
 */
export class MultiLevelWorkflowCache {
  private l1: L1Cache;
  private l2: L2Cache;
  private l3: L3Cache;
  private logger: FastifyBaseLogger;

  constructor(redis: Redis, database: any, logger: FastifyBaseLogger) {
    this.l1 = new L1Cache(1000, 300000); // 1000 items, 5 minutes
    this.l2 = new L2Cache(redis, logger);
    this.l3 = new L3Cache(database, logger);
    this.logger = logger;

    // Setup periodic L3 cleanup
    setInterval(() => {
      this.l3.cleanup().catch(error => 
        this.logger.error({ error }, 'L3 cache cleanup failed')
      );
    }, 3600000); // Every hour
  }

  /**
   * Get from cache with L1 -> L2 -> L3 fallback strategy
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();

    try {
      // Try L1 first
      let entry = await this.l1.get<T>(key);
      if (entry) {
        this.logger.debug({ key, source: 'L1', responseTime: Date.now() - startTime }, 'Cache hit');
        return entry.data;
      }

      // Try L2
      entry = await this.l2.get<T>(key);
      if (entry) {
        // Promote to L1
        await this.l1.set(key, entry.data, Math.min(entry.ttl, 300000));
        this.logger.debug({ key, source: 'L2', responseTime: Date.now() - startTime }, 'Cache hit');
        return entry.data;
      }

      // Try L3
      entry = await this.l3.get<T>(key);
      if (entry) {
        // Promote to L2 and L1
        await this.l2.set(key, entry.data, Math.min(entry.ttl / 1000, 900));
        await this.l1.set(key, entry.data, Math.min(entry.ttl, 300000));
        this.logger.debug({ key, source: 'L3', responseTime: Date.now() - startTime }, 'Cache hit');
        return entry.data;
      }

      this.logger.debug({ key, responseTime: Date.now() - startTime }, 'Cache miss');
      return null;

    } catch (error) {
      this.logger.error({ error, key }, 'Multi-level cache get error');
      return null;
    }
  }

  /**
   * Set to all cache levels
   */
  async set<T>(key: string, data: T, ttl?: { l1?: number; l2?: number; l3?: number }): Promise<void> {
    try {
      const defaultTtl = { l1: 300000, l2: 900, l3: 3600 }; // 5min, 15min, 1hour
      const actualTtl = { ...defaultTtl, ...ttl };

      // Set to all levels simultaneously
      await Promise.all([
        this.l1.set(key, data, actualTtl.l1),
        this.l2.set(key, data, actualTtl.l2),
        this.l3.set(key, data, actualTtl.l3)
      ]);

      this.logger.debug({ key, ttl: actualTtl }, 'Multi-level cache set');
    } catch (error) {
      this.logger.error({ error, key }, 'Multi-level cache set error');
    }
  }

  /**
   * Delete from all cache levels
   */
  async delete(key: string): Promise<void> {
    try {
      await Promise.all([
        this.l1.delete(key),
        this.l2.delete(key),
        this.l3.delete(key)
      ]);

      this.logger.debug({ key }, 'Multi-level cache delete');
    } catch (error) {
      this.logger.error({ error, key }, 'Multi-level cache delete error');
    }
  }

  /**
   * Clear all cache levels
   */
  async clear(pattern?: string): Promise<void> {
    try {
      await Promise.all([
        this.l1.clear(),
        this.l2.clear(pattern),
        this.l3.clear(pattern)
      ]);

      this.logger.info({ pattern }, 'Multi-level cache cleared');
    } catch (error) {
      this.logger.error({ error, pattern }, 'Multi-level cache clear error');
    }
  }

  /**
   * Get comprehensive cache metrics
   */
  getMetrics(): WorkflowCacheMetrics {
    return this.l1.getMetrics();
  }

  /**
   * Generate cache key for workflow generation requests
   */
  generateWorkflowKey(request: WorkflowGenerationRequest): string {
    const keyData = {
      requirements: request.requirements,
      language: request.target_language,
      complexity: request.user_preferences?.complexity,
      models: {
        ideation: request.user_preferences?.ideation_model,
        spec: request.user_preferences?.spec_builder_model,
        code: request.user_preferences?.code_generator_model
      }
    };

    // Create deterministic hash of request parameters
    const hash = require('crypto')
      .createHash('md5')
      .update(JSON.stringify(keyData))
      .digest('hex');

    return `workflow:${hash}`;
  }

  /**
   * Generate cache key for AI model responses
   */
  generateAIResponseKey(model: string, prompt: string, temperature: number = 0.7): string {
    const keyData = { model, prompt: prompt.substring(0, 500), temperature }; // Truncate prompt for key
    const hash = require('crypto')
      .createHash('md5')
      .update(JSON.stringify(keyData))
      .digest('hex');

    return `ai_response:${model}:${hash}`;
  }

  /**
   * Generate cache key for plugin metadata
   */
  generatePluginKey(pluginId: string): string {
    return `plugin:${pluginId}`;
  }

  /**
   * Warm up cache with frequently used templates
   */
  async warmUpCache(): Promise<void> {
    try {
      this.logger.info('Starting cache warm-up');

      // Load frequently used generation templates
      const { rows } = await this.l3.database.query(`
        SELECT template_name, requirements_pattern, success_indicators, optimization_hints
        FROM generation_templates 
        WHERE usage_count > 5
        ORDER BY usage_count DESC
        LIMIT 50
      `);

      for (const template of rows) {
        const key = `template:${template.template_name}`;
        await this.set(key, template, { l1: 1800000, l2: 3600, l3: 86400 }); // 30min, 1hour, 1day
      }

      this.logger.info({ templatesLoaded: rows.length }, 'Cache warm-up completed');
    } catch (error) {
      this.logger.error({ error }, 'Cache warm-up failed');
    }
  }
}