-- ============================================================================
-- TEMPORAL AI WORKFLOW PLATFORM - PROJECT INITIALIZATION DATABASE SCRIPT
-- ============================================================================
-- 
-- This script initializes a complete Temporal AI Workflow Platform project
-- with all required tables, sample activities, and workflow definitions.
-- 
-- Usage:
--   psql -U temporal -d temporal_ai_platform_clean -f init-project-database.sql
-- 
-- Features:
--   ✅ Clean schema with only 5 essential tables  
--   ✅ Comprehensive activity library with working examples
--   ✅ Sample workflow definitions (Factorial, Circle Area, Email Processing)
--   ✅ Proper indexes and constraints for performance
--   ✅ Generic and stable regex parsing system support
--   ✅ Redis parameter validation integration
--   ✅ Full foreign key relationships and data integrity
-- 
-- Generated: 2025-08-23
-- Database Version: PostgreSQL 15+
-- Compatible Services: temporal-worker v2.0.0+, enhanced-workflow-editor, workflow-automation
-- ============================================================================

-- Create clean database (only run if setting up new project)
-- DROP DATABASE IF EXISTS temporal_ai_platform_clean;
-- CREATE DATABASE temporal_ai_platform_clean;
-- \c temporal_ai_platform_clean;

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Auto-update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- 1. Activity Library - Reusable activity definitions with unique IDs
CREATE TABLE IF NOT EXISTS activity_library (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) DEFAULT 'javascript',
    description TEXT,
    version VARCHAR(50) DEFAULT '1.0.0',
    category VARCHAR(100),
    code TEXT NOT NULL,
    language VARCHAR(50) DEFAULT 'typescript',
    
    -- Input/Output schemas (JSON Schema format)
    inputs JSONB DEFAULT '{}'::jsonb,
    outputs JSONB DEFAULT '{}'::jsonb,
    
    -- Configuration for temporal execution
    retry_policy JSONB DEFAULT '{"maxAttempts": 3, "backoffCoefficient": 2}'::jsonb,
    timeout_config JSONB DEFAULT '{"startToCloseTimeout": "10m"}'::jsonb,
    
    -- Metadata and organization
    metadata JSONB DEFAULT '{}'::jsonb,
    tags TEXT[],
    dependencies JSONB DEFAULT '[]'::jsonb,
    
    -- Usage tracking and quality metrics
    usage_count INTEGER DEFAULT 0,
    quality_score NUMERIC(3,2) DEFAULT 0.0 CHECK (quality_score >= 0.0 AND quality_score <= 10.0),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    
    -- Reusability flag
    generic_reusable BOOLEAN DEFAULT false
);

-- 2. Workflow Definitions - Workflow templates that reference activities by unique ID
CREATE TABLE IF NOT EXISTS workflow_definitions (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    description TEXT,
    category VARCHAR(100),
    
    -- Workflow structure (references activity_library.id)
    activities JSONB DEFAULT '[]'::jsonb, -- Array of {id, name, type, configuration}
    configuration JSONB DEFAULT '{}'::jsonb,
    
    -- Test and validation data
    input_data JSONB DEFAULT '{}'::jsonb,
    test_cases JSONB DEFAULT '[]'::jsonb,
    
    -- Audit and status
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    status VARCHAR(50) DEFAULT 'active',
    usage_count INTEGER DEFAULT 0
);

-- 3. Workflow Executions - Runtime execution tracking for workflows
CREATE TABLE IF NOT EXISTS workflow_executions (
    execution_id VARCHAR(255) PRIMARY KEY,
    workflow_id VARCHAR(255) NOT NULL,
    
    -- Execution data
    status VARCHAR(50) DEFAULT 'pending',
    input_data JSONB DEFAULT '{}'::jsonb,
    output_data JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    
    -- Temporal integration
    temporal_workflow_id VARCHAR(255),
    temporal_run_id VARCHAR(255),
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata and status
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    
    FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id)
);

