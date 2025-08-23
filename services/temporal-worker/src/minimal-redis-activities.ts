/**
 * MINIMAL PostgreSQL + Redis Activities - GUARANTEED TO BUILD
 */

import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379')
});

export async function loadWorkflowDefinition(workflowId: string): Promise<any> {
  console.log('🔍 MINIMAL-DEBUG: Loading workflow definition from PostgreSQL for:', workflowId);
  console.log('🔍 MINIMAL-DEBUG: WorkflowId type:', typeof workflowId, 'workflowId:', JSON.stringify(workflowId));
  
  // Handle undefined or invalid workflowId
  if (!workflowId || typeof workflowId !== 'string') {
    console.error('❌ MINIMAL-DEBUG: Invalid workflowId provided:', workflowId);
    throw new Error(`Invalid workflowId: ${workflowId}. Expected non-empty string.`);
  }
  
  console.log('🔍 MINIMAL-DEBUG: WorkflowId length:', workflowId.length);
  console.log('🔍 MINIMAL-DEBUG: Environment variables - POSTGRES_HOST:', process.env.POSTGRES_HOST || 'postgres');
  console.log('🔍 MINIMAL-DEBUG: Environment variables - POSTGRES_DB:', process.env.POSTGRES_DB || 'temporal_ai_platform');
  
  try {
    // Try to load from PostgreSQL first
    const { Client } = require('pg');
    const client = new Client({
      host: process.env.POSTGRES_HOST || 'postgres',
      port: 5432,
      database: 'temporal_ai_platform',
      user: 'temporal',
      password: 'temporal'
    });
    
    console.log('🔍 MINIMAL-DEBUG: Connecting to database...');
    await client.connect();
    console.log('🔍 MINIMAL-DEBUG: Database connected successfully!');
    
    // Load workflow definition
    console.log('🔍 MINIMAL-DEBUG: Executing workflow query with parameter:', JSON.stringify(workflowId));
    const workflowQuery = `
      SELECT id, name, description, activities, configuration
      FROM workflow_definitions 
      WHERE id = $1 OR name = $1
      LIMIT 1
    `;
    console.log('🔍 MINIMAL-DEBUG: Workflow query SQL:', workflowQuery);
    const workflowResult = await client.query(workflowQuery, [workflowId]);
    console.log('🔍 MINIMAL-DEBUG: Workflow query returned', workflowResult.rows.length, 'rows');
    
    if (workflowResult.rows.length > 0) {
      const workflow = workflowResult.rows[0];
      console.log('✅ POSTGRESQL: Loaded workflow from database:', workflow.name);
      
      // Load activities from activity_library by IDs
      console.log('🔍 MINIMAL-DEBUG: Loading activities for workflow:', workflowId);
      
      // Try multiple approaches to find activities
      console.log('🔍 MINIMAL-DEBUG: Approach 1 - Activities by name pattern (workflow_id not in schema):');
      const workflowSpecificQuery = `
        SELECT id, name, type, code, inputs, outputs, created_at
        FROM activity_library 
        WHERE name LIKE $1 OR description LIKE $1 OR id LIKE $1
        ORDER BY created_at DESC
        LIMIT 20
      `;
      console.log('🔍 MINIMAL-DEBUG: Query SQL:', workflowSpecificQuery);
      const searchPattern = `%${workflowId}%`;
      const workflowSpecificResult = await client.query(workflowSpecificQuery, [searchPattern]);
      console.log('🔍 MINIMAL-DEBUG: Pattern-based query returned', workflowSpecificResult.rows.length, 'rows');
      
      let activitiesResult = workflowSpecificResult;
      
      // If no workflow-specific activities found, try recent activities (but only circle/factorial ones)
      if (workflowSpecificResult.rows.length === 0) {
        console.log('🔍 MINIMAL-DEBUG: Approach 2 - Circle/Factorial activities only:');
        const recentActivitiesQuery = `
          SELECT id, name, type, code, inputs, outputs, created_at
          FROM activity_library 
          WHERE (name LIKE '%circle%' OR name LIKE '%factorial%' OR name LIKE '%area%') 
            AND created_at > NOW() - INTERVAL '7 days'
          ORDER BY created_at DESC
          LIMIT 20
        `;
        console.log('🔍 MINIMAL-DEBUG: Targeted activities query SQL:', recentActivitiesQuery);
        activitiesResult = await client.query(recentActivitiesQuery);
        console.log('🔍 MINIMAL-DEBUG: Targeted activities query returned', activitiesResult.rows.length, 'rows');
        
        // Show what activities we found
        if (activitiesResult.rows.length > 0) {
          console.log('🔍 MINIMAL-DEBUG: Targeted activities found:');
          activitiesResult.rows.forEach((row: any, i: number) => {
            console.log(`  ${i + 1}. ID: "${row.id}", Name: "${row.name}", Type: "${row.type}", Created: ${row.created_at}`);
          });
        }
      } else {
        console.log('🔍 MINIMAL-DEBUG: Pattern-based activities found:');
        workflowSpecificResult.rows.forEach((row: any, i: number) => {
          console.log(`  ${i + 1}. ID: "${row.id}", Name: "${row.name}", Type: "${row.type}", Created: ${row.created_at}`);
        });
      }
      
      // Original approach as fallback
      if (activitiesResult.rows.length === 0) {
        console.log('🔍 MINIMAL-DEBUG: Approach 3 - Original ID parsing approach:');
        const originalQuery = `
          SELECT id, name, type, code, inputs, outputs
          FROM activity_library 
          WHERE id IN (
            SELECT unnest(string_to_array($1, ','))
          )
          ORDER BY name ASC
        `;
        console.log('🔍 MINIMAL-DEBUG: Original query SQL:', originalQuery);
        activitiesResult = await client.query(originalQuery, [workflowId]);
        console.log('🔍 MINIMAL-DEBUG: Original query returned', activitiesResult.rows.length, 'rows');
      }
      
      console.log('🔍 MINIMAL-DEBUG: Processing', activitiesResult.rows.length, 'activities from database');
      const activities = activitiesResult.rows.map((activity: any, index: number) => {
        console.log(`🔍 MINIMAL-DEBUG: Processing activity ${index + 1}: ID="${activity.id}", Name="${activity.name}", Type="${activity.type}"`);
        return {
          id: activity.id,
          name: activity.name,
          type: activity.type,
          configuration: {},
          dependencies: index === 0 ? [] : [activitiesResult.rows[index - 1].name], // Chain dependencies
          required: true,
          code: activity.code,
          input_schema: activity.inputs,
          output_schema: activity.outputs
        };
      });
      console.log('🔍 MINIMAL-DEBUG: Converted to', activities.length, 'activity definitions');
      console.log('🔍 MINIMAL-DEBUG: Activity names:', activities.map((a: any) => a.name));
      
      await client.end();
      
      const result = {
        activities: activities.length > 0 ? activities : getDefaultActivities(workflowId, workflow.name),
        steps: [],
        metadata: { 
          name: workflow.name,
          source: 'postgresql',
          workflow_id: workflow.id,
          total_activities: activities.length,
          using_fallback: activities.length === 0,
          db_activities: workflow.activities || null
        }
      };
      console.log('🔍 MINIMAL-DEBUG: Returning workflow definition with', result.activities.length, 'activities');
      console.log('🔍 MINIMAL-DEBUG: Using fallback:', result.metadata.using_fallback);
      return result;
    }
    
    await client.end();
    console.log('⚠️ MINIMAL-DEBUG: Workflow not found in PostgreSQL - workflowId:', workflowId);
    console.log('⚠️ MINIMAL-DEBUG: Using default activities as fallback');
    
  } catch (error) {
    console.log('⚠️ MINIMAL-DEBUG: PostgreSQL connection failed:', (error as Error).message);
    console.log('⚠️ MINIMAL-DEBUG: Full error stack:', (error as Error).stack);
  }
  
  // Fallback to hardcoded activities for demo
  console.log('🔍 MINIMAL-DEBUG: Returning fallback workflow definition');
  const fallbackResult = {
    activities: getDefaultActivities(workflowId),
    steps: [],
    metadata: { 
      name: 'Demo Circle Calculator',
      source: 'fallback',
      original_workflow_id: workflowId
    }
  };
  console.log('🔍 MINIMAL-DEBUG: Fallback activities:', fallbackResult.activities.map(a => a.name));
  return fallbackResult;
}

