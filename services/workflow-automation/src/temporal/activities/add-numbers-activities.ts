/**
 * Add Numbers Activities
 * Activity implementations for the simple add numbers workflow
 */

export interface LogResultInput {
  workflowId: string;
  originalNumbers: [number, number];
  sum: number;
  finalResult: number;
  multiplier: number;
  isValid: boolean;
}

/**
 * Activity: Add two numbers together
 */
export async function addTwoNumbers(num1: number, num2: number): Promise<number> {
  console.log(`Adding ${num1} + ${num2}`);
  
  // Simulate some processing time
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const result = num1 + num2;
  console.log(`Addition result: ${result}`);
  
  return result;
}

/**
 * Activity: Multiply a number by a multiplier
 */
export async function multiplyResult(value: number, multiplier: number): Promise<number> {
  console.log(`Multiplying ${value} × ${multiplier}`);
  
  // Simulate some processing time
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const result = value * multiplier;
  console.log(`Multiplication result: ${result}`);
  
  return result;
}

/**
 * Activity: Validate that a result is positive and within reasonable bounds
 */
export async function validateResult(value: number): Promise<boolean> {
  console.log(`Validating result: ${value}`);
  
  // Simulate some processing time
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const isValid = value > 0 && value < 1000000; // Positive and less than 1 million
  console.log(`Validation result: ${isValid}`);
  
  if (!isValid) {
    console.warn(`Invalid result detected: ${value}`);
  }
  
  return isValid;
}

/**
 * Activity: Log the final result to console and potentially to external system
 */
export async function logResult(input: LogResultInput): Promise<void> {
  console.log('Logging final result:', input);
  
  // Simulate logging to external system
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // In a real implementation, you might log to a database, file, or external service
  console.log('=== ADD NUMBERS WORKFLOW RESULT ===');
  console.log(`Workflow ID: ${input.workflowId}`);
  console.log(`Original Numbers: ${input.originalNumbers[0]} + ${input.originalNumbers[1]}`);
  console.log(`Sum: ${input.sum}`);
  console.log(`Multiplied by ${input.multiplier}: ${input.finalResult}`);
  console.log(`Result is valid: ${input.isValid}`);
  console.log('================================');
}