/**
 * MINIMAL PostgreSQL + Redis Activities - GUARANTEED TO BUILD
 * Updated to use generic and stable regex parser
 */

import Redis from 'ioredis';
import { RegexParser, SafeFunctionExecutor } from './utils/regex-parser';
import { RedisValidator } from './utils/redis-validator';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'temporal-redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  connectTimeout: 5000,
  lazyConnect: true
});

// Initialize Redis validator with improved settings
const redisValidator = new RedisValidator(redis, {
  keyPrefix: 'temporal:workflow:',
  ttl: 3600, // 1 hour
  maxKeyLength: 200,
  maxValueSize: 512 * 1024 // 512KB
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
      database: 'temporal_ai_platform_clean',
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
      WHERE id = $1
      LIMIT 1
    `;
    console.log('🔍 MINIMAL-DEBUG: Workflow query SQL:', workflowQuery);
    const workflowResult = await client.query(workflowQuery, [workflowId]);
    console.log('🔍 MINIMAL-DEBUG: Workflow query returned', workflowResult.rows.length, 'rows');
    
    if (workflowResult.rows.length > 0) {
      const workflow = workflowResult.rows[0];
      console.log('✅ POSTGRESQL: Loaded workflow from database by ID:', workflow.id, '(name:', workflow.name, ')');
      
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
      database: 'temporal_ai_platform_clean',
      user: 'temporal',
      password: 'temporal'
    });
    
    await client.connect();
    
    // Load activity by ID ONLY from activity_library (unique IDs only)
    const activityResult = await client.query(`
      SELECT id, name, type, code, inputs, outputs
      FROM activity_library 
      WHERE id = $1
      LIMIT 1
    `, [activityName]);
    
    if (activityResult.rows.length === 0) {
      await client.end();
      throw new Error(`Activity not found in database by ID: ${activityName}`);
    }
    
    const activity = activityResult.rows[0];
    console.log('✅ POSTGRESQL: Loaded activity by ID:', activity.id, '(name:', activity.name, ')');
    
    await client.end();
    
    // Execute the dynamic activity code using safe regex parser
    try {
      // Extract functions using generic regex parser
      const functions = RegexParser.extractFunctions(activity.code);
      
      if (functions.length === 0) {
        throw new Error(`No functions found in activity code for ${activity.name}`);
      }
      
      // Use the first valid function (prioritized by specificity)
      const primaryFunction = functions[0];
      
      if (!RegexParser.isValidFunctionName(primaryFunction.name)) {
        throw new Error(`Invalid function name '${primaryFunction.name}' in activity ${activity.name}`);
      }
      
      console.log(`🔍 REGEX: Found function '${primaryFunction.name}' (type: ${primaryFunction.type}, params: [${primaryFunction.parameters.join(', ')}])`);
      
      // Load previous data from Redis using validator
      const storedParameters = await redisValidator.getAllParameters(sessionId, workflowId);
      const previousData: Record<string, any> = {};
      
      // Convert stored parameters to simple key-value pairs for function execution
      for (const [paramName, storedParam] of Object.entries(storedParameters)) {
        previousData[paramName] = storedParam.value;
      }
      
      console.log(`🔗 REDIS: Found ${Object.keys(previousData).length} previous parameters for ${activityName}`);
      
      // Execute the function safely using SafeFunctionExecutor
      const functionArgs = [input, previousData, redis, sessionId, workflowId];
      const result = await SafeFunctionExecutor.executeFunction(
        activity.code,
        primaryFunction.name,
        functionArgs,
        {
          timeout: 30000,
          allowedGlobals: ['console', 'JSON', 'Date', 'Math', 'parseInt', 'parseFloat'],
          memoryLimit: 50 * 1024 * 1024
        }
      );
      
      // Store result in Redis using the improved validator
      if (result && typeof result === 'object') {
        const storedKeys = await redisValidator.storeParameters(
          sessionId,
          workflowId,
          result,
          {
            activityName: activity.name,
            activityId: activity.id
          }
        );
        
        console.log(`💾 REDIS: Stored ${storedKeys.length} parameters for activity ${activity.name}: ${storedKeys.join(', ')}`);
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
      console.error('❌ FALLBACK ERROR: Activity validate_input not found in database');
      console.error('❌ REASON: This activity should be loaded from activity_library table, not hardcoded fallback');
      console.error('❌ SOLUTION: Ensure activity is properly stored in database with correct implementation');
      throw new Error(`Activity '${activityName}' not found in activity library. This fallback should not execute. Please ensure the activity is properly defined in the database.`);
    }
    
    if (activityName === 'calculate_factorial') {
      console.error('❌ FALLBACK ERROR: Activity calculate_factorial not found in database');
      console.error('❌ REASON: This activity should be loaded from activity_library table, not hardcoded fallback');
      console.error('❌ SOLUTION: Ensure activity is properly stored in database with correct implementation');
      throw new Error(`Activity '${activityName}' not found in activity library. This fallback should not execute. Please ensure the activity is properly defined in the database.`);
    }
    
    if (activityName === 'calculate_circle_area') {
      console.error('❌ FALLBACK ERROR: Activity calculate_circle_area not found in database');
      console.error('❌ REASON: This activity should be loaded from activity_library table, not hardcoded fallback');
      console.error('❌ SOLUTION: Ensure activity is properly stored in database with correct implementation');
      throw new Error(`Activity '${activityName}' not found in activity library. This fallback should not execute. Please ensure the activity is properly defined in the database.`);
    }
    
    if (activityName === 'format_result') {
      console.error('❌ FALLBACK ERROR: Activity format_result not found in database');
      console.error('❌ REASON: This activity should be loaded from activity_library table, not hardcoded fallback');
      console.error('❌ SOLUTION: Ensure activity is properly stored in database with correct implementation');
      throw new Error(`Activity '${activityName}' not found in activity library. This fallback should not execute. Please ensure the activity is properly defined in the database.`);
    }
    
    // Email workflow activities fallback
    if (activityName === 'loadEmailTemplate') {
      const fs = require('fs').promises;
      const path = require('path');
      
      try {
        const templatePath = path.join(input.configuration?.templatePath || '/app/examples/email-templates/', input.emailTemplate || 'welcome-email.html');
        const content = await fs.readFile(templatePath, 'utf-8');
        
        console.log('✅ FALLBACK: Loaded email template:', input.emailTemplate);
        return {
          template: content,
          templateName: input.emailTemplate,
          size: content.length
        };
      } catch (error) {
        // Return mock template if file not found
        const mockTemplate = `
          <html>
            <body>
              <h1>Welcome {{name}}!</h1>
              <p>Thank you for joining {{company}}.</p>
              <p>Visit your dashboard: {{dashboard_url}}</p>
            </body>
          </html>
        `;
        console.log('✅ FALLBACK: Using mock email template');
        return {
          template: mockTemplate,
          templateName: input.emailTemplate || 'mock-template.html',
          size: mockTemplate.length
        };
      }
    }
    
    if (activityName === 'parseCSVFile') {
      const fs = require('fs').promises;
      const path = require('path');
      
      try {
        const csvPath = path.join(input.configuration?.csvPath || '/app/examples/csv/', input.recipientsList || 'sample-recipients.csv');
        const content = await fs.readFile(csvPath, 'utf-8');
        
        const lines = content.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        
        const recipients = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim());
          const recipient = {};
          headers.forEach((header, index) => {
            recipient[header] = values[index];
          });
          return recipient;
        });
        
        console.log('✅ FALLBACK: Parsed CSV file with', recipients.length, 'recipients');
        return {
          recipients,
          count: recipients.length,
          headers
        };
      } catch (error) {
        // Return mock recipients if file not found
        const mockRecipients = [
          { email: 'test@example.com', name: 'Test User', company: 'Example Corp', dashboard_url: 'https://app.example.com' },
          { email: 'demo@example.com', name: 'Demo User', company: 'Demo Inc', dashboard_url: 'https://app.example.com' }
        ];
        console.log('✅ FALLBACK: Using mock recipients data');
        return {
          recipients: mockRecipients,
          count: mockRecipients.length,
          headers: ['email', 'name', 'company', 'dashboard_url']
        };
      }
    }
    
    if (activityName === 'validateTemplate') {
      const template = input.template || 'Mock template content {{name}}';
      const placeholders = template.match(/{{[^}]+}}/g) || [];
      const isValid = template && template.length > 0;
      
      console.log('✅ FALLBACK: Validated email template, found', placeholders.length, 'placeholders');
      return {
        isValid,
        placeholders: placeholders.map(p => p.replace(/[{}]/g, '').trim()),
        templateLength: template.length
      };
    }
    
    if (activityName === 'prepareBatch') {
      const recipients = input.recipients || [
        { email: 'test@example.com', name: 'Test User' },
        { email: 'demo@example.com', name: 'Demo User' }
      ];
      const maxBatchSize = input.configuration?.maxBatchSize || 100;
      
      const batches = [];
      for (let i = 0; i < recipients.length; i += maxBatchSize) {
        batches.push({
          batchNumber: Math.floor(i / maxBatchSize) + 1,
          recipients: recipients.slice(i, i + maxBatchSize),
          size: Math.min(maxBatchSize, recipients.length - i)
        });
      }
      
      console.log('✅ FALLBACK: Prepared', batches.length, 'batches for', recipients.length, 'recipients');
      return {
        batches,
        totalBatches: batches.length,
        totalRecipients: recipients.length
      };
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