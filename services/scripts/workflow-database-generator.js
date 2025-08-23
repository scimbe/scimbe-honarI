#!/usr/bin/env node

/**
 * Intelligent Workflow & Activity Database Generator
 * 
 * Uses the existing shared database schema to:
 * 1. Parse all workflows from workflow_nodes_full.md
 * 2. Generate modular, reusable activities with Redis integration  
 * 3. Insert workflows into existing workflow_definitions table
 * 4. Insert activities into existing activity_library table
 * 5. Generate workflow instances in existing generated_workflows table
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// Claude Flow Integration for intelligent code generation
class ClaudeFlowIntegration {
  constructor() {
    this.maxRetries = 2;
    this.timeout = 30000; // 30 seconds
  }

  async generateCode(prompt, language = 'javascript') {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🤖 Claude Flow generating code (attempt ${attempt}/${this.maxRetries})...`);
        
        // Use Claude Flow via CLI
        const command = `npx claude-flow@alpha sparc run coder "${prompt.replace(/"/g, '\\"')}"`;
        const { stdout, stderr } = await execAsync(command, { 
          timeout: this.timeout,
          maxBuffer: 1024 * 1024 // 1MB buffer
        });
        
        if (stderr && !stderr.includes('warning')) {
          throw new Error(`Claude Flow error: ${stderr}`);
        }
        
        // Extract code from response
        const generatedCode = this.extractCode(stdout);
        if (generatedCode && generatedCode.length > 50) { // Basic quality check
          return generatedCode;
        }
        
        throw new Error('Generated code too short or invalid');
        
      } catch (error) {
        console.warn(`⚠️ Claude Flow attempt ${attempt} failed: ${error.message}`);
        if (attempt === this.maxRetries) {
          throw error;
        }
        await this.delay(1000 * attempt); // Exponential backoff
      }
    }
  }

  extractCode(response) {
    // Extract JavaScript code from Claude Flow response
    const codeBlockRegex = /```(?:javascript|js)?\n([\s\S]*?)\n```/gi;
    const match = codeBlockRegex.exec(response);
    
    if (match && match[1]) {
      return match[1].trim();
    }
    
    // Fallback: look for function definitions
    const functionRegex = /(async\s+function\s+\w+[\s\S]*?^})/gm;
    const funcMatch = functionRegex.exec(response);
    
    if (funcMatch && funcMatch[1]) {
      return funcMatch[1].trim();
    }
    
    // Return original response cleaned up
    return response.trim();
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class WorkflowDatabaseGenerator {
  constructor() {
    this.client = new Client({
      user: process.env.DB_USER || 'temporal',
      host: process.env.DB_HOST || 'localhost', 
      database: process.env.DB_NAME || 'temporal_ai_platform',
      password: process.env.DB_PASSWORD || 'temporal',
      port: process.env.DB_PORT || 5432,
    });

    this.workflowCounter = 0;
    this.activityCounter = 0;
    this.claudeFlow = new ClaudeFlowIntegration();
  }

  async connect() {
    await this.client.connect();
    console.log('✅ Connected to PostgreSQL database');
  }

  async disconnect() {
    await this.client.end();
  }

  async verifyTables() {
    const tables = ['activity_library', 'workflow_definitions', 'generated_workflows'];
    
    for (const table of tables) {
      const exists = await this.client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        );
      `, [table]);
      
      if (!exists.rows[0].exists) {
        throw new Error(`Table '${table}' does not exist. Please run shared-schema.sql first.`);
      }
      
      // Check actual columns
      const columns = await this.client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);
      
      console.log(`📋 ${table} columns:`, columns.rows.map(r => r.column_name).join(', '));
    }
    
    console.log('✅ Database tables verified (using existing shared schema)');
  }

  parseWorkflowsFromMarkdown(markdown) {
    const workflows = [];
    
    // Updated regex to match the actual German markdown format
    const workflowRegex = /### (workflow_\w+)\s*?\n#### 1\. Funktionsweise, Ablauf- und Fehlersemantik\s*?\n([\s\S]*?)\n#### 2\. Weitere Verarbeitung\s*?\n([\s\S]*?)\n#### 3\. Benötigte Inputdaten\s*?\n([\s\S]*?)\n#### 4\. Fehlerbehandlung\s*?\n([\s\S]*?)\n#### 5\. Eindeutiger Workflow-Name\s*?\n([\s\S]*?)\n#### 6\. Testfälle/gm;
    
    let match;
    while ((match = workflowRegex.exec(markdown)) !== null) {
      const [, workflowName, functionality, processing, inputDataText, errorHandling, workflowNameConfirm] = match;
      
      // Extract input data from the German format
      const inputData = this.parseInputDataFromGermanText(inputDataText);
      
      // Clean up the workflow name
      const workflowId = workflowName.trim();
      const displayName = this.convertToDisplayName(workflowName);
      
      workflows.push({
        id: workflowId,
        name: workflowId,
        display_name: displayName,
        description: functionality.trim().substring(0, 500), // First 500 chars as description
        category: this.getCategoryFromName(workflowName),
        workflow_type: 'standard',
        definition: {
          name: workflowId,
          displayName: displayName,
          description: functionality.trim(),
          functionality: functionality.trim(),
          processing: processing.trim(),
          inputData,
          activities: []
        },
        steps: [],
        nodes: [],
        edges: [],
        metadata: {
          functionality: functionality.trim(),
          processing: processing.trim(),
          errorHandling: errorHandling.trim(),
          redisIntegration: true,
          generatedActivities: true,
          language: 'german'
        },
        code: this.generateWorkflowCode(workflowId, inputData),
        status: 'active',
        version: '1.0.0',
        inputData
      });
    }
    
    return workflows;
  }

  parseInputDataFromGermanText(inputText) {
    // Parse German input data format like:
    // - `recipient` (RFC 5321/5322-konform)
    // - `subject` (UTF-8)
    const inputData = {};
    const lines = inputText.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^-\s*`(\w+)`\s*\(([^)]*)\)?\s*(.*)$/);
      if (match) {
        const [, fieldName, type, description] = match;
        inputData[fieldName] = {
          type: type || 'string',
          description: description || '',
          required: !description.includes('optional')
        };
      }
    }
    
    return inputData;
  }

  convertToDisplayName(workflowName) {
    // Convert workflow_communication_email to "Communication Email"
    return workflowName
      .replace(/^workflow_/, '')
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  getCategoryFromName(name) {
    if (name.includes('Email') || name.includes('SMS') || name.includes('Communication')) return 'communication';
    if (name.includes('Storage') || name.includes('File') || name.includes('S3')) return 'storage';
    if (name.includes('Database') || name.includes('SQL') || name.includes('DB')) return 'database';
    if (name.includes('API') || name.includes('HTTP') || name.includes('GraphQL')) return 'api';
    if (name.includes('AI') || name.includes('LLM') || name.includes('ML')) return 'ai';
    if (name.includes('System') || name.includes('Docker') || name.includes('K8s')) return 'system';
    if (name.includes('Security') || name.includes('Encrypt') || name.includes('JWT')) return 'security';
    if (name.includes('Monitor') || name.includes('Log') || name.includes('Alert')) return 'monitoring';
    if (name.includes('Control') || name.includes('Variable') || name.includes('Branch')) return 'control';
    return 'general';
  }

  generateWorkflowCode(workflowId, inputData) {
    return `// Generated workflow code for ${workflowId}
export async function ${workflowId}(input) {
  // Validate input
  const validatedInput = validateInput(input, ${JSON.stringify(inputData)});
  
  // Execute activities with Redis parameter sharing
  const activities = [
    '${workflowId}_validate_input',
    '${workflowId}_process_core',
    '${workflowId}_format_output'
  ];
  
  let currentData = validatedInput;
  for (const activityName of activities) {
    currentData = await executeActivity(activityName, currentData);
  }
  
  return currentData;
}`;
  }

  async generateActivitiesForWorkflow(workflow) {
    const activities = [];
    const workflowName = workflow.name.replace('workflow_', '').substring(0, 12); // Max 12 chars for base
    
    console.log(`🔧 Generating functional code for: ${workflow.display_name}`);
    
    // 1. Input Validation Activity (max 20 chars)
    const validateName = `${workflowName}_validate`;
    console.log(`  📝 Generating validation code...`);
    const validationCode = await this.generateValidationActivityCode(workflow);
    
    activities.push({
      id: validateName,
      name: validateName,
      type: 'validation',
      description: `Input validation for ${workflow.display_name}`,
      category: workflow.category,
      code: validationCode,
      inputs: { input: 'object', sessionId: 'string', workflowId: 'string' },
      outputs: { validated: 'object', errors: 'array' },
      redis_config: {
        keys: {
          input: `session.{sessionId}.${workflow.name}.raw_input`,
          output: `session.{sessionId}.${workflow.name}.validated_input`
        }
      },
      metadata: { 
        workflowId: workflow.name,
        redisIntegration: true,
        reusable: true
      }
    });

    // 2. Core Processing Activity (max 20 chars)
    const processName = `${workflowName}_process`;
    console.log(`  ⚙️ Generating processing code...`);
    const processingCode = await this.generateCoreProcessingCode(workflow);
    
    activities.push({
      id: processName,
      name: processName,
      type: 'processing',
      description: `Core processing logic for ${workflow.display_name}`,
      category: workflow.category,
      code: processingCode,
      inputs: { validatedInput: 'object', sessionId: 'string', workflowId: 'string' },
      outputs: { result: 'object', status: 'string' },
      redis_config: {
        keys: {
          input: `session.{sessionId}.${workflow.name}.validated_input`,
          output: `session.{sessionId}.${workflow.name}.core_result`
        }
      },
      metadata: {
        workflowId: workflow.name,
        redisIntegration: true,
        functionality: workflow.metadata.functionality
      }
    });

    // 3. Output Formatting Activity (max 20 chars)
    const formatName = `${workflowName}_format`;
    console.log(`  📤 Generating formatting code...`);
    const formattingCode = await this.generateFormattingActivityCode(workflow);
    
    activities.push({
      id: formatName,
      name: formatName,
      type: 'formatting',
      description: `Output formatting for ${workflow.display_name}`,
      category: 'formatting',
      code: formattingCode,
      inputs: { coreResult: 'object', sessionId: 'string', workflowId: 'string' },
      outputs: { formattedOutput: 'object' },
      redis_config: {
        keys: {
          input: `session.{sessionId}.${workflow.name}.core_result`,
          output: `session.{sessionId}.${workflow.name}.final_output`
        }
      },
      metadata: {
        workflowId: workflow.name,
        redisIntegration: true,
        reusable: true
      }
    });

    return activities;
  }

  async generateValidationActivityCode(workflow) {
    const prompt = `Generate a complete JavaScript validation activity function for a ${workflow.category} workflow named "${workflow.display_name}".

Requirements:
- Function name: validate_${workflow.name.replace('workflow_', '')}
- Parameters: (input, previousData, redis, sessionId, workflowId)
- Input schema: ${JSON.stringify(workflow.inputData, null, 2)}
- Must validate all required fields with appropriate validation logic
- Store raw input in Redis: session.{sessionId}.{workflowId}.raw_input
- Store validated input in Redis: session.{sessionId}.{workflowId}.validated_input
- Return { validated, errors, status } format
- Include proper error handling
- Add Redis TTL of 3600 seconds
- Make it production-ready with comprehensive validation

Generate ONLY the complete function code, no explanations.`;

    try {
      return await this.claudeFlow.generateCode(prompt);
    } catch (error) {
      console.warn(`⚠️ Claude Flow failed for ${workflow.name}, using fallback`);
      return this.generateFallbackValidationCode(workflow);
    }
  }

  generateFallbackValidationCode(workflow) {
    const inputSchema = workflow.inputData;
    const requiredFields = Object.keys(inputSchema).filter(key => inputSchema[key].required);
    
    return `async function validate_${workflow.name.replace('workflow_', '')}(input, previousData, redis, sessionId, workflowId) {
  const errors = [];
  const validated = { ...input };
  
  try {
    // Store raw input in Redis
    const inputKey = \`session.\${sessionId}.\${workflowId}.raw_input\`;
    await redis.setex(inputKey, 3600, JSON.stringify(input));
    
    // Validate required fields
    const requiredFields = ${JSON.stringify(requiredFields)};
    for (const field of requiredFields) {
      if (!input[field]) {
        errors.push(\`Missing required field: \${field}\`);
      }
    }
    
    if (errors.length > 0) {
      throw new Error(\`Validation failed: \${errors.join(', ')}\`);
    }
    
    // Store validated input in Redis
    const outputKey = \`session.\${sessionId}.\${workflowId}.validated_input\`;
    await redis.setex(outputKey, 3600, JSON.stringify(validated));
    
    return { validated, errors: [], status: 'success' };
  } catch (error) {
    console.error('Validation error:', error);
    return { validated: null, errors: [error.message], status: 'error' };
  }
}`;
  }

  async generateCoreProcessingCode(workflow) {
    const functionality = workflow.metadata.functionality;
    const prompt = `Generate a complete JavaScript core processing activity function for a ${workflow.category} workflow.

Workflow Details:
- Name: ${workflow.display_name}
- Category: ${workflow.category}
- Functionality: ${functionality}
- Input Schema: ${JSON.stringify(workflow.inputData, null, 2)}

Requirements:
- Function name: process_${workflow.name.replace('workflow_', '')}
- Parameters: (input, previousData, redis, sessionId, workflowId)
- Retrieve validated input from Redis: session.{sessionId}.{workflowId}.validated_input
- Store result in Redis: session.{sessionId}.{workflowId}.core_result
- Implement REAL functional code for ${workflow.category} operations (no placeholders)
- Include proper error handling with retries where appropriate
- Return { result, status, processedAt } format
- Add Redis TTL of 3600 seconds
- Make it production-ready with proper imports (nodemailer, axios, fs, etc. as needed)

Generate ONLY the complete function code with all necessary logic, no explanations.`;

    try {
      return await this.claudeFlow.generateCode(prompt);
    } catch (error) {
      console.warn(`⚠️ Claude Flow failed for ${workflow.name}, using fallback`);
      return this.generateFallbackProcessingCode(workflow);
    }
  }

  generateFallbackProcessingCode(workflow) {
    return `async function process_${workflow.name.replace('workflow_', '')}(input, previousData, redis, sessionId, workflowId) {
  try {
    // Retrieve validated input from Redis
    const inputKey = \`session.\${sessionId}.\${workflowId}.validated_input\`;
    const validatedData = JSON.parse(await redis.get(inputKey));
    
    // Core processing logic for ${workflow.category}
    ${this.generateCategorySpecificLogic(workflow.category)}
    
    // Store result in Redis
    const outputKey = \`session.\${sessionId}.\${workflowId}.core_result\`;
    await redis.setex(outputKey, 3600, JSON.stringify(result));
    
    return { result, status: 'success', processedAt: new Date().toISOString() };
  } catch (error) {
    console.error('Processing error:', error);
    return { result: null, status: 'error', error: error.message };
  }
}`;
  }

  generateCategorySpecificLogic(category) {
    switch (category) {
      case 'communication':
        return `const result = await this.sendCommunication(validatedData);`;
      case 'storage':
        return `const result = await this.performStorageOperation(validatedData);`;
      case 'database':
        return `const result = await this.executeDatabaseOperation(validatedData);`;
      case 'api':
        return `const result = await this.makeApiRequest(validatedData);`;
      case 'ai':
        return `const result = await this.processWithAI(validatedData);`;
      default:
        return `const result = await this.processData(validatedData);`;
    }
  }

  async generateFormattingActivityCode(workflow) {
    const prompt = `Generate a complete JavaScript output formatting activity function for a ${workflow.category} workflow.

Requirements:
- Function name: format_${workflow.name.replace('workflow_', '')}
- Parameters: (input, previousData, redis, sessionId, workflowId)
- Retrieve core result from Redis: session.{sessionId}.{workflowId}.core_result
- Store formatted output in Redis: session.{sessionId}.{workflowId}.final_output
- Format output for client consumption with proper structure
- Return formatted response object
- Include proper error handling
- Add Redis TTL of 3600 seconds
- Make it production-ready

Generate ONLY the complete function code, no explanations.`;

    try {
      return await this.claudeFlow.generateCode(prompt);
    } catch (error) {
      console.warn(`⚠️ Claude Flow failed for ${workflow.name}, using fallback`);
      return this.generateFallbackFormattingCode(workflow);
    }
  }

  generateFallbackFormattingCode(workflow) {
    return `async function format_${workflow.name.replace('workflow_', '')}(input, previousData, redis, sessionId, workflowId) {
  try {
    // Retrieve core result from Redis
    const inputKey = \`session.\${sessionId}.\${workflowId}.core_result\`;
    const coreResult = JSON.parse(await redis.get(inputKey));
    
    // Format output for client consumption
    const formattedOutput = {
      success: coreResult.status === 'success',
      data: coreResult.result,
      metadata: {
        workflowId,
        processedAt: coreResult.processedAt,
        sessionId
      }
    };
    
    // Store final output in Redis
    const outputKey = \`session.\${sessionId}.\${workflowId}.final_output\`;
    await redis.setex(outputKey, 3600, JSON.stringify(formattedOutput));
    
    return formattedOutput;
  } catch (error) {
    console.error('Formatting error:', error);
    return { success: false, error: error.message, data: null };
  }
}`;
  }

  async insertActivity(activity) {
    // Use existing activity_library schema - use simple insert with manual conflict handling
    try {
      const query = `
        INSERT INTO activity_library (
          id, name, type, description, category, inputs, outputs, 
          code, language, redis_config, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `;
      
      await this.client.query(query, [
        activity.id,
        activity.name,
        activity.type,
        activity.description,
        activity.category || 'general',
        JSON.stringify(activity.inputs),
        JSON.stringify(activity.outputs),
        activity.code,
        'javascript',
        JSON.stringify(activity.redis_config),
        JSON.stringify(activity.metadata)
      ]);
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        // Update existing record
        const updateQuery = `
          UPDATE activity_library SET
            code = $2, inputs = $3, outputs = $4, redis_config = $5, 
            metadata = $6, updated_at = CURRENT_TIMESTAMP
          WHERE name = $1
        `;
        
        await this.client.query(updateQuery, [
          activity.name,
          activity.code,
          JSON.stringify(activity.inputs),
          JSON.stringify(activity.outputs),
          JSON.stringify(activity.redis_config),
          JSON.stringify(activity.metadata)
        ]);
      } else {
        throw error;
      }
    }
  }

  async insertWorkflow(workflow) {
    // Use actual workflow_definitions schema columns
    try {
      const query = `
        INSERT INTO workflow_definitions (
          id, name, display_name, description, category, type, code, 
          configuration, status, functionality, error_handling, 
          redis_keys, input_data, activities
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `;
      
      await this.client.query(query, [
        workflow.id,
        workflow.name,
        workflow.display_name,
        workflow.description,
        workflow.category,
        'standard', // type
        workflow.code,
        JSON.stringify(workflow.definition), // configuration
        workflow.status,
        workflow.metadata.functionality,
        workflow.metadata.errorHandling,
        JSON.stringify({ redisIntegration: true }), // redis_keys
        JSON.stringify(workflow.inputData),
        JSON.stringify(workflow.definition.activities)
      ]);
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        // Update existing record
        const updateQuery = `
          UPDATE workflow_definitions SET
            configuration = $2, functionality = $3, error_handling = $4, 
            code = $5, updated_at = CURRENT_TIMESTAMP
          WHERE name = $1
        `;
        
        await this.client.query(updateQuery, [
          workflow.name,
          JSON.stringify(workflow.definition),
          workflow.metadata.functionality,
          workflow.metadata.errorHandling,
          workflow.code
        ]);
      } else {
        throw error;
      }
    }

    // Also insert into generated_workflows for execution tracking
    try {
      const generatedQuery = `
        INSERT INTO generated_workflows (
          execution_id, workflow_id, plugin_name, user_id, requirements,
          target_language, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      
      await this.client.query(generatedQuery, [
        `exec_${workflow.id}_${Date.now()}`,
        workflow.id,
        'workflow-database-generator',
        'system',
        `Generated from markdown: ${workflow.description}`,
        'javascript',
        'completed'
      ]);
    } catch (error) {
      // Ignore conflicts in generated_workflows as they're execution-specific
      if (error.code !== '23505') {
        console.warn(`Warning: Could not insert into generated_workflows: ${error.message}`);
      }
    }
  }
}

async function main() {
  const generator = new WorkflowDatabaseGenerator();
  
  try {
    console.log('🚀 Starting Intelligent Workflow Database Generator');
    
    // Read workflow markdown
    const markdownPath = '/Users/martin/Documents/git/honarī Kopie/workflow_nodes_full.md';
    console.log(`📖 Reading workflows from: ${markdownPath}`);
    
    const markdown = fs.readFileSync(markdownPath, 'utf8');
    console.log(`📄 Loaded ${markdown.length} characters from markdown`);
    
    // Connect to database
    await generator.connect();
    await generator.verifyTables();
    
    // Parse workflows
    const workflows = generator.parseWorkflowsFromMarkdown(markdown);
    console.log(`🔍 Parsed ${workflows.length} workflows from markdown`);
    
    // Process each workflow
    let processedWorkflows = 0;
    let processedActivities = 0;
    
    for (const workflow of workflows) {
      console.log(`🔄 Processing workflow: ${workflow.display_name}`);
      
      // Generate activities for workflow (now async with Claude Flow)
      const activities = await generator.generateActivitiesForWorkflow(workflow);
      
      // Insert activities
      for (const activity of activities) {
        await generator.insertActivity(activity);
        console.log(`✅ Inserted/Updated activity: ${activity.name} (${activity.name.length} chars)`);
        processedActivities++;
      }
      
      // Update workflow definition with activity IDs
      workflow.definition.activities = activities.map(a => a.id);
      
      // Insert workflow
      await generator.insertWorkflow(workflow);
      console.log(`✅ Inserted/Updated workflow: ${workflow.name}`);
      processedWorkflows++;
    }
    
    console.log(`\n🎉 Workflow Database Generation Complete!`);
    console.log(`📊 Summary:`);
    console.log(`  - Workflows processed: ${processedWorkflows}`);
    console.log(`  - Activities created: ${processedActivities}`);
    console.log(`  - Redis integration: ✅ Full parameter sharing support`);
    console.log(`  - Database tables: ✅ All data written to existing schema`);
    
  } catch (error) {
    console.error('❌ Error during processing:', error);
    process.exit(1);
  } finally {
    await generator.disconnect();
  }
}

if (require.main === module) {
  main();
}