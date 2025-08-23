# Workflow Generation Scripts

This directory contains scripts for generating workflows using the workflow automation API.

## Scripts

### 1. `generate_circle_area_workflow.js`

**Purpose**: Generates a workflow for calculating the area of a circle using the workflow automation API.

**Usage**:
```bash
node generate_circle_area_workflow.js
```

**What it does**:
- Sends a POST request to `http://localhost:8092/workflow-automation/api/workflows/generate`
- Requests generation of a "Circle Area Calculator" workflow
- Includes proper input/output specifications and mathematical requirements
- Returns workflow generation status

**Payload Structure**:
```json
{
  "name": "Circle Area Calculator",
  "description": "Calculate the area of a circle given its radius using the formula π × r²",
  "requirements": "Accept radius as input parameter. Validate that radius is a positive number. Calculate area using formula: π × radius². Return the calculated area with appropriate precision. Handle edge cases like zero or negative radius.",
  "inputs": [
    {
      "name": "radius",
      "type": "number",
      "description": "The radius of the circle in units",
      "required": true,
      "validation": "Must be a positive number greater than 0"
    }
  ],
  "outputs": [
    {
      "name": "area",
      "type": "number", 
      "description": "The calculated area of the circle",
      "format": "Decimal number with 4 decimal places"
    },
    {
      "name": "formula_used",
      "type": "string",
      "description": "The mathematical formula used for calculation"
    }
  ],
  "complexity": "simple",
  "domain": "mathematics",
  "tags": ["geometry", "circle", "area", "calculation", "math"]
}
```

### 2. `check_generated_workflows.js`

**Purpose**: Tests various API endpoints to find ways to retrieve generated workflow details.

**Usage**:
```bash
node check_generated_workflows.js
```

**What it does**:
- Tests multiple potential API endpoints for retrieving workflow data
- Reports which endpoints are available vs. returning 404
- Helps identify the correct API structure for workflow retrieval

## Test Results

### Successful Workflow Generation

✅ **Generation Request**: Successfully sent workflow generation request
✅ **API Response**: Received 200 OK response with `{"status": "completed", "iterations": 1, "success": true}`
✅ **Backend Processing**: Logs show successful completion:
- Workflow ID: `c0a60a8b-2f59-4982-869e-9e0af9777ae4`
- Execution ID: `f3522260-9fc8-4b0d-afd8-08dc9585e6b7`
- Status: `completed`
- Quality Score: `1`
- Artifacts Generated: `4`
- Execution Time: `8436ms`

### API Endpoint Discovery

❌ **Retrieval Challenge**: No obvious GET endpoints found for retrieving generated workflows
✅ **Health Check**: `/health` endpoint works and shows service is healthy
❌ **Database Issue**: `/workflow-automation/api/executions/{id}` returns 500 error due to missing table `workflow_generation_executions`

## Conclusions

1. **Workflow Generation Works**: The API successfully processes workflow generation requests and creates workflows with artifacts
2. **Retrieval API Missing**: No clear endpoints available for retrieving the generated workflow details
3. **Database Schema**: The workflow automation service may need additional database tables for storing/retrieving generated workflows
4. **Processing Complete**: The backend shows complete processing with quality scoring and artifact generation

## Next Steps

To fully utilize the generated workflows, the following would be helpful:

1. **Add Retrieval Endpoints**: Implement GET endpoints for accessing generated workflows
2. **Database Schema**: Ensure proper tables exist for persisting generated workflow data
3. **File System Access**: If workflows are stored as files, provide endpoints to access generated artifacts
4. **Integration**: Connect generated workflows to the main workflow editor for visualization and execution

## Technical Details

- **API Base URL**: `http://localhost:8092`
- **Generation Endpoint**: `/workflow-automation/api/workflows/generate` (POST)
- **Service Health**: `/health` (GET)
- **Framework**: Fastify with rate limiting and CORS support
- **Database**: PostgreSQL with Redis caching
- **Background Processing**: Temporal workflow engine for async generation