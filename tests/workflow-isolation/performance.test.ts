/**
 * Performance Tests for Workflow Isolation Fix
 * Validates that the fix doesn't introduce performance regressions
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Client } from 'pg';
import Redis from 'ioredis';
import { performance } from 'perf_hooks';

// Import functions to test
import { loadWorkflowDefinition, executeActivity } from '../../services/temporal-worker/src/working-activities';

// Mock dependencies
jest.mock('pg');
jest.mock('ioredis');

const mockPgClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  query: jest.fn(),
  end: jest.fn().mockResolvedValue(undefined),
};

const mockRedis = {
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn(),
  del: jest.fn(),
};

(Client as jest.MockedClass<typeof Client>).mockImplementation(() => mockPgClient as any);
(Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => mockRedis as any);

describe('Performance Tests for Workflow Isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadWorkflowDefinition Performance', () => {
    it('should load workflow definition within 500ms', async () => {
      const workflowId = 'PerformanceTestWorkflow';
      const activities = Array.from({ length: 20 }, (_, i) => ({
        name: `activity_${i}`,
        type: 'test',
        workflow_id: workflowId,
        created_at: new Date(),
        description: `Performance test activity ${i}`
      }));

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Performance test requirements' }] })
        .mockResolvedValueOnce({ rows: activities });

      const startTime = performance.now();
      const result = await loadWorkflowDefinition(workflowId);
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(result).toBeDefined();
      expect(result.activities).toHaveLength(20);
      expect(duration).toBeLessThan(500); // Must complete within 500ms
    });

    it('should maintain performance with large activity sets', async () => {
      const workflowId = 'LargeWorkflow';
      const activities = Array.from({ length: 100 }, (_, i) => ({
        name: `large_activity_${i}`,
        type: 'computation',
        workflow_id: workflowId,
        created_at: new Date(),
        description: `Large workflow activity ${i}`,
        code: `function large_activity_${i}(input) { return { result: input * ${i} }; }`
      }));

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Large workflow with 100 activities' }] })
        .mockResolvedValueOnce({ rows: activities });

      const startTime = performance.now();
      const result = await loadWorkflowDefinition(workflowId);
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(result.activities).toHaveLength(100);
      expect(duration).toBeLessThan(1000); // Should still be under 1 second
    });

    it('should handle concurrent loads efficiently', async () => {
      const baseActivities = Array.from({ length: 10 }, (_, i) => ({
        name: `concurrent_activity_${i}`,
        type: 'test',
        created_at: new Date(),
        description: `Concurrent test activity ${i}`
      }));

      // Mock different responses for different workflow IDs
      mockPgClient.query.mockImplementation((query, params) => {
        const workflowId = params[0];
        if (query.includes('generated_workflows')) {
          return Promise.resolve({ rows: [{ requirements: `Requirements for ${workflowId}` }] });
        }
        if (query.includes('activity_library')) {
          return Promise.resolve({
            rows: baseActivities.map(activity => ({
              ...activity,
              workflow_id: workflowId,
              name: `${workflowId}_${activity.name}`
            }))
          });
        }
        return Promise.resolve({ rows: [] });
      });

      // Create 10 concurrent load operations
      const workflows = Array.from({ length: 10 }, (_, i) => `ConcurrentWorkflow_${i}`);

      const startTime = performance.now();
      const results = await Promise.all(
        workflows.map(workflowId => loadWorkflowDefinition(workflowId))
      );
      const endTime = performance.now();
      const totalDuration = endTime - startTime;

      // All should succeed
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.activities).toHaveLength(10);
      });

      // Total time should be reasonable for concurrent operations
      expect(totalDuration).toBeLessThan(2000); // 2 seconds for 10 concurrent loads
    });

    it('should not leak memory during repeated loads', async () => {
      const workflowId = 'MemoryTestWorkflow';
      const activities = [
        { name: 'memoryActivity', type: 'test', workflow_id: workflowId, created_at: new Date() }
      ];

      mockPgClient.query
        .mockResolvedValue({ rows: [{ requirements: 'Memory test' }] })
        .mockResolvedValue({ rows: activities });

      // Measure memory before
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform 50 load operations
      for (let i = 0; i < 50; i++) {
        await loadWorkflowDefinition(`${workflowId}_${i}`);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be minimal (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    it('should perform database queries efficiently', async () => {
      const workflowId = 'QueryPerformanceWorkflow';
      const activities = Array.from({ length: 5 }, (_, i) => ({
        name: `query_activity_${i}`,
        type: 'test',
        workflow_id: workflowId,
        created_at: new Date()
      }));

      let queryCount = 0;
      mockPgClient.query.mockImplementation((...args) => {
        queryCount++;
        if (queryCount === 1) {
          return Promise.resolve({ rows: [{ requirements: 'Query performance test' }] });
        }
        return Promise.resolve({ rows: activities });
      });

      await loadWorkflowDefinition(workflowId);

      // Should make exactly 2 queries: one for workflow, one for activities
      expect(queryCount).toBe(2);
    });
  });

  describe('executeActivity Performance', () => {
    it('should execute simple activities within 100ms', async () => {
      const activityCode = `
        function simpleActivity(input) {
          return { result: input * 2 };
        }
      `;

      mockPgClient.query.mockResolvedValue({
        rows: [{ code: activityCode, name: 'simpleActivity', type: 'calculation' }]
      });

      const params = {
        sessionId: 'test-session',
        workflowId: 'TestWorkflow',
        activityName: 'simpleActivity',
        input: { value: 42 },
        configuration: {}
      };

      const startTime = performance.now();
      const result = await executeActivity(params);
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(result).toEqual({ result: 84 });
      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });

    it('should handle complex calculations efficiently', async () => {
      const complexActivityCode = `
        function complexCalculation(input) {
          const n = input.number || 100;
          let result = 0;
          for (let i = 1; i <= n; i++) {
            result += Math.sqrt(i) * Math.sin(i);
          }
          return { complexResult: result };
        }
      `;

      mockPgClient.query.mockResolvedValue({
        rows: [{ code: complexActivityCode, name: 'complexCalculation', type: 'calculation' }]
      });

      const params = {
        sessionId: 'test-session',
        workflowId: 'ComplexWorkflow',
        activityName: 'complexCalculation',
        input: { number: 1000 },
        configuration: {}
      };

      const startTime = performance.now();
      const result = await executeActivity(params);
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(result.complexResult).toBeDefined();
      expect(typeof result.complexResult).toBe('number');
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should execute multiple activities in sequence efficiently', async () => {
      const activities = [
        {
          name: 'step1',
          code: 'function step1(input) { return { value: input.value * 2 }; }'
        },
        {
          name: 'step2',
          code: 'function step2(input) { return { value: input.value + 10 }; }'
        },
        {
          name: 'step3',
          code: 'function step3(input) { return { finalValue: input.value / 2 }; }'
        }
      ];

      mockPgClient.query.mockImplementation((query, params) => {
        const activityName = params[0];
        const activity = activities.find(a => a.name === activityName);
        return Promise.resolve({
          rows: activity ? [{ ...activity, type: 'calculation' }] : []
        });
      });

      const baseParams = {
        sessionId: 'sequence-test',
        workflowId: 'SequenceWorkflow',
        configuration: {}
      };

      const startTime = performance.now();

      // Execute activities in sequence
      let currentInput = { value: 5 };
      for (const activity of activities) {
        const result = await executeActivity({
          ...baseParams,
          activityName: activity.name,
          input: currentInput
        });
        currentInput = result;
      }

      const endTime = performance.now();
      const totalDuration = endTime - startTime;

      expect(currentInput.finalValue).toBe(10); // (5 * 2 + 10) / 2
      expect(totalDuration).toBeLessThan(500); // All 3 activities in under 500ms
    });

    it('should maintain performance with large data payloads', async () => {
      const largeDataActivityCode = `
        function processLargeData(input) {
          const processedData = input.data.map(item => ({
            ...item,
            processed: true,
            timestamp: Date.now()
          }));
          return { processedData, count: processedData.length };
        }
      `;

      mockPgClient.query.mockResolvedValue({
        rows: [{ code: largeDataActivityCode, name: 'processLargeData', type: 'processing' }]
      });

      // Create large input data (1000 items)
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        value: Math.random(),
        name: `Item ${i}`
      }));

      const params = {
        sessionId: 'large-data-test',
        workflowId: 'LargeDataWorkflow',
        activityName: 'processLargeData',
        input: { data: largeData },
        configuration: {}
      };

      const startTime = performance.now();
      const result = await executeActivity(params);
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(result.count).toBe(1000);
      expect(result.processedData).toHaveLength(1000);
      expect(duration).toBeLessThan(2000); // Should handle large data within 2 seconds
    });
  });

  describe('Memory and Resource Management', () => {
    it('should efficiently manage Redis connections', async () => {
      const workflowId = 'RedisTestWorkflow';
      const activities = [
        { name: 'redisActivity', type: 'test', workflow_id: workflowId, created_at: new Date() }
      ];

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Redis test' }] })
        .mockResolvedValueOnce({ rows: activities });

      // Mock Redis operations
      let redisOperationCount = 0;
      mockRedis.set.mockImplementation(() => {
        redisOperationCount++;
        return Promise.resolve('OK');
      });

      // Load workflow multiple times
      for (let i = 0; i < 10; i++) {
        await loadWorkflowDefinition(workflowId);
      }

      // Redis should be reused efficiently, not creating new connections each time
      expect(Redis).toHaveBeenCalledTimes(1); // Only one Redis instance created
    });

    it('should cleanup database connections properly', async () => {
      const workflowId = 'CleanupTestWorkflow';

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Cleanup test' }] })
        .mockResolvedValueOnce({ rows: [] });

      await loadWorkflowDefinition(workflowId);

      // Verify connection was properly closed
      expect(mockPgClient.end).toHaveBeenCalled();
    });

    it('should handle connection pooling efficiently', async () => {
      const workflowIds = Array.from({ length: 5 }, (_, i) => `PoolingTestWorkflow_${i}`);

      mockPgClient.query
        .mockResolvedValue({ rows: [{ requirements: 'Pooling test' }] })
        .mockResolvedValue({ rows: [] });

      // Execute multiple loads concurrently
      await Promise.all(
        workflowIds.map(id => loadWorkflowDefinition(id))
      );

      // Should create exactly 5 database clients (one per concurrent operation)
      expect(Client).toHaveBeenCalledTimes(5);
      expect(mockPgClient.end).toHaveBeenCalledTimes(5);
    });
  });

  describe('Scalability Tests', () => {
    it('should scale linearly with workflow complexity', async () => {
      const testComplexities = [5, 10, 20, 50];
      const durations: number[] = [];

      for (const complexity of testComplexities) {
        const workflowId = `ScalabilityTest_${complexity}`;
        const activities = Array.from({ length: complexity }, (_, i) => ({
          name: `activity_${i}`,
          type: 'test',
          workflow_id: workflowId,
          created_at: new Date()
        }));

        mockPgClient.query
          .mockResolvedValueOnce({ rows: [{ requirements: `Test with ${complexity} activities` }] })
          .mockResolvedValueOnce({ rows: activities });

        const startTime = performance.now();
        await loadWorkflowDefinition(workflowId);
        const endTime = performance.now();
        durations.push(endTime - startTime);

        // Clear mocks for next iteration
        jest.clearAllMocks();
      }

      // Verify reasonable scaling (duration should not increase exponentially)
      const maxRatio = Math.max(...durations.slice(1).map((d, i) => d / durations[i]));
      expect(maxRatio).toBeLessThan(3); // No operation should be 3x slower than the previous
    });

    it('should maintain throughput under load', async () => {
      const workflowId = 'ThroughputTestWorkflow';
      const activities = [
        { name: 'throughputActivity', type: 'test', workflow_id: workflowId, created_at: new Date() }
      ];

      mockPgClient.query
        .mockResolvedValue({ rows: [{ requirements: 'Throughput test' }] })
        .mockResolvedValue({ rows: activities });

      // Measure throughput with increasing load
      const loadSizes = [1, 5, 10, 20];
      const throughputs: number[] = [];

      for (const loadSize of loadSizes) {
        const startTime = performance.now();
        
        await Promise.all(
          Array.from({ length: loadSize }, () => loadWorkflowDefinition(workflowId))
        );
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        const throughput = loadSize / (duration / 1000); // operations per second
        
        throughputs.push(throughput);
        
        // Clear mocks for next iteration
        jest.clearAllMocks();
      }

      // Throughput should not degrade significantly
      const minThroughput = Math.min(...throughputs);
      const maxThroughput = Math.max(...throughputs);
      const throughputRatio = maxThroughput / minThroughput;
      
      expect(throughputRatio).toBeLessThan(3); // Throughput shouldn't vary by more than 3x
    });
  });
});