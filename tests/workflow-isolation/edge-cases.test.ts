/**
 * Edge Cases and Boundary Condition Tests
 * Tests unusual scenarios and boundary conditions for workflow isolation
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
  del: jest.fn(),
};

(Client as jest.MockedClass<typeof Client>).mockImplementation(() => mockPgClient as any);
(Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => mockRedis as any);

describe('Edge Cases and Boundary Conditions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Input Validation Edge Cases', () => {
    it('should handle empty string workflow ID', async () => {
      const workflowId = '';

      mockPgClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await loadWorkflowDefinition(workflowId);

      expect(result).toBeDefined();
      expect(result.activities).toBeDefined();
      // Should use fallback workflow
      expect(result.metadata.name).toBe('Factorial Calculator');
    });

    it('should handle null workflow ID', async () => {
      mockPgClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await loadWorkflowDefinition(null as any);

      expect(result).toBeDefined();
      expect(result.activities).toBeDefined();
    });

    it('should handle undefined workflow ID', async () => {
      mockPgClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await loadWorkflowDefinition(undefined as any);

      expect(result).toBeDefined();
      expect(result.activities).toBeDefined();
    });

    it('should handle very long workflow ID', async () => {
      const longWorkflowId = 'A'.repeat(1000);

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [] }) // no workflow found
        .mockResolvedValueOnce({ rows: [] }); // no activities found

      const result = await loadWorkflowDefinition(longWorkflowId);

      expect(result).toBeDefined();
      // Should still attempt the query with the long ID
      expect(mockPgClient.query).toHaveBeenCalledWith(
        expect.any(String),
        [longWorkflowId]
      );
    });

    it('should handle workflow ID with special characters', async () => {
      const specialWorkflowId = 'workflow-test!@#$%^&*()_+={}[]|\\:";\'<>?,./ 测试';

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Special character test' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await loadWorkflowDefinition(specialWorkflowId);

      expect(result).toBeDefined();
      expect(mockPgClient.query).toHaveBeenCalledWith(
        expect.any(String),
        [specialWorkflowId]
      );
    });

    it('should handle SQL injection attempts in workflow ID', async () => {
      const maliciousWorkflowId = "'; DROP TABLE activity_library; --";

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await loadWorkflowDefinition(maliciousWorkflowId);

      expect(result).toBeDefined();
      // Should use parameterized query, preventing SQL injection
      expect(mockPgClient.query).toHaveBeenCalledWith(
        expect.stringMatching(/\$1/), // Should use parameterized query
        [maliciousWorkflowId]
      );
    });
  });

  describe('Database Response Edge Cases', () => {
    it('should handle null database response', async () => {
      const workflowId = 'NullResponseTest';

      mockPgClient.query.mockResolvedValueOnce(null);

      const result = await loadWorkflowDefinition(workflowId);

      expect(result).toBeDefined();
      expect(result.activities).toBeDefined();
    });

    it('should handle undefined database response', async () => {
      const workflowId = 'UndefinedResponseTest';

      mockPgClient.query.mockResolvedValueOnce(undefined);

      const result = await loadWorkflowDefinition(workflowId);

      expect(result).toBeDefined();
      expect(result.activities).toBeDefined();
    });

    it('should handle malformed database response', async () => {
      const workflowId = 'MalformedResponseTest';

      mockPgClient.query
        .mockResolvedValueOnce({ rows: 'not an array' as any })
        .mockResolvedValueOnce({ rows: [] });

      const result = await loadWorkflowDefinition(workflowId);

      expect(result).toBeDefined();
      expect(result.activities).toBeDefined();
    });

    it('should handle database response with null rows', async () => {
      const workflowId = 'NullRowsTest';

      mockPgClient.query
        .mockResolvedValueOnce({ rows: null })
        .mockResolvedValueOnce({ rows: [] });

      const result = await loadWorkflowDefinition(workflowId);

      expect(result).toBeDefined();
      expect(result.activities).toBeDefined();
    });

    it('should handle activities with null/undefined fields', async () => {
      const workflowId = 'NullFieldsTest';
      const malformedActivities = [
        { name: null, type: undefined, workflow_id: workflowId, created_at: new Date() },
        { name: 'validActivity', type: 'valid', workflow_id: null, created_at: new Date() },
        { name: '', type: '', workflow_id: workflowId, created_at: null }
      ];

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Null fields test' }] })
        .mockResolvedValueOnce({ rows: malformedActivities });

      const result = await loadWorkflowDefinition(workflowId);

      expect(result.activities).toHaveLength(3);
      // Should handle null/undefined gracefully
      expect(result.activities[0].name).toBe(null);
      expect(result.activities[1].name).toBe('validActivity');
      expect(result.activities[2].name).toBe('');
    });

    it('should handle circular activity dependencies', async () => {
      const workflowId = 'CircularDependencyTest';
      const activities = [
        { name: 'activity1', type: 'test', workflow_id: workflowId, created_at: new Date() },
        { name: 'activity2', type: 'test', workflow_id: workflowId, created_at: new Date() },
        { name: 'activity3', type: 'test', workflow_id: workflowId, created_at: new Date() }
      ];

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Circular dependency test' }] })
        .mockResolvedValueOnce({ rows: activities });

      const result = await loadWorkflowDefinition(workflowId);

      // Should still generate sequential dependencies (avoiding circular issues)
      expect(result.activities[0].dependencies).toEqual([]);
      expect(result.activities[1].dependencies).toEqual(['activity-1']);
      expect(result.activities[2].dependencies).toEqual(['activity-2']);
    });
  });

  describe('Connection and Network Edge Cases', () => {
    it('should handle database connection timeout', async () => {
      const workflowId = 'ConnectionTimeoutTest';

      mockPgClient.connect.mockRejectedValueOnce(new Error('Connection timeout'));

      const result = await loadWorkflowDefinition(workflowId);

      expect(result).toBeDefined();
      expect(result.activities).toBeDefined();
      // Should use fallback
      expect(result.metadata.name).toBe('Factorial Calculator');
    });

    it('should handle database query timeout', async () => {
      const workflowId = 'QueryTimeoutTest';

      mockPgClient.query.mockRejectedValueOnce(new Error('Query timeout'));

      const result = await loadWorkflowDefinition(workflowId);

      expect(result).toBeDefined();
      expect(result.activities).toBeDefined();
    });

    it('should handle Redis connection errors', async () => {
      const workflowId = 'RedisErrorTest';
      const activities = [
        { name: 'redisTestActivity', type: 'test', workflow_id: workflowId, created_at: new Date() }
      ];

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Redis error test' }] })
        .mockResolvedValueOnce({ rows: activities });

      // Mock Redis connection error
      const redisError = new Redis() as any;
      redisError.set = jest.fn().mockRejectedValue(new Error('Redis connection failed'));
      (Redis as jest.MockedClass<typeof Redis>).mockImplementationOnce(() => redisError);

      const result = await loadWorkflowDefinition(workflowId);

      expect(result).toBeDefined();
      expect(result.activities).toHaveLength(1);
    });

    it('should handle intermittent network failures', async () => {
      const workflowId = 'IntermittentFailureTest';

      let callCount = 0;
      mockPgClient.connect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Network failure'));
        }
        return Promise.resolve();
      });

      // First call should fail, function should handle gracefully
      const result = await loadWorkflowDefinition(workflowId);

      expect(result).toBeDefined();
      expect(result.activities).toBeDefined();
    });
  });

  describe('Activity Execution Edge Cases', () => {
    it('should handle activity with malformed JavaScript code', async () => {
      const malformedCode = `
        function brokenActivity(input) {
          // Missing closing brace and syntax errors
          return { result: input.value * 
      `;

      mockPgClient.query.mockResolvedValue({
        rows: [{ code: malformedCode, name: 'brokenActivity', type: 'broken' }]
      });

      const params = {
        sessionId: 'test-session',
        workflowId: 'BrokenWorkflow',
        activityName: 'brokenActivity',
        input: { value: 42 },
        configuration: {}
      };

      await expect(executeActivity(params)).rejects.toThrow();
    });

    it('should handle activity that throws runtime errors', async () => {
      const errorThrowingCode = `
        function errorActivity(input) {
          throw new Error('Intentional runtime error');
        }
      `;

      mockPgClient.query.mockResolvedValue({
        rows: [{ code: errorThrowingCode, name: 'errorActivity', type: 'error' }]
      });

      const params = {
        sessionId: 'test-session',
        workflowId: 'ErrorWorkflow',
        activityName: 'errorActivity',
        input: { value: 42 },
        configuration: {}
      };

      await expect(executeActivity(params)).rejects.toThrow('Intentional runtime error');
    });

    it('should handle activity with infinite loops', async () => {
      const infiniteLoopCode = `
        function infiniteLoopActivity(input) {
          while (true) {
            // This would hang without proper safeguards
          }
          return { result: 'never reached' };
        }
      `;

      mockPgClient.query.mockResolvedValue({
        rows: [{ code: infiniteLoopCode, name: 'infiniteLoopActivity', type: 'infinite' }]
      });

      const params = {
        sessionId: 'test-session',
        workflowId: 'InfiniteWorkflow',
        activityName: 'infiniteLoopActivity',
        input: { value: 42 },
        configuration: {}
      };

      // This test documents the current behavior - it would timeout
      // In a real implementation, you might want to add execution timeouts
      await expect(executeActivity(params)).rejects.toThrow();
    });

    it('should handle activity with memory-intensive operations', async () => {
      const memoryIntensiveCode = `
        function memoryIntensiveActivity(input) {
          const largeArray = new Array(1000000).fill(0);
          return { result: largeArray.length };
        }
      `;

      mockPgClient.query.mockResolvedValue({
        rows: [{ code: memoryIntensiveCode, name: 'memoryIntensiveActivity', type: 'memory' }]
      });

      const params = {
        sessionId: 'test-session',
        workflowId: 'MemoryWorkflow',
        activityName: 'memoryIntensiveActivity',
        input: {},
        configuration: {}
      };

      const result = await executeActivity(params);
      expect(result.result).toBe(1000000);
    });

    it('should handle activity that tries to access restricted globals', async () => {
      const restrictedCode = `
        function restrictedActivity(input) {
          // Try to access restricted globals
          const fs = require('fs'); // Should not be available
          return { result: 'should not work' };
        }
      `;

      mockPgClient.query.mockResolvedValue({
        rows: [{ code: restrictedCode, name: 'restrictedActivity', type: 'restricted' }]
      });

      const params = {
        sessionId: 'test-session',
        workflowId: 'RestrictedWorkflow',
        activityName: 'restrictedActivity',
        input: {},
        configuration: {}
      };

      // Should throw an error as 'require' is not available in VM context
      await expect(executeActivity(params)).rejects.toThrow();
    });
  });

  describe('Race Conditions and Timing Issues', () => {
    it('should handle simultaneous loads of the same workflow', async () => {
      const workflowId = 'RaceConditionWorkflow';
      const activities = [
        { name: 'raceActivity', type: 'test', workflow_id: workflowId, created_at: new Date() }
      ];

      let queryCallCount = 0;
      mockPgClient.query.mockImplementation(() => {
        queryCallCount++;
        if (queryCallCount <= 2) {
          return Promise.resolve({ rows: [{ requirements: 'Race condition test' }] });
        }
        return Promise.resolve({ rows: activities });
      });

      // Load the same workflow simultaneously
      const [result1, result2] = await Promise.all([
        loadWorkflowDefinition(workflowId),
        loadWorkflowDefinition(workflowId)
      ]);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result1.activities).toHaveLength(1);
      expect(result2.activities).toHaveLength(1);
    });

    it('should handle database responses in different orders', async () => {
      const workflowId = 'OutOfOrderWorkflow';

      // Mock delayed responses
      mockPgClient.query
        .mockImplementationOnce(() => 
          new Promise(resolve => 
            setTimeout(() => resolve({ rows: [{ requirements: 'Out of order test' }] }), 100)
          )
        )
        .mockImplementationOnce(() => 
          Promise.resolve({ 
            rows: [
              { name: 'fastActivity', type: 'test', workflow_id: workflowId, created_at: new Date() }
            ] 
          })
        );

      const result = await loadWorkflowDefinition(workflowId);

      expect(result).toBeDefined();
      expect(result.activities).toHaveLength(1);
    });
  });

  describe('Extreme Data Scenarios', () => {
    it('should handle very large activity definitions', async () => {
      const workflowId = 'LargeActivityWorkflow';
      const hugeActivity = {
        name: 'hugeActivity',
        type: 'test',
        workflow_id: workflowId,
        created_at: new Date(),
        description: 'A'.repeat(100000), // 100KB description
        code: `function hugeActivity(input) { return { result: '${'data'.repeat(10000)}' }; }` // Large code
      };

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Large activity test' }] })
        .mockResolvedValueOnce({ rows: [hugeActivity] });

      const result = await loadWorkflowDefinition(workflowId);

      expect(result).toBeDefined();
      expect(result.activities).toHaveLength(1);
      expect(result.activities[0].name).toBe('hugeActivity');
    });

    it('should handle workflow with maximum number of activities', async () => {
      const workflowId = 'MaxActivitiesWorkflow';
      const maxActivities = Array.from({ length: 1000 }, (_, i) => ({
        name: `activity_${i}`,
        type: 'test',
        workflow_id: workflowId,
        created_at: new Date(),
        description: `Activity number ${i}`
      }));

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Maximum activities test' }] })
        .mockResolvedValueOnce({ rows: maxActivities });

      const result = await loadWorkflowDefinition(workflowId);

      expect(result.activities).toHaveLength(1000);
    });

    it('should handle empty activity results', async () => {
      const workflowId = 'EmptyResultsWorkflow';

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Empty results test' }] })
        .mockResolvedValueOnce({ rows: [] }) // no workflow-specific activities
        .mockResolvedValueOnce({ rows: [] }); // no recent activities either

      const result = await loadWorkflowDefinition(workflowId);

      // Should use fallback workflow
      expect(result).toBeDefined();
      expect(result.activities).toBeDefined();
      expect(result.activities.length).toBeGreaterThan(0);
    });
  });
});