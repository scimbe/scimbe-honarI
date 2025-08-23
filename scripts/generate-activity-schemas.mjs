#!/usr/bin/env node
/**
 * Activity Schema Generation Script
 * Generates comprehensive configuration schemas for all activities
 * Integrates workflow automation service with drag-and-drop editors
 */

import { Client } from 'pg';
import fetch from 'node-fetch';

// Database connection configuration
const dbConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: 'temporal_ai_platform',
  user: process.env.POSTGRES_USER || 'temporal',
  password: process.env.POSTGRES_PASSWORD || 'temporal'
};

// Workflow automation service URL
const AUTOMATION_API = process.env.AUTOMATION_API || 'http://localhost:8092';

// Activity definitions with proper schemas
const ACTIVITY_DEFINITIONS = [
  {
    id: 'add-numbers',
    name: 'Add Numbers',
    type: 'calculation',
    description: 'Add two numbers together',
    category: 'Math',
    inputs: {
      num1: { type: 'number', description: 'First number', required: true },
      num2: { type: 'number', description: 'Second number', required: true }
    },
    outputs: {
      sum: { type: 'number', description: 'Sum of the two numbers' },
      result: { type: 'number', description: 'Addition result' }
    },
    code: 'function addNumbers(num1, num2) { const result = num1 + num2; return { sum: result, result }; }'
  },
  {
    id: 'multiply-numbers',
    name: 'Multiply Numbers', 
    type: 'calculation',
    description: 'Multiply two numbers',
    category: 'Math',
    inputs: {
      num1: { type: 'number', description: 'First number', required: true },
      num2: { type: 'number', description: 'Second number', required: true }
    },
    outputs: {
      product: { type: 'number', description: 'Product of the two numbers' },
      result: { type: 'number', description: 'Multiplication result' }
    },
    code: 'function multiplyNumbers(num1, num2) { const result = num1 * num2; return { product: result, result }; }'
  },
  {
    id: 'send-email',
    name: 'Send Email',
    type: 'communication', 
    description: 'Send email notification',
    category: 'Communication',
    inputs: {
      to: { type: 'string', description: 'Recipient email address', required: true },
      subject: { type: 'string', description: 'Email subject', required: true },
      body: { type: 'string', description: 'Email body content', required: true },
      cc: { type: 'string', description: 'CC recipients', required: false },
      bcc: { type: 'string', description: 'BCC recipients', required: false }
    },
    outputs: {
      messageId: { type: 'string', description: 'Email message ID' },
      status: { type: 'string', description: 'Send status' },
      sent: { type: 'boolean', description: 'Successfully sent flag' }
    },
    code: 'async function sendEmail(to, subject, body, cc, bcc) { return { messageId: "msg_" + Date.now(), status: "sent", sent: true }; }'
  },
  {
    id: 'validate-data',
    name: 'Validate Data',
    type: 'validation',
    description: 'Validate input data structure',
    category: 'Data', 
    inputs: {
      data: { type: 'object', description: 'Data to validate', required: true },
      schema: { type: 'object', description: 'Validation schema', required: true },
      strict: { type: 'boolean', description: 'Strict validation mode', required: false, default: false }
    },
    outputs: {
      isValid: { type: 'boolean', description: 'Validation result' },
      errors: { type: 'array', description: 'Validation errors' },
      warnings: { type: 'array', description: 'Validation warnings' }
    },
    code: 'function validateData(data, schema, strict = false) { return { isValid: true, errors: [], warnings: [] }; }'
  },
  {
    id: 'transform-data',
    name: 'Transform Data',
    type: 'transformation',
    description: 'Transform data using mapping rules',
    category: 'Data',
    inputs: {
      data: { type: 'object', description: 'Input data to transform', required: true },
      mappings: { type: 'object', description: 'Transformation mappings', required: true },
      format: { type: 'string', description: 'Output format', required: false, default: 'json' }
    },
    outputs: {
      transformedData: { type: 'object', description: 'Transformed data result' },
      metadata: { type: 'object', description: 'Transformation metadata' }
    },
    code: 'function transformData(data, mappings, format = "json") { return { transformedData: data, metadata: { format, timestamp: Date.now() } }; }'
  }
];

