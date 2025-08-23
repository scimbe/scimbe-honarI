
const { proxyActivities } = require('@temporalio/workflow');

// Proxy activities with timeouts
const activities = proxyActivities({
  mathMultiplyActivity: {
    startToCloseTimeout: '30s',
  },
  mathSubtractActivity: {
    startToCloseTimeout: '30s',
  },
});

// Dynamic workflow based on generated definition
async function multiply_subtract_workflow_1755778888439Workflow(input) {
  console.log('🔄 Starting workflow execution with input:', input);
  
  try {
    // Step 1: Multiply two numbers
    console.log('📊 Step 1: Multiplying numbers...');
    const multiplyResult = await activities.mathMultiplyActivity({
      number1: input.number1,
      number2: input.number2
    });
    
    console.log('✅ Multiply result:', multiplyResult);
    
    // Step 2: Subtract 1 from result
    console.log('📊 Step 2: Subtracting 1...');
    const subtractResult = await activities.mathSubtractActivity({
      minuend: multiplyResult.product,
      subtrahend: 1
    });
    
    console.log('✅ Subtract result:', subtractResult);
    
    return {
      workflow_id: 'multiply-subtract-workflow-1755778888439',
      workflow_name: 'Multiply and Subtract Workflow',
      input: input,
      steps: [
        { step: 'multiply', input: { number1: input.number1, number2: input.number2 }, output: multiplyResult },
        { step: 'subtract', input: { minuend: multiplyResult.product, subtrahend: 1 }, output: subtractResult }
      ],
      final_result: subtractResult.result,
      execution_time: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Workflow execution failed:', error);
    throw error;
  }
}

module.exports = { multiply_subtract_workflow_1755778888439Workflow };
