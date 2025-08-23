#!/usr/bin/env node

/**
 * Enhanced script to generate a multi-activity workflow that demonstrates parameter sharing
 * This workflow will have multiple activities that pass data through Redis
 */

const https = require('http');

// Enhanced workflow with multiple activities for parameter demonstration
const workflowRequest = {
  name: "Enhanced Circle Calculator with Parameter Sharing",
  description: "Multi-activity workflow: validates input, calculates circle area, perimeter, and generates summary report. Each activity stores its results in Redis for the next activity to use.",
  requirements: `
    This workflow must have exactly 4 activities that execute in sequence:
    1. Input Validation Activity - Validates the radius and stores it in Redis
    2. Area Calculation Activity - Reads radius from Redis, calculates area, stores result
    3. Perimeter Calculation Activity - Reads radius from Redis, calculates perimeter, stores result  
    4. Summary Report Activity - Reads all previous results from Redis and generates final report
    
    Each activity MUST store its results using the parameter management system.
    Each activity MUST be able to read parameters from previous activities.
    The workflow MUST demonstrate the full parameter sharing capability.
  `,
  inputs: [
    {
      name: "radius",
      type: "number",
      description: "The radius of the circle in units",
      required: true,
      validation: "Must be a positive number greater than 0"
    },
    {
      name: "unit",
      type: "string",
      description: "The unit of measurement (e.g., cm, m, ft)",
      required: false,
      default: "units"
    }
  ],
  outputs: [
    {
      name: "area",
      type: "number",
      description: "The calculated area of the circle"
    },
    {
      name: "perimeter",
      type: "number",
      description: "The calculated perimeter of the circle"
    },
    {
      name: "diameter",
      type: "number",
      description: "The calculated diameter of the circle"
    },
    {
      name: "summary_report",
      type: "object",
      description: "Complete summary with all calculations and metadata"
    },
    {
      name: "execution_log",
      type: "array",
      description: "Log of all activities executed with their results"
    }
  ],
  activities: [
    {
      name: "validate_input",
      type: "validation",
      description: "Validates input radius and prepares for calculation",
      code: `
        // Activity 1: Input Validation
        if (!input.radius || typeof input.radius !== 'number') {
          throw new Error('Invalid radius: must be a number');
        }
        if (input.radius <= 0) {
          throw new Error('Invalid radius: must be greater than 0');
        }
        
        const validated = {
          radius: input.radius,
          unit: input.unit || 'units',
          validated_at: new Date().toISOString(),
          validation_status: 'success'
        };
        
        // Store in Redis for next activities
        await storeActivityParameter(sessionId, workflowId, 'validated_radius', 'validate_input', validated.radius);
        await storeActivityParameter(sessionId, workflowId, 'unit', 'validate_input', validated.unit);
        
        return validated;
      `
    },
    {
      name: "calculate_area",
      type: "calculation",
      description: "Calculates the area of the circle using validated radius",
      code: `
        // Activity 2: Area Calculation
        // Read validated radius from Redis
        const radius = await resolveParameter(sessionId, workflowId, 'validated_radius');
        const unit = await resolveParameter(sessionId, workflowId, 'unit');
        
        const area = Math.PI * Math.pow(radius, 2);
        const roundedArea = Math.round(area * 10000) / 10000;
        
        const result = {
          area: roundedArea,
          formula: 'π × r²',
          calculation: \`π × \${radius}² = \${roundedArea} \${unit}²\`,
          calculated_at: new Date().toISOString()
        };
        
        // Store area result for next activities
        await storeActivityParameter(sessionId, workflowId, 'calculated_area', 'calculate_area', roundedArea);
        await storeActivityParameter(sessionId, workflowId, 'area_details', 'calculate_area', result);
        
        return result;
      `
    },
    {
      name: "calculate_perimeter",
      type: "calculation",
      description: "Calculates the perimeter and diameter using radius",
      code: `
        // Activity 3: Perimeter and Diameter Calculation
        // Read validated radius from Redis
        const radius = await resolveParameter(sessionId, workflowId, 'validated_radius');
        const unit = await resolveParameter(sessionId, workflowId, 'unit');
        
        const perimeter = 2 * Math.PI * radius;
        const diameter = 2 * radius;
        const roundedPerimeter = Math.round(perimeter * 10000) / 10000;
        
        const result = {
          perimeter: roundedPerimeter,
          diameter: diameter,
          formula_perimeter: '2 × π × r',
          formula_diameter: '2 × r',
          calculation_perimeter: \`2 × π × \${radius} = \${roundedPerimeter} \${unit}\`,
          calculation_diameter: \`2 × \${radius} = \${diameter} \${unit}\`,
          calculated_at: new Date().toISOString()
        };
        
        // Store results for final summary
        await storeActivityParameter(sessionId, workflowId, 'calculated_perimeter', 'calculate_perimeter', roundedPerimeter);
        await storeActivityParameter(sessionId, workflowId, 'calculated_diameter', 'calculate_perimeter', diameter);
        await storeActivityParameter(sessionId, workflowId, 'perimeter_details', 'calculate_perimeter', result);
        
        return result;
      `
    },
    {
      name: "generate_summary",
      type: "aggregation",
      description: "Generates comprehensive summary report from all previous activities",
      code: `
        // Activity 4: Summary Report Generation
        // Read all previous results from Redis
        const radius = await resolveParameter(sessionId, workflowId, 'validated_radius');
        const unit = await resolveParameter(sessionId, workflowId, 'unit');
        const area = await resolveParameter(sessionId, workflowId, 'calculated_area');
        const perimeter = await resolveParameter(sessionId, workflowId, 'calculated_perimeter');
        const diameter = await resolveParameter(sessionId, workflowId, 'calculated_diameter');
        const areaDetails = await resolveParameter(sessionId, workflowId, 'area_details');
        const perimeterDetails = await resolveParameter(sessionId, workflowId, 'perimeter_details');
        
        const summary = {
          input: {
            radius: radius,
            unit: unit
          },
          calculations: {
            area: area,
            perimeter: perimeter,
            diameter: diameter
          },
          formulas: {
            area: 'π × r²',
            perimeter: '2 × π × r',
            diameter: '2 × r'
          },
          detailed_results: {
            area: areaDetails,
            perimeter: perimeterDetails
          },
          metadata: {
            workflow_id: workflowId,
            session_id: sessionId,
            total_activities: 4,
            completed_at: new Date().toISOString(),
            execution_log: [
              'Activity 1: Input validation - SUCCESS',
              'Activity 2: Area calculation - SUCCESS',
              'Activity 3: Perimeter calculation - SUCCESS',
              'Activity 4: Summary generation - SUCCESS'
            ]
          }
        };
        
        // Store final summary
        await storeActivityParameter(sessionId, workflowId, 'final_summary', 'generate_summary', summary);
        
        return summary;
      `
    }
  ],
  complexity: "medium",
  domain: "mathematics",
  tags: ["geometry", "circle", "area", "perimeter", "calculation", "multi-activity", "parameter-sharing", "redis"]
};

