/**
 * Comprehensive Workflow Isolation Validation Tests
 * 
 * These tests verify that the workflow isolation fixes prevent
 * activity cross-contamination and maintain strict boundaries
 * between concurrent workflow executions.
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import {
    loadWorkflowDefinitionIsolated,
    executeActivityIsolated,
    IsolatedWorkflowCache,
    WorkflowIsolationError,
    createWorkflowExecutionContext,
    validateWorkflowContext
} from '../src/workflow-isolation-fixes';

describe('Workflow Isolation Validation', () => {
    let dbPool: Pool;
    let redis: Redis;
    let isolatedCache: IsolatedWorkflowCache;

    beforeAll(async () => {
        // Setup test database connection
        dbPool = new Pool({
            host: process.env.TEST_DB_HOST || 'localhost',
            port: parseInt(process.env.TEST_DB_PORT || '5432'),
            database: process.env.TEST_DB_NAME || 'test_temporal_ai_platform',
            user: process.env.TEST_DB_USER || 'temporal',
            password: process.env.TEST_DB_PASSWORD || 'temporal',
        });

        // Setup test Redis connection
        redis = new Redis({
            host: process.env.TEST_REDIS_HOST || 'localhost',
            port: parseInt(process.env.TEST_REDIS_PORT || '6379'),
            db: 1 // Use separate DB for tests
        });

        isolatedCache = new IsolatedWorkflowCache({
            host: process.env.TEST_REDIS_HOST || 'localhost',
            port: parseInt(process.env.TEST_REDIS_PORT || '6379'),
            db: 1
        });

        // Clear test data
        await redis.flushdb();
    });

    afterAll(async () => {
        await dbPool.end();
        await redis.disconnect();
    });

    beforeEach(async () => {
        // Clean test database
        await dbPool.query('DELETE FROM workflow_execution_contexts WHERE workflow_id IN (SELECT id FROM workflow_definitions WHERE name LIKE \'test-%\')');
        await dbPool.query('DELETE FROM activity_library WHERE workflow_id IN (SELECT id FROM workflow_definitions WHERE name LIKE \'test-%\')');
        await dbPool.query('DELETE FROM workflow_definitions WHERE name LIKE \'test-%\'');
        
        // Clear Redis test data
        await redis.flushdb();
    });

    describe('Database Isolation', () => {
        test('should prevent cross-workflow activity access', async () => {
            // Create two test workflows
            const workflow1 = await createTestWorkflow('test-workflow-1', 'TestWorkflow1');
            const workflow2 = await createTestWorkflow('test-workflow-2', 'TestWorkflow2');

            // Create activities for each workflow
            await createTestActivity(workflow1.id, 'activity-1-wf1', 'Workflow 1 Activity');
            await createTestActivity(workflow2.id, 'activity-1-wf2', 'Workflow 2 Activity');

            // Try to load workflow 1's definition - should only get workflow 1 activities
            const client = await dbPool.connect();
            try {
                const wf1Definition = await loadWorkflowDefinitionIsolated(
                    workflow1.id,
                    'exec-1',
                    'session-1',
                    client
                );

                expect(wf1Definition.activities).toBeDefined();
                expect(wf1Definition.activities.length).toBeGreaterThan(0);
                
                // Verify all activities belong to workflow 1
                wf1Definition.activities.forEach((activity: any) => {
                    expect(activity.workflowId).toBe(workflow1.id);
                    expect(activity.isolationContext.workflowId).toBe(workflow1.id);
                });

                // Verify workflow 2's activity is not present
                const hasWf2Activity = wf1Definition.activities.some(
                    (activity: any) => activity.name === 'activity-1-wf2'
                );
                expect(hasWf2Activity).toBe(false);

            } finally {
                client.release();
            }
        });

        test('should enforce strict workflow boundaries in queries', async () => {
            const workflow1 = await createTestWorkflow('test-isolation-1', 'IsolationTest1');
            const workflow2 = await createTestWorkflow('test-isolation-2', 'IsolationTest2');

            // Create activities in both workflows
            await createTestActivity(workflow1.id, 'shared-activity-name', 'Activity in Workflow 1');
            await createTestActivity(workflow2.id, 'shared-activity-name', 'Activity in Workflow 2');

            // Query for activities with same name but different workflows
            const client = await dbPool.connect();
            try {
                // Should only return workflow 1's activity
                const result = await client.query(`
                    SELECT * FROM get_workflow_activities_isolated($1)
                `, [workflow1.id]);

                expect(result.rows.length).toBe(1);
                expect(result.rows[0].workflow_id).toBe(workflow1.id);
                expect(result.rows[0].name).toBe('shared-activity-name');
                
                // Verify it's the correct activity (Workflow 1's version)
                expect(result.rows[0].code).toContain('Activity in Workflow 1');

            } finally {
                client.release();
            }
        });

        test('should throw isolation error when no activities found', async () => {
            const workflow = await createTestWorkflow('test-empty-workflow', 'EmptyWorkflow');

            const client = await dbPool.connect();
            try {
                await expect(
                    loadWorkflowDefinitionIsolated(workflow.id, 'exec-1', 'session-1', client)
                ).rejects.toThrow(WorkflowIsolationError);

            } finally {
                client.release();
            }
        });
    });

    describe('Activity Execution Isolation', () => {
        test('should execute activities only within workflow boundaries', async () => {
            const workflow1 = await createTestWorkflow('test-exec-1', 'ExecTest1');
            const workflow2 = await createTestWorkflow('test-exec-2', 'ExecTest2');

            // Create test activities
            await createTestActivity(
                workflow1.id, 
                'test-activity', 
                'function testActivity(input) { return { result: "workflow-1-result", input }; }'
            );
            await createTestActivity(
                workflow2.id, 
                'test-activity', 
                'function testActivity(input) { return { result: "workflow-2-result", input }; }'
            );

            const client = await dbPool.connect();
            try {
                // Execute activity in workflow 1 context
                const result1 = await executeActivityIsolated({
                    sessionId: 'session-1',
                    workflowId: workflow1.id,
                    activityName: 'test-activity',
                    input: { test: 'data' },
                    configuration: {}
                }, client);

                expect(result1.result).toBe('workflow-1-result');
                expect(result1.__isolation.workflowId).toBe(workflow1.id);

                // Execute same activity name in workflow 2 context - should get different result
                const result2 = await executeActivityIsolated({
                    sessionId: 'session-2',
                    workflowId: workflow2.id,
                    activityName: 'test-activity',
                    input: { test: 'data' },
                    configuration: {}
                }, client);

                expect(result2.result).toBe('workflow-2-result');
                expect(result2.__isolation.workflowId).toBe(workflow2.id);

                // Results should be different despite same activity name
                expect(result1.result).not.toBe(result2.result);

            } finally {
                client.release();
            }
        });

        test('should prevent cross-workflow activity execution', async () => {
            const workflow1 = await createTestWorkflow('test-cross-1', 'CrossTest1');
            const workflow2 = await createTestWorkflow('test-cross-2', 'CrossTest2');

            // Create activity only in workflow 1
            await createTestActivity(
                workflow1.id,
                'exclusive-activity',
                'function exclusiveActivity(input) { return { result: "exclusive" }; }'
            );

            const client = await dbPool.connect();
            try {
                // Try to execute workflow 1's activity in workflow 2's context
                await expect(
                    executeActivityIsolated({
                        sessionId: 'session-1',
                        workflowId: workflow2.id, // Wrong workflow ID
                        activityName: 'exclusive-activity', // Activity belongs to workflow 1
                        input: { test: 'data' },
                        configuration: {}
                    }, client)
                ).rejects.toThrow(WorkflowIsolationError);

            } finally {
                client.release();
            }
        });
    });

    describe('Cache Isolation', () => {
        test('should isolate cached results between workflows', async () => {
            const context1 = createWorkflowExecutionContext('wf-1', 'exec-1', 'session-1');
            const context2 = createWorkflowExecutionContext('wf-2', 'exec-2', 'session-2');

            // Store results in both contexts with same activity name
            await isolatedCache.storeActivityResult(context1, 'test-activity', { value: 'workflow-1-data' });
            await isolatedCache.storeActivityResult(context2, 'test-activity', { value: 'workflow-2-data' });

            // Retrieve results - should get correct data for each context
            const result1 = await isolatedCache.getActivityResult(context1, 'test-activity');
            const result2 = await isolatedCache.getActivityResult(context2, 'test-activity');

            expect(result1.value).toBe('workflow-1-data');
            expect(result2.value).toBe('workflow-2-data');
            expect(result1.value).not.toBe(result2.value);
        });

        test('should prevent cross-context cache access', async () => {
            const context1 = createWorkflowExecutionContext('wf-1', 'exec-1', 'session-1');
            const context2 = createWorkflowExecutionContext('wf-1', 'exec-2', 'session-2'); // Different execution

            // Store result in context 1
            await isolatedCache.storeActivityResult(context1, 'private-activity', { secret: 'confidential' });

            // Try to access from context 2 - should fail
            await expect(
                isolatedCache.getActivityResult(context2, 'private-activity')
            ).rejects.toThrow(WorkflowIsolationError);
        });

        test('should generate unique cache keys for isolation', async () => {
            const context1 = createWorkflowExecutionContext('wf-1', 'exec-1', 'session-1');
            const context2 = createWorkflowExecutionContext('wf-1', 'exec-1', 'session-2'); // Different session

            // Store same data in both contexts
            await isolatedCache.storeActivityResult(context1, 'activity', { data: 'test1' });
            await isolatedCache.storeActivityResult(context2, 'activity', { data: 'test2' });

            // Should be able to retrieve correct data from each context
            const result1 = await isolatedCache.getActivityResult(context1, 'activity');
            const result2 = await isolatedCache.getActivityResult(context2, 'activity');

            expect(result1.data).toBe('test1');
            expect(result2.data).toBe('test2');
        });

        test('should clear workflow cache correctly', async () => {
            const context = createWorkflowExecutionContext('wf-test', 'exec-test', 'session-test');

            // Store multiple results
            await isolatedCache.storeActivityResult(context, 'activity-1', { value: 'data1' });
            await isolatedCache.storeActivityResult(context, 'activity-2', { value: 'data2' });
            await isolatedCache.storeActivityResult(context, 'activity-3', { value: 'data3' });

            // Verify data exists
            const before1 = await isolatedCache.getActivityResult(context, 'activity-1');
            expect(before1.value).toBe('data1');

            // Clear workflow cache
            await isolatedCache.clearWorkflowCache(context);

            // Verify data is gone
            const after1 = await isolatedCache.getActivityResult(context, 'activity-1');
            const after2 = await isolatedCache.getActivityResult(context, 'activity-2');
            const after3 = await isolatedCache.getActivityResult(context, 'activity-3');

            expect(after1).toBeNull();
            expect(after2).toBeNull();
            expect(after3).toBeNull();
        });
    });

    describe('Concurrent Workflow Execution', () => {
        test('should maintain isolation under concurrent load', async () => {
            const workflows = [];
            const numWorkflows = 5;

            // Create multiple workflows
            for (let i = 0; i < numWorkflows; i++) {
                const workflow = await createTestWorkflow(
                    `concurrent-test-${i}`,
                    `ConcurrentTest${i}`
                );
                await createTestActivity(
                    workflow.id,
                    'concurrent-activity',
                    `function concurrentActivity(input) { return { workflowIndex: ${i}, input }; }`
                );
                workflows.push(workflow);
            }

            // Execute all workflows concurrently
            const promises = workflows.map(async (workflow, index) => {
                const client = await dbPool.connect();
                try {
                    const context = createWorkflowExecutionContext(
                        workflow.id,
                        `exec-${index}`,
                        `session-${index}`
                    );

                    // Load definition
                    const definition = await loadWorkflowDefinitionIsolated(
                        workflow.id,
                        context.executionId,
                        context.sessionId,
                        client
                    );

                    // Execute activity
                    const result = await executeActivityIsolated({
                        sessionId: context.sessionId,
                        workflowId: workflow.id,
                        activityName: 'concurrent-activity',
                        input: { test: `data-${index}` },
                        configuration: {}
                    }, client);

                    return {
                        workflowIndex: index,
                        workflowId: workflow.id,
                        definition,
                        result
                    };
                } finally {
                    client.release();
                }
            });

            const results = await Promise.all(promises);

            // Verify isolation - each workflow got its own correct data
            results.forEach((result, index) => {
                expect(result.workflowIndex).toBe(index);
                expect(result.result.workflowIndex).toBe(index);
                expect(result.result.__isolation.workflowId).toBe(result.workflowId);
                
                // Verify definition contains only activities for this workflow
                result.definition.activities.forEach((activity: any) => {
                    expect(activity.workflowId).toBe(result.workflowId);
                });
            });
        });
    });

    describe('Validation and Safety Checks', () => {
        test('should validate workflow context parameters', () => {
            expect(() => validateWorkflowContext('', 'exec', 'session')).toThrow(WorkflowIsolationError);
            expect(() => validateWorkflowContext('wf', '', 'session')).toThrow(WorkflowIsolationError);
            expect(() => validateWorkflowContext('wf', 'exec', '')).toThrow(WorkflowIsolationError);
            expect(() => validateWorkflowContext('ab', 'exec', 'session')).toThrow(WorkflowIsolationError);

            // Valid context should not throw
            expect(() => validateWorkflowContext('workflow', 'execution', 'session')).not.toThrow();
        });

        test('should create execution context with proper validation', () => {
            const context = createWorkflowExecutionContext('test-wf', 'test-exec', 'test-session');
            
            expect(context.workflowId).toBe('test-wf');
            expect(context.executionId).toBe('test-exec');
            expect(context.sessionId).toBe('test-session');
            expect(context.contextId).toBeDefined();
            expect(context.contextId).toMatch(/^[a-f0-9]{16}$/);
        });

        test('should generate consistent context IDs for same parameters', () => {
            const context1 = createWorkflowExecutionContext('wf', 'exec', 'session');
            const context2 = createWorkflowExecutionContext('wf', 'exec', 'session');
            
            expect(context1.contextId).toBe(context2.contextId);
        });

        test('should generate different context IDs for different parameters', () => {
            const context1 = createWorkflowExecutionContext('wf1', 'exec', 'session');
            const context2 = createWorkflowExecutionContext('wf2', 'exec', 'session');
            const context3 = createWorkflowExecutionContext('wf1', 'exec2', 'session');
            
            expect(context1.contextId).not.toBe(context2.contextId);
            expect(context1.contextId).not.toBe(context3.contextId);
            expect(context2.contextId).not.toBe(context3.contextId);
        });
    });

    // Helper functions
    async function createTestWorkflow(name: string, className: string) {
        const result = await dbPool.query(`
            INSERT INTO workflow_definitions (
                name, workflow_class_name, task_queue, python_workflow_code,
                description, category, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            name,
            className,
            'test-queue',
            `# Test workflow: ${name}`,
            `Test workflow for isolation testing: ${name}`,
            'testing',
            'active'
        ]);
        
        return result.rows[0];
    }

    async function createTestActivity(workflowId: string, name: string, code: string) {
        await dbPool.query(`
            INSERT INTO activity_library (
                id, name, type, code, workflow_id, access_scope, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            `${workflowId}-${name}-${Date.now()}`,
            name,
            'test',
            code,
            workflowId,
            'workflow_private',
            'test-suite'
        ]);
    }
});

// Performance and stress testing
describe('Workflow Isolation Performance', () => {
    test('should maintain performance under isolation constraints', async () => {
        const startTime = Date.now();
        const numOperations = 100;
        
        const operations = Array.from({ length: numOperations }, async (_, i) => {
            const context = createWorkflowExecutionContext(
                `perf-test-${i % 10}`, // 10 different workflows
                `exec-${i}`,
                `session-${i}`
            );
            
            // Simulate cache operations
            await isolatedCache.storeActivityResult(
                context,
                `activity-${i}`,
                { data: `test-data-${i}`, timestamp: Date.now() }
            );
            
            return await isolatedCache.getActivityResult(context, `activity-${i}`);
        });
        
        const results = await Promise.all(operations);
        const endTime = Date.now();
        
        expect(results).toHaveLength(numOperations);
        expect(results.every(r => r !== null)).toBe(true);
        
        const averageTime = (endTime - startTime) / numOperations;
        console.log(`Average isolation operation time: ${averageTime.toFixed(2)}ms`);
        
        // Should complete reasonably quickly (< 50ms average per operation)
        expect(averageTime).toBeLessThan(50);
    });
});