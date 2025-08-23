/**
 * Unit Tests for Activity Loading Logic
 * Tests the core bug: CircleAreaCalculatorWorkflow loading wrong activity
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Client } from 'pg';
import Redis from 'ioredis';

// Import the functions to test
import { loadWorkflowDefinition, executeActivity } from '../../services/temporal-worker/src/working-activities';

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

describe('Activity Loading Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('loadWorkflowDefinition', () => {
    it('should load correct activities for CircleAreaCalculatorWorkflow', async () => {
      const workflowId = 'CircleAreaCalculatorWorkflow';
      const expectedActivities = [
        { name: 'validateRadius', type: 'validation', workflow_id: workflowId },
        { name: 'calculateCircleArea', type: 'calculation', workflow_id: workflowId },
        { name: 'formatAreaResult', type: 'formatting', workflow_id: workflowId }
      ];

      // Mock workflow exists
      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Calculate circle area' }] }) // workflow query
        .mockResolvedValueOnce({ rows: expectedActivities }); // activity query

      const result = await loadWorkflowDefinition(workflowId);

      expect(result).toBeDefined();
      expect(result.activities).toHaveLength(3);
      expect(result.activities[0].name).toBe('validateRadius');
      expect(result.activities[1].name).toBe('calculateCircleArea');
      expect(result.activities[2].name).toBe('formatAreaResult');
      expect(result.metadata.workflowId).toBe(workflowId);
    });

    it('should load correct activities for FactorialCalculatorWorkflow', async () => {
      const workflowId = 'FactorialCalculatorWorkflow';
      const expectedActivities = [
        { name: 'validateInteger', type: 'validation', workflow_id: workflowId },
        { name: 'calculateFactorial', type: 'calculation', workflow_id: workflowId },
        { name: 'formatFactorialResult', type: 'formatting', workflow_id: workflowId }
      ];

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Calculate factorial' }] })
        .mockResolvedValueOnce({ rows: expectedActivities });

      const result = await loadWorkflowDefinition(workflowId);

      expect(result.activities).toHaveLength(3);
      expect(result.activities[0].name).toBe('validateInteger');
      expect(result.activities[1].name).toBe('calculateFactorial');
      expect(result.activities[2].name).toBe('formatFactorialResult');
    });

    it('should NOT load factorial activities for circle workflow', async () => {
      const workflowId = 'CircleAreaCalculatorWorkflow';
      const correctActivities = [
        { name: 'validateRadius', type: 'validation', workflow_id: workflowId },
        { name: 'calculateCircleArea', type: 'calculation', workflow_id: workflowId }
      ];

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Calculate circle area' }] })
        .mockResolvedValueOnce({ rows: correctActivities });

      const result = await loadWorkflowDefinition(workflowId);

      // Should NOT contain factorial-related activities
      const activityNames = result.activities.map(a => a.name);
      expect(activityNames).not.toContain('calculateFactorial');
      expect(activityNames).not.toContain('validateInteger');
      expect(activityNames).toContain('validateRadius');
      expect(activityNames).toContain('calculateCircleArea');
    });

    it('should handle workflow not found gracefully', async () => {
      const workflowId = 'NonExistentWorkflow';

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [] }); // workflow not found

      const result = await loadWorkflowDefinition(workflowId);

      expect(result).toBeDefined();
      expect(result.activities).toBeDefined();
      expect(result.metadata.name).toBe('Factorial Calculator'); // fallback
    });

    it('should handle database connection errors', async () => {
      const workflowId = 'TestWorkflow';
      
      mockPgClient.connect.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await loadWorkflowDefinition(workflowId);

      expect(result).toBeDefined();
      expect(result.activities).toBeDefined(); // should use fallback
    });

    it('should use workflow-specific query first', async () => {
      const workflowId = 'TestWorkflow';

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Test requirements' }] })
        .mockResolvedValueOnce({ rows: [] }) // no workflow-specific activities
        .mockResolvedValueOnce({ rows: [{ name: 'genericActivity', type: 'generic' }] }); // recent activities

      await loadWorkflowDefinition(workflowId);

      // Should call workflow-specific query first
      expect(mockPgClient.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('WHERE workflow_id = $1'),
        [workflowId]
      );
    });

    it('should fall back to recent activities when no workflow-specific activities found', async () => {
      const workflowId = 'TestWorkflow';

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Test requirements' }] })
        .mockResolvedValueOnce({ rows: [] }) // no workflow-specific activities
        .mockResolvedValueOnce({ rows: [{ name: 'recentActivity', type: 'recent' }] });

      const result = await loadWorkflowDefinition(workflowId);

      expect(result.activities).toHaveLength(1);
      expect(result.activities[0].name).toBe('recentActivity');
    });

    it('should preserve activity dependencies in correct order', async () => {
      const workflowId = 'TestWorkflow';
      const activities = [
        { name: 'firstActivity', type: 'start', workflow_id: workflowId },
        { name: 'secondActivity', type: 'middle', workflow_id: workflowId },
        { name: 'thirdActivity', type: 'end', workflow_id: workflowId }
      ];

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Test requirements' }] })
        .mockResolvedValueOnce({ rows: activities });

      const result = await loadWorkflowDefinition(workflowId);

      // Check sequential dependencies
      expect(result.activities[0].dependencies).toEqual([]);
      expect(result.activities[1].dependencies).toEqual(['activity-1']);
      expect(result.activities[2].dependencies).toEqual(['activity-2']);
    });

    it('should generate unique activity IDs', async () => {
      const workflowId = 'TestWorkflow';
      const activities = [
        { name: 'activity1', type: 'type1', workflow_id: workflowId },
        { name: 'activity2', type: 'type2', workflow_id: workflowId },
        { name: 'activity3', type: 'type3', workflow_id: workflowId }
      ];

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Test requirements' }] })
        .mockResolvedValueOnce({ rows: activities });

      const result = await loadWorkflowDefinition(workflowId);

      const activityIds = result.activities.map(a => a.id);
      expect(activityIds).toEqual(['activity-1', 'activity-2', 'activity-3']);
      expect(new Set(activityIds).size).toBe(3); // all unique
    });
  });

  describe('Bug Reproduction Tests', () => {
    it('should reproduce the original bug scenario', async () => {
      // Simulate the bug where CircleAreaCalculatorWorkflow gets factorial activities
      const circleWorkflowId = 'CircleAreaCalculatorWorkflow';
      const wrongActivities = [
        { name: 'validateInteger', type: 'validation', workflow_id: 'FactorialCalculatorWorkflow' },
        { name: 'calculateFactorial', type: 'calculation', workflow_id: 'FactorialCalculatorWorkflow' }
      ];

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Calculate circle area' }] })
        .mockResolvedValueOnce({ rows: [] }) // no specific activities
        .mockResolvedValueOnce({ rows: wrongActivities }); // wrong activities from cache

      const result = await loadWorkflowDefinition(circleWorkflowId);

      // This test documents the bug - the circle workflow gets factorial activities
      const activityNames = result.activities.map(a => a.name);
      expect(activityNames).toContain('validateInteger'); // This is the bug!
      expect(activityNames).toContain('calculateFactorial'); // This is the bug!
    });

    it('should verify the fix prevents wrong activities from loading', async () => {
      // This test will pass once the fix is implemented
      const circleWorkflowId = 'CircleAreaCalculatorWorkflow';
      
      // Mock the database to return workflow-specific activities only
      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Calculate circle area' }] })
        .mockResolvedValueOnce({ 
          rows: [
            { name: 'validateRadius', type: 'validation', workflow_id: circleWorkflowId },
            { name: 'calculateCircleArea', type: 'calculation', workflow_id: circleWorkflowId }
          ] 
        });

      const result = await loadWorkflowDefinition(circleWorkflowId);

      const activityNames = result.activities.map(a => a.name);
      expect(activityNames).not.toContain('validateInteger');
      expect(activityNames).not.toContain('calculateFactorial');
      expect(activityNames).toContain('validateRadius');
      expect(activityNames).toContain('calculateCircleArea');
    });
  });

  describe('Cache Isolation Tests', () => {
    it('should not share activity cache between different workflows', async () => {
      // First load factorial workflow
      const factorialWorkflowId = 'FactorialCalculatorWorkflow';
      const factorialActivities = [
        { name: 'validateInteger', type: 'validation', workflow_id: factorialWorkflowId }
      ];

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Calculate factorial' }] })
        .mockResolvedValueOnce({ rows: factorialActivities });

      const factorialResult = await loadWorkflowDefinition(factorialWorkflowId);

      // Then load circle workflow
      const circleWorkflowId = 'CircleAreaCalculatorWorkflow';
      const circleActivities = [
        { name: 'validateRadius', type: 'validation', workflow_id: circleWorkflowId }
      ];

      mockPgClient.query
        .mockResolvedValueOnce({ rows: [{ requirements: 'Calculate circle area' }] })
        .mockResolvedValueOnce({ rows: circleActivities });

      const circleResult = await loadWorkflowDefinition(circleWorkflowId);

      // Verify no cross-contamination
      expect(factorialResult.activities[0].name).toBe('validateInteger');
      expect(circleResult.activities[0].name).toBe('validateRadius');
    });
  });
});