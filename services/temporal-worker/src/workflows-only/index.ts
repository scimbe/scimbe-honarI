/**
 * Workflow System - Clean Dynamic Workflow Export
 */

// Export the main dynamic workflow function
export { dynamicWorkflow } from './dynamic-workflow-wrapper';

// Export additional workflow variants for compatibility
export { dynamicWorkflow as redisWorkflow } from './dynamic-workflow-wrapper';
export { dynamicWorkflow as DynamicWorkflowWrapper } from './dynamic-workflow-wrapper';