/**
 * Simple Add Numbers Temporal Workflow
 * Demonstrates basic Temporal workflow with multiple activities
 */

import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/add-numbers-activities';

// Configure activity options
const { addTwoNumbers, multiplyResult, validateResult, logResult } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  retry: {
    initialInterval: '1 second',
    maximumInterval: '30 seconds',
    maximumAttempts: 3,
  },
});

export interface AddNumbersInput {
  number1: number;
  number2: number;
  multiplier?: number;
}

export interface AddNumbersOutput {
  originalNumbers: [number, number];
  sum: number;
  finalResult: number;
  multiplier: number;
  isValid: boolean;
  executionTime: number;
  workflowId: string;
}

/**
 * Add Numbers Workflow - demonstrates basic arithmetic operations
 */
export async function addNumbersWorkflow(input: AddNumbersInput): Promise<AddNumbersOutput> {
  const startTime = Date.now();
  const workflowId = 'add-numbers-' + Date.now();
  
  console.log('Starting Add Numbers Workflow', { input, workflowId });
  
  // Step 1: Add the two numbers
  const sum = await addTwoNumbers(input.number1, input.number2);
  console.log('Addition completed:', { number1: input.number1, number2: input.number2, sum });
  
  // Step 2: Multiply result by multiplier (default 2)
  const multiplier = input.multiplier || 2;
  const finalResult = await multiplyResult(sum, multiplier);
  console.log('Multiplication completed:', { sum, multiplier, finalResult });
  
  // Step 3: Validate the result is positive
  const isValid = await validateResult(finalResult);
  console.log('Validation completed:', { finalResult, isValid });
  
  // Step 4: Log the final result
  await logResult({
    workflowId,
    originalNumbers: [input.number1, input.number2],
    sum,
    finalResult,
    multiplier,
    isValid
  });
  
  const executionTime = Date.now() - startTime;
  
  const output: AddNumbersOutput = {
    originalNumbers: [input.number1, input.number2],
    sum,
    finalResult,
    multiplier,
    isValid,
    executionTime,
    workflowId
  };
  
  console.log('Add Numbers Workflow completed:', output);
  
  return output;
}