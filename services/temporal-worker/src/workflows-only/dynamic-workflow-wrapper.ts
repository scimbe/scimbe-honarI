/**
 * Revolutionary Dynamic Workflow Wrapper
 * Loads workflow logic dynamically from the workflow automation service
 * This bypasses determinism issues by keeping workflows pure and loading logic at runtime
 * Enhanced with Redis parameter storage and ALL activities execution guarantee
 */

import { proxyActivities, log } from '@temporalio/workflow';

// Generic dynamic activity proxy that can handle any workflow automation service activity
const dynamicActivities = proxyActivities<{
  executeWorkflowStep: (params: {
    workflowId: string;
    stepId: string;
    input: any;
    stepType: string;
    configuration: any;
    sessionId?: string;
  }) => Promise<any>;
  
  loadWorkflowDefinition: (workflowId: string) => Promise<{
    activities: Array<{
      id: string;
      name: string;
      type: string;
      configuration: any;
      dependencies: string[];
      required: boolean;
    }>;
    steps: Array<{
      id: string;
      type: string;
      configuration: any;
      dependencies: string[];
    }>;
    subworkflows?: Array<{
      id: string;
      name: string;
      activities: Array<{
        name: string;
        configuration: any;
        parameterDependencies?: string[];
      }>;
      parameters?: Record<string, any>;
    }>;
    subworkflowExecutionStrategy?: 'parallel' | 'sequential';
    metadata: any;
  }>;
  
  executeActivity: (params: {
    sessionId: string;
    workflowId: string;
    activityName: string;
    input: any;
    configuration: any;
  }) => Promise<any>;
  
  storeActivityParameters: (params: {
    sessionId: string;
    workflowId: string;
    activityName: string;
    parameters: Record<string, any>;
  }) => Promise<boolean>;
  
  resolveParameter: (params: {
    sessionId: string;
    workflowId: string;
    parameterId: string;
  }) => Promise<any>;
  
  exchangeData: (params: {
    sourceWorkflow: string;
    targetWorkflow: string;
    data: any;
    channel: string;
  }) => Promise<boolean>;
  
  logExecution: (params: {
    workflowId: string;
    stepId: string;
    status: string;
    result: any;
    timestamp: number;
    sessionId?: string;
  }) => Promise<boolean>;
}>({
  startToCloseTimeout: '15 minutes',
  retry: {
    initialInterval: '2s',
    maximumAttempts: 5,
    backoffCoefficient: 2,
  },
});

export interface DynamicWorkflowInput {
  workflowId?: string;
  workflowDefinitionId?: string;
  parameters: Record<string, any>;
  executionId?: string;
  sessionId?: string;
  parentWorkflowId?: string;
  triggerType: 'manual' | 'scheduled' | 'event' | 'workflow-chain';
}

export interface DynamicWorkflowResult {
  success: boolean;
  workflowId: string;
  executionId: string;
  result: any;
  steps: Array<{
    stepId: string;
    status: 'completed' | 'failed' | 'skipped';
    result: any;
    executionTime: number;
  }>;
  totalExecutionTime: number;
  timestamp: number;
}

/**
 * Enhanced Dynamic Workflow that ensures ALL activities execute in sequence
 * Integrates with Redis parameter storage for cross-activity data sharing
 */
