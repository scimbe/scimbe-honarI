-- Clean Database Initialization Script for Temporal AI Workflow Platform
-- This script creates the minimal required tables with proper schema

-- Drop existing database and recreate (only in development)
DROP DATABASE IF EXISTS temporal_ai_platform_clean;
CREATE DATABASE temporal_ai_platform_clean;

\c temporal_ai_platform_clean;

-- Create core extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- ====================
-- CORE TABLES
-- ====================

-- 1. Activity Library - Store reusable activity definitions
CREATE TABLE activity_library (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) DEFAULT 'javascript',
    description TEXT,
    version VARCHAR(50) DEFAULT '1.0.0',
    category VARCHAR(100),
    code TEXT NOT NULL,
    language VARCHAR(50) DEFAULT 'typescript',
    
    -- Input/Output schemas
    inputs JSONB DEFAULT '{}'::jsonb,
    outputs JSONB DEFAULT '{}'::jsonb,
    
    -- Configuration
    retry_policy JSONB DEFAULT '{"maxAttempts": 3, "backoffCoefficient": 2}'::jsonb,
    timeout_config JSONB DEFAULT '{"startToCloseTimeout": "10m"}'::jsonb,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    tags TEXT[],
    dependencies JSONB DEFAULT '[]'::jsonb,
    
    -- Metrics
    usage_count INTEGER DEFAULT 0,
    quality_score NUMERIC(3,2) DEFAULT 0.0 CHECK (quality_score >= 0.0 AND quality_score <= 10.0),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    
    -- Flags
    generic_reusable BOOLEAN DEFAULT false
);

-- 2. Workflow Definitions - Store workflow templates
CREATE TABLE workflow_definitions (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    description TEXT,
    category VARCHAR(100),
    
    -- Workflow structure
    activities JSONB DEFAULT '[]'::jsonb, -- Array of {id, name, type, configuration}
    configuration JSONB DEFAULT '{}'::jsonb,
    
    -- Metadata
    input_data JSONB DEFAULT '{}'::jsonb,
    test_cases JSONB DEFAULT '[]'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    status VARCHAR(50) DEFAULT 'active',
    usage_count INTEGER DEFAULT 0
);

-- 3. Workflow Executions - Track workflow runs
CREATE TABLE workflow_executions (
    execution_id VARCHAR(255) PRIMARY KEY,
    workflow_id VARCHAR(255) NOT NULL,
    
    -- Execution data
    status VARCHAR(50) DEFAULT 'pending',
    input_data JSONB DEFAULT '{}'::jsonb,
    output_data JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    
    -- Temporal info
    temporal_workflow_id VARCHAR(255),
    temporal_run_id VARCHAR(255),
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    
    FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id)
);

-- 4. Activity Executions - Track individual activity runs within workflows
CREATE TABLE activity_executions (
    execution_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    workflow_execution_id VARCHAR(255) NOT NULL,
    activity_id VARCHAR(255) NOT NULL,
    activity_name VARCHAR(255) NOT NULL,
    
    -- Execution data
    status VARCHAR(50) DEFAULT 'pending',
    input JSONB DEFAULT '{}'::jsonb,
    output JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    
    -- Performance
    execution_time_ms INTEGER,
    attempt INTEGER DEFAULT 1,
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (workflow_execution_id) REFERENCES workflow_executions(execution_id),
    FOREIGN KEY (activity_id) REFERENCES activity_library(id)
);

-- ====================
-- INDEXES
-- ====================

-- Activity Library indexes
CREATE INDEX idx_activity_library_type ON activity_library(type);
CREATE INDEX idx_activity_library_category ON activity_library(category);
CREATE INDEX idx_activity_library_usage ON activity_library(usage_count DESC);
CREATE INDEX idx_activity_library_quality ON activity_library(quality_score DESC);
CREATE INDEX idx_activity_library_tags ON activity_library USING GIN(tags);

-- Workflow Definitions indexes
CREATE INDEX idx_workflow_definitions_category ON workflow_definitions(category);
CREATE INDEX idx_workflow_definitions_status ON workflow_definitions(status);
CREATE INDEX idx_workflow_definitions_active ON workflow_definitions(is_active);

-- Workflow Executions indexes
CREATE INDEX idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_workflow_executions_started_at ON workflow_executions(started_at);

