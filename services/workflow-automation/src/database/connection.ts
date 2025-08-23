/**
 * Database Connection for Workflow Automation Service
 * Handles PostgreSQL connection and automation-specific schema operations
 */

import { Pool, PoolConfig } from 'pg';
import { createServiceLogger, WorkflowAutomationEnvironment } from '../shared-utils-local';
import { z } from 'zod';

const logger = createServiceLogger('workflow-automation-database');

export interface AutomationDatabase {
  query: (text: string, params?: any[]) => Promise<any>;
  close: () => Promise<void>;
  checkConnection: () => Promise<boolean>;
}

// Parse database connection from environment URL or individual components

/**
 * Create database connection pool for Workflow Automation Service
 */
export async function createDatabaseConnection(env: WorkflowAutomationEnvironment): Promise<AutomationDatabase> {
  try {
    // Parse database URL or use default values
    const databaseUrl = env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/workflow_automation';
    
    const poolConfig: PoolConfig = {
      connectionString: databaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

    const pool = new Pool(poolConfig);

    // Ensure database exists first
    await ensureDatabaseExists(databaseUrl);

    // Test the connection
    const testClient = await pool.connect();
    await testClient.query('SELECT NOW()');
    testClient.release();

    logger.getLogger().info({
      connectionString: databaseUrl.replace(/\/\/[^@]+@/, '//***:***@'), // Hide credentials
    }, 'Database connection established');

    // Ensure automation-specific tables exist
    await ensureAutomationTables(pool);

    const database: AutomationDatabase = {
      query: async (text: string, params?: any[]) => {
        const start = Date.now();
        try {
          const result = await pool.query(text, params);
          const duration = Date.now() - start;
          
          logger.getLogger().debug({
            query: text.substring(0, 100),
            duration,
            rowCount: result.rowCount,
          }, 'Database query executed');
          
          return result;
        } catch (error) {
          const duration = Date.now() - start;
          logger.error(error as Error, {
            query: text.substring(0, 100),
            duration,
          }, 'Database query failed');
          throw error;
        }
      },

      close: async () => {
        await pool.end();
        logger.getLogger().info('Database connection pool closed');
      },

      checkConnection: async () => {
        try {
          const client = await pool.connect();
          await client.query('SELECT 1');
          client.release();
          return true;
        } catch (error) {
          logger.error(error as Error, {}, 'Database connection check failed');
          return false;
        }
      },
    };

    return database;

  } catch (error) {
    logger.error(error as Error, {}, 'Failed to create database connection');
    throw error;
  }
}

/**
 * Ensure database exists before connecting
 */
async function ensureDatabaseExists(databaseUrl: string): Promise<void> {
  try {
    // Parse the database URL to extract components
    const url = new URL(databaseUrl);
    const dbName = url.pathname.slice(1); // Remove leading slash
    
    // Create a connection to postgres database to check/create target database
    const adminUrl = databaseUrl.replace(`/${dbName}`, '/postgres');
    const adminPool = new Pool({ connectionString: adminUrl });
    
    try {
      const client = await adminPool.connect();
      
      // Check if database exists
      const result = await client.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [dbName]
      );
      
      if (result.rows.length === 0) {
        // Database doesn't exist, create it
        await client.query(`CREATE DATABASE "${dbName}"`);
        logger.getLogger().info({ dbName }, 'Database created successfully');
      } else {
        logger.getLogger().info({ dbName }, 'Database already exists');
      }
      
      client.release();
    } finally {
      await adminPool.end();
    }
  } catch (error) {
    logger.warn(error as Error, {}, 'Failed to ensure database exists, continuing anyway');
    // Continue anyway - the database might already exist or be created externally
  }
}

/**
 * Ensure automation-specific database tables exist
 */
