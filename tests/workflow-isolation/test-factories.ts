/**
 * Test Data Factories and Mock Utilities
 * Provides reusable test data and mock configurations
 */

import { jest } from '@jest/globals';

// Workflow Test Data Factory
export class WorkflowTestDataFactory {
  static createCircleAreaWorkflow(overrides?: Partial<any>) {
    return {
      workflowId: 'CircleAreaCalculatorWorkflow',
      requirements: 'Calculate the area of a circle given its radius',
      activities: [
        {
          id: 'activity-1',
          name: 'validateRadius',
          type: 'validation',
          description: 'Validate that the radius is a positive number',
          code: `
            function validateRadius(input) {
              const radius = parseFloat(input.radius || input);
              if (isNaN(radius) || radius <= 0) {
                throw new Error('Radius must be a positive number');
              }
              return { validatedRadius: radius };
            }
          `,
          workflow_id: 'CircleAreaCalculatorWorkflow',
          created_at: new Date(),
          configuration: {},
          dependencies: [],
          required: true
        },
        {
          id: 'activity-2',
          name: 'calculateCircleArea',
          type: 'calculation',
          description: 'Calculate the area using the formula π × r²',
          code: `
            function calculateCircleArea(input) {
              const radius = input.validatedRadius || input.radius;
              const area = Math.PI * Math.pow(radius, 2);
              return { area: area, formula: 'π × r²' };
            }
          `,
          workflow_id: 'CircleAreaCalculatorWorkflow',
          created_at: new Date(),
          configuration: {},
          dependencies: ['activity-1'],
          required: true
        },
        {
          id: 'activity-3',
          name: 'formatAreaResult',
          type: 'formatting',
          description: 'Format the result for display',
          code: `
            function formatAreaResult(input) {
              const area = input.area;
              const formatted = 'Circle area: ' + area.toFixed(2) + ' square units';
              return { formattedResult: formatted, rawArea: area };
            }
          `,
          workflow_id: 'CircleAreaCalculatorWorkflow',
          created_at: new Date(),
          configuration: {},
          dependencies: ['activity-2'],
          required: true
        }
      ],
      ...overrides
    };
  }

  static createFactorialWorkflow(overrides?: Partial<any>) {
    return {
      workflowId: 'FactorialCalculatorWorkflow',
      requirements: 'Calculate the factorial of a positive integer',
      activities: [
        {
          id: 'activity-1',
          name: 'validateInteger',
          type: 'validation',
          description: 'Validate that the input is a positive integer',
          code: `
            function validateInteger(input) {
              const number = parseInt(input.number || input);
              if (isNaN(number) || number < 0 || !Number.isInteger(number)) {
                throw new Error('Input must be a non-negative integer');
              }
              return { validatedInteger: number };
            }
          `,
          workflow_id: 'FactorialCalculatorWorkflow',
          created_at: new Date(),
          configuration: {},
          dependencies: [],
          required: true
        },
        {
          id: 'activity-2',
          name: 'calculateFactorial',
          type: 'calculation',
          description: 'Calculate the factorial using iterative method',
          code: `
            function calculateFactorial(input) {
              const n = input.validatedInteger || input.number;
              if (n === 0 || n === 1) return { factorial: 1 };
              
              let result = 1;
              for (let i = 2; i <= n; i++) {
                result *= i;
              }
              return { factorial: result, inputNumber: n };
            }
          `,
          workflow_id: 'FactorialCalculatorWorkflow',
          created_at: new Date(),
          configuration: {},
          dependencies: ['activity-1'],
          required: true
        },
        {
          id: 'activity-3',
          name: 'formatFactorialResult',
          type: 'formatting',
          description: 'Format the factorial result for display',
          code: `
            function formatFactorialResult(input) {
              const factorial = input.factorial;
              const n = input.inputNumber;
              const formatted = n + '! = ' + factorial;
              return { formattedResult: formatted, rawFactorial: factorial };
            }
          `,
          workflow_id: 'FactorialCalculatorWorkflow',
          created_at: new Date(),
          configuration: {},
          dependencies: ['activity-2'],
          required: true
        }
      ],
      ...overrides
    };
  }

