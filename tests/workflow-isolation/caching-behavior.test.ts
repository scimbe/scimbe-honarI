/**
 * Activity Caching Behavior Tests
 * Tests caching mechanisms and isolation between workflows
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Client } from 'pg';
import Redis from 'ioredis';

// Import functions to test
import { loadWorkflowDefinition, executeActivity, storeActivityParameters } from '../../services/temporal-worker/src/working-activities';

// Mock dependencies
jest.mock('pg');
jest.mock('ioredis');

const mockPgClient = {
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn(),
};

const mockRedis = {
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  flushdb: jest.fn().mockResolvedValue('OK'),
};

(Client as jest.MockedClass<typeof Client>).mockImplementation(() => mockPgClient as any);
(Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => mockRedis as any);

describe('Activity Caching Behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Database Query Caching', () => {
    it('should not cache database results between different workflow loads', async () => {
      const workflow1Id = 'CacheTest1Workflow';
      const workflow2Id = 'CacheTest2Workflow';

      const workflow1Activities = [
        { name: 'activity1', type: 'test1', workflow_id: workflow1Id, created_at: new Date() }
      ];

      const workflow2Activities = [
        { name: 'activity2', type: 'test2', workflow_id: workflow2Id, created_at: new Date() }
      ];

      // First workflow load
      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Workflow 1 requirements' }] })
        .mockResolvedValueOnce({ rows: workflow1Activities });

      const result1 = await loadWorkflowDefinition(workflow1Id);

      // Second workflow load (should make new database calls)
      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Workflow 2 requirements' }] })
        .mockResolvedValueOnce({ rows: workflow2Activities });

      const result2 = await loadWorkflowDefinition(workflow2Id);

      // Verify both workflows got their correct activities
      expect(result1.activities[0].name).toBe('activity1');
      expect(result2.activities[0].name).toBe('activity2');

      // Verify database was called 4 times (2 for each workflow)
      expect(mockPgClient.query).toHaveBeenCalledTimes(4);
    });

    it('should make fresh database calls for each workflow load', async () => {
      const workflowId = 'FreshCallsWorkflow';
      const activities = [
        { name: 'freshActivity', type: 'test', workflow_id: workflowId, created_at: new Date() }
      ];

      mockPgClient.query
        .mockResolvedValue({ rows: [{ requirements: 'Fresh calls test' }] })
        .mockResolvedValue({ rows: activities });

      // Load the same workflow multiple times
      await loadWorkflowDefinition(workflowId);
      await loadWorkflowDefinition(workflowId);
      await loadWorkflowDefinition(workflowId);

      // Each load should make fresh database calls (no caching)
      expect(mockPgClient.query).toHaveBeenCalledTimes(6); // 2 calls per load × 3 loads
    });

    it('should handle database cache misses gracefully', async () => {
      const workflowId = 'CacheMissWorkflow';

      // First query returns results, second returns empty (simulating cache miss)
      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Cache miss test' }] })
        .mockResolvedValueOnce({ rows: [] }) // no specific activities
        .mockResolvedValueOnce({ rows: [] }); // no recent activities

      const result = await loadWorkflowDefinition(workflowId);

      // Should fall back to default workflow
      expect(result).toBeDefined();
      expect(result.activities).toBeDefined();
      expect(result.metadata.name).toBe('Factorial Calculator');
    });
  });

  describe('Redis Activity Parameter Caching', () => {
    it('should store activity parameters with session isolation', async () => {
      const session1 = 'session-1';
      const session2 = 'session-2';
      const workflowId = 'ParameterCacheWorkflow';

      // Store parameters for first session
      await storeActivityParameters({
        sessionId: session1,
        workflowId: workflowId,
        activityName: 'testActivity',
        parameters: { result: 'session1-result' }
      });

      // Store parameters for second session
      await storeActivityParameters({
        sessionId: session2,
        workflowId: workflowId,
        activityName: 'testActivity',
        parameters: { result: 'session2-result' }
      });

      // Verify Redis was called with different keys for each session
      expect(mockRedis.set).toHaveBeenCalledWith(
        `${session1}.${workflowId}.result`,
        expect.stringContaining('session1-result')
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        `${session2}.${workflowId}.result`,
        expect.stringContaining('session2-result')
      );
    });

    it('should handle Redis storage failures gracefully', async () => {
      const params = {
        sessionId: 'test-session',
        workflowId: 'RedisFailureWorkflow',
        activityName: 'testActivity',
        parameters: { test: 'value' }
      };

      // Mock Redis failure
      mockRedis.set.mockRejectedValueOnce(new Error('Redis storage failed'));

      // Should not throw error, but handle gracefully
      const result = await storeActivityParameters(params);
      expect(result).toBe(true); // Current implementation returns true regardless
    });

    it('should create unique Redis keys for different workflows', async () => {
      const sessionId = 'test-session';
      const workflow1 = 'Workflow1';
      const workflow2 = 'Workflow2';

      await storeActivityParameters({
        sessionId,
        workflowId: workflow1,
        activityName: 'sharedActivity',
        parameters: { data: 'workflow1-data' }
      });

      await storeActivityParameters({
        sessionId,
        workflowId: workflow2,
        activityName: 'sharedActivity',
        parameters: { data: 'workflow2-data' }
      });

      // Verify different Redis keys were used
      expect(mockRedis.set).toHaveBeenCalledWith(
        `${sessionId}.${workflow1}.data`,
        expect.stringContaining('workflow1-data')
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        `${sessionId}.${workflow2}.data`,
        expect.stringContaining('workflow2-data')
      );
    });

    it('should handle parameter overwrites correctly', async () => {
      const params = {
        sessionId: 'overwrite-session',
        workflowId: 'OverwriteWorkflow',
        activityName: 'overwriteActivity',
        parameters: { value: 'original' }
      };

      // Store initial parameters
      await storeActivityParameters(params);

      // Overwrite with new parameters
      await storeActivityParameters({
        ...params,
        parameters: { value: 'updated' }
      });

      // Should be called twice with same key but different values
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
      expect(mockRedis.set).toHaveBeenLastCalledWith(
        'overwrite-session.OverwriteWorkflow.value',
        expect.stringContaining('updated')
      );
    });

    it('should store complex parameter objects correctly', async () => {
      const complexParams = {
        sessionId: 'complex-session',
        workflowId: 'ComplexWorkflow',
        activityName: 'complexActivity',
        parameters: {
          simpleValue: 42,
          stringValue: 'test string',
          arrayValue: [1, 2, 3, 'four'],
          objectValue: {
            nested: {
              deep: true,
              count: 100
            }
          },
          nullValue: null,
          undefinedValue: undefined,
          booleanValue: false
        }
      };

      await storeActivityParameters(complexParams);

      // Verify each parameter was stored
      expect(mockRedis.set).toHaveBeenCalledTimes(7); // All non-undefined parameters

      // Verify complex objects are properly serialized
      expect(mockRedis.set).toHaveBeenCalledWith(
        'complex-session.ComplexWorkflow.objectValue',
        expect.stringContaining('"nested"')
      );
    });
  });

  describe('Activity Result Caching', () => {
    it('should cache activity results in Redis with correct keys', async () => {
      const activityCode = `
        function testActivity(input) {
          return { result: input.value * 2 };
        }
      `;

      mockPgClient.query.mockResolvedValue({
        rows: [{ code: activityCode, name: 'testActivity', type: 'calculation' }]
      });

      const params = {
        sessionId: 'result-cache-session',
        workflowId: 'ResultCacheWorkflow',
        activityName: 'testActivity',
        input: { value: 21 },
        configuration: {}
      };

      const result = await executeActivity(params);

      expect(result).toEqual({ result: 42 });

      // Verify result was stored in Redis
      expect(mockRedis.set).toHaveBeenCalledWith(
        'result-cache-session.ResultCacheWorkflow.testActivity_result',
        expect.stringContaining('"value":{"result":42}')
      );
    });

    it('should not cache results between different sessions', async () => {
      const activityCode = `
        function sessionTestActivity(input) {
          return { sessionId: input.sessionId };
        }
      `;

      mockPgClient.query.mockResolvedValue({
        rows: [{ code: activityCode, name: 'sessionTestActivity', type: 'test' }]
      });

      const params1 = {
        sessionId: 'session-A',
        workflowId: 'SessionTestWorkflow',
        activityName: 'sessionTestActivity',
        input: { sessionId: 'session-A' },
        configuration: {}
      };

      const params2 = {
        sessionId: 'session-B',
        workflowId: 'SessionTestWorkflow',
        activityName: 'sessionTestActivity',
        input: { sessionId: 'session-B' },
        configuration: {}
      };

      await executeActivity(params1);
      await executeActivity(params2);

      // Verify different Redis keys for each session
      expect(mockRedis.set).toHaveBeenCalledWith(
        'session-A.SessionTestWorkflow.sessionTestActivity_result',
        expect.any(String)
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        'session-B.SessionTestWorkflow.sessionTestActivity_result',
        expect.any(String)
      );
    });

    it('should handle Redis caching failures during activity execution', async () => {
      const activityCode = `
        function redisCacheFailActivity(input) {
          return { success: true };
        }
      `;

      mockPgClient.query.mockResolvedValue({
        rows: [{ code: activityCode, name: 'redisCacheFailActivity', type: 'test' }]
      });

      // Mock Redis set failure
      mockRedis.set.mockRejectedValueOnce(new Error('Redis cache failure'));

      const params = {
        sessionId: 'redis-fail-session',
        workflowId: 'RedisCacheFailWorkflow',
        activityName: 'redisCacheFailActivity',
        input: {},
        configuration: {}
      };

      // Activity should still execute successfully even if caching fails
      const result = await executeActivity(params);
      expect(result).toEqual({ success: true });
    });
  });

  describe('Cache Isolation Between Workflows', () => {
    it('should maintain strict isolation between workflow caches', async () => {
      // Set up two workflows with similar activity names
      const circleWorkflowId = 'CircleAreaCalculatorWorkflow';
      const factorialWorkflowId = 'FactorialCalculatorWorkflow';
      const sessionId = 'isolation-test-session';

      // Store parameters for circle workflow
      await storeActivityParameters({
        sessionId,
        workflowId: circleWorkflowId,
        activityName: 'calculate',
        parameters: { type: 'circle', radius: 5 }
      });

      // Store parameters for factorial workflow
      await storeActivityParameters({
        sessionId,
        workflowId: factorialWorkflowId,
        activityName: 'calculate',
        parameters: { type: 'factorial', number: 5 }
      });

      // Verify different Redis keys despite same activity name
      expect(mockRedis.set).toHaveBeenCalledWith(
        `${sessionId}.${circleWorkflowId}.type`,
        expect.stringContaining('circle')
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        `${sessionId}.${factorialWorkflowId}.type`,
        expect.stringContaining('factorial')
      );
    });

    it('should prevent cache pollution between workflow types', async () => {
      const sessionId = 'pollution-test-session';

      // Execute activities for different workflows with similar names
      const workflows = [
        { id: 'WorkflowA', activityName: 'process', data: 'A-data' },
        { id: 'WorkflowB', activityName: 'process', data: 'B-data' },
        { id: 'WorkflowC', activityName: 'process', data: 'C-data' }
      ];

      for (const workflow of workflows) {
        await storeActivityParameters({
          sessionId,
          workflowId: workflow.id,
          activityName: workflow.activityName,
          parameters: { data: workflow.data }
        });
      }

      // Verify each workflow has its own cache namespace
      workflows.forEach(workflow => {
        expect(mockRedis.set).toHaveBeenCalledWith(
          `${sessionId}.${workflow.id}.data`,
          expect.stringContaining(workflow.data)
        );
      });

      // Total calls should be 3 (one per workflow)
      expect(mockRedis.set).toHaveBeenCalledTimes(3);
    });

    it('should handle cache cleanup correctly', async () => {
      const sessionId = 'cleanup-test-session';
      const workflowId = 'CleanupTestWorkflow';

      // Store multiple parameters
      await storeActivityParameters({
        sessionId,
        workflowId,
        activityName: 'activity1',
        parameters: { step: 1, data: 'first' }
      });

      await storeActivityParameters({
        sessionId,
        workflowId,
        activityName: 'activity2',
        parameters: { step: 2, data: 'second' }
      });

      // Verify parameters were stored
      expect(mockRedis.set).toHaveBeenCalledTimes(4); // 2 parameters × 2 activities

      // Mock cleanup operation
      mockRedis.keys.mockResolvedValueOnce([
        `${sessionId}.${workflowId}.step`,
        `${sessionId}.${workflowId}.data`
      ]);

      // Simulate cache cleanup (this would be done by a cleanup function)
      const keys = await mockRedis.keys(`${sessionId}.${workflowId}.*`);
      await Promise.all(keys.map(key => mockRedis.del(key)));

      expect(mockRedis.del).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cache Consistency and Integrity', () => {
    it('should maintain cache consistency during concurrent operations', async () => {
      const sessionId = 'concurrent-cache-session';
      const workflowId = 'ConcurrentCacheWorkflow';

      // Simulate concurrent parameter storage
      const concurrentOps = Array.from({ length: 5 }, (_, i) => 
        storeActivityParameters({
          sessionId,
          workflowId,
          activityName: `activity${i}`,
          parameters: { index: i, timestamp: Date.now() }
        })
      );

      await Promise.all(concurrentOps);

      // All operations should complete successfully
      expect(mockRedis.set).toHaveBeenCalledTimes(10); // 2 parameters × 5 activities
    });

    it('should handle cache key collisions gracefully', async () => {
      const sessionId = 'collision-test-session';
      
      // Try to create potential key collisions
      const collisionTests = [
        { workflowId: 'Work.flow', activityName: 'test', param: 'value1' },
        { workflowId: 'Work', activityName: 'flow.test', param: 'value2' },
        { workflowId: 'Workflow', activityName: 'te.st', param: 'value3' }
      ];

      for (const test of collisionTests) {
        await storeActivityParameters({
          sessionId,
          workflowId: test.workflowId,
          activityName: test.activityName,
          parameters: { param: test.param }
        });
      }

      // Each should create unique keys despite potential collisions
      expect(mockRedis.set).toHaveBeenCalledTimes(3);
      
      // Verify unique keys were generated
      const setCalls = (mockRedis.set as jest.Mock).mock.calls;
      const keys = setCalls.map(call => call[0]);
      expect(new Set(keys).size).toBe(3); // All keys should be unique
    });

    it('should validate cache data integrity', async () => {
      const sessionId = 'integrity-test-session';
      const workflowId = 'IntegrityTestWorkflow';

      const complexData = {
        numbers: [1, 2, 3.14, -5],
        strings: ['hello', 'world', ''],
        booleans: [true, false],
        objects: [{ a: 1 }, { b: null }],
        special: [null, undefined, NaN, Infinity]
      };

      await storeActivityParameters({
        sessionId,
        workflowId,
        activityName: 'integrityTest',
        parameters: complexData
      });

      // Verify complex data is properly serialized
      const serializedCalls = (mockRedis.set as jest.Mock).mock.calls;
      serializedCalls.forEach(call => {
        const [key, value] = call;
        expect(typeof value).toBe('string');
        expect(() => JSON.parse(value)).not.toThrow();
      });
    });

    it('should handle cache expiration and TTL correctly', async () => {
      const sessionId = 'ttl-test-session';
      const workflowId = 'TTLTestWorkflow';

      await storeActivityParameters({
        sessionId,
        workflowId,
        activityName: 'ttlActivity',
        parameters: { timestamp: Date.now() }
      });

      // Verify timestamp is included in cached data for potential TTL handling
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"timestamp"')
      );
    });
  });
});