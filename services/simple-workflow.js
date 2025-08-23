
const { proxyActivities } = require('@temporalio/workflow');

const { mathMultiplyActivity, mathDivideActivity } = proxyActivities({
  startToCloseTimeout: '1 minute',
});

async function multiplyDivideWorkflow(input) {
  console.log('🔄 Starting multiplyDivideWorkflow with:', input);
  
  // Step 1: Multiply
  const multiplyResult = await mathMultiplyActivity({
    number1: input.number1,
    number2: input.number2
  });
  
  // Step 2: Divide by 100
  const divideResult = await mathDivideActivity({
    dividend: multiplyResult.product,
    divisor: 100
  });
  
  return {
    workflow: 'multiplyDivideWorkflow',
    input: input,
    steps: [
      { step: 'multiply', result: multiplyResult },
      { step: 'divide', result: divideResult }
    ],
    final_result: divideResult.result
  };
}

module.exports = { multiplyDivideWorkflow };