  static createGenericWorkflow(workflowId: string, activityCount: number = 3) {
    const activities = Array.from({ length: activityCount }, (_, i) => ({
      id: `activity-${i + 1}`,
      name: `genericActivity${i + 1}`,
      type: 'generic',
      description: `Generic activity ${i + 1} for ${workflowId}`,
      code: `
        function genericActivity${i + 1}(input) {
          return { 
            step: ${i + 1}, 
            result: 'Step ${i + 1} completed',
            input: input 
          };
        }
      `,
      workflow_id: workflowId,
      created_at: new Date(),
      configuration: {},
      dependencies: i === 0 ? [] : [`activity-${i}`],
      required: true
    }));

    return {
      workflowId,
      requirements: `Generic workflow with ${activityCount} activities`,
      activities,
    };
  }

  static createLargeWorkflow(workflowId: string, activityCount: number = 100) {
    return this.createGenericWorkflow(workflowId, activityCount);
  }

  static createMixedActivitiesWorkflow() {
    return {
      workflowId: 'MixedActivitiesWorkflow',
      requirements: 'Workflow with mixed activities from different sources',
      activities: [
        // Circle activities
        ...this.createCircleAreaWorkflow().activities.slice(0, 2),
        // Factorial activities
        ...this.createFactorialWorkflow().activities.slice(1, 3),
        // Generic activities
        ...this.createGenericWorkflow('MixedActivitiesWorkflow', 2).activities
      ]
    };
  }

  static createErrorProneWorkflow() {
    return {
      workflowId: 'ErrorProneWorkflow',
      requirements: 'Workflow designed to test error handling',
      activities: [
        {
          id: 'activity-1',
          name: 'alwaysFailActivity',
          type: 'error',
          description: 'Activity that always throws an error',
          code: `
            function alwaysFailActivity(input) {
              throw new Error('This activity always fails');
            }
          `,
          workflow_id: 'ErrorProneWorkflow',
          created_at: new Date(),
          configuration: {},
          dependencies: [],
          required: false
        },
        {
          id: 'activity-2',
          name: 'syntaxErrorActivity',
          type: 'error',
          description: 'Activity with syntax errors',
          code: `
            function syntaxErrorActivity(input) {
              return { result: input.value * // Missing operand
            }
          `,
          workflow_id: 'ErrorProneWorkflow',
          created_at: new Date(),
          configuration: {},
          dependencies: [],
          required: false
        }
      ]
    };
  }
}

// Session Test Data Factory
export class SessionTestDataFactory {
  static createSession(sessionId?: string) {
    return {
      sessionId: sessionId || `test-session-${Date.now()}`,
      createdAt: new Date(),
      parameters: {},
      results: new Map()
    };
  }

  static createMultipleSessions(count: number = 3) {
    return Array.from({ length: count }, (_, i) => 
      this.createSession(`concurrent-session-${i + 1}`)
    );
  }
}

// Mock Database Client Factory
export class MockDatabaseFactory {
  static createMockPgClient() {
    return {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      end: jest.fn().mockResolvedValue(undefined),
    };
  }

  static createMockRedisClient() {
    return {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue([]),
      flushdb: jest.fn().mockResolvedValue('OK'),
      exists: jest.fn().mockResolvedValue(0),
      expire: jest.fn().mockResolvedValue(1),
    };
  }

  static setupWorkflowQueries(mockClient: any, workflow: any) {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ requirements: workflow.requirements }] })
      .mockResolvedValueOnce({ rows: workflow.activities });
  }

  static setupActivityQuery(mockClient: any, activity: any) {
    mockClient.query.mockResolvedValue({
      rows: [{
        code: activity.code,
        name: activity.name,
        type: activity.type
      }]
    });
  }

  static setupErrorQuery(mockClient: any, errorMessage: string) {
    mockClient.query.mockRejectedValue(new Error(errorMessage));
  }
}

// Dynamic Workflow Input Factory
export class DynamicWorkflowInputFactory {
  static createBasicInput(workflowId: string, parameters?: any) {
    return {
      workflowId,
      parameters: parameters || { value: 42 },
      triggerType: 'manual' as const,
      sessionId: `session-${workflowId}-${Date.now()}`,
      executionId: `exec-${workflowId}-${Date.now()}`
    };
  }

  static createCircleAreaInput(radius: number = 5) {
    return this.createBasicInput('CircleAreaCalculatorWorkflow', { radius });
  }

  static createFactorialInput(number: number = 5) {
    return this.createBasicInput('FactorialCalculatorWorkflow', { number });
  }

  static createConcurrentInputs(workflowId: string, count: number = 3) {
    return Array.from({ length: count }, (_, i) => ({
      ...this.createBasicInput(workflowId, { index: i, value: i * 10 }),
      sessionId: `concurrent-session-${i + 1}`
    }));
  }

