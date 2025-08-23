/**
 * Immediate Workflow Isolation Bug Fixes
 * 
 * This file contains the critical fixes to prevent activity cross-contamination
 * between workflows. Apply these changes immediately to resolve the isolation bug.
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import crypto from 'crypto';

// ============================================================================
// CRITICAL FIX 1: Enhanced Activity Loading with Workflow Isolation
// ============================================================================

export interface WorkflowExecutionContext {
    workflowId: string;
    executionId: string;
    sessionId: string;
    contextId?: string;
}

export class WorkflowIsolationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WorkflowIsolationError';
    }
}

/**
 * REPLACE working-activities.ts loadWorkflowDefinition function with this
 */
export async function loadWorkflowDefinitionIsolated(
    workflowId: string, 
    executionId: string, 
    sessionId: string,
    dbClient: any
): Promise<any> {
    console.log('🔒 Loading workflow with strict isolation:', { workflowId, executionId, sessionId });
    
    try {
        // CRITICAL: Only query activities for this specific workflow
        const workflowSpecificQuery = `
            SELECT name, type, description, code, workflow_id, created_at 
            FROM activity_library 
            WHERE workflow_id = $1 
                AND (
                    -- Allow activities specifically for this workflow
                    workflow_id = $1
                    -- Do NOT fallback to recent activities from other workflows
                )
            ORDER BY created_at DESC 
            LIMIT 50
        `;
        
        console.log('🔍 Executing isolated query for workflow:', workflowId);
        const activitiesResult = await dbClient.query(workflowSpecificQuery, [workflowId]);
        
        console.log(`🔒 Isolated query returned ${activitiesResult.rows.length} activities for workflow ${workflowId}`);
        
        // STRICT: If no activities found, do not fallback to other workflows
        if (activitiesResult.rows.length === 0) {
            throw new WorkflowIsolationError(
                `No activities found for workflow ${workflowId}. Cross-workflow access blocked for isolation.`
            );
        }
        
        // Validate that all returned activities belong to the requested workflow
        const invalidActivities = activitiesResult.rows.filter(
            (activity: any) => activity.workflow_id !== workflowId
        );
        
        if (invalidActivities.length > 0) {
            throw new WorkflowIsolationError(
                `Cross-workflow contamination detected. Found ${invalidActivities.length} activities from other workflows.`
            );
        }
        
        // Convert to workflow definition format with isolation metadata
        const activities = activitiesResult.rows.map((row: any, index: number) => ({
            id: `activity-${index + 1}`,
            name: row.name,
            type: row.type,
            description: row.description,
            configuration: {},
            dependencies: index === 0 ? [] : [`activity-${index}`],
            required: true,
            // Add isolation metadata
            workflowId: row.workflow_id,
            isolationContext: {
                workflowId,
                executionId,
                sessionId,
                loadedAt: new Date().toISOString()
            }
        }));
        
        console.log('✅ Loaded isolated activities:', activities.map(a => `${a.name} (${a.workflowId})`));
        
        return {
            activities,
            steps: [],
            metadata: {
                workflowId,
                executionId,
                sessionId,
                isolationLevel: 'strict',
                loadedAt: new Date().toISOString(),
                finalStep: activities.length > 0 ? activities[activities.length - 1].id : undefined
            }
        };
        
    } catch (error) {
        console.error('❌ Error loading isolated workflow:', error);
        
        // Do not provide fallback - maintain isolation
        if (error instanceof WorkflowIsolationError) {
            throw error;
        }
        
        throw new WorkflowIsolationError(
            `Failed to load workflow ${workflowId} with isolation: ${(error as Error).message}`
        );
    }
}

// ============================================================================
// CRITICAL FIX 2: Isolated Activity Execution
// ============================================================================

/**
 * REPLACE working-activities.ts executeActivity function with this
 */
