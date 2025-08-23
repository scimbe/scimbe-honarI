# Workflow Isolation Test Suite

This comprehensive test suite is designed to detect, reproduce, and verify fixes for the workflow isolation bug where `CircleAreaCalculatorWorkflow` was loading wrong activities from other workflows.

## Test Structure

```
tests/workflow-isolation/
├── activity-loading.unit.test.ts      # Unit tests for activity loading logic
├── concurrent-execution.integration.test.ts  # Integration tests for concurrent workflows
├── regression.test.ts                 # Regression tests to prevent bug recurrence
├── performance.test.ts               # Performance tests for the fix
├── edge-cases.test.ts               # Edge cases and boundary conditions
├── caching-behavior.test.ts         # Activity caching behavior tests
├── test-factories.ts               # Reusable test data and mock factories
├── setup.ts                       # Test setup and configuration
├── jest.config.js                # Jest configuration
└── README.md                     # This documentation
```

## Test Categories

### 1. Unit Tests (`activity-loading.unit.test.ts`)

Tests the core `loadWorkflowDefinition` function to ensure it:
- Loads correct activities for each workflow type
- Does NOT load activities from other workflows
- Handles database queries properly
- Falls back gracefully when workflows are not found

**Key Test Cases:**
- ✅ CircleAreaCalculatorWorkflow loads only circle-related activities
- ✅ FactorialCalculatorWorkflow loads only factorial-related activities
- ❌ **BUG REPRODUCTION**: Documents the bug where wrong activities are loaded
- ✅ Verifies the fix prevents cross-contamination

### 2. Integration Tests (`concurrent-execution.integration.test.ts`)