  static createBatchInputs() {
    return [
      this.createCircleAreaInput(3),
      this.createCircleAreaInput(7),
      this.createFactorialInput(4),
      this.createFactorialInput(6),
      this.createBasicInput('GenericWorkflow', { test: 'data' })
    ];
  }
}

// Activity Parameter Factory
export class ActivityParameterFactory {
  static createBasicParameters(sessionId: string, workflowId: string, activityName: string) {
    return {
      sessionId,
      workflowId,
      activityName,
      parameters: {
        timestamp: Date.now(),
        status: 'completed',
        result: 'success'
      }
    };
  }

  static createCircleAreaParameters(sessionId: string) {
    return [
      {
        ...this.createBasicParameters(sessionId, 'CircleAreaCalculatorWorkflow', 'validateRadius'),
        parameters: { validatedRadius: 5 }
      },
      {
        ...this.createBasicParameters(sessionId, 'CircleAreaCalculatorWorkflow', 'calculateCircleArea'),
        parameters: { area: 78.54, formula: 'π × r²' }
      },
      {
        ...this.createBasicParameters(sessionId, 'CircleAreaCalculatorWorkflow', 'formatAreaResult'),
        parameters: { formattedResult: 'Circle area: 78.54 square units' }
      }
    ];
  }

  static createComplexParameters(sessionId: string, workflowId: string) {
    return {
      sessionId,
      workflowId,
      activityName: 'complexActivity',
      parameters: {
        simple: 'string',
        number: 42,
        boolean: true,
        array: [1, 2, 3, 'four'],
        object: {
          nested: {
            deep: {
              value: 'deeply nested'
            }
          }
        },
        nullValue: null,
        date: new Date(),
        regex: /test/g
      }
    };
  }
}

// Test Assertions Helper
export class TestAssertions {
  static assertWorkflowIsolation(result1: any, result2: any) {
    // Ensure results don't share references
    expect(result1).not.toBe(result2);
    
    // Ensure activities are different
    const activities1 = result1.activities.map((a: any) => a.name);
    const activities2 = result2.activities.map((a: any) => a.name);
    
    expect(activities1).not.toEqual(activities2);
  }

  static assertActivitySequence(activities: any[]) {
    // Check that dependencies form a valid sequence
    for (let i = 1; i < activities.length; i++) {
      if (activities[i].dependencies && activities[i].dependencies.length > 0) {
        expect(activities[i].dependencies).toContain(`activity-${i}`);
      }
    }
  }

  static assertRedisKeyIsolation(mockRedis: any, session1: string, session2: string) {
    const setCalls = mockRedis.set.mock.calls;
    const session1Keys = setCalls.filter((call: any) => call[0].startsWith(session1)).map((call: any) => call[0]);
    const session2Keys = setCalls.filter((call: any) => call[0].startsWith(session2)).map((call: any) => call[0]);
    
    // Ensure no key overlap between sessions
    const keyOverlap = session1Keys.filter((key: string) => session2Keys.includes(key));
    expect(keyOverlap).toHaveLength(0);
  }

  static assertPerformanceWithinBounds(duration: number, maxDuration: number) {
    expect(duration).toBeLessThan(maxDuration);
    expect(duration).toBeGreaterThan(0);
  }

  static assertMemoryUsageStable(initialMemory: number, finalMemory: number, maxIncrease: number) {
    const memoryIncrease = finalMemory - initialMemory;
    expect(memoryIncrease).toBeLessThan(maxIncrease);
  }
}

// Test Scenario Builder
export class TestScenarioBuilder {
  private scenarios: any[] = [];

  addScenario(name: string, setup: () => any, expectations: (result: any) => void) {
    this.scenarios.push({ name, setup, expectations });
    return this;
  }

  addConcurrencyScenario(name: string, setupFn: () => any[], parallelCount: number = 3) {
    this.addScenario(name, () => {
      const setups = Array.from({ length: parallelCount }, setupFn);
      return Promise.all(setups.map(setup => setup()));
    }, (results) => {
      expect(results).toHaveLength(parallelCount);
      results.forEach((result: any) => expect(result).toBeDefined());
    });
    return this;
  }

  addErrorScenario(name: string, setup: () => any, expectedError?: string) {
    this.scenarios.push({
      name,
      setup,
      expectations: async (setupFn: () => any) => {
        if (expectedError) {
          await expect(setupFn()).rejects.toThrow(expectedError);
        } else {
          await expect(setupFn()).rejects.toThrow();
        }
      }
    });
    return this;
  }

  build() {
    return this.scenarios;
  }
}