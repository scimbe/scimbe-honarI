/**
 * Embedded Temporal Workflows - Dynamically deployed by the Automation Service
 */

import { proxyActivities, log } from '@temporalio/workflow';
import type * as activities from './embedded-activities';

// Create activity proxies with timeout configurations
const { 
  validateRadiusActivity,
  calculateCircleAreaActivity,
  formatResultActivity 
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2.0,
    maximumInterval: '30s',
    maximumAttempts: 3,
  },
});

/**
 * Circle Area Calculation Workflow - Embedded Version
 * This workflow is automatically deployed by the Workflow Automation Service
 */
export async function CircleAreaWorkflow(input: { radius: number }): Promise<{
  success: boolean;
  input: { radius: number };
  output: { area: number };
  message: string;
  calculation_details: any;
  workflow_id: string;
  generated_by: string;
  executed_via: string;
}> {
  log.info('🚀 [EMBEDDED TEMPORAL] Starting Circle Area Calculation Workflow', { input });
  
  try {
    // Step 1: Validate radius input
    log.info('[EMBEDDED] Step 1: Validating radius input');
    const validation = await validateRadiusActivity(input.radius);
    
    if (!validation.valid) {
      log.error('[EMBEDDED] Radius validation failed', { error: validation.error });
      throw new Error(`Radius validation failed: ${validation.error}`);
    }
    
    // Step 2: Calculate circle area
    log.info('[EMBEDDED] Step 2: Calculating circle area');
    const calculationResult = await calculateCircleAreaActivity(validation.radius);
    
    // Step 3: Format result
    log.info('[EMBEDDED] Step 3: Formatting result');
    const finalResult = await formatResultActivity(calculationResult);
    
    // Add embedded worker metadata
    const result = {
      ...finalResult,
      executed_via: 'EMBEDDED Temporal Worker',
      temporal_execution: true,
      worker_type: 'embedded'
    };
    
    log.info('🎉 [EMBEDDED TEMPORAL] Circle Area Calculation completed successfully', { 
      result 
    });
    
    return result;
    
  } catch (error) {
    log.error('[EMBEDDED TEMPORAL] Circle Area Calculation failed', { 
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw error;
  }
}