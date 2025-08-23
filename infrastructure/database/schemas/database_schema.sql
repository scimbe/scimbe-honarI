-- Database Schema for Dynamic Temporal Worker Management
-- This allows workers to load workflows and activities dynamically from PostgreSQL

-- Table to store workflow definitions
CREATE TABLE IF NOT EXISTS workflows (
    id SERIAL PRIMARY KEY,
    workflow_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    class_name VARCHAR(255) NOT NULL,
    description TEXT,
    python_code TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1
);

-- Table to store activity definitions
CREATE TABLE IF NOT EXISTS activities (
    id SERIAL PRIMARY KEY,
    activity_id VARCHAR(255) UNIQUE NOT NULL,
    workflow_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    function_name VARCHAR(255) NOT NULL,
    description TEXT,
    python_code TEXT NOT NULL,
    inputs JSONB,
    outputs JSONB,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workflow_id) REFERENCES workflows(workflow_id) ON DELETE CASCADE
);

-- Table to store worker configurations
CREATE TABLE IF NOT EXISTS worker_configs (
    id SERIAL PRIMARY KEY,
    worker_name VARCHAR(255) NOT NULL,
    task_queue VARCHAR(255) NOT NULL,
    enabled_workflows TEXT[], -- Array of workflow_ids
    enabled_activities TEXT[], -- Array of activity_ids
    config JSONB,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table to track workflow executions
CREATE TABLE IF NOT EXISTS workflow_executions (
    id SERIAL PRIMARY KEY,
    execution_id VARCHAR(255) UNIQUE NOT NULL,
    workflow_id VARCHAR(255) NOT NULL,
    input_data JSONB,
    output_data JSONB,
    status VARCHAR(50),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    FOREIGN KEY (workflow_id) REFERENCES workflows(workflow_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_class_name ON workflows(class_name);
CREATE INDEX IF NOT EXISTS idx_activities_workflow_id ON activities(workflow_id);
CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
CREATE INDEX IF NOT EXISTS idx_worker_configs_status ON worker_configs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);

-- Insert default workflows (CircleAreaWorkflow, FactorialWorkflow, etc.)
INSERT INTO workflows (workflow_id, name, class_name, description, python_code) VALUES
('circle-area-default', 'CircleAreaWorkflow', 'CircleAreaWorkflow', 'Calculate circle area using π × r²', '
@workflow.defn
class CircleAreaWorkflow:
    @workflow.run
    async def run(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        radius = input_data.get("radius", 5.0)
        
        # Validate radius
        validation = await workflow.execute_activity(
            validate_radius_activity,
            radius,
            start_to_close_timeout=timedelta(minutes=2)
        )
        
        if not validation["valid"]:
            raise workflow.ApplicationError(f"Validation failed: {validation[''error'']}")
        
        # Calculate area
        calculation_result = await workflow.execute_activity(
            calculate_circle_area_activity,
            validation["radius"],
            start_to_close_timeout=timedelta(minutes=2)
        )
        
        # Format result
        final_result = await workflow.execute_activity(
            format_result_activity,
            calculation_result,
            start_to_close_timeout=timedelta(minutes=1)
        )
        
        return final_result
'),

('factorial-default', 'FactorialWorkflow', 'FactorialWorkflow', 'Calculate factorial of a number', '
@workflow.defn
class FactorialWorkflow:
    @workflow.run
    async def run(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        number = input_data.get("number", 5)
        
        # Validate input
        validation = await workflow.execute_activity(
            validate_factorial_input_activity,
            number,
            start_to_close_timeout=timedelta(minutes=1)
        )
        
        if not validation["valid"]:
            return {"success": False, "error": validation["error"]}
        
        # Calculate factorial
        calculation_result = await workflow.execute_activity(
            calculate_factorial_activity,
            validation["number"],
            start_to_close_timeout=timedelta(minutes=2)
        )
        
        # Format result
        final_result = await workflow.execute_activity(
            format_factorial_result_activity,
            calculation_result,
            start_to_close_timeout=timedelta(minutes=1)
        )
        
        return final_result
');

-- Insert default activities
INSERT INTO activities (activity_id, workflow_id, name, function_name, description, python_code, inputs, outputs) VALUES
('validate-radius', 'circle-area-default', 'Validate Radius', 'validate_radius_activity', 'Validates radius input', '
@activity.defn
async def validate_radius_activity(radius: float) -> Dict[str, Any]:
    if not isinstance(radius, (int, float)) or math.isnan(radius):
        return {"valid": False, "radius": radius, "error": "Radius must be a valid number"}
    
    if radius <= 0:
        return {"valid": False, "radius": radius, "error": "Radius must be positive"}
    
    return {"valid": True, "radius": radius}
', '{"radius": "float"}', '{"valid": "boolean", "radius": "float", "error": "string"}'),

('calculate-circle-area', 'circle-area-default', 'Calculate Circle Area', 'calculate_circle_area_activity', 'Calculates circle area', '
@activity.defn
async def calculate_circle_area_activity(radius: float) -> Dict[str, Any]:
    area_exact = math.pi * radius * radius
    area = round(area_exact, 6)
    
    return {
        "radius": radius,
        "area": area,
        "area_exact": area_exact,
        "formula": "π × r²",
        "pi_value": math.pi,
        "calculation": f"{math.pi} × {radius}² = {area_exact}"
    }
', '{"radius": "float"}', '{"radius": "float", "area": "float", "area_exact": "float", "formula": "string"}');

-- Create default worker configuration
INSERT INTO worker_configs (worker_name, task_queue, enabled_workflows, enabled_activities, config) VALUES
('default-worker', 'workflow-editor-queue', 
 ARRAY['circle-area-default', 'factorial-default'], 
 ARRAY['validate-radius', 'calculate-circle-area'],
 '{"max_concurrent_activities": 100, "max_concurrent_workflows": 100}'
);