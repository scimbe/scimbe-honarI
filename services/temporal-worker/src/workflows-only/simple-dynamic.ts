/**
 * Dynamic Workflow Wrapper - Database-Driven Activities
 * Loads activities dynamically from database at runtime
 */

import { proxyActivities } from '@temporalio/workflow';

// Dynamic activities that load from database
const dynamicActivities = proxyActivities<{
  loadWorkflowDefinition: (workflowDefinitionId: string) => Promise<{
    id: string;
    name: string;
    definition: {
      steps: Array<{
        id: string;
        name: string;
        type: string;
        activity_id: string;
        inputs: any;
        outputs: any;
      }>;
    };
  }>;
  
  executeActivity: (params: {
    activityId: string;
    input: any;
  }) => Promise<any>;
  
  logExecution: (params: {
    workflowId: string;
    stepId: string;
    status: string;
    result: any;
    timestamp: number;
  }) => Promise<boolean>;
}>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '1s',
    maximumAttempts: 3,
  },
});

export interface DynamicInput {
  workflowDefinitionId: string;
  parameters?: Record<string, any>;
}

/**
 * DynamicWorkflowWrapper - Executes workflows using database-loaded activities
 */
export async function DynamicWorkflowWrapper(input: DynamicInput): Promise<any> {
  const startTime = Date.now();
  
  try {
    // Load workflow definition from database
    const workflowDefinition = await dynamicActivities.loadWorkflowDefinition(input.workflowDefinitionId);
    
    console.log(`Executing workflow: ${workflowDefinition.name}`);
    
    // Execute each step in the workflow
    const stepResults: any[] = [];
    const stepOutputs = new Map<string, any>();
    
    for (const step of workflowDefinition.definition.steps) {
      console.log(`Executing step: ${step.name} (${step.activity_id})`);
      
      // Prepare step input by resolving dependencies
      const stepInput: any = { ...input.parameters };
      
      // Resolve step inputs from previous step outputs
      if (step.inputs) {
        for (const [key, inputDef] of Object.entries(step.inputs)) {
          if (typeof inputDef === 'object' && inputDef !== null) {
            const def = inputDef as any;
            if (def.source === 'step' && def.step) {
              const previousOutput = stepOutputs.get(def.step);
              if (previousOutput && def.path) {
                stepInput[key] = previousOutput[def.path];
              }
            } else if (def.source === 'input' && def.path) {
              stepInput[key] = input.parameters?.[def.path];
            } else if (def.value !== undefined) {
              stepInput[key] = def.value;
            }
          }
        }
      }
      
      // Execute activity from database
      const stepResult = await dynamicActivities.executeActivity({
        activityId: step.activity_id,
        input: stepInput,
      });
      
      stepResults.push({
        stepId: step.id,
        activityId: step.activity_id,
        input: stepInput,
        result: stepResult,
      });
      
      // Store output for next steps
      stepOutputs.set(step.id, stepResult);
      
      // Log step execution
      await dynamicActivities.logExecution({
        workflowId: input.workflowDefinitionId,
        stepId: step.id,
        status: 'completed',
        result: stepResult,
        timestamp: Date.now(),
      });
    }
    
    const executionTime = Date.now() - startTime;
    
    return {
      success: true,
      workflowDefinitionId: input.workflowDefinitionId,
      workflowName: workflowDefinition.name,
      steps: stepResults,
      executionTime,
      timestamp: Date.now(),
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    await dynamicActivities.logExecution({
      workflowId: input.workflowDefinitionId,
      stepId: 'workflow',
      status: 'failed',
      result: { error: error instanceof Error ? error.message : String(error) },
      timestamp: Date.now(),
    });
    
    return {
      success: false,
      workflowDefinitionId: input.workflowDefinitionId,
      error: error instanceof Error ? error.message : String(error),
      executionTime,
      timestamp: Date.now(),
    };
  }
}