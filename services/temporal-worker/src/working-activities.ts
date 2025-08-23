
/**
 * WORKING Activity Implementation with Redis
 */

import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379')
});

export async function loadWorkflowDefinition(workflowId: string): Promise<any> {
  console.log('🔍 ULTRA-DEBUG: Loading workflow definition for:', workflowId);
  console.log('🔍 ULTRA-DEBUG: WorkflowId type:', typeof workflowId, 'length:', workflowId.length);
  
  try {
    // Connect to workflow automation database to get actual generated activities
    const { Client } = require('pg');
    console.log('🔍 ULTRA-DEBUG: Creating database client...');
    
    const dbClient = new Client({
      host: process.env.POSTGRES_HOST || 'postgres',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'temporal_ai_platform', 
      user: process.env.POSTGRES_USER || 'temporal',
      password: process.env.POSTGRES_PASSWORD || 'temporal',
    });
    
    console.log('🔍 ULTRA-DEBUG: Connecting to database...');
    await dbClient.connect();
    console.log('🔍 ULTRA-DEBUG: Database connected successfully!');
    
    // Get the generated workflow requirements to understand what we're dealing with
    const workflowQuery = 'SELECT requirements, created_at FROM generated_workflows WHERE workflow_id = $1 ORDER BY created_at DESC LIMIT 1';
    console.log('🔍 ULTRA-DEBUG: Executing workflow query with ID:', JSON.stringify(workflowId));
    
    const workflowResult = await dbClient.query(workflowQuery, [workflowId]);
    console.log('🔍 ULTRA-DEBUG: Workflow query returned', workflowResult.rows.length, 'rows');
    
    if (workflowResult.rows.length === 0) {
      console.log('⚠️ ULTRA-DEBUG: No workflow found for ID, using fallback activities');
      await dbClient.end();
      return getFallbackWorkflowDefinition();
    }
    
    const workflowRequirements = workflowResult.rows[0].requirements;
    console.log('📋 Found workflow requirements:', workflowRequirements.substring(0, 100) + '...');
    
    // 🔍 ULTRA-DEBUG: Get the actual generated activities from activity_library
    console.log('🔍 ULTRA-DEBUG: Querying activity_library for workflow:', workflowId);
    
    // First, try to find activities associated with this specific workflow
    const workflowSpecificQuery = 'SELECT name, type, description, code, workflow_id, created_at FROM activity_library WHERE workflow_id = $1 ORDER BY created_at DESC LIMIT 20';
    console.log('🔍 ULTRA-DEBUG: Executing workflow-specific query:', workflowSpecificQuery);
    console.log('🔍 ULTRA-DEBUG: Query parameter - workflowId:', JSON.stringify(workflowId));
    
    const workflowSpecificResult = await dbClient.query(workflowSpecificQuery, [workflowId]);
    console.log('🔍 ULTRA-DEBUG: Workflow-specific query returned', workflowSpecificResult.rows.length, 'rows');
    
    let activitiesResult = workflowSpecificResult;
    
    // If no workflow-specific activities found, try recent activities (extended time range)
    if (workflowSpecificResult.rows.length === 0) {
      console.log('🔍 ULTRA-DEBUG: No workflow-specific activities, trying recent activities...');
      const recentActivitiesQuery = 'SELECT name, type, description, code, workflow_id, created_at FROM activity_library WHERE created_at > NOW() - INTERVAL \'24 hours\' ORDER BY created_at DESC LIMIT 20';
      console.log('🔍 ULTRA-DEBUG: Executing recent activities query:', recentActivitiesQuery);
      
      activitiesResult = await dbClient.query(recentActivitiesQuery);
      console.log('🔍 ULTRA-DEBUG: Recent activities query returned', activitiesResult.rows.length, 'rows');
      
      // Show what activities we found
      if (activitiesResult.rows.length > 0) {
        console.log('🔍 ULTRA-DEBUG: Recent activities found:');
        activitiesResult.rows.forEach((row: any, i: number) => {
          console.log(`  ${i + 1}. Name: "${row.name}", Type: "${row.type}", WorkflowID: "${row.workflow_id}", Created: ${row.created_at}`);
        });
      }
    } else {
      console.log('🔍 ULTRA-DEBUG: Workflow-specific activities found:');
      workflowSpecificResult.rows.forEach((row: any, i: number) => {
        console.log(`  ${i + 1}. Name: "${row.name}", Type: "${row.type}", WorkflowID: "${row.workflow_id}", Created: ${row.created_at}`);
      });
    }
    
    await dbClient.end();
    
    // Convert database activities to workflow definition format
    const activities = activitiesResult.rows.map((row, index) => ({
      id: `activity-${index + 1}`,
      name: row.name,
      type: row.type,
      description: row.description,
      configuration: {},
      dependencies: index === 0 ? [] : [`activity-${index}`], // Sequential dependencies
      required: true
    }));
    
    console.log('🔍 ULTRA-DEBUG: Converted to', activities.length, 'activity definitions');
    console.log('🔍 ULTRA-DEBUG: Activity names:', activities.map(a => a.name));
    
    if (activities.length === 0) {
      console.log('⚠️ ULTRA-DEBUG: No activities found in database, using fallback');
      return getFallbackWorkflowDefinition();
    }
    
    console.log('✅ Loaded', activities.length, 'activities from database:', activities.map(a => a.name).join(', '));
    
    return {
      activities,
      steps: [], // We're using activities, not separate steps
      metadata: {
        workflowId,
        requirements: workflowRequirements,
        loadedAt: new Date().toISOString(),
        finalStep: activities.length > 0 ? activities[activities.length - 1].id : undefined
      }
    };
    
  } catch (error) {
    console.error('❌ Error loading workflow definition:', error);
    return getFallbackWorkflowDefinition();
  }
}

