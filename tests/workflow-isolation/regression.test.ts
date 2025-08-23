/**
 * Regression Test Suite for Workflow Isolation Bug
 * Specifically tests that CircleAreaCalculatorWorkflow doesn't load wrong activities
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Client } from 'pg';
import Redis from 'ioredis';

// Import the function to test
import { loadWorkflowDefinition } from '../../services/temporal-worker/src/working-activities';

// Mock dependencies
jest.mock('pg');
jest.mock('ioredis');

const mockPgClient = {
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn(),
};

const mockRedis = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
};

(Client as jest.MockedClass<typeof Client>).mockImplementation(() => mockPgClient as any);
(Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => mockRedis as any);

describe('Workflow Isolation Regression Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Bug Prevention', () => {
    it('REGRESSION: CircleAreaCalculatorWorkflow should never load factorial activities', async () => {
      const workflowId = 'CircleAreaCalculatorWorkflow';
      
      // Simulate database state where both circle and factorial activities exist
      const circleActivities = [
        { name: 'validateRadius', type: 'validation', workflow_id: 'CircleAreaCalculatorWorkflow', created_at: new Date() },
        { name: 'calculateCircleArea', type: 'calculation', workflow_id: 'CircleAreaCalculatorWorkflow', created_at: new Date() },
        { name: 'formatAreaResult', type: 'formatting', workflow_id: 'CircleAreaCalculatorWorkflow', created_at: new Date() }
      ];

      const factorialActivities = [
        { name: 'validateInteger', type: 'validation', workflow_id: 'FactorialCalculatorWorkflow', created_at: new Date() },
        { name: 'calculateFactorial', type: 'calculation', workflow_id: 'FactorialCalculatorWorkflow', created_at: new Date() },
        { name: 'formatFactorialResult', type: 'formatting', workflow_id: 'FactorialCalculatorWorkflow', created_at: new Date() }
      ];

      // Mock workflow exists
      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Calculate circle area from radius' }] })
        .mockResolvedValueOnce({ rows: circleActivities }); // should return circle activities only

      const result = await loadWorkflowDefinition(workflowId);

      const activityNames = result.activities.map(a => a.name);

      // CRITICAL: Should NEVER contain factorial activities
      expect(activityNames).not.toContain('validateInteger');
      expect(activityNames).not.toContain('calculateFactorial');
      expect(activityNames).not.toContain('formatFactorialResult');

      // CRITICAL: Should ONLY contain circle activities
      expect(activityNames).toContain('validateRadius');
      expect(activityNames).toContain('calculateCircleArea');
      expect(activityNames).toContain('formatAreaResult');

      // Verify the query was called with the correct workflow ID
      expect(mockPgClient.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE workflow_id = $1'),
        [workflowId]
      );
    });

    it('REGRESSION: FactorialCalculatorWorkflow should never load circle activities', async () => {
      const workflowId = 'FactorialCalculatorWorkflow';
      
      const factorialActivities = [
        { name: 'validateInteger', type: 'validation', workflow_id: 'FactorialCalculatorWorkflow', created_at: new Date() },
        { name: 'calculateFactorial', type: 'calculation', workflow_id: 'FactorialCalculatorWorkflow', created_at: new Date() },
        { name: 'formatFactorialResult', type: 'formatting', workflow_id: 'FactorialCalculatorWorkflow', created_at: new Date() }
      ];

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Calculate factorial of integer' }] })
        .mockResolvedValueOnce({ rows: factorialActivities });

      const result = await loadWorkflowDefinition(workflowId);

      const activityNames = result.activities.map(a => a.name);

      // CRITICAL: Should NEVER contain circle activities
      expect(activityNames).not.toContain('validateRadius');
      expect(activityNames).not.toContain('calculateCircleArea');
      expect(activityNames).not.toContain('formatAreaResult');

      // CRITICAL: Should ONLY contain factorial activities
      expect(activityNames).toContain('validateInteger');
      expect(activityNames).toContain('calculateFactorial');
      expect(activityNames).toContain('formatFactorialResult');
    });

    it('REGRESSION: Should not use cached activities from different workflows', async () => {
      // First call for factorial workflow
      const factorialWorkflowId = 'FactorialCalculatorWorkflow';
      const factorialActivities = [
        { name: 'validateInteger', type: 'validation', workflow_id: factorialWorkflowId, created_at: new Date() }
      ];

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Calculate factorial' }] })
        .mockResolvedValueOnce({ rows: factorialActivities });

      await loadWorkflowDefinition(factorialWorkflowId);

      // Clear mocks to simulate new request
      jest.clearAllMocks();

      // Second call for circle workflow - should NOT get factorial activities
      const circleWorkflowId = 'CircleAreaCalculatorWorkflow';
      const circleActivities = [
        { name: 'validateRadius', type: 'validation', workflow_id: circleWorkflowId, created_at: new Date() }
      ];

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Calculate circle area' }] })
        .mockResolvedValueOnce({ rows: circleActivities });

      const result = await loadWorkflowDefinition(circleWorkflowId);

      const activityNames = result.activities.map(a => a.name);
      expect(activityNames).toContain('validateRadius');
      expect(activityNames).not.toContain('validateInteger');
    });

    it('REGRESSION: Should handle recent activities fallback correctly', async () => {
      const workflowId = 'NewWorkflow';
      
      // No workflow-specific activities, but recent activities from different workflows exist
      const recentMixedActivities = [
        { name: 'validateRadius', type: 'validation', workflow_id: 'CircleAreaCalculatorWorkflow', created_at: new Date() },
        { name: 'validateInteger', type: 'validation', workflow_id: 'FactorialCalculatorWorkflow', created_at: new Date() },
        { name: 'genericActivity', type: 'generic', workflow_id: 'NewWorkflow', created_at: new Date() }
      ];

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'New workflow requirements' }] })
        .mockResolvedValueOnce({ rows: [] }) // no workflow-specific activities
        .mockResolvedValueOnce({ rows: recentMixedActivities }); // mixed recent activities

      const result = await loadWorkflowDefinition(workflowId);

      // Should get all recent activities when no workflow-specific ones exist
      expect(result.activities).toHaveLength(3);
      
      const activityNames = result.activities.map(a => a.name);
      expect(activityNames).toContain('validateRadius');
      expect(activityNames).toContain('validateInteger');
      expect(activityNames).toContain('genericActivity');
    });

    it('REGRESSION: Should properly filter by workflow_id in database query', async () => {
      const workflowId = 'TestWorkflow';

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Test requirements' }] })
        .mockResolvedValueOnce({ rows: [] }); // no activities found

      await loadWorkflowDefinition(workflowId);

      // Verify the exact query structure
      expect(mockPgClient.query).toHaveBeenCalledWith(
        expect.stringMatching(/SELECT.*FROM activity_library WHERE workflow_id = \$1.*ORDER BY created_at DESC LIMIT 20/),
        [workflowId]
      );
    });

    it('REGRESSION: Should maintain workflow ID consistency throughout loading', async () => {
      const workflowId = 'ConsistencyTestWorkflow';
      const activities = [
        { name: 'testActivity', type: 'test', workflow_id: workflowId, created_at: new Date(), description: 'Test activity' }
      ];

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Test requirements' }] })
        .mockResolvedValueOnce({ rows: activities });

      const result = await loadWorkflowDefinition(workflowId);

      // Verify workflow ID is preserved in metadata
      expect(result.metadata.workflowId).toBe(workflowId);
      
      // Verify activities maintain configuration
      expect(result.activities).toHaveLength(1);
      expect(result.activities[0].name).toBe('testActivity');
      expect(result.activities[0].type).toBe('test');
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle empty workflow ID gracefully', async () => {
      const workflowId = '';

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [] }); // no workflow found

      const result = await loadWorkflowDefinition(workflowId);

      // Should use fallback
      expect(result).toBeDefined();
      expect(result.activities).toBeDefined();
    });

    it('should handle null/undefined workflow ID gracefully', async () => {
      mockPgClient.query
        .mockResolvedValueOnce({ rows: [] });

      const result = await loadWorkflowDefinition(null as any);

      expect(result).toBeDefined();
      expect(result.activities).toBeDefined();
    });

    it('should handle database query errors gracefully', async () => {
      const workflowId = 'ErrorTestWorkflow';

      mockPgClient.query.mockRejectedValueOnce(new Error('Database connection lost'));

      const result = await loadWorkflowDefinition(workflowId);

      // Should fall back to default workflow
      expect(result).toBeDefined();
      expect(result.activities).toBeDefined();
      expect(result.metadata.name).toBe('Factorial Calculator'); // fallback name
    });

    it('should handle malformed database responses', async () => {
      const workflowId = 'MalformedTestWorkflow';

      // Mock malformed response
      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Test requirements' }] })
        .mockResolvedValueOnce({ 
          rows: [
            { name: null, type: undefined, workflow_id: workflowId }, // malformed activity
            { name: 'validActivity', type: 'valid', workflow_id: workflowId, created_at: new Date() }
          ] 
        });

      const result = await loadWorkflowDefinition(workflowId);

      // Should handle malformed data gracefully
      expect(result.activities).toHaveLength(2);
      expect(result.activities[1].name).toBe('validActivity');
    });
  });

  describe('Performance Regression', () => {
    it('should load workflow definitions within acceptable time', async () => {
      const workflowId = 'PerformanceTestWorkflow';
      const activities = Array.from({ length: 10 }, (_, i) => ({
        name: `activity${i}`,
        type: 'test',
        workflow_id: workflowId,
        created_at: new Date(),
        description: `Test activity ${i}`
      }));

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Performance test requirements' }] })
        .mockResolvedValueOnce({ rows: activities });

      const startTime = Date.now();
      const result = await loadWorkflowDefinition(workflowId);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result.activities).toHaveLength(10);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should not degrade with large activity sets', async () => {
      const workflowId = 'LargeWorkflow';
      const activities = Array.from({ length: 100 }, (_, i) => ({
        name: `activity${i}`,
        type: 'test',
        workflow_id: workflowId,
        created_at: new Date(),
        description: `Test activity ${i}`
      }));

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Large workflow requirements' }] })
        .mockResolvedValueOnce({ rows: activities });

      const startTime = Date.now();
      const result = await loadWorkflowDefinition(workflowId);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result.activities).toHaveLength(100);
      expect(duration).toBeLessThan(2000); // Should still complete within 2 seconds
    });
  });
});