-- Activity Executions indexes  
CREATE INDEX idx_activity_executions_workflow_id ON activity_executions(workflow_execution_id);
CREATE INDEX idx_activity_executions_activity_id ON activity_executions(activity_id);
CREATE INDEX idx_activity_executions_status ON activity_executions(status);

-- ====================
-- TRIGGERS
-- ====================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_activity_library_updated_at BEFORE UPDATE ON activity_library FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflow_definitions_updated_at BEFORE UPDATE ON workflow_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ====================
-- SAMPLE DATA
-- ====================

-- Insert core activities that workflows expect
INSERT INTO activity_library (id, name, type, description, code, category) VALUES
('input_validation', 'Input Validation Activity', 'validation', 'Validates input parameters for workflows', 
'function validateInput(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid input: Input must be an object");
  }
  return { 
    validated: true, 
    value: input,
    validation_timestamp: new Date().toISOString()
  };
}', 'validation'),

('template_loading', 'Template Loading Activity', 'processing', 'Loads email templates from filesystem or database',
'async function loadTemplate(input) {
  const fs = require("fs").promises;
  const path = require("path");
  
  try {
    const templatePath = path.join(input.templatePath || "/app/examples/email-templates/", input.templateName || "welcome-email.html");
    const content = await fs.readFile(templatePath, "utf-8");
    
    return {
      template: content,
      templateName: input.templateName,
      size: content.length,
      loaded_at: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Template loading failed: ${error.message}`);
  }
}', 'processing'),

('csv_parsing', 'CSV File Parser', 'processing', 'Parses CSV files for data processing',
'function parseCSV(input) {
  const csvData = input.csvContent || "";
  const lines = csvData.split("\\n").filter(line => line.trim());
  
  if (lines.length === 0) {
    return { data: [], count: 0, parsed_at: new Date().toISOString() };
  }
  
  const headers = lines[0].split(",");
  const data = lines.slice(1).map(line => {
    const values = line.split(",");
    const row = {};
    headers.forEach((header, index) => {
      row[header.trim()] = values[index]?.trim() || "";
    });
    return row;
  });
  
  return {
    data: data,
    count: data.length,
    headers: headers,
    parsed_at: new Date().toISOString()
  };
}', 'processing'),

('data_validation', 'Data Validation Activity', 'validation', 'Validates processed data against schemas',
'function validateData(input) {
  const data = input.data || [];
  const schema = input.schema || {};
  
  const validatedData = data.map(item => ({
    ...item,
    _valid: true,
    _validated_at: new Date().toISOString()
  }));
  
  return {
    validated_data: validatedData,
    validation_summary: {
      total_records: data.length,
      valid_records: validatedData.length,
      invalid_records: 0
    },
    validated_at: new Date().toISOString()
  };
}', 'validation');

-- Insert sample workflow that uses proper activity IDs
INSERT INTO workflow_definitions (id, name, description, activities) VALUES
('email-template-workflow', 'Email Template Processing Workflow', 'Processes email templates with data validation',
'[
  {
    "id": "input_validation",
    "name": "validateInput", 
    "type": "validation",
    "configuration": {}
  },
  {
    "id": "template_loading",
    "name": "loadTemplate",
    "type": "processing", 
    "configuration": {"templatePath": "/app/examples/email-templates/"}
  },
  {
    "id": "csv_parsing", 
    "name": "parseCSV",
    "type": "processing",
    "configuration": {}
  },
  {
    "id": "data_validation",
    "name": "validateData", 
    "type": "validation",
    "configuration": {}
  }
]'::jsonb);

-- ====================
-- PERMISSIONS
-- ====================

-- Grant permissions to temporal user
GRANT ALL PRIVILEGES ON DATABASE temporal_ai_platform_clean TO temporal;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO temporal;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO temporal;

COMMENT ON DATABASE temporal_ai_platform_clean IS 'Clean Temporal AI Workflow Platform Database - Contains only essential tables';
COMMENT ON TABLE activity_library IS 'Reusable activity definitions with unique IDs';
COMMENT ON TABLE workflow_definitions IS 'Workflow templates that reference activities by ID';
COMMENT ON TABLE workflow_executions IS 'Runtime execution tracking for workflows';
COMMENT ON TABLE activity_executions IS 'Runtime execution tracking for individual activities';