async function ensureAutomationTables(pool: Pool): Promise<void> {
  const client = await pool.connect();
  
  try {
    // Automation Workflows table
    await client.query(`
      CREATE TABLE IF NOT EXISTS automation_workflows (
        workflow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        workflow_type VARCHAR(100) NOT NULL,
        configuration JSONB NOT NULL DEFAULT '{}',
        triggers JSONB NOT NULL DEFAULT '[]',
        steps JSONB NOT NULL DEFAULT '[]',
        quality_settings JSONB NOT NULL DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_by VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Automation Executions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS automation_executions (
        execution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id UUID REFERENCES automation_workflows(workflow_id),
        trigger_source VARCHAR(100),
        trigger_data JSONB,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        current_iteration INTEGER DEFAULT 1,
        max_iterations INTEGER DEFAULT 25,
        quality_threshold DECIMAL(5,4) DEFAULT 0.95,
        input_data JSONB NOT NULL,
        output_data JSONB,
        quality_scores JSONB DEFAULT '[]',
        error_details JSONB,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        total_duration_ms INTEGER
      )
    `);

    // Automation Steps table
    await client.query(`
      CREATE TABLE IF NOT EXISTS automation_step_executions (
        step_execution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        execution_id UUID REFERENCES automation_executions(execution_id),
        step_name VARCHAR(255) NOT NULL,
        step_type VARCHAR(100) NOT NULL,
        iteration INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        input_data JSONB NOT NULL,
        output_data JSONB,
        quality_score DECIMAL(5,4),
        feedback JSONB,
        error_details JSONB,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        duration_ms INTEGER
      )
    `);

    // Quality Assessments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS quality_assessments (
        assessment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        execution_id UUID REFERENCES automation_executions(execution_id),
        step_execution_id UUID REFERENCES automation_step_executions(step_execution_id),
        iteration INTEGER NOT NULL,
        assessment_type VARCHAR(100) NOT NULL,
        criteria JSONB NOT NULL,
        results JSONB NOT NULL,
        overall_score DECIMAL(5,4) NOT NULL,
        passed BOOLEAN NOT NULL,
        feedback_for_improvement TEXT,
        assessor VARCHAR(100) NOT NULL,
        assessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Automation Jobs table (for queue management)
    await client.query(`
      CREATE TABLE IF NOT EXISTS automation_jobs (
        job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        execution_id UUID REFERENCES automation_executions(execution_id),
        job_type VARCHAR(100) NOT NULL,
        priority INTEGER DEFAULT 0,
        payload JSONB NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        delay_until TIMESTAMP WITH TIME ZONE,
        error_details JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE
      )
    `);

    // Workflow Schedules table
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_schedules (
        schedule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id UUID REFERENCES automation_workflows(workflow_id),
        name VARCHAR(255) NOT NULL,
        cron_expression VARCHAR(100) NOT NULL,
        timezone VARCHAR(100) DEFAULT 'UTC',
        is_active BOOLEAN DEFAULT true,
        last_execution TIMESTAMP WITH TIME ZONE,
        next_execution TIMESTAMP WITH TIME ZONE,
        execution_count INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Automation Metrics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS automation_metrics (
        metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id UUID REFERENCES automation_workflows(workflow_id),
        execution_id UUID REFERENCES automation_executions(execution_id),
        metric_type VARCHAR(100) NOT NULL,
        metric_name VARCHAR(255) NOT NULL,
        metric_value DECIMAL(10,4),
        metric_data JSONB,
        complexity_score INTEGER DEFAULT 1,
        success_rate DECIMAL(5,2) DEFAULT 0.0,
        is_active BOOLEAN DEFAULT true,
        recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Generated Temporal Workflows table
    await client.query(`
      CREATE TABLE IF NOT EXISTS generated_workflows (
        workflow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        execution_id UUID REFERENCES automation_executions(execution_id),
        requirements TEXT NOT NULL,
        generated_code TEXT NOT NULL,
        supporting_files JSONB DEFAULT '[]',
        template_id VARCHAR(255),
        target_language VARCHAR(50) NOT NULL,
        temporal_workflow_class VARCHAR(255) NOT NULL,
        quality_score DECIMAL(3,2),
        complexity_score INTEGER DEFAULT 1,
        success_rate DECIMAL(5,2) DEFAULT 0.0,
        is_active BOOLEAN DEFAULT true,
        deployment_status VARCHAR(50) DEFAULT 'generated',
        deployment_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        deployed_at TIMESTAMP WITH TIME ZONE
      )
    `);

    // Dynamic Workflow Definitions table (for dynamicWorkflow execution)
    await client.query(`
      CREATE TABLE IF NOT EXISTS dynamic_workflow_definitions (
        workflow_id VARCHAR(255) PRIMARY KEY,
        definition JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Workflow Execution Logs table (for temporal-worker logging)
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_execution_logs (
        log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id VARCHAR(255) NOT NULL,
        step_id VARCHAR(255),
        status VARCHAR(100) NOT NULL,
        result_data JSONB,
        timestamp TIMESTAMP WITH TIME ZONE,
        activity_context JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Workflow Data Exchange table
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_data_exchange (
        exchange_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_workflow VARCHAR(255) NOT NULL,
        target_workflow VARCHAR(255) NOT NULL,
        data JSONB NOT NULL,
        channel VARCHAR(255),
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Sub Workflow Executions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sub_workflow_executions (
        execution_id VARCHAR(255) PRIMARY KEY,
        workflow_id VARCHAR(255) NOT NULL,
        parent_execution_id VARCHAR(255),
        input_data JSONB,
        result_data JSONB,
        status VARCHAR(100) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE
      )
    `);

    // Workflow Data Transfers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_data_transfers (
        transfer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_workflow_id VARCHAR(255) NOT NULL,
        target_workflow_id VARCHAR(255) NOT NULL,
        data JSONB NOT NULL,
        transfer_type VARCHAR(100) NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Workflow Chain Definitions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_chain_definitions (
        chain_id VARCHAR(255) PRIMARY KEY,
        definition JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Chain Execution Logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chain_execution_logs (
        log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chain_id VARCHAR(255) NOT NULL,
        execution_id VARCHAR(255) NOT NULL,
        status VARCHAR(100) NOT NULL,
        current_workflow VARCHAR(255),
        result_data JSONB,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Workflow Templates table
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_templates (
        template_id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100) NOT NULL,
        tags TEXT[] DEFAULT '{}',
        yaml_pattern TEXT NOT NULL,
        code_template TEXT NOT NULL,
        supported_languages TEXT[] DEFAULT '{}',
        complexity_score INTEGER DEFAULT 1,
        success_rate DECIMAL(5,2) DEFAULT 0.0,
        usage_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_used TIMESTAMP WITH TIME ZONE
      )
    `);

    // System Configurations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_configurations (
        config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        config_type VARCHAR(100) NOT NULL,
        config_data JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_by VARCHAR(255)
      )
    `);

    // Editor Configuration Schemas table - for drag-and-drop editor
    await client.query(`
      CREATE TABLE IF NOT EXISTS editor_configuration_schemas (
        schema_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id UUID REFERENCES automation_workflows(workflow_id),
        execution_id UUID REFERENCES automation_executions(execution_id),
        component_type VARCHAR(50) NOT NULL CHECK (component_type IN ('activity', 'workflow', 'connector', 'trigger')),
        component_name VARCHAR(255) NOT NULL,
        display_name VARCHAR(255),
        description TEXT,
        category VARCHAR(100),
        icon VARCHAR(100),
        schema_version VARCHAR(20) DEFAULT '1.0.0',
        configuration_schema JSONB NOT NULL,
        ui_schema JSONB DEFAULT '{}',
        input_ports JSONB DEFAULT '[]',
        output_ports JSONB DEFAULT '[]',
        properties JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        temporal_workflow_class VARCHAR(255),
        temporal_activity_class VARCHAR(255),
        source_code TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Workflow Editor Components table - tracks available components for drag-and-drop
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_editor_components (
        component_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        schema_id UUID REFERENCES editor_configuration_schemas(schema_id),
        component_group VARCHAR(100) NOT NULL,
        component_name VARCHAR(255) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        description TEXT,
        icon VARCHAR(100),
        color VARCHAR(20),
        tags TEXT[] DEFAULT '{}',
        complexity_level INTEGER DEFAULT 1 CHECK (complexity_level BETWEEN 1 AND 5),
        usage_count INTEGER DEFAULT 0,
        success_rate DECIMAL(5,2) DEFAULT 0.0,
        average_execution_time INTEGER DEFAULT 0,
        dependencies TEXT[] DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Editor Component Usage Tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS editor_component_usage (
        usage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        component_id UUID REFERENCES workflow_editor_components(component_id),
        workflow_id UUID REFERENCES automation_workflows(workflow_id),
        execution_id UUID REFERENCES automation_executions(execution_id),
        usage_context VARCHAR(100),
        configuration_data JSONB,
        execution_success BOOLEAN,
        execution_time_ms INTEGER,
        error_details JSONB,
        user_id VARCHAR(255),
        used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_automation_executions_workflow_id ON automation_executions(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_automation_executions_status ON automation_executions(status);
      CREATE INDEX IF NOT EXISTS idx_automation_executions_started_at ON automation_executions(started_at);
      
      CREATE INDEX IF NOT EXISTS idx_automation_step_executions_execution_id ON automation_step_executions(execution_id);
      CREATE INDEX IF NOT EXISTS idx_automation_step_executions_iteration ON automation_step_executions(iteration);
      CREATE INDEX IF NOT EXISTS idx_automation_step_executions_status ON automation_step_executions(status);
      
      CREATE INDEX IF NOT EXISTS idx_quality_assessments_execution_id ON quality_assessments(execution_id);
      CREATE INDEX IF NOT EXISTS idx_quality_assessments_iteration ON quality_assessments(iteration);
      CREATE INDEX IF NOT EXISTS idx_quality_assessments_passed ON quality_assessments(passed);
      
      CREATE INDEX IF NOT EXISTS idx_automation_jobs_status ON automation_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_automation_jobs_created_at ON automation_jobs(created_at);
      CREATE INDEX IF NOT EXISTS idx_automation_jobs_delay_until ON automation_jobs(delay_until);
      
      CREATE INDEX IF NOT EXISTS idx_workflow_schedules_workflow_id ON workflow_schedules(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_schedules_next_execution ON workflow_schedules(next_execution);
      CREATE INDEX IF NOT EXISTS idx_workflow_schedules_is_active ON workflow_schedules(is_active);
      
      CREATE INDEX IF NOT EXISTS idx_automation_metrics_workflow_id ON automation_metrics(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_automation_metrics_execution_id ON automation_metrics(execution_id);
      CREATE INDEX IF NOT EXISTS idx_automation_metrics_recorded_at ON automation_metrics(recorded_at);
      
      CREATE INDEX IF NOT EXISTS idx_generated_workflows_execution_id ON generated_workflows(execution_id);
      CREATE INDEX IF NOT EXISTS idx_generated_workflows_template_id ON generated_workflows(template_id);
      CREATE INDEX IF NOT EXISTS idx_generated_workflows_target_language ON generated_workflows(target_language);
      CREATE INDEX IF NOT EXISTS idx_generated_workflows_deployment_status ON generated_workflows(deployment_status);
      
      CREATE INDEX IF NOT EXISTS idx_workflow_templates_category ON workflow_templates(category);
      CREATE INDEX IF NOT EXISTS idx_workflow_templates_is_active ON workflow_templates(is_active);
      CREATE INDEX IF NOT EXISTS idx_workflow_templates_complexity_score ON workflow_templates(complexity_score);
      
      CREATE INDEX IF NOT EXISTS idx_system_configurations_config_type ON system_configurations(config_type);
      
      CREATE INDEX IF NOT EXISTS idx_editor_configuration_schemas_workflow_id ON editor_configuration_schemas(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_editor_configuration_schemas_execution_id ON editor_configuration_schemas(execution_id);
      CREATE INDEX IF NOT EXISTS idx_editor_configuration_schemas_component_type ON editor_configuration_schemas(component_type);
      CREATE INDEX IF NOT EXISTS idx_editor_configuration_schemas_component_name ON editor_configuration_schemas(component_name);
      CREATE INDEX IF NOT EXISTS idx_editor_configuration_schemas_is_active ON editor_configuration_schemas(is_active);
      
      CREATE INDEX IF NOT EXISTS idx_workflow_editor_components_schema_id ON workflow_editor_components(schema_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_editor_components_component_group ON workflow_editor_components(component_group);
      CREATE INDEX IF NOT EXISTS idx_workflow_editor_components_is_active ON workflow_editor_components(is_active);
      CREATE INDEX IF NOT EXISTS idx_workflow_editor_components_tags ON workflow_editor_components USING GIN (tags);
      
      CREATE INDEX IF NOT EXISTS idx_editor_component_usage_component_id ON editor_component_usage(component_id);
      CREATE INDEX IF NOT EXISTS idx_editor_component_usage_workflow_id ON editor_component_usage(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_editor_component_usage_execution_id ON editor_component_usage(execution_id);
      CREATE INDEX IF NOT EXISTS idx_editor_component_usage_used_at ON editor_component_usage(used_at);
    `);

    // Create or update the updated_at trigger function (if it doesn't exist)
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create triggers for updated_at columns
    await client.query(`
      DROP TRIGGER IF EXISTS update_automation_workflows_updated_at ON automation_workflows;
      CREATE TRIGGER update_automation_workflows_updated_at
        BEFORE UPDATE ON automation_workflows
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        
      DROP TRIGGER IF EXISTS update_workflow_schedules_updated_at ON workflow_schedules;
      CREATE TRIGGER update_workflow_schedules_updated_at
        BEFORE UPDATE ON workflow_schedules
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        
      DROP TRIGGER IF EXISTS update_editor_configuration_schemas_updated_at ON editor_configuration_schemas;
      CREATE TRIGGER update_editor_configuration_schemas_updated_at
        BEFORE UPDATE ON editor_configuration_schemas
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        
      DROP TRIGGER IF EXISTS update_workflow_editor_components_updated_at ON workflow_editor_components;
      CREATE TRIGGER update_workflow_editor_components_updated_at
        BEFORE UPDATE ON workflow_editor_components
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    logger.getLogger().info('Automation database tables ensured successfully');

  } catch (error) {
    logger.error(error as Error, {}, 'Failed to ensure automation database tables');
    throw error;
  } finally {
    client.release();
  }
}