// Function to make the HTTP request
function generateWorkflow() {
  const postData = JSON.stringify(workflowRequest);
  
  const options = {
    hostname: 'localhost',
    port: 8092,
    path: '/workflow-automation/api/workflows/generate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  console.log('🚀 Requesting enhanced multi-activity workflow generation...');
  console.log('📍 URL:', `http://${options.hostname}:${options.port}${options.path}`);
  console.log('\n📊 Workflow Activities:');
  console.log('  1️⃣  Input Validation - Validates radius and stores in Redis');
  console.log('  2️⃣  Area Calculation - Reads radius from Redis, calculates area');
  console.log('  3️⃣  Perimeter Calculation - Reads radius from Redis, calculates perimeter');
  console.log('  4️⃣  Summary Generation - Reads all results and generates report');
  console.log('\n⏳ Sending request...\n');

  const req = https.request(options, (res) => {
    console.log(`📡 Response Status: ${res.statusCode}`);
    
    let responseData = '';
    
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      try {
        const response = JSON.parse(responseData);
        
        if (res.statusCode === 200 || res.statusCode === 201) {
          console.log('✅ SUCCESS: Multi-activity workflow generated successfully!');
          console.log('');
          
          if (response.workflow) {
            console.log('🔍 Workflow Summary:');
            console.log(`  📝 Name: ${response.workflow.name || 'N/A'}`);
            console.log(`  🆔 ID: ${response.workflow.id || 'N/A'}`);
            console.log(`  📊 Activities: ${response.workflow.activities?.length || 0}`);
            console.log(`  🔗 Parameter Sharing: Enabled via Redis`);
            
            if (response.workflow.activities) {
              console.log('\n📋 Activity Sequence:');
              response.workflow.activities.forEach((activity, index) => {
                console.log(`  ${index + 1}. ${activity.name} - ${activity.type}`);
              });
            }
            
            console.log('\n💾 Full Response saved to: multi_activity_workflow_response.json');
            require('fs').writeFileSync('multi_activity_workflow_response.json', JSON.stringify(response, null, 2));
          }
        } else {
          console.log('❌ ERROR: Failed to generate workflow');
          console.log('Response:', response);
        }
      } catch (error) {
        console.log('❌ ERROR: Failed to parse response JSON');
        console.log('Raw response:', responseData);
      }
    });
  });

  req.on('error', (error) => {
    console.log('❌ REQUEST ERROR:', error.message);
    console.log('');
    console.log('💡 Troubleshooting tips:');
    console.log('  1. Ensure Docker containers are running: docker-compose ps');
    console.log('  2. Check if workflow-automation service is accessible: curl http://localhost:8092/health');
    console.log('  3. Check Redis connection: docker exec -it redis redis-cli ping');
  });

  req.write(postData);
  req.end();
}

// Execute the script
if (require.main === module) {
  console.log('🔄 Enhanced Multi-Activity Workflow Generator');
  console.log('============================================');
  console.log('This workflow demonstrates parameter sharing between activities via Redis\n');
  generateWorkflow();
}

module.exports = { generateWorkflow, workflowRequest };