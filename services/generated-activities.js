
// Math Multiply Activity Implementation
async function mathMultiplyActivity(input) {
  console.log('🔢 Executing mathMultiplyActivity with:', input);
  
  if (typeof input.number1 !== 'number' || typeof input.number2 !== 'number') {
    throw new Error('Both inputs must be numbers');
  }
  
  const product = input.number1 * input.number2;
  const result = {
    product: product,
    operation: 'multiplication',
    inputs: input,
    timestamp: new Date().toISOString()
  };
  
  console.log('✅ Multiply activity result:', result);
  return result;
}

// Math Subtract Activity Implementation  
async function mathSubtractActivity(input) {
  console.log('🔢 Executing mathSubtractActivity with:', input);
  
  if (typeof input.minuend !== 'number' || typeof input.subtrahend !== 'number') {
    throw new Error('Both inputs must be numbers');
  }
  
  const result_value = input.minuend - input.subtrahend;
  const result = {
    result: result_value,
    operation: 'subtraction',
    inputs: input,
    timestamp: new Date().toISOString()
  };
  
  console.log('✅ Subtract activity result:', result);
  return result;
}

module.exports = {
  mathMultiplyActivity,
  mathSubtractActivity,
};