Tests complete workflow execution scenarios:
- Multiple workflows executing simultaneously
- Session isolation between concurrent executions
- Error isolation (one workflow failure doesn't affect others)
- Load testing with high concurrency

**Key Test Cases:**
- Parallel execution of different workflow types
- Same workflow type with different inputs
- Session-based parameter isolation
- High-concurrency performance validation

### 3. Regression Tests (`regression.test.ts`)

Specific tests to prevent the original bug from recurring:
- **CRITICAL**: CircleAreaCalculatorWorkflow never loads factorial activities
- **CRITICAL**: FactorialCalculatorWorkflow never loads circle activities
- Database query isolation
- Cache pollution prevention

**Key Test Cases:**
- Strict activity type validation
- Database query parameter verification
- Workflow ID consistency checks
- Boundary condition handling

### 4. Performance Tests (`performance.test.ts`)

Ensures the fix doesn't introduce performance regressions:
- Workflow definition loading times
- Activity execution performance
- Memory usage validation
- Scalability with large workflows

**Key Metrics:**
- Workflow loading: < 500ms for normal workflows
- Large workflows (100+ activities): < 1000ms
- Memory increase: < 10MB for repeated operations
- Concurrent operations: Linear scaling

### 5. Edge Cases (`edge-cases.test.ts`)

Tests unusual scenarios and boundary conditions:
- Invalid/malformed input handling
- Database connection failures
- Network timeouts
- Malformed activity code
- SQL injection prevention

**Key Scenarios:**
- Empty/null workflow IDs
- Special characters in workflow names
- Database connection errors
- Malformed JavaScript activity code
- Race conditions and timing issues

### 6. Caching Behavior (`caching-behavior.test.ts`)

Tests caching mechanisms and isolation:
- Redis parameter storage isolation
- Activity result caching
- Cache cleanup and expiration
- Cross-workflow cache prevention

**Key Validations:**
- Session-based cache keys
- Workflow-specific namespacing
- Parameter serialization integrity
- Cache cleanup verification

## Running the Tests

### Prerequisites

```bash
# Install dependencies
npm install

# Ensure test database is available
docker-compose up -d postgres redis
```

### Running All Tests

```bash
# Run all workflow isolation tests
npm test -- --testPathPattern=workflow-isolation

# Run with coverage
npm test -- --testPathPattern=workflow-isolation --coverage

# Run in watch mode
npm test -- --testPathPattern=workflow-isolation --watch
```

### Running Specific Test Categories

```bash
# Unit tests only
npm test activity-loading.unit.test.ts

# Integration tests
npm test concurrent-execution.integration.test.ts

# Regression tests (most critical)
npm test regression.test.ts

# Performance tests
npm test performance.test.ts

# Edge cases
npm test edge-cases.test.ts

# Caching behavior
npm test caching-behavior.test.ts
```

### Running in CI/CD

```bash
# CI-friendly command with XML output
npm test -- --testPathPattern=workflow-isolation --ci --coverage --reporters=default --reporters=jest-junit
```

## Test Data and Mocks

The `test-factories.ts` file provides reusable test data:

### WorkflowTestDataFactory
- `createCircleAreaWorkflow()` - Complete circle area workflow
- `createFactorialWorkflow()` - Complete factorial workflow  
- `createGenericWorkflow()` - Configurable generic workflow
- `createErrorProneWorkflow()` - Workflow for error testing

### MockDatabaseFactory
- `createMockPgClient()` - PostgreSQL client mock
- `createMockRedisClient()` - Redis client mock
- `setupWorkflowQueries()` - Configure query responses
- `setupErrorQuery()` - Simulate database errors

### DynamicWorkflowInputFactory
- `createCircleAreaInput()` - Circle workflow input
- `createFactorialInput()` - Factorial workflow input
- `createConcurrentInputs()` - Multiple concurrent inputs

## Bug Reproduction

The original bug can be reproduced with this test:

```typescript
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
```

## Fix Verification

The fix should be verified with these critical tests:

```typescript
it('should verify the fix prevents wrong activities from loading', async () => {
  const circleWorkflowId = 'CircleAreaCalculatorWorkflow';
  
  // Mock workflow-specific activities only
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
```

## Coverage Requirements

- **Overall Coverage**: 80% minimum
- **Critical Files**: 90% minimum
- **Activity Loading Logic**: 95% minimum

### Coverage Targets

| Component | Lines | Functions | Branches |
|-----------|-------|-----------|----------|
| working-activities.ts | 90% | 90% | 85% |
| dynamic-workflow-wrapper.ts | 85% | 85% | 80% |
| Overall Test Suite | 80% | 75% | 70% |

## Expected Test Results

### Before Fix (Bug Present)
```
✅ Unit Tests: Should document bug reproduction
❌ Regression Tests: Should fail showing bug
❌ Integration Tests: May show cross-contamination
✅ Performance Tests: Should pass (if no performance issues)
✅ Edge Cases: Should pass (if properly handled)
```

### After Fix (Bug Resolved)
```
✅ All Test Categories: Should pass
✅ Regression Tests: Should prevent bug recurrence
✅ Integration Tests: Should show proper isolation
✅ Performance Tests: Should maintain or improve performance
✅ Edge Cases: Should handle all boundary conditions
```

## Debugging Failed Tests

### Common Issues

1. **Mock Setup Problems**
   ```bash
   # Clear Jest cache
   npm test -- --clearCache
   ```

2. **Database Connection Issues**
   ```bash
   # Verify test database is running
   docker-compose ps postgres redis
   ```

3. **Timeout Issues**
   ```bash
   # Increase timeout for slow tests
   npm test -- --testTimeout=60000
   ```

### Debugging Commands

```bash
# Run single test with verbose output
npm test -- --testNamePattern="specific test name" --verbose

# Run with debug logging
DEBUG=* npm test activity-loading.unit.test.ts

# Run with coverage for specific file
npm test -- --collectCoverageFrom="**/working-activities.ts" --coverage
```

## Contributing

When adding new tests:

1. Use the test factories for consistent test data
2. Follow the naming convention: `describe('Category') > it('should action')`
3. Include both positive and negative test cases
4. Add performance benchmarks for new functionality
5. Update this README with new test descriptions

## Monitoring and Alerts

Set up monitoring for:
- Test execution time increases
- Coverage decreases
- New test failures in CI/CD
- Performance regression alerts

The test suite is designed to be the definitive verification that the workflow isolation bug is fixed and will not recur.