// Hardcoded activity definitions for port 3004 compatibility
const HARDCODED_ACTIVITIES = [
  {
    id: 'make-api-call',
    name: 'MakeAPICall',
    type: 'api',
    description: 'Make HTTP API calls to external services',
    category: 'Integration',
    inputs: {
      url: { type: 'string', description: 'API endpoint URL', required: true },
      method: { type: 'string', description: 'HTTP method', required: true, default: 'GET' },
      headers: { type: 'object', description: 'Request headers', required: false },
      data: { type: 'object', description: 'Request payload', required: false },
      timeout: { type: 'number', description: 'Request timeout (ms)', required: false, default: 30000 }
    },
    outputs: {
      response: { type: 'object', description: 'API response data' },
      status: { type: 'number', description: 'HTTP status code' },
      headers: { type: 'object', description: 'Response headers' }
    },
    code: 'async function makeAPICall(url, method, headers, data, timeout) { return { response: {}, status: 200, headers: {} }; }'
  },
  {
    id: 'file-operation',
    name: 'FileOperation',
    type: 'file',
    description: 'File system operations',
    category: 'System',
    inputs: {
      path: { type: 'string', description: 'File path', required: true },
      operation: { type: 'string', description: 'Operation type (read/write/delete)', required: true },
      content: { type: 'string', description: 'File content (for write)', required: false },
      encoding: { type: 'string', description: 'File encoding', required: false, default: 'utf8' }
    },
    outputs: {
      result: { type: 'boolean', description: 'Operation success' },
      data: { type: 'string', description: 'File content (for read)' },
      size: { type: 'number', description: 'File size in bytes' }
    },
    code: 'function fileOperation(path, operation, content, encoding) { return { result: true, data: content || "", size: 0 }; }'
  },
  {
    id: 'custom-script',
    name: 'CustomScript',
    type: 'script',
    description: 'Execute custom scripts',
    category: 'Automation',
    inputs: {
      script: { type: 'string', description: 'Script to execute', required: true },
      args: { type: 'object', description: 'Script arguments', required: false },
      interpreter: { type: 'string', description: 'Script interpreter', required: false, default: 'bash' },
      timeout: { type: 'number', description: 'Execution timeout (ms)', required: false, default: 60000 }
    },
    outputs: {
      output: { type: 'string', description: 'Script output' },
      exitCode: { type: 'number', description: 'Exit code' },
      error: { type: 'string', description: 'Error output' }
    },
    code: 'function customScript(script, args, interpreter, timeout) { return { output: "", exitCode: 0, error: "" }; }'
  },
  {
    id: 'process-data',
    name: 'ProcessData',
    type: 'processing',
    description: 'Process and manipulate data',
    category: 'Data',
    inputs: {
      data: { type: 'object', description: 'Input data', required: true },
      rules: { type: 'object', description: 'Processing rules', required: true },
      parallel: { type: 'boolean', description: 'Enable parallel processing', required: false, default: false }
    },
    outputs: {
      processedData: { type: 'object', description: 'Processed data result' },
      stats: { type: 'object', description: 'Processing statistics' }
    },
    code: 'function processData(data, rules, parallel) { return { processedData: data, stats: { processed: 1, time: Date.now() } }; }'
  },
  {
    id: 'save-to-database',
    name: 'SaveToDatabase',
    type: 'database',
    description: 'Save data to database',
    category: 'Database',
    inputs: {
      data: { type: 'object', description: 'Data to save', required: true },
      table: { type: 'string', description: 'Database table', required: true },
      connection: { type: 'string', description: 'Database connection', required: false, default: 'default' }
    },
    outputs: {
      success: { type: 'boolean', description: 'Save success' },
      id: { type: 'string', description: 'Record ID' },
      rowsAffected: { type: 'number', description: 'Rows affected' }
    },
    code: 'async function saveToDatabase(data, table, connection) { return { success: true, id: "rec_" + Date.now(), rowsAffected: 1 }; }'
  },
  {
    id: 'send-notification',
    name: 'SendNotification', 
    type: 'notification',
    description: 'Send push notifications',
    category: 'Communication',
    inputs: {
      message: { type: 'string', description: 'Notification message', required: true },
      target: { type: 'string', description: 'Notification target', required: true },
      channel: { type: 'string', description: 'Notification channel', required: false, default: 'push' },
      priority: { type: 'string', description: 'Notification priority', required: false, default: 'normal' }
    },
    outputs: {
      sent: { type: 'boolean', description: 'Notification sent' },
      messageId: { type: 'string', description: 'Message ID' },
      deliveryStatus: { type: 'string', description: 'Delivery status' }
    },
    code: 'async function sendNotification(message, target, channel, priority) { return { sent: true, messageId: "notif_" + Date.now(), deliveryStatus: "delivered" }; }'
  }
];

class ActivitySchemaGenerator {
  constructor() {
    this.client = new Client(dbConfig);
  }

  async connect() {
    await this.client.connect();
    console.log('🔗 Connected to PostgreSQL database');
  }

  async disconnect() {
    await this.client.end();
    console.log('🔌 Disconnected from PostgreSQL database');
  }

