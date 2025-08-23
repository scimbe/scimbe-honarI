-- Insert sample workflow to fix the "advancedcircleareacalculatorWorkflow" error
-- This will create the missing workflow definition in the database

INSERT INTO workflow_definitions (
    id,
    name,
    version,
    description,
    category,
    workflow_class_name,
    task_queue,
    python_workflow_code,
    visual_definition,
    form_schema,
    status,
    quality_score,
    source_type,
    created_by,
    tags,
    created_at,
    updated_at
) VALUES (
    'advancedcircleareacalculatorWorkflow'::uuid,
    'mlops-advanced-circle-area-calculator-1755544321188',
    '1.0.0',
    'Advanced Circle Area Calculator with MLOps integration',
    'data',
    'advancedcircleareacalculatorWorkflow',
    'workflow-editor-queue',
    '# Advanced Circle Area Calculator Workflow
import math
from temporalio import workflow, activity
from temporalio.common import RetryPolicy
from datetime import timedelta

@workflow.defn(name="advancedcircleareacalculatorWorkflow")
class AdvancedCircleAreaCalculatorWorkflow:
    """Advanced Circle Area Calculator with error handling and validation."""
    
    @workflow.run
    async def run(self, input_data: dict) -> dict:
        """Execute the circle area calculation workflow."""
        
        try:
            # Extract radius from input
            radius = input_data.get("radius", 1.0)
            
            if not isinstance(radius, (int, float)):
                raise ValueError("Radius must be a number")
                
            if radius <= 0:
                raise ValueError("Radius must be positive")
            
            # Calculate area using π * r²
            area = math.pi * radius * radius
            circumference = 2 * math.pi * radius
            diameter = 2 * radius
            
            # Return comprehensive results
            result = {
                "success": True,
                "radius": radius,
                "area": area,
                "circumference": circumference,
                "diameter": diameter,
                "formula": "π × r²",
                "calculation": f"π × {radius}² = {area:.6f}",
                "metadata": {
                    "workflow_name": "advancedcircleareacalculatorWorkflow",
                    "calculation_type": "circle_geometry",
                    "precision": "double",
                    "units": "square_units"
                }
            }
            
            return result
            
        except Exception as error:
            return {
                "success": False,
                "error": str(error),
                "input_data": input_data,
                "error_type": type(error).__name__
            }
',
    '{
        "type": "workflow",
        "name": "Circle Area Calculator",
        "description": "Calculate area, circumference, and diameter of a circle",
        "inputs": [
            {
                "name": "radius",
                "type": "number",
                "required": true,
                "validation": {
                    "min": 0.1,
                    "max": 10000
                }
            }
        ],
        "outputs": [
            {
                "name": "area",
                "type": "number",
                "description": "Area of the circle"
            },
            {
                "name": "circumference", 
                "type": "number",
                "description": "Circumference of the circle"
            },
            {
                "name": "diameter",
                "type": "number", 
                "description": "Diameter of the circle"
            }
        ]
    }',
    '{
        "type": "object",
        "properties": {
            "radius": {
                "type": "number",
                "title": "Circle Radius",
                "description": "Enter the radius of the circle",
                "minimum": 0.1,
                "maximum": 10000,
                "default": 1.0
            }
        },
        "required": ["radius"]
    }',
    'active',
    0.95,
    'mlops-direct',
    'system',
    '{"calculator", "geometry", "math", "mlops", "advanced"}',
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    python_workflow_code = EXCLUDED.python_workflow_code,
    visual_definition = EXCLUDED.visual_definition,
    form_schema = EXCLUDED.form_schema,
    updated_at = NOW();

-- Insert additional sample workflows for comprehensive testing
INSERT INTO workflow_definitions (
    id,
    name,
    version,
    description,
    category,
    workflow_class_name,
    task_queue,
    python_workflow_code,
    visual_definition,
    form_schema,
    status,
    quality_score,
    source_type,
    created_by,
    tags,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    'simple-data-processor',
    '1.0.0',
    'Simple data processing workflow for testing',
    'data',
    'SimpleDataProcessorWorkflow',
    'workflow-editor-queue',
    '# Simple Data Processor Workflow
from temporalio import workflow

@workflow.defn
class SimpleDataProcessorWorkflow:
    @workflow.run
    async def run(self, data: dict) -> dict:
        return {
            "success": True,
            "processed_data": data,
            "record_count": len(data) if isinstance(data, dict) else 1
        }
',
    '{"type": "workflow", "name": "Simple Data Processor"}',
    '{"type": "object", "properties": {"data": {"type": "object"}}}',
    'active',
    0.85,
    'manual',
    'system', 
    '{"data", "processing", "simple"}',
    NOW(),
    NOW()
),
(
    gen_random_uuid(),
    'ai-text-analyzer',
    '1.0.0', 
    'AI-powered text analysis workflow',
    'ai',
    'AITextAnalyzerWorkflow',
    'workflow-editor-queue',
    '# AI Text Analyzer Workflow
from temporalio import workflow

@workflow.defn
class AITextAnalyzerWorkflow:
    @workflow.run
    async def run(self, text_data: dict) -> dict:
        text = text_data.get("text", "")
        return {
            "success": True,
            "original_text": text,
            "word_count": len(text.split()),
            "character_count": len(text),
            "analysis": "Sample AI analysis results"
        }
',
    '{"type": "workflow", "name": "AI Text Analyzer"}',
    '{"type": "object", "properties": {"text": {"type": "string"}}}',
    'active',
    0.90,
    'ai-generated',
    'system',
    '{"ai", "text", "analysis", "nlp"}',
    NOW(),
    NOW()
) ON CONFLICT (name) DO NOTHING;

-- Update the workflow execution count for the circle calculator
UPDATE workflow_definitions 
SET execution_count = 0, last_executed_at = NULL 
WHERE workflow_class_name = 'advancedcircleareacalculatorWorkflow';