export async function executeActivityIsolated(params: {
    sessionId: string;
    workflowId: string;
    activityName: string;
    input: any;
    configuration: any;
}, dbClient: any): Promise<any> {
    console.log('🔒 Executing activity with isolation:', {
        workflow: params.workflowId,
        activity: params.activityName,
        session: params.sessionId
    });
    
    const { sessionId, workflowId, activityName, input } = params;
    
    try {
        // CRITICAL: Query with strict workflow isolation
        const activityQuery = `
            SELECT code, name, type, workflow_id, created_at
            FROM activity_library 
            WHERE name = $1 
                AND workflow_id = $2  -- CRITICAL: Enforce workflow boundary
            ORDER BY created_at DESC 
            LIMIT 1
        `;
        
        const activityResult = await dbClient.query(activityQuery, [activityName, workflowId]);
        
        if (activityResult.rows.length === 0) {
            throw new WorkflowIsolationError(
                `Activity ${activityName} not found for workflow ${workflowId}. Cross-workflow access blocked.`
            );
        }
        
        const { code, name, type, workflow_id } = activityResult.rows[0];
        
        // Validate isolation boundary
        if (workflow_id !== workflowId) {
            throw new WorkflowIsolationError(
                `Activity ${activityName} belongs to workflow ${workflow_id}, not ${workflowId}`
            );
        }
        
        console.log('✅ Activity isolation validated:', { name, type, workflow_id });
        
        // Execute with isolation context
        const isolatedContext = {
            input: input,
            sessionId: sessionId,
            workflowId: workflowId,
            activityName: activityName,
            isolationBoundary: true,
            console: console,
            Math: Math,
            JSON: JSON,
            Date: Date
        };
        
        // Safe execution with isolation
        const vm = require('vm');
        const context = vm.createContext(isolatedContext);
        
        const wrappedCode = `
            try {
                ${code}
                
                // Extract and execute function
                const functionMatch = code.match(/function\\s+(\\w+)/);
                let result;
                if (functionMatch && typeof eval(functionMatch[1]) === 'function') {
                    result = eval(functionMatch[1])(${JSON.stringify(getActivityInputIsolated(input, activityName))});
                } else {
                    throw new Error('Function not found in activity code');
                }
                
                // Add isolation metadata to result
                if (result && typeof result === 'object') {
                    result.__isolation = {
                        workflowId: '${workflowId}',
                        activityName: '${activityName}',
                        sessionId: '${sessionId}',
                        executedAt: new Date().toISOString()
                    };
                }
                
                result;
            } catch (error) {
                ({ 
                    error: error.message, 
                    activityName: '${activityName}',
                    workflowId: '${workflowId}',
                    isolationViolation: false
                });
            }
        `;
        
        const result = vm.runInContext(wrappedCode, context);
        
        if (result && result.error) {
            throw new Error(`Activity ${activityName} execution failed: ${result.error}`);
        }
        
        console.log('✅ Activity executed with isolation:', activityName);
        return result;
        
    } catch (error) {
        console.error('❌ Isolated activity execution failed:', error);
        throw error;
    }
}

// ============================================================================
// CRITICAL FIX 3: Isolated Redis Caching
// ============================================================================

export class IsolatedWorkflowCache {
    private redis: Redis;
    
    constructor(redisConfig?: any) {
        this.redis = new Redis({
            host: process.env.REDIS_HOST || 'redis',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            keyPrefix: 'workflow:isolated:',
            ...redisConfig
        });
    }
    
    /**
     * Generate isolated cache key with strong boundary enforcement
     */
    private buildIsolatedKey(
        workflowId: string,
        executionId: string,
        sessionId: string,
        resourceType: string,
        resourceId: string
    ): string {
        // Create hash to ensure uniqueness and prevent key collision
        const boundaryHash = crypto
            .createHash('sha256')
            .update(`${workflowId}:${executionId}:${sessionId}`)
            .digest('hex')
            .substring(0, 16);
        
        return `${boundaryHash}:${resourceType}:${resourceId}`;
    }
    
    /**
     * Store activity result with strict isolation
     */
    async storeActivityResult(
        context: WorkflowExecutionContext,
        activityName: string,
        result: any
    ): Promise<void> {
        const key = this.buildIsolatedKey(
            context.workflowId,
            context.executionId,
            context.sessionId,
            'activity_result',
            activityName
        );
        
        const isolatedData = {
            result,
            metadata: {
                workflowId: context.workflowId,
                executionId: context.executionId,
                sessionId: context.sessionId,
                activityName,
                timestamp: Date.now(),
                isolationBoundary: true,
                version: '1.0'
            }
        };
        
        await this.redis.setex(key, 3600, JSON.stringify(isolatedData));
        console.log('🔒 Stored isolated activity result:', { key, activityName });
    }
    
