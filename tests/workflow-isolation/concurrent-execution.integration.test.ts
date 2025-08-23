/**
 * Integration Tests for Concurrent Workflow Execution
 * Tests that multiple workflows can execute simultaneously without interference
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { Client } from 'pg';
import Redis from 'ioredis';
import { dynamicWorkflow, DynamicWorkflowInput } from '../../services/temporal-worker/src/workflows-only/dynamic-workflow-wrapper';

// Mock database and Redis
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

jest.mock('pg', () => ({
  Client: jest.fn(() => mockPgClient)
}));

jest.mock('ioredis', () => jest.fn(() => mockRedis));

// Mock Temporal activities
const mockActivities = {
  loadWorkflowDefinition: jest.fn(),
  executeActivity: jest.fn(),
  storeActivityParameters: jest.fn().mockResolvedValue(true),
  logExecution: jest.fn().mockResolvedValue(true),
  resolveParameter: jest.fn(),
  executeWorkflowStep: jest.fn(),
  exchangeData: jest.fn(),
};

// Mock the activities module
jest.mock('@temporalio/workflow', () => ({
  proxyActivities: jest.fn(() => mockActivities),
  log: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

describe('Concurrent Workflow Execution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Parallel Workflow Execution', () => {
    it('should execute multiple different workflows concurrently without interference', async () => {
      // Setup mock responses for different workflows
      const circleWorkflowDefinition = {
        activities: [
          { id: 'activity-1', name: 'validateRadius', type: 'validation', configuration: {}, dependencies: [], required: true },
          { id: 'activity-2', name: 'calculateCircleArea', type: 'calculation', configuration: {}, dependencies: ['activity-1'], required: true },
          { id: 'activity-3', name: 'formatAreaResult', type: 'formatting', configuration: {}, dependencies: ['activity-2'], required: true }
        ],
        steps: [],
        metadata: { workflowId: 'CircleAreaCalculatorWorkflow', finalStep: 'activity-3' }
      };

      const factorialWorkflowDefinition = {
        activities: [
          { id: 'activity-1', name: 'validateInteger', type: 'validation', configuration: {}, dependencies: [], required: true },
          { id: 'activity-2', name: 'calculateFactorial', type: 'calculation', configuration: {}, dependencies: ['activity-1'], required: true },
          { id: 'activity-3', name: 'formatFactorialResult', type: 'formatting', configuration: {}, dependencies: ['activity-2'], required: true }
        ],
        steps: [],
        metadata: { workflowId: 'FactorialCalculatorWorkflow', finalStep: 'activity-3' }
      };

      // Mock activity responses
      mockActivities.loadWorkflowDefinition.mockImplementation((workflowId: string) => {
        if (workflowId === 'CircleAreaCalculatorWorkflow') {
          return Promise.resolve(circleWorkflowDefinition);
        } else if (workflowId === 'FactorialCalculatorWorkflow') {
          return Promise.resolve(factorialWorkflowDefinition);
        }
        throw new Error(`Unknown workflow: ${workflowId}`);
      });

      mockActivities.executeActivity.mockImplementation(({ activityName, input }) => {
        switch (activityName) {
          case 'validateRadius':
            return Promise.resolve({ validatedRadius: input.radius || 5 });
          case 'calculateCircleArea':
            return Promise.resolve({ area: Math.PI * Math.pow(input.validatedRadius || 5, 2) });
          case 'formatAreaResult':
            return Promise.resolve({ formattedResult: `Circle area: ${input.area}` });
          case 'validateInteger':
            return Promise.resolve({ validatedInteger: input.number || 5 });
          case 'calculateFactorial':
            const n = input.validatedInteger || 5;
            const factorial = Array.from({length: n}, (_, i) => i + 1).reduce((a, b) => a * b, 1);
            return Promise.resolve({ factorial });
          case 'formatFactorialResult':
            return Promise.resolve({ formattedResult: `Factorial: ${input.factorial}` });
          default:
            throw new Error(`Unknown activity: ${activityName}`);
        }
      });

      // Execute both workflows concurrently
      const circleInput: DynamicWorkflowInput = {
        workflowId: 'CircleAreaCalculatorWorkflow',
        parameters: { radius: 10 },
        triggerType: 'manual',
        sessionId: 'circle-session-1'
      };

      const factorialInput: DynamicWorkflowInput = {
        workflowId: 'FactorialCalculatorWorkflow',
        parameters: { number: 6 },
        triggerType: 'manual',
        sessionId: 'factorial-session-1'
      };

      // Run both workflows in parallel
      const [circleResult, factorialResult] = await Promise.all([
        dynamicWorkflow(circleInput),
        dynamicWorkflow(factorialInput)
      ]);

      // Verify both succeeded
      expect(circleResult.success).toBe(true);
      expect(factorialResult.success).toBe(true);

      // Verify correct results
      expect(circleResult.steps).toHaveLength(3);
      expect(factorialResult.steps).toHaveLength(3);

      // Verify no cross-contamination
      const circleActivityNames = circleResult.steps.map(s => s.stepId);
      const factorialActivityNames = factorialResult.steps.map(s => s.stepId);

      expect(circleActivityNames).toContain('activity-1'); // validateRadius
      expect(circleActivityNames).toContain('activity-2'); // calculateCircleArea
      expect(circleActivityNames).toContain('activity-3'); // formatAreaResult

      expect(factorialActivityNames).toContain('activity-1'); // validateInteger
      expect(factorialActivityNames).toContain('activity-2'); // calculateFactorial
      expect(factorialActivityNames).toContain('activity-3'); // formatFactorialResult

      // Verify activities were called with correct parameters
      expect(mockActivities.executeActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: 'CircleAreaCalculatorWorkflow',
          activityName: 'validateRadius'
        })
      );

      expect(mockActivities.executeActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: 'FactorialCalculatorWorkflow',
          activityName: 'validateInteger'
        })
      );
    });

    it('should handle concurrent execution of same workflow type with different inputs', async () => {
      const workflowDefinition = {
        activities: [
          { id: 'activity-1', name: 'validateRadius', type: 'validation', configuration: {}, dependencies: [], required: true },
          { id: 'activity-2', name: 'calculateCircleArea', type: 'calculation', configuration: {}, dependencies: ['activity-1'], required: true }
        ],
        steps: [],
        metadata: { workflowId: 'CircleAreaCalculatorWorkflow' }
      };

      mockActivities.loadWorkflowDefinition.mockResolvedValue(workflowDefinition);
      
      mockActivities.executeActivity.mockImplementation(({ activityName, input }) => {
        switch (activityName) {
          case 'validateRadius':
            return Promise.resolve({ validatedRadius: input.radius || input.validatedRadius || 5 });
          case 'calculateCircleArea':
            const radius = input.validatedRadius || 5;
            return Promise.resolve({ area: Math.PI * Math.pow(radius, 2) });
          default:
            throw new Error(`Unknown activity: ${activityName}`);
        }
      });

      // Execute same workflow type with different inputs
      const input1: DynamicWorkflowInput = {
        workflowId: 'CircleAreaCalculatorWorkflow',
        parameters: { radius: 5 },
        triggerType: 'manual',
        sessionId: 'session-1'
      };

      const input2: DynamicWorkflowInput = {
        workflowId: 'CircleAreaCalculatorWorkflow',
        parameters: { radius: 10 },
        triggerType: 'manual',
        sessionId: 'session-2'
      };

      const input3: DynamicWorkflowInput = {
        workflowId: 'CircleAreaCalculatorWorkflow',
        parameters: { radius: 15 },
        triggerType: 'manual',
        sessionId: 'session-3'
      };

      // Run all three instances concurrently
      const [result1, result2, result3] = await Promise.all([
        dynamicWorkflow(input1),
        dynamicWorkflow(input2),
        dynamicWorkflow(input3)
      ]);

      // All should succeed
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);

      // Each should have been called with their respective session IDs
      expect(mockActivities.executeActivity).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-1' })
      );
      expect(mockActivities.executeActivity).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-2' })
      );
      expect(mockActivities.executeActivity).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-3' })
      );
    });

    it('should maintain session isolation between concurrent workflows', async () => {
      const workflowDefinition = {
        activities: [
          { id: 'activity-1', name: 'storeData', type: 'storage', configuration: {}, dependencies: [], required: true }
        ],
        steps: [],
        metadata: { workflowId: 'DataStorageWorkflow' }
      };

      mockActivities.loadWorkflowDefinition.mockResolvedValue(workflowDefinition);
      mockActivities.executeActivity.mockResolvedValue({ stored: true });

      const session1Input: DynamicWorkflowInput = {
        workflowId: 'DataStorageWorkflow',
        parameters: { data: 'session1-data' },
        triggerType: 'manual',
        sessionId: 'session-1'
      };

      const session2Input: DynamicWorkflowInput = {
        workflowId: 'DataStorageWorkflow',
        parameters: { data: 'session2-data' },
        triggerType: 'manual',
        sessionId: 'session-2'
      };

      await Promise.all([
        dynamicWorkflow(session1Input),
        dynamicWorkflow(session2Input)
      ]);

      // Verify parameters were stored with correct session isolation
      expect(mockActivities.storeActivityParameters).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-1' })
      );
      expect(mockActivities.storeActivityParameters).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-2' })
      );
    });
  });

  describe('Error Isolation', () => {
    it('should not affect other workflows when one workflow fails', async () => {
      const workflowDefinition = {
        activities: [
          { id: 'activity-1', name: 'maybeFailActivity', type: 'test', configuration: {}, dependencies: [], required: true }
        ],
        steps: [],
        metadata: { workflowId: 'TestWorkflow' }
      };

      mockActivities.loadWorkflowDefinition.mockResolvedValue(workflowDefinition);

      // First workflow will fail
      // Second workflow will succeed
      mockActivities.executeActivity.mockImplementation(({ sessionId }) => {
        if (sessionId === 'fail-session') {
          return Promise.reject(new Error('Simulated failure'));
        }
        return Promise.resolve({ success: true });
      });

      const failInput: DynamicWorkflowInput = {
        workflowId: 'TestWorkflow',
        parameters: {},
        triggerType: 'manual',
        sessionId: 'fail-session'
      };

      const successInput: DynamicWorkflowInput = {
        workflowId: 'TestWorkflow',
        parameters: {},
        triggerType: 'manual',
        sessionId: 'success-session'
      };

      const [failResult, successResult] = await Promise.all([
        dynamicWorkflow(failInput),
        dynamicWorkflow(successInput)
      ]);

      expect(failResult.success).toBe(false);
      expect(successResult.success).toBe(true);
    });
  });

  describe('Load Testing', () => {
    it('should handle high concurrency without degradation', async () => {
      const workflowDefinition = {
        activities: [
          { id: 'activity-1', name: 'quickActivity', type: 'test', configuration: {}, dependencies: [], required: true }
        ],
        steps: [],
        metadata: { workflowId: 'PerformanceTestWorkflow' }
      };

      mockActivities.loadWorkflowDefinition.mockResolvedValue(workflowDefinition);
      mockActivities.executeActivity.mockResolvedValue({ result: 'success', timestamp: Date.now() });

      // Create 20 concurrent workflow executions
      const workflows = Array.from({ length: 20 }, (_, i): DynamicWorkflowInput => ({
        workflowId: 'PerformanceTestWorkflow',
        parameters: { index: i },
        triggerType: 'manual',
        sessionId: `perf-session-${i}`
      }));

      const startTime = Date.now();
      const results = await Promise.all(workflows.map(w => dynamicWorkflow(w)));
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All should succeed
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.executionId).toBeDefined();
      });

      // Should complete in reasonable time (adjust as needed)
      expect(totalTime).toBeLessThan(10000); // 10 seconds

      // Verify all workflows were called
      expect(mockActivities.executeActivity).toHaveBeenCalledTimes(20);
    });
  });
});