export async function dynamicWorkflow(input: DynamicWorkflowInput): Promise<DynamicWorkflowResult> {
  const startTime = Date.now();
  const executionId = input.executionId || `exec_${input.workflowId}_${startTime}`;
  const sessionId = input.sessionId || `session_${startTime}`;
  
  try {
    // Step 1: Load workflow definition from automation service
    // Ensure workflowId is passed correctly
    const workflowIdToLoad = input.workflowId || input.workflowDefinitionId || 'unknown_workflow';
    const workflowDefinition = await dynamicActivities.loadWorkflowDefinition(workflowIdToLoad);
    
    // Step 2: Initialize execution tracking
    const activityResults: Array<{
      activityId: string;
      activityName: string;
      status: 'completed' | 'failed' | 'skipped';
      result: any;
      executionTime: number;
    }> = [];
    
    const stepResults: Array<{
      stepId: string;
      status: 'completed' | 'failed' | 'skipped';
      result: any;
      executionTime: number;
    }> = [];
    
    // Step 3: Execute ALL activities in sequence (CRITICAL REQUIREMENT)
    if (workflowDefinition.activities && workflowDefinition.activities.length > 0) {
      let currentInput = input.parameters;
      
      for (const activity of workflowDefinition.activities) {
        const activityStartTime = Date.now();
        
        try {
          // Execute activity with current input and session context
          const activityResult = await dynamicActivities.executeActivity({
            sessionId,
            workflowId: workflowIdToLoad,
            activityName: activity.name,
            input: currentInput,
            configuration: activity.configuration,
          });
          
          // Store activity results in Redis for cross-activity access
          await dynamicActivities.storeActivityParameters({
            sessionId,
            workflowId: workflowIdToLoad,
            activityName: activity.name,
            parameters: activityResult,
          });
          
          // Track activity completion
          const activityExecutionTime = Date.now() - activityStartTime;
          activityResults.push({
            activityId: activity.id,
            activityName: activity.name,
            status: 'completed',
            result: activityResult,
            executionTime: activityExecutionTime,
          });
          
          // Log execution
          await dynamicActivities.logExecution({
            workflowId: workflowIdToLoad,
            stepId: activity.id,
            status: 'completed',
            result: activityResult,
            timestamp: Date.now(),
            sessionId,
          });
          
          // Pass result to next activity as input
          currentInput = { 
            ...currentInput, 
            ...activityResult,
            [`${activity.name}_result`]: activityResult 
          };
          
        } catch (error) {
          const activityExecutionTime = Date.now() - activityStartTime;
          const errorResult = { error: error instanceof Error ? error.message : String(error) };
          
          activityResults.push({
            activityId: activity.id,
            activityName: activity.name,
            status: 'failed',
            result: errorResult,
            executionTime: activityExecutionTime,
          });
          
          // Log failure
          await dynamicActivities.logExecution({
            workflowId: workflowIdToLoad,
            stepId: activity.id,
            status: 'failed',
            result: errorResult,
            timestamp: Date.now(),
            sessionId,
          });
          
          // Fail workflow if activity is required
          if (activity.required !== false) {
            throw new Error(`Required activity ${activity.name} failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
    
    // Step 4: Execute subworkflows if any exist (simplified implementation)
    if (workflowDefinition.subworkflows && workflowDefinition.subworkflows.length > 0) {
      log.info('Subworkflow execution temporarily disabled - focusing on core activity sequence');
      // TODO: Implement subworkflow execution after core activity flow is stable
    }
    
    // Step 5: Execute remaining workflow steps (if any)
    if (workflowDefinition.steps && workflowDefinition.steps.length > 0) {
      const executionContext = {
        workflowId: workflowIdToLoad,
        executionId,
        parameters: input.parameters,
        stepResults: new Map<string, any>(),
      };
      
      // Resolve step dependencies and create execution order
      const executionOrder = resolveDependencies(workflowDefinition.steps);
      
      // Execute each step
      for (const step of executionOrder) {
        const stepStartTime = Date.now();
        
        try {
          // Prepare step input by resolving dependencies and Redis parameters
          const stepInput = {
            ...input.parameters,
            ...resolveStepDependencies(step, executionContext),
          };
          
          // Resolve additional parameters from Redis if needed
          for (const dependency of step.dependencies || []) {
            try {
              const paramValue = await dynamicActivities.resolveParameter({
                sessionId,
                workflowId: workflowIdToLoad,
                parameterId: dependency,
              });
              stepInput[`param_${dependency}`] = paramValue;
            } catch (error) {
              // Parameter not found in Redis, continue with step dependencies
            }
          }
          
          // Execute step via automation service
          const stepResult = await dynamicActivities.executeWorkflowStep({
            workflowId: workflowIdToLoad,
            stepId: step.id,
            input: stepInput,
            stepType: step.type,
            configuration: step.configuration,
            sessionId,
          });
          
          // Store result for dependent steps
          executionContext.stepResults.set(step.id, stepResult);
          
          // Track step completion
          const stepExecutionTime = Date.now() - stepStartTime;
          stepResults.push({
            stepId: step.id,
            status: 'completed',
            result: stepResult,
            executionTime: stepExecutionTime,
          });
          
          // Log execution
          await dynamicActivities.logExecution({
            workflowId: workflowIdToLoad,
            stepId: step.id,
            status: 'completed',
            result: stepResult,
            timestamp: Date.now(),
            sessionId,
          });
          
        } catch (error) {
          const stepExecutionTime = Date.now() - stepStartTime;
          stepResults.push({
            stepId: step.id,
            status: 'failed',
            result: { error: error instanceof Error ? error.message : String(error) },
            executionTime: stepExecutionTime,
          });
          
          // Log failure
          await dynamicActivities.logExecution({
            workflowId: workflowIdToLoad,
            stepId: step.id,
            status: 'failed',
            result: { error: error instanceof Error ? error.message : String(error) },
            timestamp: Date.now(),
            sessionId,
          });
          
          // Decide whether to continue or fail workflow based on step configuration
          if (step.configuration?.required !== false) {
            throw new Error(`Required step ${step.id} failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
    
    // Step 6: Prepare final result combining activities and steps
    const finalResult = extractFinalResult(
      [
        ...activityResults.map(a => ({ stepId: a.activityId, result: a.result })),
        ...stepResults.map(s => ({ stepId: s.stepId, result: s.result }))
      ],
      workflowDefinition.metadata
    );
    const totalExecutionTime = Date.now() - startTime;
    
    return {
      success: true,
      workflowId: input.workflowId,
      executionId,
      result: finalResult,
      steps: [
        ...activityResults.map(a => ({
          stepId: a.activityId,
          status: a.status,
          result: a.result,
          executionTime: a.executionTime,
        })),
        ...stepResults
      ],
      totalExecutionTime,
      timestamp: Date.now(),
    };
    
  } catch (error) {
    const totalExecutionTime = Date.now() - startTime;
    
    return {
      success: false,
      workflowId: input.workflowId,
      executionId,
      result: { error: error instanceof Error ? error.message : String(error) },
      steps: [],
      totalExecutionTime,
      timestamp: Date.now(),
    };
  }
}

/**
 * Resolve step dependencies to create proper execution order
 */
function resolveDependencies(steps: Array<{ id: string; type: string; configuration: any; dependencies: string[] }>): Array<{ id: string; type: string; configuration: any; dependencies: string[] }> {
  const resolved: Array<{ id: string; type: string; configuration: any; dependencies: string[] }> = [];
  const remaining = [...steps];
  
  while (remaining.length > 0) {
    const previousLength = remaining.length;
    
    for (let i = remaining.length - 1; i >= 0; i--) {
      const step = remaining[i];
      if (!step) continue;
      const dependenciesMet = step.dependencies.every(dep => 
        resolved.some(resolvedStep => resolvedStep.id === dep)
      );
      
      if (dependenciesMet) {
        resolved.push(step as { id: string; type: string; configuration: any; dependencies: string[] });
        remaining.splice(i, 1);
      }
    }
    
    // Prevent infinite loops in case of circular dependencies
    if (remaining.length === previousLength) {
      throw new Error(`Circular dependency detected in workflow steps: ${remaining.map(s => s.id).join(', ')}`);
    }
  }
  
  return resolved;
}

/**
 * Resolve step dependencies by gathering results from previous steps
 */
function resolveStepDependencies(
  step: { id: string; dependencies: string[] },
  context: { stepResults: Map<string, any> }
): Record<string, any> {
  const dependencyResults: Record<string, any> = {};
  
  for (const depId of step.dependencies) {
    const depResult = context.stepResults.get(depId);
    if (depResult !== undefined) {
      dependencyResults[`${depId}_result`] = depResult;
    }
  }
  
  return dependencyResults;
}

/**
 * Extract final workflow result based on step results and metadata
 */
function extractFinalResult(
  stepResults: Array<{ stepId: string; result: any }>,
  metadata: any
): any {
  // If metadata specifies a final step, use that result
  if (metadata?.finalStep) {
    const finalStep = stepResults.find(step => step.stepId === metadata.finalStep);
    return finalStep?.result || {};
  }
  
  // Otherwise, return results from all steps
  const results: Record<string, any> = {};
  for (const step of stepResults) {
    results[step.stepId] = step.result;
  }
  
  return results;
}