    /**
     * Retrieve activity result with isolation validation
     */
    async getActivityResult(
        context: WorkflowExecutionContext,
        activityName: string
    ): Promise<any> {
        const key = this.buildIsolatedKey(
            context.workflowId,
            context.executionId,
            context.sessionId,
            'activity_result',
            activityName
        );
        
        const cached = await this.redis.get(key);
        if (!cached) {
            return null;
        }
        
        const data = JSON.parse(cached);
        
        // CRITICAL: Validate isolation boundary
        const metadata = data.metadata;
        if (!metadata || !metadata.isolationBoundary) {
            throw new WorkflowIsolationError('Cache entry missing isolation metadata');
        }
        
        if (metadata.workflowId !== context.workflowId ||
            metadata.executionId !== context.executionId ||
            metadata.sessionId !== context.sessionId) {
            throw new WorkflowIsolationError(
                `Cache isolation violation: Expected ${context.workflowId}:${context.executionId}:${context.sessionId}, ` +
                `got ${metadata.workflowId}:${metadata.executionId}:${metadata.sessionId}`
            );
        }
        
        console.log('✅ Retrieved isolated cache entry:', { key, activityName });
        return data.result;
    }
    
    /**
     * Clear all cache entries for a workflow execution
     */
    async clearWorkflowCache(context: WorkflowExecutionContext): Promise<void> {
        const pattern = this.buildIsolatedKey(
            context.workflowId,
            context.executionId,
            context.sessionId,
            '*',
            '*'
        );
        
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
            await this.redis.del(...keys);
            console.log('🧹 Cleared isolated cache entries:', keys.length);
        }
    }
}

// ============================================================================
// CRITICAL FIX 4: Enhanced Route Isolation
// ============================================================================

/**
 * REPLACE activities.ts route handler with this isolated version
 */