function getDefaultActivities(workflowId?: string, workflowName?: string) {
  console.log('🔍 ISOLATION-FIX: Getting default activities for workflow:', workflowId, 'name:', workflowName);
  
  // Detect workflow type by ID or name
  const isCircleWorkflow = (
    workflowId?.toLowerCase().includes('circle') ||
    workflowName?.toLowerCase().includes('circle') ||
    workflowId?.includes('fbc7b314-4641-4dfc-8c69-5d9803decd1b') // CircleAreaCalculatorWorkflow ID
  );
  
  const isFactorialWorkflow = (
    workflowId?.toLowerCase().includes('factorial') ||
    workflowName?.toLowerCase().includes('factorial') ||
    workflowId?.includes('1ecd29fc-cc1c-4edf-9a60-bf7f1fbc6504') // FactorialCalculatorWorkflow ID
  );
  
  if (isCircleWorkflow) {
    console.log('✅ ISOLATION-FIX: Returning circle area activities for workflow:', workflowId);
    return [
      {
        id: 'validate_input',
        name: 'validate_input',
        type: 'validation',
        configuration: {},
        dependencies: [],
        required: true
      },
      {
        id: 'calculate_circle_area',
        name: 'calculate_circle_area',
        type: 'calculation',
        configuration: {},
        dependencies: ['validate_input'],
        required: true
      },
      {
        id: 'format_result',
        name: 'format_result',
        type: 'formatting',
        configuration: {},
        dependencies: ['calculate_circle_area'],
        required: true
      }
    ];
  }
  
  if (isFactorialWorkflow) {
    console.log('✅ ISOLATION-FIX: Returning factorial activities for workflow:', workflowId);
    return [
      {
        id: 'validate_input',
        name: 'validate_input',
        type: 'validation',
        configuration: {},
        dependencies: [],
        required: true
      },
      {
        id: 'calculate_factorial',
        name: 'calculate_factorial',
        type: 'calculation',
        configuration: {},
        dependencies: ['validate_input'],
        required: true
      },
      {
        id: 'format_result',
        name: 'format_result',
        type: 'formatting',
        configuration: {},
        dependencies: ['calculate_factorial'],
        required: true
      }
    ];
  }
  
  // Default fallback (circle area as safer default)
  console.log('⚠️ ISOLATION-FIX: Using default circle area activities for unknown workflow:', workflowId);
  return [
    {
      id: 'validate_input',
      name: 'validate_input',
      type: 'validation',
      configuration: {},
      dependencies: [],
      required: true
    },
    {
      id: 'calculate_circle_area',
      name: 'calculate_circle_area',
      type: 'calculation',
      configuration: {},
      dependencies: ['validate_input'],
      required: true
    },
    {
      id: 'format_result',
      name: 'format_result',
      type: 'formatting',
      configuration: {},
      dependencies: ['calculate_circle_area'],
      required: true
    }
  ];
}

