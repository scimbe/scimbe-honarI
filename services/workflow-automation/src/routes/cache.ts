/**
 * Cache Management Routes for Workflow Automation Service
 * Provides endpoints for cache monitoring, warming, and administration
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('cache-routes');

interface CacheOperationParams {
  operation: 'clear' | 'warm' | 'metrics' | 'invalidate';
}

interface CacheKeyParams {
  key: string;
}

interface CacheClearBody {
  pattern?: string;
  cache_levels?: ('L1' | 'L2' | 'L3')[];
}

export async function cacheRoutes(fastify: FastifyInstance): Promise<void> {
  
  // Get comprehensive cache metrics
  fastify.get('/api/v1/cache/metrics', {
    schema: {


      response: {
        200: {
          type: 'object',
          properties: {
            l1_metrics: {
              type: 'object',
              properties: {
                hits: { type: 'number' },
                misses: { type: 'number' },
                evictions: { type: 'number' },
                hit_rate: { type: 'number' },
                average_response_time: { type: 'number' }
              }
            },
            l2_metrics: {
              type: 'object',
              properties: {
                total_keys: { type: 'number' },
                memory_usage: { type: 'string' },
                connected_clients: { type: 'number' }
              }
            },
            l3_metrics: {
              type: 'object',
              properties: {
                total_cached_items: { type: 'number' },
                cache_size_mb: { type: 'number' },
                expired_items: { type: 'number' },
                most_accessed_templates: { type: 'array' }
              }
            },
            overall_performance: {
              type: 'object',
              properties: {
                total_requests: { type: 'number' },
                cache_efficiency: { type: 'number' },
                cost_savings_estimate: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const cache = (fastify as any).workflowCache;
      if (!cache) {
        return reply.status(503).send({
          error: 'CACHE_NOT_AVAILABLE',
          message: 'Multi-level cache system not initialized'
        });
      }

      // Get L1 metrics
      const l1Metrics = cache.getMetrics();
      
      // Get L2 metrics (Redis)
      const redisInfo = await fastify.redis.info('memory');
      const redisKeys = await fastify.redis.dbsize();
      
      // Get L3 metrics (Database)
      const { rows: cacheStats } = await fastify.database.query(`
        SELECT 
          COUNT(*) as total_cached_items,
          ROUND(AVG(LENGTH(data::text)) / 1024.0, 2) as avg_item_size_kb,
          COUNT(*) FILTER (WHERE (created_at + INTERVAL '1 second' * ttl_seconds) < NOW()) as expired_items,
          SUM(hits) as total_hits
        FROM workflow_cache
      `);

      const { rows: topTemplates } = await fastify.database.query(`
        SELECT template_name, usage_frequency, avg_quality_score
        FROM template_cache 
        ORDER BY usage_frequency DESC 
        LIMIT 5
      `);

      const cacheEfficiency = l1Metrics.totalRequests > 0 
        ? ((l1Metrics.l1Hits + l1Metrics.l2Hits + l1Metrics.l3Hits) / l1Metrics.totalRequests) * 100
        : 0;

      // Estimate cost savings (assuming $0.002 per AI API call)
      const totalCacheHits = l1Metrics.l1Hits + l1Metrics.l2Hits + l1Metrics.l3Hits;
      const estimatedSavings = totalCacheHits * 0.002;

      const metrics = {
        l1_metrics: {
          hits: l1Metrics.l1Hits,
          misses: l1Metrics.misses,
          evictions: l1Metrics.evictions,
          hit_rate: l1Metrics.totalRequests > 0 ? (l1Metrics.l1Hits / l1Metrics.totalRequests) * 100 : 0,
          average_response_time: l1Metrics.averageResponseTime
        },
        l2_metrics: {
          total_keys: redisKeys,
          memory_usage: this.parseRedisMemory(redisInfo),
          connected_clients: await fastify.redis.client('list').then(list => list.split('\n').length - 1)
        },
        l3_metrics: {
          total_cached_items: parseInt(cacheStats[0]?.total_cached_items || '0'),
          cache_size_mb: parseFloat(cacheStats[0]?.avg_item_size_kb || '0') * parseInt(cacheStats[0]?.total_cached_items || '0') / 1024,
          expired_items: parseInt(cacheStats[0]?.expired_items || '0'),
          most_accessed_templates: topTemplates
        },
        overall_performance: {
          total_requests: l1Metrics.totalRequests,
          cache_efficiency: Math.round(cacheEfficiency * 100) / 100,
          cost_savings_estimate: `$${estimatedSavings.toFixed(2)}`
        }
      };

      logger.getLogger().info({
        cacheEfficiency,
        totalRequests: l1Metrics.totalRequests,
        estimatedSavings
      }, 'Cache metrics retrieved');

      return reply.send(metrics);

    } catch (error) {
      logger.error(error as Error, {}, 'Failed to retrieve cache metrics');
      return reply.status(500).send({
        error: 'METRICS_RETRIEVAL_FAILED',
        message: 'Failed to retrieve cache metrics'
      });
    }
  });

  // Warm up cache with frequently used data
  fastify.post('/api/v1/cache/warm', {
    schema: {


      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            items_loaded: { type: 'number' },
            categories: {
              type: 'object',
              properties: {
                templates: { type: 'number' },
                ai_responses: { type: 'number' },
                plugins: { type: 'number' }
              }
            },
            warm_up_time_ms: { type: 'number' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const cache = (fastify as any).workflowCache;
      if (!cache) {
        return reply.status(503).send({
          error: 'CACHE_NOT_AVAILABLE',
          message: 'Multi-level cache system not initialized'
        });
      }

      let itemsLoaded = 0;
      const categories = { templates: 0, ai_responses: 0, plugins: 0 };

      // Load frequently used templates
      const { rows: templates } = await fastify.database.query(`
        SELECT template_name, generated_code, success_metrics, optimization_hints
        FROM template_cache 
        WHERE usage_frequency > 3
        ORDER BY usage_frequency DESC, avg_quality_score DESC
        LIMIT 50
      `);

      for (const template of templates) {
        const key = `template:${template.template_name}`;
        await cache.set(key, template, { l1: 1800000, l2: 3600, l3: 86400 });
        categories.templates++;
        itemsLoaded++;
      }

      // Load high-quality AI responses
      const { rows: aiResponses } = await fastify.database.query(`
        SELECT model_name, prompt_hash, response_data, quality_score
        FROM ai_response_cache 
        WHERE quality_score > 0.85 
        AND expires_at > NOW()
        AND usage_count > 2
        ORDER BY usage_count DESC, quality_score DESC
        LIMIT 100
      `);

      for (const response of aiResponses) {
        const key = `ai_response:${response.model_name}:${response.prompt_hash}`;
        await cache.set(key, response.response_data, { l1: 3600000, l2: 7200, l3: 86400 });
        categories.ai_responses++;
        itemsLoaded++;
      }

      // Load active plugin metadata
      const { rows: plugins } = await fastify.database.query(`
        SELECT plugin_id, metadata, performance_metrics
        FROM plugin_cache 
        WHERE cache_until > NOW()
        ORDER BY last_updated DESC
        LIMIT 30
      `);

      for (const plugin of plugins) {
        const key = cache.generatePluginKey(plugin.plugin_id);
        await cache.set(key, { metadata: plugin.metadata, metrics: plugin.performance_metrics }, 
          { l1: 900000, l2: 1800, l3: 7200 });
        categories.plugins++;
        itemsLoaded++;
      }

      const warmUpTime = Date.now() - startTime;

      logger.getLogger().info({
        itemsLoaded,
        categories,
        warmUpTime
      }, 'Cache warm-up completed');

      return reply.send({
        success: true,
        items_loaded: itemsLoaded,
        categories,
        warm_up_time_ms: warmUpTime
      });

    } catch (error) {
      logger.error(error as Error, {}, 'Cache warm-up failed');
      return reply.status(500).send({
        error: 'WARM_UP_FAILED',
        message: 'Failed to warm up cache'
      });
    }
  });

  // Clear cache with optional pattern matching
  fastify.post<{ Body: CacheClearBody }>('/api/v1/cache/clear', {
    schema: {


      body: {
        type: 'object',
        properties: {
          pattern: { 
            type: 'string',
            description: 'Pattern to match cache keys (supports wildcards)'
          },
          cache_levels: {
            type: 'array',
            items: { type: 'string', enum: ['L1', 'L2', 'L3'] },
            description: 'Specific cache levels to clear'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            cleared_levels: { type: 'array', items: { type: 'string' } },
            pattern_used: { type: 'string' },
            estimated_items_cleared: { type: 'number' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CacheClearBody }>, reply: FastifyReply) => {
    try {
      const { pattern, cache_levels } = request.body;
      const cache = (fastify as any).workflowCache;
      
      if (!cache) {
        return reply.status(503).send({
          error: 'CACHE_NOT_AVAILABLE',
          message: 'Multi-level cache system not initialized'
        });
      }

      const levelsToClears = cache_levels || ['L1', 'L2', 'L3'];
      let estimatedItemsCleared = 0;

      // Estimate items before clearing
      if (pattern) {
        const { rows } = await fastify.database.query(
          'SELECT COUNT(*) as count FROM workflow_cache WHERE cache_key LIKE $1',
          [`%${pattern}%`]
        );
        estimatedItemsCleared = parseInt(rows[0]?.count || '0');
      }

      // Clear specified levels
      if (levelsToClears.includes('L1') || levelsToClears.includes('L2') || levelsToClears.includes('L3')) {
        await cache.clear(pattern);
      }

      logger.getLogger().info({
        pattern,
        clearedLevels: levelsToClears,
        estimatedItemsCleared
      }, 'Cache cleared');

      return reply.send({
        success: true,
        cleared_levels: levelsToClears,
        pattern_used: pattern || '*',
        estimated_items_cleared: estimatedItemsCleared
      });

    } catch (error) {
      logger.error(error as Error, {}, 'Cache clear failed');
      return reply.status(500).send({
        error: 'CACHE_CLEAR_FAILED',
        message: 'Failed to clear cache'
      });
    }
  });

  // Get specific cache entry
  fastify.get<{ Params: CacheKeyParams }>('/api/v1/cache/entry/:key', {
    schema: {


      params: {
        type: 'object',
        required: ['key'],
        properties: {
          key: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            found: { type: 'boolean' },
            source: { type: 'string', enum: ['L1', 'L2', 'L3'] },
            data: { type: 'object' },
            metadata: {
              type: 'object',
              properties: {
                timestamp: { type: 'number' },
                ttl: { type: 'number' },
                hits: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: CacheKeyParams }>, reply: FastifyReply) => {
    try {
      const { key } = request.params;
      const cache = (fastify as any).workflowCache;
      
      if (!cache) {
        return reply.status(503).send({
          error: 'CACHE_NOT_AVAILABLE',
          message: 'Multi-level cache system not initialized'
        });
      }

      const entry = await cache.get(key);
      
      if (entry) {
        return reply.send({
          found: true,
          source: 'multi-level', // Cache determines actual source
          data: entry,
          metadata: {
            timestamp: Date.now(),
            ttl: 'varies by level',
            hits: 'tracked per level'
          }
        });
      } else {
        return reply.send({
          found: false,
          source: null,
          data: null,
          metadata: null
        });
      }

    } catch (error) {
      logger.error(error as Error, { key: request.params.key }, 'Cache entry retrieval failed');
      return reply.status(500).send({
        error: 'CACHE_ENTRY_RETRIEVAL_FAILED',
        message: 'Failed to retrieve cache entry'
      });
    }
  });

  // Cache health check
  fastify.get('/api/v1/cache/health', {
    schema: {


      response: {
        200: {
          type: 'object',
          properties: {
            overall_status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            l1_status: { type: 'string' },
            l2_status: { type: 'string' },
            l3_status: { type: 'string' },
            performance_grade: { type: 'string', enum: ['A', 'B', 'C', 'D', 'F'] },
            recommendations: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const cache = (fastify as any).workflowCache;
      const recommendations: string[] = [];
      
      // Check L1 (Memory) status
      const l1Metrics = cache?.getMetrics() || { totalRequests: 0, l1Hits: 0, averageResponseTime: 0 };
      const l1HitRate = l1Metrics.totalRequests > 0 ? (l1Metrics.l1Hits / l1Metrics.totalRequests) * 100 : 0;
      const l1Status = l1HitRate > 80 ? 'healthy' : l1HitRate > 50 ? 'degraded' : 'unhealthy';
      
      if (l1HitRate < 60) {
        recommendations.push('Consider increasing L1 cache size or TTL');
      }

      // Check L2 (Redis) status
      let l2Status = 'healthy';
      try {
        await fastify.redis.ping();
        const memory = await fastify.redis.info('memory');
        if (memory.includes('maxmemory_policy:noeviction')) {
          recommendations.push('Configure Redis eviction policy for better cache management');
        }
      } catch {
        l2Status = 'unhealthy';
        recommendations.push('Redis connection issues detected');
      }

      // Check L3 (Database) status
      let l3Status = 'healthy';
      try {
        await fastify.database.query('SELECT 1');
        const { rows } = await fastify.database.query(`
          SELECT COUNT(*) as expired_count 
          FROM workflow_cache 
          WHERE (created_at + INTERVAL '1 second' * ttl_seconds) < NOW()
        `);
        
        const expiredCount = parseInt(rows[0]?.expired_count || '0');
        if (expiredCount > 100) {
          recommendations.push('Run cache cleanup - many expired entries detected');
        }
      } catch {
        l3Status = 'unhealthy';
        recommendations.push('Database connection issues detected');
      }

      // Calculate overall status and performance grade
      const statuses = [l1Status, l2Status, l3Status];
      const unhealthyCount = statuses.filter(s => s === 'unhealthy').length;
      const degradedCount = statuses.filter(s => s === 'degraded').length;
      
      let overallStatus = 'healthy';
      let performanceGrade = 'A';
      
      if (unhealthyCount > 0) {
        overallStatus = 'unhealthy';
        performanceGrade = unhealthyCount > 1 ? 'F' : 'D';
      } else if (degradedCount > 0) {
        overallStatus = 'degraded';
        performanceGrade = degradedCount > 1 ? 'C' : 'B';
      }

      if (l1Metrics.averageResponseTime > 100) {
        recommendations.push('Cache response times are high - consider optimization');
        if (performanceGrade === 'A') performanceGrade = 'B';
      }

      return reply.send({
        overall_status: overallStatus,
        l1_status: l1Status,
        l2_status: l2Status,
        l3_status: l3Status,
        performance_grade: performanceGrade,
        recommendations
      });

    } catch (error) {
      logger.error(error as Error, {}, 'Cache health check failed');
      return reply.status(500).send({
        error: 'HEALTH_CHECK_FAILED',
        message: 'Failed to check cache health'
      });
    }
  });

  /**
   * Helper function to parse Redis memory info
   */
  function parseRedisMemory(info: string): string {
    const lines = info.split('\r\n');
    const memoryLine = lines.find(line => line.startsWith('used_memory_human:'));
    return memoryLine ? memoryLine.split(':')[1] : 'unknown';
  }
}