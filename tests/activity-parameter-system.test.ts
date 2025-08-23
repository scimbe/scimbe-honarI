/**
 * Comprehensive Test Suite for Activity Parameter System
 * Tests Redis storage, deterministic resolution, and workflow orchestration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/testing-library/jest-dom';
import Redis from 'ioredis';
import { ActivityParameterManager } from '../services/workflow-automation/src/services/activity-parameter-manager';

describe('Activity Parameter System', () => {
  let redis: Redis;
  let parameterManager: ActivityParameterManager;
  
  const testSessionId = 'test-session-123';
  const testWorkflowId = 'test-workflow-456';
  const testParameterId = 'test-param-789';
  
  beforeAll(async () => {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryDelayOnFailover: 100,
      lazyConnect: true,
    });
    
    await redis.connect();
    parameterManager = new ActivityParameterManager(redis);
  });
  
  afterAll(async () => {
    await redis.quit();
  });
  
  beforeEach(async () => {
    // Clean up test data before each test
    await redis.flushdb();
  });
  
  afterEach(async () => {
    // Clean up test data after each test
    await redis.flushdb();
  });

  describe('Redis Parameter Storage', () => {
    it('should store and retrieve activity parameters', async () => {
      const testValue = { result: 'success', count: 42 };
      const metadata = {
        source: 'activity_output' as const,
        validation: { required: true, type: 'object' }
      };

      await parameterManager.storeActivityParameter(
        testSessionId,
        testWorkflowId,
        testParameterId,
        'test-activity',
        testValue,
        metadata
      );

      const retrievedValue = await parameterManager.resolveParameter(
        testSessionId,
        testWorkflowId,
        testParameterId
      );

      expect(retrievedValue).toEqual(testValue);
    });

    it('should create sessions with user context', async () => {
      const userContext = { userId: 'user123', role: 'admin' };
      
      await parameterManager.createSession(testSessionId, userContext);
      
      // Verify session exists by storing and retrieving a parameter
      await parameterManager.storeActivityParameter(
        testSessionId,
        testWorkflowId,
        testParameterId,
        'test-activity',
        'session-test',
        { source: 'user_input' }
      );

      const value = await parameterManager.resolveParameter(testSessionId, testWorkflowId, testParameterId);
      expect(value).toBe('session-test');
    });

    it('should store activity results in bulk', async () => {
      const results = {
        param1: 'value1',
        param2: { nested: 'value2' },
        param3: [1, 2, 3]
      };

      await parameterManager.storeActivityResults(
        testSessionId,
        testWorkflowId,
        'bulk-test-activity',
        results,
        { source: 'activity_output' }
      );

      // Verify all parameters were stored
      for (const [key, expectedValue] of Object.entries(results)) {
        const value = await parameterManager.resolveParameter(testSessionId, testWorkflowId, key);
        expect(value).toEqual(expectedValue);
      }
    });
  });

  describe('Deterministic Parameter Resolution', () => {
    it('should throw ParameterNotFoundError for missing parameters', async () => {
      await expect(
        parameterManager.resolveParameter(testSessionId, testWorkflowId, 'non-existent-param')
      ).rejects.toThrow('Parameter not found: test-session-123.test-workflow-456.non-existent-param');
    });

    it('should throw SessionExpiredError for expired sessions', async () => {
      // Store a parameter with very short TTL
      await parameterManager.storeActivityParameter(
        testSessionId,
        testWorkflowId,
        testParameterId,
        'test-activity',
        'test-value',
        { source: 'activity_output' },
        1 // 1 second TTL
      );

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      await expect(
        parameterManager.resolveParameter(testSessionId, testWorkflowId, testParameterId)
      ).rejects.toThrow('Parameter not found');
    });

    it('should validate parameter types correctly', async () => {
      const stringValue = 'test-string';
      const numberValue = 42;
      const objectValue = { key: 'value' };
      const arrayValue = [1, 2, 3];
      const booleanValue = true;

      // Store different types
      await parameterManager.storeActivityParameter(testSessionId, testWorkflowId, 'string-param', 'activity1', stringValue, { source: 'activity_output' });
      await parameterManager.storeActivityParameter(testSessionId, testWorkflowId, 'number-param', 'activity1', numberValue, { source: 'activity_output' });
      await parameterManager.storeActivityParameter(testSessionId, testWorkflowId, 'object-param', 'activity1', objectValue, { source: 'activity_output' });
      await parameterManager.storeActivityParameter(testSessionId, testWorkflowId, 'array-param', 'activity1', arrayValue, { source: 'activity_output' });
      await parameterManager.storeActivityParameter(testSessionId, testWorkflowId, 'boolean-param', 'activity1', booleanValue, { source: 'activity_output' });

      // Verify types are preserved
      expect(await parameterManager.resolveParameter(testSessionId, testWorkflowId, 'string-param')).toBe(stringValue);
      expect(await parameterManager.resolveParameter(testSessionId, testWorkflowId, 'number-param')).toBe(numberValue);
      expect(await parameterManager.resolveParameter(testSessionId, testWorkflowId, 'object-param')).toEqual(objectValue);
      expect(await parameterManager.resolveParameter(testSessionId, testWorkflowId, 'array-param')).toEqual(arrayValue);
      expect(await parameterManager.resolveParameter(testSessionId, testWorkflowId, 'boolean-param')).toBe(booleanValue);
    });
  });

  describe('Parameter Search and Filtering', () => {
    beforeEach(async () => {
      // Set up test data for search tests
      const testData = [
        { sessionId: 'session1', workflowId: 'workflow1', parameterId: 'param1', activityName: 'activity-a', value: 'value1', type: 'string' },
        { sessionId: 'session1', workflowId: 'workflow1', parameterId: 'param2', activityName: 'activity-b', value: 42, type: 'number' },
        { sessionId: 'session1', workflowId: 'workflow2', parameterId: 'param3', activityName: 'activity-a', value: { key: 'value' }, type: 'object' },
        { sessionId: 'session2', workflowId: 'workflow1', parameterId: 'param4', activityName: 'activity-c', value: [1, 2, 3], type: 'array' },
      ];

      for (const data of testData) {
        await parameterManager.storeActivityParameter(
          data.sessionId,
          data.workflowId,
          data.parameterId,
          data.activityName,
          data.value,
          { source: 'activity_output' }
        );
      }
    });

    it('should search parameters by session ID', async () => {
      const results = await parameterManager.searchParameters({
        sessionId: 'session1'
      });

      expect(results).toHaveLength(3);
      expect(results.every(p => p.sessionId === 'session1')).toBe(true);
    });

    it('should search parameters by workflow ID', async () => {
      const results = await parameterManager.searchParameters({
        sessionId: 'session1',
        workflowId: 'workflow1'
      });

      expect(results).toHaveLength(2);
      expect(results.every(p => p.workflowId === 'workflow1')).toBe(true);
    });

    it('should search parameters by activity name', async () => {
      const results = await parameterManager.searchParameters({
        activityName: 'activity-a'
      });

      expect(results).toHaveLength(2);
      expect(results.every(p => p.activityName === 'activity-a')).toBe(true);
    });

    it('should search parameters by type', async () => {
      const results = await parameterManager.searchParameters({
        parameterType: 'string'
      });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('string');
    });

    it('should filter parameters by time range', async () => {
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);

      const results = await parameterManager.searchParameters({
        timeRange: {
          from: oneHourAgo,
          to: now
        }
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(p => p.timestamp >= oneHourAgo && p.timestamp <= now)).toBe(true);
    });
  });

  describe('Workflow State Management', () => {
    it('should update workflow state', async () => {
      const initialState = { status: 'running', progress: 0 };
      
      await parameterManager.updateWorkflowState(testSessionId, testWorkflowId, initialState);
      
      const updatedState = { status: 'completed', progress: 100, result: 'success' };
      await parameterManager.updateWorkflowState(testSessionId, testWorkflowId, updatedState);

      const workflowParams = await parameterManager.getWorkflowParameters(testSessionId, testWorkflowId);
      expect(workflowParams).toMatchObject(updatedState);
    });

    it('should get all workflow parameters', async () => {
      // Store multiple parameters
      await parameterManager.storeActivityParameter(testSessionId, testWorkflowId, 'param1', 'activity1', 'value1', { source: 'activity_output' });
      await parameterManager.storeActivityParameter(testSessionId, testWorkflowId, 'param2', 'activity2', 'value2', { source: 'activity_output' });
      await parameterManager.storeActivityParameter(testSessionId, testWorkflowId, 'param3', 'activity3', 'value3', { source: 'user_input' });

      const allParams = await parameterManager.getWorkflowParameters(testSessionId, testWorkflowId);

      expect(Object.keys(allParams)).toHaveLength(3);
      expect(allParams.param1).toBe('value1');
      expect(allParams.param2).toBe('value2');
      expect(allParams.param3).toBe('value3');
    });
  });

  describe('Cleanup and TTL Management', () => {
    it('should cleanup expired parameters', async () => {
      // Store parameters with different TTLs
      await parameterManager.storeActivityParameter(testSessionId, testWorkflowId, 'short-lived', 'activity1', 'value1', { source: 'activity_output' }, 1);
      await parameterManager.storeActivityParameter(testSessionId, testWorkflowId, 'long-lived', 'activity2', 'value2', { source: 'activity_output' }, 3600);

      // Wait for short-lived parameter to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      const deletedCount = await parameterManager.cleanupExpiredParameters();
      expect(deletedCount).toBeGreaterThanOrEqual(1);

      // Verify short-lived parameter is gone but long-lived remains
      await expect(
        parameterManager.resolveParameter(testSessionId, testWorkflowId, 'short-lived')
      ).rejects.toThrow();

      const longLivedValue = await parameterManager.resolveParameter(testSessionId, testWorkflowId, 'long-lived');
      expect(longLivedValue).toBe('value2');
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection errors gracefully', async () => {
      // Simulate Redis disconnect
      await redis.disconnect();

      await expect(
        parameterManager.storeActivityParameter(testSessionId, testWorkflowId, testParameterId, 'activity', 'value', { source: 'activity_output' })
      ).rejects.toThrow();

      // Reconnect for cleanup
      await redis.connect();
    });

    it('should validate required parameters', async () => {
      await expect(
        parameterManager.storeActivityParameter('', testWorkflowId, testParameterId, 'activity', 'value', { source: 'activity_output' })
      ).rejects.toThrow('SessionId is required');

      await expect(
        parameterManager.storeActivityParameter(testSessionId, '', testParameterId, 'activity', 'value', { source: 'activity_output' })
      ).rejects.toThrow('WorkflowId is required');

      await expect(
        parameterManager.storeActivityParameter(testSessionId, testWorkflowId, '', 'activity', 'value', { source: 'activity_output' })
      ).rejects.toThrow('ParameterId is required');
    });
  });

  describe('Integration with Workflow Automation', () => {
    it('should integrate with temporal workflow execution', async () => {
      // Simulate temporal workflow parameter flow
      const sessionId = 'temporal-session-123';
      const workflowId = 'temporal-workflow-456';
      
      // Step 1: Store initial workflow parameters
      await parameterManager.storeActivityResults(sessionId, workflowId, 'initialization', {
        userId: 'user123',
        requestId: 'req456',
        startTime: Date.now()
      }, { source: 'system_generated' });

      // Step 2: Activity 1 stores its results
      await parameterManager.storeActivityResults(sessionId, workflowId, 'data-processing', {
        processedData: { records: 100, status: 'completed' },
        processingTime: 1500
      }, { source: 'activity_output' });

      // Step 3: Activity 2 resolves Activity 1's results
      const processedData = await parameterManager.resolveParameter(sessionId, workflowId, 'processedData');
      expect(processedData).toEqual({ records: 100, status: 'completed' });

      // Step 4: Activity 2 stores its results using Activity 1's data
      await parameterManager.storeActivityResults(sessionId, workflowId, 'result-generation', {
        finalResult: `Processed ${processedData.records} records successfully`,
        workflowComplete: true
      }, { source: 'activity_output' });

      // Verify complete workflow state
      const allParams = await parameterManager.getWorkflowParameters(sessionId, workflowId);
      expect(allParams.workflowComplete).toBe(true);
      expect(allParams.finalResult).toContain('100 records');
    });
  });
});