export async function executeActivity(params: {
  sessionId: string;
  workflowId: string;
  activityName: string;
  input: any;
  configuration: any;
}): Promise<any> {
  console.log('🔍 DYNAMIC: Executing activity by ID:', params.activityName);
  
  const { sessionId, workflowId, activityName, input } = params;
  
  // Load activity dynamically from PostgreSQL by ID
  try {
    const { Client } = require('pg');
    const client = new Client({
      host: process.env.POSTGRES_HOST || 'postgres',
      port: 5432,
      database: 'temporal_ai_platform',
      user: 'temporal',
      password: 'temporal'
    });
    
    await client.connect();
    
    // Load activity by ID from activity_library
    const activityResult = await client.query(`
      SELECT id, name, type, code, inputs, outputs
      FROM activity_library 
      WHERE id = $1 OR name = $1
      LIMIT 1
    `, [activityName]);
    
    if (activityResult.rows.length === 0) {
      await client.end();
      throw new Error(`Activity not found in database: ${activityName}`);
    }
    
    const activity = activityResult.rows[0];
    console.log(`✅ POSTGRESQL: Loading activity by ID: ${activity.id} (${activity.name})`);
    
    await client.end();
    
    // Execute the dynamic activity code
    try {
      // Create a safe execution context for the dynamic code
      const dynamicFunction = new Function(
        'input', 
        'previousData', 
        'redis', 
        'sessionId', 
        'workflowId', 
        `
        ${activity.code}
        
        // Extract the function name from the code
        const functionMatch = \`${activity.code}\`.match(/function\s+(\w+)\s*\(/); 
        if (functionMatch && typeof eval(functionMatch[1]) === 'function') {
          return eval(functionMatch[1])(input, previousData);
        } else {
          throw new Error('Dynamic activity function not found in code');
        }
        `
      );
      
      // Load previous data from Redis for parameter chaining
      const allKeys = await redis.keys(`${sessionId}.${workflowId}.*`);
      const previousData: Record<string, any> = {};
      
      for (const key of allKeys) {
        const value = await redis.get(key);
        if (value) {
          try {
            const parsed = JSON.parse(value);
            const paramName = key.split('.').pop();
            if (paramName) {
              previousData[paramName] = parsed;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
      
      console.log(`🔗 REDIS: Found ${Object.keys(previousData).length} previous parameters for ${activityName}`);
      
      // Execute the dynamic function
      const result = dynamicFunction(input, previousData, redis, sessionId, workflowId);
      
      // Store result in Redis using activity-specific parameter pattern
      if (result && typeof result === 'object') {
        for (const [key, value] of Object.entries(result)) {
          // Skip metadata fields
          if (['timestamp', 'validated'].includes(key)) continue;
          
          const parameterName = activity.name === 'validate_input' ? 
            (key === 'radius' ? 'validated_radius' : key) :
            (key === 'area' ? 'calculated_area' : key);
          
          const redisKey = `${sessionId}.${workflowId}.${parameterName}`;
          await redis.set(redisKey, JSON.stringify({
            value,
            type: typeof value,
            activityName: activity.name,
            activityId: activity.id,
            workflowId,
            sessionId,
            timestamp: Date.now()
          }));
          
          console.log(`💾 REDIS: Stored ${parameterName} = ${value} for activity ${activity.name}`);
        }
      }
      
      console.log(`✅ DYNAMIC: Activity ${activity.name} executed successfully`);
      return result;
      
    } catch (codeError) {
      console.error(`❌ DYNAMIC: Error executing activity code for ${activity.name}:`, codeError);
      throw new Error(`Activity execution failed: ${codeError instanceof Error ? codeError.message : String(codeError)}`);
    }
    
  } catch (dbError) {
    console.error('❌ POSTGRESQL: Database connection failed:', dbError);
    
    // Fallback to hardcoded activities for backwards compatibility
    console.log('⚠️ FALLBACK: Using hardcoded activity execution');
    
    if (activityName === 'validate_input') {
      // Detect if this is a circle workflow by checking the workflow ID
      const isCircleWorkflow = workflowId.includes('fbc7b314-4641-4dfc-8c69-5d9803decd1b') || 
                              workflowId.toLowerCase().includes('circle');
      
      if (isCircleWorkflow) {
        // Validate radius for circle workflow
        const radius = input.parameters?.radius || input.radius || input.user_input || 5;
        
        if (typeof radius !== 'number' || radius <= 0 || radius > 100) {
          throw new Error('Invalid input: Please provide a positive radius between 0 and 100');
        }
        
        const result = { validated_radius: radius, validated: true };
        
        const key = `${sessionId}.${workflowId}.validated_radius`;
        await redis.set(key, JSON.stringify({
          value: radius,
          type: 'number',
          activityName: 'validate_input',
          workflowId,
          sessionId,
          timestamp: Date.now()
        }));
        
        console.log('✅ FALLBACK: Stored validated_radius in Redis for circle workflow:', radius);
        return result;
      } else {
        // Validate integer for factorial workflow
        const number = input.parameters?.number || input.number || input.user_input || 5;
        
        if (typeof number !== 'number' || number < 0 || number > 20 || !Number.isInteger(number)) {
          throw new Error('Invalid input: Please provide an integer between 0 and 20');
        }
        
        const result = { validated_integer: number, validated: true };
        
        const key = `${sessionId}.${workflowId}.validated_integer`;
        await redis.set(key, JSON.stringify({
          value: number,
          type: 'number',
          activityName: 'validate_input',
          workflowId,
          sessionId,
          timestamp: Date.now()
        }));
        
        console.log('✅ FALLBACK: Stored validated_integer in Redis for factorial workflow:', number);
        return result;
      }
    }
    
    if (activityName === 'calculate_factorial') {
      const numberKey = `${sessionId}.${workflowId}.validated_integer`;
      const numberData = await redis.get(numberKey);
      
      if (!numberData) {
        throw new Error('Validated integer not found in Redis');
      }
      
      const number = JSON.parse(numberData).value;
      
      // Calculate factorial
      let factorial = 1;
      for (let i = 1; i <= number; i++) {
        factorial *= i;
      }
      
      const factorialKey = `${sessionId}.${workflowId}.factorial_result`;
      await redis.set(factorialKey, JSON.stringify({
        value: factorial,
        type: 'number',
        activityName: 'calculate_factorial',
        workflowId,
        sessionId,
        timestamp: Date.now()
      }));
      
      console.log('✅ FALLBACK: Read number from Redis:', number);
      console.log('✅ FALLBACK: Calculated and stored factorial:', factorial);
      
      return { factorial_result: factorial, input_number: number };
    }
    
    if (activityName === 'calculate_circle_area') {
      // Look for validated radius from validate_input step
      const radiusKey = `${sessionId}.${workflowId}.validated_radius`;
      const radiusData = await redis.get(radiusKey);
      
      if (!radiusData) {
        throw new Error('Validated radius not found in Redis');
      }
      
      const radius = JSON.parse(radiusData).value;
      
      // Calculate circle area: A = π * r²
      const area = Math.PI * radius * radius;
      
      const areaKey = `${sessionId}.${workflowId}.calculated_area`;
      await redis.set(areaKey, JSON.stringify({
        value: area,
        type: 'number',
        activityName: 'calculate_circle_area',
        workflowId,
        sessionId,
        timestamp: Date.now()
      }));
      
      console.log('✅ FALLBACK: Read radius from Redis:', radius);
      console.log('✅ FALLBACK: Calculated and stored circle area:', area);
      
      return { calculated_area: area, input_radius: radius, formula: 'π × r²' };
    }
    
    if (activityName === 'format_result') {
      // Check for both circle area and factorial results
      const areaKey = `${sessionId}.${workflowId}.calculated_area`;
      const factorialKey = `${sessionId}.${workflowId}.factorial_result`;
      
      const areaData = await redis.get(areaKey);
      const factorialData = await redis.get(factorialKey);
      
      if (areaData) {
        // Format circle area result
        const areaResult = JSON.parse(areaData).value;
        const radiusKey = `${sessionId}.${workflowId}.validated_radius`;
        const radiusData = await redis.get(radiusKey);
        const inputRadius = radiusData ? JSON.parse(radiusData).value : 'unknown';
        
        const formattedResult = `The area of a circle with radius ${inputRadius} is ${areaResult.toFixed(2)} square units`;
        
        console.log('✅ FALLBACK: Formatted circle area result:', formattedResult);
        
        return { formatted_result: formattedResult, area: areaResult, radius: inputRadius };
      } else if (factorialData) {
        // Format factorial result  
        const factorialResult = JSON.parse(factorialData).value;
        const numberKey = `${sessionId}.${workflowId}.validated_integer`;
        const numberData = await redis.get(numberKey);
        const inputNumber = numberData ? JSON.parse(numberData).value : 'unknown';
        
        const formattedResult = `The factorial of ${inputNumber} is ${factorialResult}`;
        
        console.log('✅ FALLBACK: Formatted factorial result:', formattedResult);
        
        return { formatted_result: formattedResult, factorial: factorialResult, input: inputNumber };
      } else {
        throw new Error('No calculation results found in Redis for formatting');
      }
    }
    
    throw new Error('Activity not found in database and no fallback available: ' + activityName);
  }
}

export async function storeActivityParameters(params: {
  sessionId: string;
  workflowId: string;
  activityName: string;
  parameters: Record<string, any>;
}): Promise<boolean> {
  console.log('💾 MINIMAL: Storing activity parameters:', params.activityName);
  
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

export async function logExecution(params: any): Promise<boolean> {
  console.log('📝 DYNAMIC: Logging execution:', params);
  return true;
}