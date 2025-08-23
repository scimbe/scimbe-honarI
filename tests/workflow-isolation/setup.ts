/**
 * Test Setup for Workflow Isolation Tests
 * Configures global test environment and utilities
 */

import { jest } from '@jest/globals';

// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.POSTGRES_HOST = 'localhost';
  process.env.POSTGRES_PORT = '5432';
  process.env.POSTGRES_DB = 'test_temporal_ai_platform';
  process.env.POSTGRES_USER = 'test_user';
  process.env.POSTGRES_PASSWORD = 'test_password';
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '6379';
});

// Global test cleanup
afterEach(() => {
  // Clear all mocks after each test
  jest.clearAllMocks();
});

afterAll(() => {
  // Final cleanup
  jest.restoreAllMocks();
});

// Custom matchers
expect.extend({
  toBeValidWorkflowDefinition(received) {
    const pass = (
      received &&
      typeof received === 'object' &&
      Array.isArray(received.activities) &&
      received.metadata &&
      typeof received.metadata === 'object'
    );

    return {
      message: () => 
        pass 
          ? `Expected ${received} not to be a valid workflow definition`
          : `Expected ${received} to be a valid workflow definition`,
      pass,
    };
  },

  toHaveIsolatedActivities(received, expectedWorkflowId) {
    if (!received.activities || !Array.isArray(received.activities)) {
      return {
        message: () => `Expected workflow to have activities array`,
        pass: false,
      };
    }

    // Check that activities don't contain wrong workflow activities
    const invalidActivities = received.activities.filter((activity: any) => {
      if (expectedWorkflowId === 'CircleAreaCalculatorWorkflow') {
        return ['validateInteger', 'calculateFactorial', 'formatFactorialResult'].includes(activity.name);
      } else if (expectedWorkflowId === 'FactorialCalculatorWorkflow') {
        return ['validateRadius', 'calculateCircleArea', 'formatAreaResult'].includes(activity.name);
      }
      return false;
    });

    const pass = invalidActivities.length === 0;

    return {
      message: () => 
        pass 
          ? `Expected workflow ${expectedWorkflowId} to have cross-contaminated activities`
          : `Expected workflow ${expectedWorkflowId} to be isolated, but found invalid activities: ${invalidActivities.map(a => a.name).join(', ')}`,
      pass,
    };
  },

  toHaveUniqueRedisKeys(received) {
    if (!Array.isArray(received)) {
      return {
        message: () => `Expected array of Redis keys`,
        pass: false,
      };
    }

    const uniqueKeys = new Set(received);
    const pass = uniqueKeys.size === received.length;

    return {
      message: () => 
        pass 
          ? `Expected Redis keys to have duplicates`
          : `Expected all Redis keys to be unique, but found ${received.length - uniqueKeys.size} duplicates`,
      pass,
    };
  },

  toCompleteWithinTime(received, maxTime) {
    const pass = received <= maxTime;

    return {
      message: () => 
        pass 
          ? `Expected operation to take more than ${maxTime}ms, but took ${received}ms`
          : `Expected operation to complete within ${maxTime}ms, but took ${received}ms`,
      pass,
    };
  }
});

// Global test utilities
global.testUtils = {
  // Wait utility for async operations
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Generate test data
  generateTestData: (size: number) => Array.from({ length: size }, (_, i) => ({
    id: i,
    value: `test-${i}`,
    timestamp: Date.now() + i
  })),
  
  // Mock database responses
  createMockDbResponse: (rows: any[] = []) => ({ rows }),
  
  // Capture console output for testing
  captureConsole: () => {
    const logs: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.log = (...args) => logs.push(['log', ...args].join(' '));
    console.error = (...args) => logs.push(['error', ...args].join(' '));
    console.warn = (...args) => logs.push(['warn', ...args].join(' '));
    
    return {
      getLogs: () => logs,
      restore: () => {
        console.log = originalLog;
        console.error = originalError;
        console.warn = originalWarn;
      }
    };
  }
};

// Enhanced error handling for tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in test:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in test:', error);
});

// TypeScript declarations for global extensions
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidWorkflowDefinition(): R;
      toHaveIsolatedActivities(expectedWorkflowId: string): R;
      toHaveUniqueRedisKeys(): R;
      toCompleteWithinTime(maxTime: number): R;
    }
  }

  var testUtils: {
    wait: (ms: number) => Promise<void>;
    generateTestData: (size: number) => Array<{ id: number; value: string; timestamp: number }>;
    createMockDbResponse: (rows?: any[]) => { rows: any[] };
    captureConsole: () => {
      getLogs: () => string[];
      restore: () => void;
    };
  };
}