  /**
   * Generate comprehensive schema using automation service
   */
  async generateSchemaViaAPI(activityName) {
    try {
      const response = await fetch(`${AUTOMATION_API}/workflow-automation/api/schema/activity/${encodeURIComponent(activityName)}`);
      if (!response.ok) {
        throw new Error(`Schema API returned ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.warn(`⚠️  Failed to generate schema via API for ${activityName}: ${error.message}`);
      return null;
    }
  }

  /**
   * Update activity_library table with complete schemas
   */
  async updateActivityLibrary() {
    console.log('📊 Updating activity_library table with complete schemas...');
    
    const allActivities = [...ACTIVITY_DEFINITIONS, ...HARDCODED_ACTIVITIES];
    
    for (const activity of allActivities) {
      const { id, name, type, description, category, inputs, outputs, code } = activity;
      
      // Convert to JSON format
      const inputsJson = JSON.stringify(inputs);
      const outputsJson = JSON.stringify(outputs);
      const metadata = JSON.stringify({ category, source: 'generated', generated_at: new Date().toISOString() });
      
      try {
        const result = await this.client.query(`
          INSERT INTO activity_library (id, name, type, description, inputs, outputs, code, metadata, version, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            type = EXCLUDED.type,
            description = EXCLUDED.description,
            inputs = EXCLUDED.inputs,
            outputs = EXCLUDED.outputs,
            code = EXCLUDED.code,
            metadata = EXCLUDED.metadata,
            version = EXCLUDED.version,
            updated_at = NOW()
        `, [id, name, type, description, inputsJson, outputsJson, code, metadata, '1.0']);
        
        console.log(`✅ Updated activity: ${name} (${id})`);
      } catch (error) {
        console.error(`❌ Failed to update activity ${name}: ${error.message}`);
      }
    }
  }

  /**
   * Update activity_configurations table for port 3004 compatibility
   */
  async updateActivityConfigurations() {
    console.log('📋 Updating activity_configurations table for port 3004...');
    
    const allActivities = [...ACTIVITY_DEFINITIONS, ...HARDCODED_ACTIVITIES];
    
    for (const activity of allActivities) {
      const { name, description, category, inputs, outputs } = activity;
      
      // Create configuration schema
      const configuration = {
        inputs: Object.entries(inputs).map(([key, spec]) => ({
          name: key,
          type: spec.type,
          description: spec.description,
          required: spec.required || false,
          default: spec.default
        })),
        outputs: Object.entries(outputs).map(([key, spec]) => ({
          name: key,
          type: spec.type,
          description: spec.description
        })),
        category,
        generated: true,
        version: '1.0'
      };
      
      try {
        const result = await this.client.query(`
          INSERT INTO activity_configurations (activity_type, configuration, description, category, created_at, updated_at)
          VALUES ($1, $2, $3, $4, NOW(), NOW())
          ON CONFLICT (activity_type) DO UPDATE SET
            configuration = EXCLUDED.configuration,
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            updated_at = NOW()
        `, [name, JSON.stringify(configuration), description, category]);
        
        console.log(`✅ Updated configuration for: ${name}`);
      } catch (error) {
        console.error(`❌ Failed to update configuration for ${name}: ${error.message}`);
      }
    }
  }

  /**
   * Run complete schema generation process
   */
  async run() {
    try {
      await this.connect();
      
      console.log('🚀 Starting comprehensive activity schema generation...\n');
      
      // Update activity_library table
      await this.updateActivityLibrary();
      console.log('');
      
      // Update activity_configurations table  
      await this.updateActivityConfigurations();
      console.log('');
      
      console.log('✨ Schema generation completed successfully!');
      
      // Verify results
      await this.verifyResults();
      
    } catch (error) {
      console.error('💥 Schema generation failed:', error);
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Verify the generated schemas
   */
  async verifyResults() {
    console.log('🔍 Verifying generated schemas...\n');
    
    // Check activity_library
    const libraryResult = await this.client.query(`
      SELECT COUNT(*) as count, COUNT(CASE WHEN inputs IS NOT NULL THEN 1 END) as with_inputs 
      FROM activity_library
    `);
    console.log(`📚 Activity Library: ${libraryResult.rows[0].count} total, ${libraryResult.rows[0].with_inputs} with schemas`);
    
    // Check activity_configurations
    const configResult = await this.client.query(`
      SELECT COUNT(*) as count FROM activity_configurations
    `);
    console.log(`⚙️  Activity Configurations: ${configResult.rows[0].count} total`);
    
    console.log('\n✅ Schema verification completed!');
  }
}

// Run the schema generator
const generator = new ActivitySchemaGenerator();
generator.run().catch(console.error);