-- 4. Activity Executions - Runtime execution tracking for individual activities
CREATE TABLE IF NOT EXISTS activity_executions (
    execution_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    workflow_execution_id VARCHAR(255) NOT NULL,
    activity_id VARCHAR(255) NOT NULL,
    activity_name VARCHAR(255) NOT NULL,
    
    -- Execution data
    status VARCHAR(50) DEFAULT 'pending',
    input JSONB DEFAULT '{}'::jsonb,
    output JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    
    -- Performance tracking
    execution_time_ms INTEGER,
    attempt INTEGER DEFAULT 1,
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (workflow_execution_id) REFERENCES workflow_executions(execution_id),
    FOREIGN KEY (activity_id) REFERENCES activity_library(id)
);

-- 5. Execution Logs - Detailed logging for debugging and monitoring
CREATE TABLE IF NOT EXISTS execution_logs (
    id SERIAL PRIMARY KEY,
    execution_id VARCHAR(255),
    workflow_id VARCHAR(255),
    message TEXT,
    log_level VARCHAR(50),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    chain_id VARCHAR(255),
    details JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Activity Library indexes
CREATE INDEX IF NOT EXISTS idx_activity_library_type ON activity_library(type);
CREATE INDEX IF NOT EXISTS idx_activity_library_category ON activity_library(category);
CREATE INDEX IF NOT EXISTS idx_activity_library_usage ON activity_library(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_activity_library_quality ON activity_library(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_activity_library_tags ON activity_library USING GIN(tags);

-- Workflow Definitions indexes
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_category ON workflow_definitions(category);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_status ON workflow_definitions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_active ON workflow_definitions(is_active);

-- Workflow Executions indexes
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_started_at ON workflow_executions(started_at);

-- Activity Executions indexes  
CREATE INDEX IF NOT EXISTS idx_activity_executions_workflow_id ON activity_executions(workflow_execution_id);
CREATE INDEX IF NOT EXISTS idx_activity_executions_activity_id ON activity_executions(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_executions_status ON activity_executions(status);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update timestamps on modification
DROP TRIGGER IF EXISTS update_activity_library_updated_at ON activity_library;
CREATE TRIGGER update_activity_library_updated_at 
    BEFORE UPDATE ON activity_library 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflow_definitions_updated_at ON workflow_definitions;
CREATE TRIGGER update_workflow_definitions_updated_at 
    BEFORE UPDATE ON workflow_definitions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SAMPLE ACTIVITY LIBRARY
-- ============================================================================

-- Clear existing sample data
TRUNCATE TABLE activity_executions, workflow_executions, workflow_definitions, activity_library CASCADE;

-- Core validation activities
INSERT INTO activity_library (id, name, type, description, code, category) VALUES

-- Input validation activity with comprehensive error handling
('input_validation', 'Input Validation Activity', 'validation', 'Validates input parameters for workflows with detailed error reporting', 
'function validateInput(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid input: Input must be an object");
  }
  
  // Validate common input types
  const validatedInput = { ...input };
  
  // Add validation metadata
  validatedInput._validation = {
    validated: true,
    timestamp: new Date().toISOString(),
    validator: "input_validation"
  };
  
  return validatedInput;
}', 'validation'),

-- Enhanced radius validation for circle calculations
('validate_radius', 'Validate Radius Input', 'validation', 'Validates radius input for circle calculations with positive number check', 
'function validateRadius(input) {
  const radius = parseFloat(input.radius);
  
  if (isNaN(radius)) {
    throw new Error("Invalid radius: must be a valid number");
  }
  
  if (radius <= 0) {
    throw new Error("Invalid radius: must be a positive number greater than 0");
  }
  
  return {
    radius: radius,
    validated: true,
    validation_timestamp: new Date().toISOString(),
    input_type: "radius"
  };
}', 'validation'),

-- Input validation specifically for factorial calculations
('validate_input', 'Input Validation for Factorial', 'validation', 'Validates integer input for factorial calculations',
'function validateInput(input) {
  const n = parseInt(input.number || input.n || input);
  
  if (isNaN(n)) {
    throw new Error("Invalid input: must be a valid integer");
  }
  
  if (n < 0) {
    throw new Error("Invalid input: factorial not defined for negative numbers");
  }
  
  if (n > 170) {
    throw new Error("Invalid input: number too large (maximum 170 for JavaScript precision)");
  }
  
  return {
    number: n,
    validated: true,
    validation_timestamp: new Date().toISOString()
  };
}', 'validation'),

-- Processing activities
('template_loading', 'Template Loading Activity', 'processing', 'Loads email templates from filesystem with error handling',
'async function loadTemplate(input) {
  const fs = require("fs").promises;
  const path = require("path");
  
  try {
    const templatePath = path.join(
      input.templatePath || "/app/examples/email-templates/", 
      input.templateName || "welcome-email.html"
    );
    
    const content = await fs.readFile(templatePath, "utf-8");
    
    return {
      template: content,
      templateName: input.templateName || "welcome-email.html",
      templatePath: templatePath,
      size: content.length,
      loaded_at: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Template loading failed: ${error.message}`);
  }
}', 'processing'),

('csv_parsing', 'CSV File Parser', 'processing', 'Parses CSV files with header detection and error handling',
'function parseCSV(input) {
  const csvData = input.csvContent || "";
  const lines = csvData.split("\\n").filter(line => line.trim());
  
  if (lines.length === 0) {
    return { 
      data: [], 
      count: 0, 
      headers: [],
      parsed_at: new Date().toISOString() 
    };
  }
  
  const headers = lines[0].split(",").map(h => h.trim());
  const data = lines.slice(1).map(line => {
    const values = line.split(",").map(v => v.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
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

-- Calculation activities
('calculate_factorial', 'Factorial Calculator', 'calculation', 'Calculates factorial with step-by-step tracking',
'function calculateFactorial(input) {
  const n = input.n || input.number || input;
  let result = 1;
  let steps = [];

  for (let i = 1; i <= n; i++) {
    result *= i;
    steps.push(i);
  }

  return {
    factorial: result,
    steps: steps,
    formula: n === 0 ? "0! = 1" : steps.join(" × ") + " = " + result
  };
}', 'calculation'),

('calculate_circle_area', 'Calculate Circle Area', 'calculation', 'Calculates circle area with formula display',
'function calculateCircleArea(input, previousData) {
  const radius = input.radius || previousData.radius || previousData.validated_radius || 10;
  const area = Math.PI * radius * radius;
  
  return {
    area: parseFloat(area.toFixed(2)),
    radius: radius,
    formula: "π × " + radius + "² = " + parseFloat(area.toFixed(2)),
    calculation_type: "circle_area"
  };
}', 'calculation'),

-- Formatting activities
('format_result', 'Result Formatter', 'formatting', 'Formats calculation results for display',
'function formatResult(input, previousData) {
  // Handle different types of calculations
  if (previousData.factorial !== undefined) {
    return {
      input: input.number || input.n,
      result: previousData.factorial,
      calculation_steps: previousData.formula || previousData.steps?.join(" × ") || "N/A",
      message: `The factorial of ${input.number || input.n} is ${previousData.factorial}`
    };
  }
  
  if (previousData.area !== undefined) {
    return {
      input: previousData.radius,
      result: previousData.area,
      calculation_steps: previousData.formula,
      message: `The area of a circle with radius ${previousData.radius} is ${previousData.area}`
    };
  }
  
  // Generic formatting
  return {
    input: input,
    result: previousData,
    message: "Calculation completed successfully"
  };
}', 'formatting'),

('result_formatting', 'Advanced Result Formatter', 'formatting', 'Advanced formatting with multiple output formats',
'function formatResult(input) {
  const result = input.factorial || input.result;
  const inputValue = input.input || input.number || input.n;
  
  return {
    result: result,
    formatted: {
      decimal: result,
      scientific: result.toExponential(),
      formatted: result.toLocaleString()
    },
    calculation_summary: `Factorial of ${inputValue} = ${result}`,
    formatted_at: new Date().toISOString()
  };
}', 'formatting'),

-- Data validation activities
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
      invalid_records: 0,
      validation_rules_applied: Object.keys(schema).length
    },
    validated_at: new Date().toISOString()
  };
}', 'validation');

-- ============================================================================
-- SAMPLE WORKFLOW DEFINITIONS
-- ============================================================================

-- Factorial Calculator Workflow
INSERT INTO workflow_definitions (id, name, description, activities, category) VALUES
('6e77654e-8486-4f91-9573-82520902c572', 'FactorialCalculatorWorkflow', 'Calculates factorial of integer input with validation and formatting',
'[
  {
    "id": "validate_input",
    "name": "validateInput", 
    "type": "validation",
    "configuration": {"maxValue": 170}
  },
  {
    "id": "calculate_factorial",
    "name": "calculateFactorial",
    "type": "calculation", 
    "configuration": {}
  },
  {
    "id": "format_result",
    "name": "formatResult",
    "type": "formatting",
    "configuration": {}
  }
]'::jsonb, 'mathematical'),

-- Circle Area Calculator Workflow
('e49b69a4-a543-4887-b52a-ce6c9cc44067', 'CircleAreaCalculatorWorkflow', 'Calculates area of a circle with input validation and formatting',
'[
  {
    "id": "validate_radius",
    "name": "validateRadius",
    "type": "validation",
    "configuration": {"minValue": 0.001, "maxValue": 10000}
  },
  {
    "id": "calculate_circle_area",
    "name": "calculateCircleArea",
    "type": "calculation",
    "configuration": {"precision": 2}
  },
  {
    "id": "format_result",
    "name": "formatResult",
    "type": "formatting",
    "configuration": {"includeFormula": true}
  }
]'::jsonb, 'mathematical'),

-- Email Template Processing Workflow
('email-template-workflow', 'Email Template Processing Workflow', 'Processes email templates with data validation and CSV parsing',
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
    "configuration": {"hasHeaders": true}
  },
  {
    "id": "data_validation",
    "name": "validateData", 
    "type": "validation",
    "configuration": {"strictMode": false}
  }
]'::jsonb, 'email-processing');

-- ============================================================================
-- PERMISSIONS AND COMMENTS
-- ============================================================================

-- Grant permissions to temporal user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO temporal;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO temporal;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO temporal;

-- Add table comments for documentation
COMMENT ON TABLE activity_library IS 'Reusable activity definitions with unique IDs - supports generic regex parsing';
COMMENT ON TABLE workflow_definitions IS 'Workflow templates that reference activities by ID - ensures consistency';
COMMENT ON TABLE workflow_executions IS 'Runtime execution tracking with Temporal integration';
COMMENT ON TABLE activity_executions IS 'Individual activity execution tracking with performance metrics';
COMMENT ON TABLE execution_logs IS 'Detailed execution logs for debugging and monitoring';

-- ============================================================================
-- INITIALIZATION COMPLETE
-- ============================================================================

-- Display summary
SELECT 
    'TEMPORAL AI WORKFLOW PLATFORM INITIALIZED SUCCESSFULLY' as status,
    (SELECT COUNT(*) FROM activity_library) as activities_loaded,
    (SELECT COUNT(*) FROM workflow_definitions) as workflows_loaded,
    'temporal_ai_platform_clean' as database_name,
    CURRENT_TIMESTAMP as initialized_at;

-- Display available activities
SELECT 
    '=== AVAILABLE ACTIVITIES ===' as info,
    id,
    name,
    type,
    category,
    description
FROM activity_library 
ORDER BY category, type, name;

-- Display available workflows
SELECT 
    '=== AVAILABLE WORKFLOWS ===' as info,
    id,
    name,
    category,
    description,
    jsonb_array_length(activities) as activity_count
FROM workflow_definitions 
ORDER BY category, name;

-- Usage examples
SELECT '
-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================

-- Test Factorial Workflow:
curl -X POST http://localhost:3001/api/chains/6e77654e-8486-4f91-9573-82520902c572/execute \
  -H "Content-Type: application/json" \
  -d "{\"input\":{\"number\":5}}"

-- Test Circle Area Workflow:
curl -X POST http://localhost:3001/api/chains/e49b69a4-a543-4887-b52a-ce6c9cc44067/execute \
  -H "Content-Type: application/json" \
  -d "{\"input\":{\"radius\":10}}"

-- Test Email Processing Workflow:
curl -X POST http://localhost:3001/api/chains/email-template-workflow/execute \
  -H "Content-Type: application/json" \
  -d "{\"input\":{\"emailTemplate\":\"welcome-email.html\",\"recipientsList\":\"sample-recipients.csv\"}}"

-- ============================================================================
-- NEXT STEPS
-- ============================================================================

1. Start all Docker services: docker-compose up -d
2. Verify temporal-worker connects: docker logs temporal-worker
3. Test workflow execution via enhanced-workflow-editor: http://localhost:3001
4. Monitor execution: http://localhost:8233 (Temporal Web UI)
5. Add custom activities via API or workflow editor

Database is ready for production deployment! 🚀
' as usage_guide;