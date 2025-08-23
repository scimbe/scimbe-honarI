/**
 * Circle Area Calculation Workflow - JavaScript Implementation
 * Works with the simple-worker.js activities
 */

const { proxyActivities, log } = require('@temporalio/workflow');

// Create activity proxies
const { 
  validateRadiusActivity,
  calculateCircleAreaActivity,
  formatResultActivity 
} = proxyActivities({
  startToCloseTimeout: '2 minutes',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2.0,
    maximumInterval: '30s',
    maximumAttempts: 3,
  },
});

/**
 * Circle Area Calculation Workflow
 */
async function CircleAreaWorkflow(input) {
  const radius = input.radius || 5.0;
  
  log.info(`🚀 [WORKFLOW] Starting Circle Area Calculation for radius: ${radius}`);
  
  try {
    // Step 1: Validate radius input
    log.info('[WORKFLOW] Step 1: Validating radius input');
    const validation = await validateRadiusActivity(radius);
    
    if (!validation.valid) {
      const errorMsg = `Radius validation failed: ${validation.error}`;
      log.error(`❌ [WORKFLOW] ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    // Step 2: Calculate circle area
    log.info('[WORKFLOW] Step 2: Calculating circle area');
    const calculationResult = await calculateCircleAreaActivity(validation.radius);
    
    // Step 3: Format result
    log.info('[WORKFLOW] Step 3: Formatting result');
    const finalResult = await formatResultActivity(calculationResult);
    
    log.info(`🎉 [WORKFLOW] Circle Area Calculation completed successfully`);
    log.info(`📈 [WORKFLOW] FINAL RESULT: ${JSON.stringify(finalResult, null, 2)}`);
    
    return finalResult;
    
  } catch (error) {
    log.error(`❌ [WORKFLOW] Circle Area Calculation failed: ${error.message}`);
    throw error;
  }
}

module.exports = { CircleAreaWorkflow };