export function createIsolatedActivityRoutes(fastify: any, dbPool: Pool): void {
    
    /**
     * Get activities for specific workflow only - NO CROSS-WORKFLOW ACCESS
     */
    fastify.get('/api/activities/:workflowId', async (request: any, reply: any) => {
        const { workflowId } = request.params;
        const { executionId, sessionId } = request.query;
        
        try {
            // CRITICAL: Only return activities for the specified workflow
            const result = await dbPool.query(`
                SELECT 
                    id, name, type, description, version, category,
                    inputs, outputs, code, language, metadata, tags,
                    usage_count, quality_score, created_at, updated_at, created_by,
                    workflow_id
                FROM activity_library 
                WHERE workflow_id = $1  -- CRITICAL: Workflow isolation enforced
                ORDER BY name ASC
            `, [workflowId]);
            
            // Validate all results belong to requested workflow
            const invalidActivities = result.rows.filter(
                (activity: any) => activity.workflow_id !== workflowId
            );
            
            if (invalidActivities.length > 0) {
                throw new WorkflowIsolationError(
                    `Cross-workflow contamination detected in query results`
                );
            }
            
            const activities = result.rows.map((activity: any) => ({
                ...activity,
                isolationMetadata: {
                    workflowId,
                    executionId,
                    sessionId,
                    validatedAt: new Date().toISOString()
                }
            }));
            
            console.log(`🔒 Returned ${activities.length} isolated activities for workflow ${workflowId}`);
            
            return reply.send({
                success: true,
                data: activities,
                metadata: {
                    workflowId,
                    isolationLevel: 'strict',
                    count: activities.length
                },
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Isolated activity query failed:', error);
            
            if (error instanceof WorkflowIsolationError) {
                return reply.status(403).send({
                    success: false,
                    error: 'Workflow Isolation Violation',
                    message: (error as Error).message,
                    workflowId,
                    timestamp: Date.now()
                });
            }
            
            return reply.status(500).send({
                success: false,
                error: 'Failed to retrieve isolated activities',
                message: (error as Error).message,
                workflowId,
                timestamp: Date.now()
            });
        }
    });
    
    /**
     * Create activity with workflow isolation enforcement
     */
    fastify.post('/api/activities', async (request: any, reply: any) => {
        const activityData = request.body;
        const { workflowId } = activityData;
        
        if (!workflowId) {
            return reply.status(400).send({
                success: false,
                error: 'Workflow ID required for isolation',
                timestamp: Date.now()
            });
        }
        
        try {
            // Validate workflow exists
            const workflowCheck = await dbPool.query(
                'SELECT id FROM workflow_definitions WHERE id = $1',
                [workflowId]
            );
            
            if (workflowCheck.rows.length === 0) {
                throw new WorkflowIsolationError(`Workflow ${workflowId} does not exist`);
            }
            
            // Create activity with isolation metadata
            const result = await dbPool.query(`
                INSERT INTO activity_library (
                    id, name, type, description, version, category,
                    inputs, outputs, code, language, metadata, tags,
                    usage_count, quality_score, created_at, updated_at, created_by,
                    workflow_id
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW(), $15, $16
                )
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    code = EXCLUDED.code,
                    workflow_id = EXCLUDED.workflow_id,  -- Ensure workflow isolation maintained
                    updated_at = NOW()
                RETURNING *
            `, [
                activityData.id,
                activityData.name,
                activityData.type || 'custom',
                activityData.description || '',
                activityData.version || '1.0.0',
                activityData.category || 'user-defined',
                JSON.stringify(activityData.inputs || {}),
                JSON.stringify(activityData.outputs || {}),
                activityData.code,
                activityData.language || 'javascript',
                JSON.stringify({
                    ...activityData.metadata,
                    isolation: {
                        workflowId,
                        createdAt: new Date().toISOString(),
                        isolationLevel: 'strict'
                    }
                }),
                activityData.tags || [],
                0,
                0.0,
                activityData.createdBy || 'workflow-editor',
                workflowId  // CRITICAL: Associate with workflow
            ]);
            
            console.log('✅ Created isolated activity:', {
                id: activityData.id,
                name: activityData.name,
                workflowId
            });
            
            return reply.status(201).send({
                success: true,
                data: result.rows[0],
                message: 'Activity created with workflow isolation',
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Failed to create isolated activity:', error);
            
            return reply.status(500).send({
                success: false,
                error: 'Failed to create isolated activity',
                message: (error as Error).message,
                timestamp: Date.now()
            });
        }
    });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getActivityInputIsolated(input: any, activityName: string): any {
    // Ensure input is properly isolated for activity type
    if (activityName.toLowerCase().includes('validate')) {
        return input.number || input.user_input || input;
    }
    
    if (activityName.toLowerCase().includes('calculate')) {
        return input.validated_integer || input.validated_input || input.number || input;
    }
    
    if (activityName.toLowerCase().includes('format')) {
        return input.factorial_result || input.calculation_result || input.result || input;
    }
    
    return input;
}

/**
 * Validation helper for workflow context
 */
export function validateWorkflowContext(
    workflowId: string,
    executionId: string,
    sessionId: string
): void {
    if (!workflowId || !executionId || !sessionId) {
        throw new WorkflowIsolationError(
            'Invalid workflow context: workflowId, executionId, and sessionId are required'
        );
    }
    
    if (workflowId.length < 3 || executionId.length < 3 || sessionId.length < 3) {
        throw new WorkflowIsolationError(
            'Workflow context identifiers must be at least 3 characters long'
        );
    }
}

/**
 * Create isolated execution context
 */
export function createWorkflowExecutionContext(
    workflowId: string,
    executionId: string,
    sessionId: string
): WorkflowExecutionContext {
    validateWorkflowContext(workflowId, executionId, sessionId);
    
    return {
        workflowId,
        executionId,
        sessionId,
        contextId: crypto
            .createHash('sha256')
            .update(`${workflowId}:${executionId}:${sessionId}`)
            .digest('hex')
            .substring(0, 16)
    };
}

// Export all critical fixes
export {
    loadWorkflowDefinitionIsolated as loadWorkflowDefinition,
    executeActivityIsolated as executeActivity,
    IsolatedWorkflowCache,
    createIsolatedActivityRoutes
};