function getFallbackWorkflowDefinition() {
  console.log('🔄 Using fallback workflow definition');
  return {
    activities: [
      {
        id: 'activity-1',
        name: 'validate_input',
        type: 'validation',
        configuration: {},
        dependencies: [],
        required: true
      },
      {
        id: 'activity-2',
        name: 'calculate_factorial',
        type: 'calculation',
        configuration: {},
        dependencies: ['validate_input'],
        required: true
      },
      {
        id: 'activity-3',
        name: 'format_result',
        type: 'formatting',
        configuration: {},
        dependencies: ['calculate_factorial'],
        required: true
      }
    ],
    steps: [],
    metadata: { name: 'Factorial Calculator' }
  };
}

export async function executeActivity(params: {
  sessionId: string;
  workflowId: string;
  activityName: string;
  input: any;
  configuration: any;
}): Promise<any> {
  console.log('⚡ Executing activity:', params.activityName);
  
  const { sessionId, workflowId, activityName, input } = params;
  
  try {
    // Connect to database to get the actual JavaScript code for this activity
    const { Client } = require('pg');
    const dbClient = new Client({
      host: process.env.POSTGRES_HOST || 'postgres',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'temporal_ai_platform', 
      user: process.env.POSTGRES_USER || 'temporal',
      password: process.env.POSTGRES_PASSWORD || 'temporal',
    });
    
    await dbClient.connect();
    
    // Get the actual JavaScript code for this activity
    const activityQuery = 'SELECT code, name, type FROM activity_library WHERE name = $1 ORDER BY created_at DESC LIMIT 1';
    const activityResult = await dbClient.query(activityQuery, [activityName]);
    
    await dbClient.end();
    
    if (activityResult.rows.length === 0) {
      console.log('⚠️ Activity not found in database:', activityName);
      throw new Error(`Activity ${activityName} not found in database`);
    }
    
    const { code, name, type } = activityResult.rows[0];
    console.log('📋 Found activity code for:', name, 'type:', type);
    console.log('🔧 Activity code preview:', code.substring(0, 150) + '...');
    
    // Prepare execution context with access to input data
    const activityContext = {
      input: input,
      sessionId: sessionId,
      workflowId: workflowId,
      console: console, // Allow logging
      redis: redis, // Access to Redis for data storage
      // Add commonly used utilities
      Math: Math,
      JSON: JSON,
      Date: Date
    };
    
    // Execute the JavaScript code safely
    const vm = require('vm');
    const context = vm.createContext(activityContext);
    
    // Wrap the code in a try-catch and extract the function
    const wrappedCode = `
      try {
        ${code}
        
        // Extract function name from code (assumes function name matches activity pattern)
        let functionName = '';
        const functionMatch = code.match(/function\\s+(\\w+)/);
        if (functionMatch) {
          functionName = functionMatch[1];
        }
        
        // Execute the function with input data
        let result;
        const functionMatch = code.match(/function\s+(\w+)/);
        if (functionMatch && typeof eval(functionMatch[1]) === 'function') {
          result = eval(functionMatch[1])(${JSON.stringify(getActivityInput(input, activityName))});
        } else {
          throw new Error('Function not found in activity code');
        }
        
        result;
      } catch (error) {
        ({ error: error.message, activityName: '${activityName}' });
      }
    `;
    
    console.log('🚀 Executing activity:', activityName);
    const result = vm.runInContext(wrappedCode, context);
    
    // Store result in Redis for next activity
    if (result && !result.error) {
      const resultKey = `${sessionId}.${workflowId}.${activityName}_result`;
      await redis.set(resultKey, JSON.stringify({
        value: result,
        activityName: activityName,
        workflowId: workflowId,
        sessionId: sessionId,
        timestamp: Date.now()
      }));
      console.log('✅ Stored result in Redis for activity:', activityName);
    }
    
    if (result && result.error) {
      console.error('❌ Activity execution failed:', result.error);
      throw new Error(`Activity ${activityName} failed: ${result.error}`);
    }
    
    console.log('✅ Activity executed successfully:', activityName, 'Result:', JSON.stringify(result).substring(0, 100));
    return result;
    
  } catch (error) {
    console.error('❌ Error executing activity:', activityName, error);
    throw error;
  }
}

// Helper function to extract function name from JavaScript code
function extractFunctionName(code: string): string {
  const functionMatch = code.match(/function\s+(\w+)/);
  return functionMatch ? functionMatch[1] : 'unknownFunction';
}

// Helper function to get appropriate input for each activity type
function getActivityInput(input: any, activityName: string): any {
  // For first activity, use the workflow input directly
  if (activityName.includes('Validate') || activityName.includes('validate')) {
    return input.number || input.user_input || input;
  }
  
  // For subsequent activities, look for previous results
  if (activityName.includes('Calculate') || activityName.includes('calculate')) {
    return input.validated_integer || input.validated_input || input.number || input;
  }
  
  if (activityName.includes('Format') || activityName.includes('format')) {
    return input.factorial_result || input.calculation_result || input.result || input;
  }
  
  // Default: return the full input
  return input;
}

export async function storeActivityParameters(params: {
  sessionId: string;
  workflowId: string;
  activityName: string;
  parameters: Record<string, any>;
}): Promise<boolean> {
  console.log('💾 Storing activity parameters:', params.activityName);
  
  for (const [key, value] of Object.entries(params.parameters)) {
    const redisKey = `${params.sessionId}.${params.workflowId}.${key}`;
    await redis.set(redisKey, JSON.stringify({
      value,
      type: typeof value,
      activityName: params.activityName,
      workflowId: params.workflowId,
      sessionId: params.sessionId,
      timestamp: Date.now()
    }));
  }
  
  return true;
}
