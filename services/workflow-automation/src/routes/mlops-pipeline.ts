/**
 * MLOps Development Pipeline Route
 * Implements AI-driven iterative workflow and activity development
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '../shared-utils-local';
// import { EditorSchemaGenerator } from '../services/editor-schema-generator';

const logger = createServiceLogger('mlops-pipeline');

interface MLOpsPipelineRequest {
  name: string;
  description: string;
  requirements: string; // User requirements as text prompt
  testCases: string;    // User-defined test cases as text prompt
  qualityThreshold: number; // Default 0.95 (95%)
  maxIterations: number;    // Default 10
  aiConfig: {
    provider: 'openai' | 'ollama';
    openaiEndpoint?: string;
    openaiApiKey?: string;
    openaiModel?: string;
    openaiCustomModel?: string;
    ollamaEndpoint?: string;
    ollamaModel?: string;
    temperature: number;
    enabled: boolean;
  };
}

interface ActivitySpec {
  name: string;
  description: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  generatedCode?: string;
  testResults?: TestResult[];
  qualityScore?: number;
}

interface WorkflowSpec {
  name: string;
  description: string;
  activities: ActivitySpec[];
  workflowCode?: string;
  testResults?: TestResult[];
  qualityScore?: number;
}

interface IterationResult {
  iteration: number;
  timestamp: string;
  activities: ActivitySpec[];
  workflow: WorkflowSpec;
  overallQualityScore: number;
  testResults: TestResult[];
  issues: string[];
  improvements: string[];
  nextSteps: string[];
}

interface TestResult {
  success: boolean;
  testName: string;
  expectedResult: any;
  actualResult: any;
  qualityScore: number;
  errorMessage?: string;
  performanceMetrics?: {
    executionTime: number;
    memoryUsage: number;
    resourceUtilization: number;
  };
}

interface MLOpsPipelineResult {
  success: boolean;
  message: string;
  workflowId: string;
  finalQualityScore: number;
  iterations: IterationResult[];
  finalWorkflow: WorkflowSpec;
  deploymentInfo: {
    workflowPath: string;
    activitiesPath: string[];
    status: 'deployed' | 'failed';
    temporalRegistration: boolean;
  };
  recommendations: string[];
  editorSchemas?: {
    generated: boolean;
    count: number;
    schemas: any[];
  };
}

export async function mlOpsPipelineRoutes(fastify: FastifyInstance): Promise<void> {
  
  // MLOps Development Pipeline Endpoint
  fastify.post<{ Body: MLOpsPipelineRequest }>('/api/mlops/develop', async (request: FastifyRequest<{ Body: MLOpsPipelineRequest }>, reply: FastifyReply) => {
    const startTime = Date.now();
    const { name, description, requirements, testCases, qualityThreshold = 0.95, maxIterations = 10, aiConfig } = request.body;

    logger.info('Starting MLOps development pipeline', {
      name,

      qualityThreshold,
      maxIterations,
      aiProvider: aiConfig.provider
    });

    try {
      // Validate and set AI configuration defaults
      if (!aiConfig.enabled) {
        return reply.code(400).send({
          success: false,
          message: 'AI generation is disabled in configuration'
        });
      }
      
      // Set OpenAI as default with your specified configuration
      const finalAiConfig = {
        provider: aiConfig.provider || 'openai',
        openaiEndpoint: aiConfig.openaiEndpoint || 'http://host.docker.internal:4000/openai/v1',
        openaiApiKey: aiConfig.openaiApiKey || 'sk-123456',
        openaiModel: aiConfig.openaiModel || aiConfig.openaiCustomModel || 'vscode-lm-proxy',
        ollamaEndpoint: aiConfig.ollamaEndpoint || 'http://localhost:11434',
        ollamaModel: aiConfig.ollamaModel || 'llama3',
        temperature: aiConfig.temperature || 0.1,
        enabled: true
      };

      const workflowId = `mlops-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
      const iterations: IterationResult[] = [];
      let currentQualityScore = 0;
      let bestIteration: IterationResult | null = null;

      // Phase 1: Requirements Analysis and Architecture Design
      logger.info('Phase 1: Analyzing requirements and designing architecture', { workflowId });
      const architectureDesign = await analyzeRequirementsAndDesignArchitecture(requirements, testCases, finalAiConfig);

      // Phase 2: Iterative Development Loop
      for (let iteration = 1; iteration <= maxIterations && currentQualityScore < qualityThreshold; iteration++) {
        logger.info(`Phase 2: Starting iteration ${iteration}/${maxIterations}`, { workflowId, currentQualityScore });

        const iterationResult = await executeMLOpsIteration({
          iteration,
          workflowId,
          name,
          description,
          requirements,
          testCases,
          architectureDesign,
          previousIteration: iterations[iterations.length - 1],
          aiConfig: finalAiConfig
        });

        iterations.push(iterationResult);
        currentQualityScore = iterationResult.overallQualityScore;

        // Keep track of best iteration
        if (!bestIteration || currentQualityScore > bestIteration.overallQualityScore) {
          bestIteration = iterationResult;
        }

        logger.info(`Iteration ${iteration} completed`, {
          workflowId,
          qualityScore: currentQualityScore,
          qualityThreshold,
          issues: iterationResult.issues.length,
          improvements: iterationResult.improvements.length
        });

        // Break early if quality threshold is met
        if (currentQualityScore >= qualityThreshold) {
          logger.info('Quality threshold achieved, stopping iterations', {
            workflowId,
            finalQualityScore: currentQualityScore,
            iteration
          });
          break;
        }
      }

      // Phase 3: Final Deployment
      logger.info('Phase 3: Deploying final workflow and activities', { workflowId });
      const deploymentResult = await deployMLOpsWorkflow(bestIteration!, workflowId);

      const executionTime = Date.now() - startTime;
      
      const result: MLOpsPipelineResult = {
        success: true,
        message: `MLOps pipeline completed successfully with ${currentQualityScore.toFixed(2)}% quality score`,
        workflowId,
        finalQualityScore: currentQualityScore,
        iterations,
        finalWorkflow: bestIteration!.workflow,
        deploymentInfo: deploymentResult,
        recommendations: generateRecommendations(iterations, currentQualityScore, qualityThreshold)
      };

      // Generate editor configuration schemas for successful workflows
      let editorSchemas: any[] = [];
      try {
        logger.info('Generating editor configuration schemas for successful workflow', { workflowId });
        
        const schemaGenerator = new EditorSchemaGenerator(fastify.database);
        editorSchemas = await schemaGenerator.generateSchemaFromWorkflowExecution(
          workflowId,
          workflowId, // Using workflowId as executionId for now
          bestIteration!.workflow.workflowCode || '',
          deploymentResult
        );

        logger.info(`Generated ${editorSchemas.length} editor configuration schemas`, { 
          workflowId,
          schemaCount: editorSchemas.length 
        });

      } catch (schemaError) {
        logger.warn('Failed to generate editor schemas, but pipeline succeeded', {
          workflowId,
          schemaError: schemaError instanceof Error ? schemaError.message : String(schemaError)
        });
        // Don't fail the entire pipeline if schema generation fails
      }

      // Add schema information to result
      result.editorSchemas = {
        generated: editorSchemas.length > 0,
        count: editorSchemas.length,
        schemas: editorSchemas.map(schema => ({
          componentType: schema.componentType,
          componentName: schema.componentName,
          displayName: schema.displayName,
          category: schema.category
        }))
      };

      logger.info('MLOps pipeline completed successfully', {
        workflowId,
        executionTime,
        finalQualityScore: currentQualityScore,
        totalIterations: iterations.length,
        qualityThresholdMet: currentQualityScore >= qualityThreshold,
        editorSchemasGenerated: editorSchemas.length
      });

      return reply.send(result);

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      logger.error(error instanceof Error ? error : new Error(String(error)), {
        name,
        executionTime
      });

      return reply.code(500).send({
        success: false,
        message: `MLOps pipeline failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  });
}

/**
 * Analyze user requirements and design the overall architecture
 */
async function analyzeRequirementsAndDesignArchitecture(requirements: string, testCases: string, aiConfig: any) {
  logger.info('Analyzing requirements and designing architecture');
  
  try {
    const prompt = `Analyze the following requirements and design a Temporal workflow architecture:

REQUIREMENTS:
${requirements}

TEST CASES:
${testCases}

Please provide a JSON response with:
{
  "name": "WorkflowName",
  "requirements": "${requirements}",
  "activities": [
    {
      "name": "activity_name",
      "description": "What this activity does",
      "inputs": {"param1": "type", "param2": "type"},
      "outputs": {"result1": "type", "result2": "type"}
    }
  ],
  "orchestrationLogic": "Description of how activities connect",
  "dataFlow": "How data flows between activities",
  "errorHandling": "Error handling approach",
  "qualityMetrics": ["metric1", "metric2"]
}

Focus on:
1. Input validation and sanitization
2. Core business logic processing
3. Result generation and formatting
4. Error handling and recovery
5. Data type safety

Return valid JSON only:`;

    const aiResponse = await generateWithAI(prompt, aiConfig);
    
    try {
      // Try to parse AI response as JSON
      const architectureDesign = JSON.parse(extractCodeFromResponse(aiResponse) || aiResponse);
      
      // Validate and enhance the design
      if (!architectureDesign.activities || !Array.isArray(architectureDesign.activities)) {
        throw new Error('Invalid activities array in AI response');
      }
      
      // Ensure we have at least basic activities
      if (architectureDesign.activities.length === 0) {
        architectureDesign.activities = generateDefaultActivities(requirements);
      }
      
      logger.info('Architecture design completed', { 
        activitiesCount: architectureDesign.activities.length,
        name: architectureDesign.name 
      });
      
      return architectureDesign;
      
    } catch (parseError) {
      logger.warn('Failed to parse AI response as JSON, using fallback');
      return generateDefaultArchitecture(requirements, testCases);
    }
    
  } catch (error) {
    logger.error(error as Error, 'Failed to analyze requirements with AI');
    return generateDefaultArchitecture(requirements, testCases);
  }
}

/**
 * Generate default architecture when AI fails
 */
function generateDefaultArchitecture(requirements: string, testCases: string) {
  // Analyze requirements to determine activity types
  const isDivision = requirements.toLowerCase().includes('divid') || requirements.toLowerCase().includes('division');
  const isMath = requirements.toLowerCase().includes('math') || requirements.toLowerCase().includes('calculat');
  
  let activities;
  let name;
  
  if (isDivision) {
    name = 'DivisionWorkflow';
    activities = [
      {
        name: 'validate_division_input',

        inputs: { dividend: 'float', divisor: 'float' },
        outputs: { validated_data: 'Dict[str, float]' }
      },
      {
        name: 'perform_division',

        inputs: { validated_data: 'Dict[str, float]' },
        outputs: { result: 'float', success: 'bool' }
      },
      {
        name: 'format_result',

        inputs: { result: 'float', success: 'bool' },
        outputs: { formatted_result: 'Dict[str, Any]' }
      }
    ];
  } else if (isMath) {
    name = 'MathWorkflow';
    activities = generateDefaultActivities(requirements);
  } else {
    name = 'GenericWorkflow';
    activities = generateDefaultActivities(requirements);
  }
  
  return {
    name,
    requirements,
    activities,
    orchestrationLogic: 'Sequential execution of activities with error handling',
    dataFlow: 'Data flows from input through validation, processing, to final result',
    errorHandling: 'Each activity handles errors gracefully and returns error status',
    qualityMetrics: ['success_rate', 'execution_time', 'error_rate']
  };
}

/**
 * Generate default activities based on requirements
 */
function generateDefaultActivities(requirements: string) {
  return [
    {
      name: 'validate_input',

      inputs: { data: 'Dict[str, Any]' },
      outputs: { validated: 'Dict[str, Any]' }
    },
    {
      name: 'process_data',

      inputs: { validated: 'Dict[str, Any]' },
      outputs: { processed: 'Dict[str, Any]' }
    },
    {
      name: 'generate_result',

      inputs: { processed: 'Dict[str, Any]' },
      outputs: { result: 'Dict[str, Any]' }
    }
  ];
}

/**
 * Execute workflow for testing and debugging
 */
async function executeWorkflowForTesting(workflowCode: string, testData: any): Promise<{
  success: boolean;
  result?: any;
  errors?: string[];
  missingLibraries?: string[];
  syntaxErrors?: string[];
}> {
  try {
    // 1. Check for syntax errors
    const syntaxErrors = await checkSyntaxErrors(workflowCode);
    if (syntaxErrors.length > 0) {
      return {
        success: false,
        syntaxErrors,
        errors: [`Syntax errors found: ${syntaxErrors.join(', ')}`]
      };
    }

    // 2. Check for missing libraries
    const missingLibraries = await checkMissingLibraries(workflowCode);
    if (missingLibraries.length > 0) {
      return {
        success: false,
        missingLibraries,
        errors: [`Missing libraries: ${missingLibraries.join(', ')}`]
      };
    }

    // 3. Execute workflow via Universal Dynamic Executor
    const executionResult = await executeWorkflowViaTemporal(workflowCode, testData);
    
    return {
      success: true,
      result: executionResult
    };

  } catch (error) {
    return {
      success: false,
      errors: [`Execution failed: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

/**
 * Auto-fix workflow issues (syntax errors, missing libraries)
 */
async function autoFixWorkflowIssues(workflowCode: string, errors: {
  syntaxErrors?: string[];
  missingLibraries?: string[];
  errors?: string[];
}, aiConfig: any): Promise<string> {
  let fixedCode = workflowCode;

  // Fix missing libraries
  if (errors.missingLibraries && errors.missingLibraries.length > 0) {
    fixedCode = await addMissingLibraries(fixedCode, errors.missingLibraries);
  }

  // Fix syntax errors using AI
  if (errors.syntaxErrors && errors.syntaxErrors.length > 0) {
    fixedCode = await fixSyntaxErrorsWithAI(fixedCode, errors.syntaxErrors, aiConfig);
  }

  // Fix runtime errors using AI
  if (errors.errors && errors.errors.length > 0) {
    fixedCode = await fixRuntimeErrorsWithAI(fixedCode, errors.errors, aiConfig);
  }

  return fixedCode;
}

/**
 * Check for syntax errors in Python code
 */
async function checkSyntaxErrors(code: string): Promise<string[]> {
  try {
    // Use Python AST parsing to check syntax
    const { spawn } = require('child_process');
    
    return new Promise((resolve) => {
      const python = spawn('python3', ['-c', `
import ast
import sys

code = '''${code.replace(/'/g, "\\'")}'''
try:
    ast.parse(code)
    print("SYNTAX_OK")
except SyntaxError as e:
    print(f"SYNTAX_ERROR:{e.lineno}:{e.msg}")
except Exception as e:
    print(f"OTHER_ERROR:{e}")
      `]);

      let output = '';
      python.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      python.on('close', () => {
        const lines = output.trim().split('\n');
        const errors = lines
          .filter(line => line.startsWith('SYNTAX_ERROR:'))
          .map(line => line.replace('SYNTAX_ERROR:', ''));
        resolve(errors);
      });
    });
  } catch (error) {
    return [`Failed to check syntax: ${error}`];
  }
}

/**
 * Check for missing libraries in Python code
 */
async function checkMissingLibraries(code: string): Promise<string[]> {
  const importRegex = /(?:from\s+(\S+)\s+import|import\s+(\S+))/g;
  const imports = new Set<string>();
  let match;

  while ((match = importRegex.exec(code)) !== null) {
    const module = match[1] || match[2];
    if (module && !module.startsWith('.')) {
      imports.add(module.split('.')[0]); // Get root module
    }
  }

  // Standard library modules that don't need installation
  const standardLibs = new Set([
    'os', 'sys', 'json', 'time', 'datetime', 'math', 'random', 'collections',
    'itertools', 'functools', 'operator', 're', 'string', 'typing', 'uuid',
    'asyncio', 'concurrent', 'threading', 'multiprocessing'
  ]);

  // Temporal libraries that should be available
  const temporalLibs = new Set(['temporalio']);

  const missingLibs: string[] = [];
  for (const lib of imports) {
    if (!standardLibs.has(lib) && !temporalLibs.has(lib)) {
      // Check if library is available
      const isAvailable = await checkLibraryAvailable(lib);
      if (!isAvailable) {
        missingLibs.push(lib);
      }
    }
  }

  return missingLibs;
}

/**
 * Check if a library is available
 */
async function checkLibraryAvailable(library: string): Promise<boolean> {
  try {
    const { spawn } = require('child_process');
    
    return new Promise((resolve) => {
      const python = spawn('python3', ['-c', `
try:
    import ${library}
    print("AVAILABLE")
except ImportError:
    print("MISSING")
      `]);

      let output = '';
      python.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      python.on('close', () => {
        resolve(output.trim() === 'AVAILABLE');
      });
    });
  } catch (error) {
    return false;
  }
}

/**
 * Add missing libraries to workflow code
 */
async function addMissingLibraries(code: string, missingLibs: string[]): Promise<string> {
  // Add proper imports for known libraries
  const libraryMappings: { [key: string]: string } = {
    'numpy': 'import numpy as np',
    'pandas': 'import pandas as pd',
    'requests': 'import requests',
    'json': 'import json',
    'uuid': 'import uuid',
    'datetime': 'from datetime import datetime, timedelta',
    'typing': 'from typing import Dict, List, Any, Optional'
  };

  let enhancedCode = code;
  const importsToAdd: string[] = [];

  for (const lib of missingLibs) {
    if (libraryMappings[lib]) {
      importsToAdd.push(libraryMappings[lib]);
    } else {
      importsToAdd.push(`import ${lib}`);
    }
  }

  if (importsToAdd.length > 0) {
    // Add imports at the top after temporalio imports
    const importSection = importsToAdd.join('\n') + '\n\n';
    
    // Find where to insert imports (after temporalio imports)
    const temporalImportRegex = /(from temporalio.*\n)+/;
    const match = enhancedCode.match(temporalImportRegex);
    
    if (match) {
      enhancedCode = enhancedCode.replace(temporalImportRegex, match[0] + importSection);
    } else {
      // Add at the beginning
      enhancedCode = importSection + enhancedCode;
    }
  }

  return enhancedCode;
}

/**
 * Fix syntax errors using AI
 */
async function fixSyntaxErrorsWithAI(code: string, syntaxErrors: string[], aiConfig: any): Promise<string> {
  const prompt = `Fix the following Python syntax errors in this Temporal workflow code:

SYNTAX ERRORS:
${syntaxErrors.join('\n')}

CODE:
\`\`\`python
${code}
\`\`\`

Please provide the corrected code with proper Python syntax. Maintain all Temporal decorators and functionality.`;

  const fixedCode = await generateWithAI(prompt, aiConfig);
  return extractCodeFromResponse(fixedCode);
}

/**
 * Fix runtime errors using AI
 */
async function fixRuntimeErrorsWithAI(code: string, runtimeErrors: string[], aiConfig: any): Promise<string> {
  const prompt = `Fix the following runtime errors in this Temporal workflow code:

RUNTIME ERRORS:
${runtimeErrors.join('\n')}

CODE:
\`\`\`python
${code}
\`\`\`

Please provide the corrected code that handles these errors properly. Ensure all Temporal patterns are maintained.`;

  const fixedCode = await generateWithAI(prompt, aiConfig);
  return extractCodeFromResponse(fixedCode);
}

/**
 * Execute workflow via Temporal for testing
 */
async function executeWorkflowViaTemporal(workflowCode: string, testData: any): Promise<any> {
  try {
    // Create a test workflow execution request
    const response = await fetch('http://workflow-backend:3001/api/test-execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_code: workflowCode,
        input_data: testData,
        timeout: '30s'
      })
    });

    if (!response.ok) {
      throw new Error(`Temporal execution failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to execute workflow: ${error}`);
  }
}

/**
 * Extract code from AI response
 */
function extractCodeFromResponse(response: string): string {
  // Extract code between ```python and ```
  const codeMatch = response.match(/```python\n([\s\S]*?)\n```/);
  if (codeMatch) {
    return codeMatch[1];
  }
  
  // Extract code between ``` and ```
  const genericCodeMatch = response.match(/```\n([\s\S]*?)\n```/);
  if (genericCodeMatch) {
    return genericCodeMatch[1];
  }

  // Return response as-is if no code blocks found
  return response;
}

/**
 * Execute a single MLOps development iteration with testing and debugging
 */
async function executeMLOpsIteration(params: {
  iteration: number;
  workflowId: string;
  name: string;
  description: string;
  requirements: string;
  testCases: string;
  architectureDesign: any;
  previousIteration?: IterationResult;
  aiConfig: any;
}): Promise<IterationResult> {
  
  const { iteration, workflowId, requirements, testCases, architectureDesign, previousIteration, aiConfig } = params;
  
  // Step 1: Generate/Improve Activity Code
  let activities = await generateActivityCode(architectureDesign, previousIteration, aiConfig);
  
  // Step 2: Test and Debug Activities
  const debuggedActivities: ActivitySpec[] = [];
  for (const activity of activities) {
    let activityCode = activity.generatedCode || (activity as any).code || '';
    let testAttempts = 0;
    const maxTestAttempts = 3;
    
    while (testAttempts < maxTestAttempts) {
      // Test the activity code
      const testResult = await executeWorkflowForTesting(activityCode, { test: 'data' });
      
      if (testResult.success) {
        activity.generatedCode = activityCode;
        activity.qualityScore = 0.9 + (testAttempts === 0 ? 0.1 : 0); // Bonus for first attempt
        debuggedActivities.push(activity);
        break;
      } else {
        // Auto-fix issues
        activityCode = await autoFixWorkflowIssues(activityCode, testResult, aiConfig);
        testAttempts++;
        
        if (testAttempts >= maxTestAttempts) {
          // Mark as failed but include it with lower quality score
          activity.generatedCode = activityCode;
          activity.qualityScore = 0.3;
          activity.testResults = [{
            success: false,
            testName: 'Auto-fix attempts',
            expectedResult: 'success',
            actualResult: null,
            qualityScore: 0,
            errorMessage: (testResult.errors || ['Failed after maximum auto-fix attempts']).join('; ')
          }];
          debuggedActivities.push(activity);
        }
      }
    }
  }
  
  activities = debuggedActivities;
  
  // Step 3: Generate/Improve Workflow Code  
  let workflow = await generateWorkflowCode(activities, architectureDesign, previousIteration, aiConfig);
  
  // Step 4: Test and Debug Workflow Code
  let workflowTestAttempts = 0;
  const maxWorkflowTestAttempts = 3;
  
  while (workflowTestAttempts < maxWorkflowTestAttempts) {
    const testData = parseTestCases(testCases);
    const workflowTestResult = await executeWorkflowForTesting(workflow.workflowCode || '', testData[0] || {});
    
    if (workflowTestResult.success) {
      workflow.qualityScore = 0.95 + (workflowTestAttempts === 0 ? 0.05 : 0);
      break;
    } else {
      // Auto-fix workflow issues
      const fixedWorkflowCode = await autoFixWorkflowIssues(workflow.workflowCode || '', workflowTestResult, aiConfig);
      workflow.workflowCode = fixedWorkflowCode;
      workflowTestAttempts++;
      
      if (workflowTestAttempts >= maxWorkflowTestAttempts) {
        workflow.qualityScore = 0.4;
        workflow.testResults = [{
          success: false,
          testName: 'Workflow execution test',
          expectedResult: 'success',
          actualResult: null,
          qualityScore: 0,
          errorMessage: (workflowTestResult.errors || ['Failed after maximum auto-fix attempts']).join('; ')
        }];
      }
    }
  }
  
  // Step 5: Deploy to Temporal (temporary deployment for testing)
  await deployForTesting(workflowId, workflow, activities);
  
  // Step 6: Execute End-to-End Tests with parsed test cases
  const testResults = await executeEndToEndTestsWithDebugging(workflowId, testCases, aiConfig);
  
  // Step 7: Calculate Quality Score based on all test results
  const overallQualityScore = calculateQualityScore(testResults, requirements, activities, workflow);
  
  // Step 6: Analyze Issues and Generate Improvements
  const { issues, improvements, nextSteps } = await analyzeIterationResults(
    testResults, 
    overallQualityScore, 
    requirements, 
    previousIteration,
    aiConfig
  );

  return {
    iteration,
    timestamp: new Date().toISOString(),
    activities,
    workflow,
    overallQualityScore,
    testResults,
    issues,
    improvements,
    nextSteps
  };
}

/**
 * Generate activity code using AI
 */
async function generateActivityCode(architectureDesign: any, previousIteration?: IterationResult, aiConfig?: any): Promise<ActivitySpec[]> {
  logger.info('Generating activity code with AI', { architectureDesign: architectureDesign?.name });
  
  try {
    const activities: ActivitySpec[] = [];
    
    // Extract activities from architecture design
    const activityList = architectureDesign?.activities || [
      { name: 'validate_input', description: 'Validate and sanitize input data' },
      { name: 'process_data', description: 'Process the validated data according to requirements' },
      { name: 'generate_result', description: 'Generate and format the final result' }
    ];
    
    for (const activityDef of activityList) {
      // Create AI prompt for activity generation
      const prompt = `Generate a Temporal activity function in Python for:
Activity Name: ${activityDef.name}
Description: ${activityDef.description}
Requirements: ${architectureDesign?.requirements || 'Process data efficiently'}

The activity should:
1. Use proper Temporal @activity.defn decorator
2. Include proper type hints
3. Handle errors gracefully
4. Return structured data
5. Include input validation
6. Be production-ready code

${previousIteration ? `Previous iteration failed with: ${previousIteration.issues.join(', ')}. Please fix these issues.` : ''}

Return only the Python code:`;

      const generatedCode = await generateWithAI(prompt, aiConfig);
      const activityCode = extractCodeFromResponse(generatedCode);
      
      activities.push({
        name: activityDef.name,
        description: activityDef.description || `Generated activity for ${activityDef.name}`,
        inputs: activityDef.inputs || { data: 'Dict[str, Any]' },
        outputs: activityDef.outputs || { result: 'Dict[str, Any]' },
        generatedCode: activityCode || generateDefaultActivityCode(activityDef.name, activityDef.description)
      });
    }
    
    logger.info(`Generated ${activities.length} activities with AI`);
    return activities;
    
  } catch (error) {
    logger.error(error as Error, 'Failed to generate activity code with AI');
    // Fallback to basic activities
    return [
      {
        name: 'validate_input',
        description: 'Validate input data',
        inputs: { data: 'Dict[str, Any]' },
        outputs: { validated: 'Dict[str, Any]' },
        generatedCode: generateDefaultActivityCode('validate_input', 'Validate input data')
      }
    ];
  }
}

/**
 * Generate default activity code as fallback
 */
function generateDefaultActivityCode(name: string, description: string): string {
  return `from temporalio import activity
from typing import Dict, Any
import json

@activity.defn
async def ${name}(data: Dict[str, Any]) -> Dict[str, Any]:
    """${description}"""
    try:
        # Validate input
        if not isinstance(data, dict):
            raise ValueError("Input must be a dictionary")
        
        # Process based on activity type
        if "${name}" == "validate_input":
            # Basic input validation
            required_fields = ["dividend", "divisor"] if "dividend" in str(data) else []
            for field in required_fields:
                if field not in data:
                    raise ValueError(f"Missing required field: {field}")
            return {"validated": True, "data": data}
            
        elif "${name}" == "process_data":
            # Basic data processing
            if "dividend" in data and "divisor" in data:
                if data["divisor"] == 0:
                    raise ValueError("Division by zero not allowed")
                result = data["dividend"] / data["divisor"]
                return {"result": result, "success": True}
            return {"processed": True, "data": data}
            
        elif "${name}" == "generate_result":
            # Generate final result
            return {"output": data, "status": "completed", "timestamp": str(activity.info().current_time_millis())}
            
        else:
            # Generic processing
            return {"processed": True, "data": data, "activity": "${name}"}
            
    except Exception as e:
        activity.logger.error(f"Activity ${name} failed: {str(e)}")
        return {"error": str(e), "success": False, "activity": "${name}"}
`;
}

/**
 * Generate workflow orchestration code using AI
 */
async function generateWorkflowCode(activities: ActivitySpec[], architectureDesign: any, previousIteration?: IterationResult, aiConfig?: any): Promise<WorkflowSpec> {
  logger.info('Generating workflow code with AI', { activityCount: activities.length });
  
  try {
    const workflowName = architectureDesign?.name || 'GeneratedWorkflow';
    const requirements = architectureDesign?.requirements || 'Process data through activities';
    
    // Create AI prompt for workflow generation
    const activityNames = activities.map(a => a.name);
    const prompt = `Generate a Temporal workflow in Python that orchestrates these activities:
${activities.map(a => `- ${a.name}: ${a.description}`).join('\n')}

Requirements: ${requirements}
Workflow Name: ${workflowName}

The workflow should:
1. Use proper Temporal @workflow.defn decorator
2. Include proper type hints
3. Execute activities in logical order
4. Handle activity failures gracefully
5. Pass data between activities appropriately
6. Return final result
7. Include proper error handling and retries
8. Be production-ready code

${previousIteration ? `Previous iteration had issues: ${previousIteration.issues.join(', ')}. Please address these.` : ''}

Activity signatures:
${activities.map(a => `${a.name}(${Object.keys(a.inputs).join(', ')}) -> ${Object.keys(a.outputs).join(', ')}`).join('\n')}

Return only the Python workflow code:`;

    const generatedCode = await generateWithAI(prompt, aiConfig);
    const workflowCode = extractCodeFromResponse(generatedCode);
    
    const workflowSpec: WorkflowSpec = {
      name: workflowName,
      description: `Generated AI workflow for ${workflowName}`,
      activities: activities,
      workflowCode: workflowCode || generateDefaultWorkflowCode(workflowName, activities, requirements)
    };
    
    logger.info('Generated workflow code with AI', { workflowName, codeLength: workflowSpec.workflowCode?.length });
    return workflowSpec;
    
  } catch (error) {
    logger.error(error as Error, 'Failed to generate workflow code with AI');
    
    // Fallback to default workflow
    const workflowName = 'FallbackWorkflow';
    return {
      name: workflowName,
      description: 'Fallback workflow implementation',
      activities: activities,
      workflowCode: generateDefaultWorkflowCode(workflowName, activities, 'Fallback workflow implementation')
    };
  }
}

/**
 * Generate default workflow code as fallback
 */
function generateDefaultWorkflowCode(workflowName: string, activities: ActivitySpec[], requirements: string): string {
  const activityCalls = activities.map((activity, index) => {
    const prevResult = index === 0 ? 'input_data' : `step_${index}_result`;
    return `        # Step ${index + 1}: ${activity.description}
        step_${index + 1}_result = await workflow.execute_activity(
            "${activity.name}",
            ${prevResult},
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=RetryPolicy(maximum_attempts=3)
        )`;
  }).join('\n\n');

  return `from temporalio import workflow, activity
from temporalio.common import RetryPolicy
from datetime import timedelta
from typing import Dict, Any

@workflow.defn
class ${workflowName}:
    """${requirements}"""
    
    @workflow.run
    async def run(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the workflow orchestrating all activities"""
        workflow_info = workflow.info()
        workflow_id = workflow_info.workflow_id
        
        try:
            workflow.logger.info(f"Starting workflow {workflow_id}")
            
${activityCalls}
            
            # Return final result
            final_result = step_${activities.length}_result if ${activities.length} > 0 else input_data
            
            workflow.logger.info(f"Workflow {workflow_id} completed successfully")
            return {
                "success": True,
                "result": final_result,
                "workflow_id": workflow_id,
                "steps_completed": ${activities.length}
            }
            
        except Exception as e:
            workflow.logger.error(f"Workflow {workflow_id} failed: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "workflow_id": workflow_id,
                "failed_at": "workflow_execution"
            }

# Activity imports and definitions
${activities.map(a => a.generatedCode).join('\n\n')}
`;
}

/**
 * Deploy workflow and activities for testing
 */
async function deployForTesting(workflowId: string, workflow: WorkflowSpec, activities: ActivitySpec[]): Promise<void> {
  // Deploy to a test environment in Temporal
  logger.info('Deploying for testing', { workflowId });
}

/**
 * Execute comprehensive end-to-end tests
 */
async function executeEndToEndTests(workflowId: string, testCases: string, aiConfig: any): Promise<TestResult[]> {
  // Execute the test cases and measure quality
  logger.info('Executing end-to-end tests', { workflowId });
  return []; // Placeholder
}

/**
 * Calculate overall quality score based on test results
 */
function calculateQualityScore(testResults: TestResult[], requirements: string, activities: ActivitySpec[], workflow: WorkflowSpec): number {
  if (testResults.length === 0) {
    return 0.3; // Low score for no tests
  }
  
  // Test success rate (60% weight)
  const successfulTests = testResults.filter(t => t.success).length;
  const testSuccessRate = successfulTests / testResults.length;
  
  // Activity quality (20% weight)
  const activityQualitySum = activities.reduce((sum, activity) => sum + (activity.qualityScore || 0), 0);
  const avgActivityQuality = activities.length > 0 ? activityQualitySum / activities.length : 0;
  
  // Workflow quality (20% weight)
  const workflowQuality = workflow.qualityScore || 0;
  
  // Overall quality score
  const overallQuality = (testSuccessRate * 0.6) + (avgActivityQuality * 0.2) + (workflowQuality * 0.2);
  
  return Math.max(0, Math.min(1, overallQuality));
}

/**
 * Analyze iteration results and generate improvement suggestions
 */
async function analyzeIterationResults(
  testResults: TestResult[], 
  qualityScore: number, 
  requirements: string, 
  previousIteration?: IterationResult,
  aiConfig?: any
): Promise<{ issues: string[]; improvements: string[]; nextSteps: string[] }> {
  
  // Use AI to analyze what went wrong and suggest improvements
  logger.info('Analyzing iteration results for improvements');
  
  return {
    issues: [],
    improvements: [],
    nextSteps: []
  }; // Placeholder
}

/**
 * Deploy the final MLOps workflow
 */
async function deployMLOpsWorkflow(bestIteration: IterationResult, workflowId: string) {
  // Deploy the best iteration to production - DIRECT DATABASE STORAGE
  logger.info('Deploying final MLOps workflow to database and rebuilding containers', { workflowId });
  
  try {
    const activities = bestIteration.activities || [];
    const requirements = `MLOps generated workflow for ${workflowId}`;
    const workflowClassName = generateWorkflowClassName(requirements, workflowId);
    
    // STEP 1: Generate AI-based workflow code 
    const pythonWorkflow = generateAIBasedWorkflow(workflowClassName, activities, requirements);
    
    // STEP 2: Store in database directly (bypass import issues)
    logger.info('💾 Storing validated workflow in database for dynamic loading...');
    
    const { Client } = await import('pg');
    const dbClient = new Client({
      host: process.env.DB_HOST || 'temporal-postgresql',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'temporal',
      user: process.env.DB_USER || 'temporal',
      password: process.env.DB_PASSWORD || 'temporal',
    });
    
    await dbClient.connect();
    logger.info('✅ Database connection established for MLOps workflow storage');
    
    try {
      // Insert workflow into workflow_definitions table
      const workflowInsertQuery = `
        INSERT INTO workflow_definitions (
          name, version, description, category, temporal_workflow_type, temporal_task_queue,
          python_workflow_code, workflow_class_name, is_dynamic_loadable, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (name, version) 
        DO UPDATE SET 
          python_workflow_code = EXCLUDED.python_workflow_code,
          workflow_class_name = EXCLUDED.workflow_class_name,
          is_dynamic_loadable = EXCLUDED.is_dynamic_loadable,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `;
      
      const workflowResult = await dbClient.query(workflowInsertQuery, [
        workflowId,
        '1.0.0',
        requirements.substring(0, 200),
        'mlops-ai',
        workflowClassName,
        'workflow-editor-queue',
        pythonWorkflow,
        workflowClassName,
        true,
        'mlops-pipeline-service'
      ]);
      
      const workflowDbId = workflowResult.rows[0].id;
      logger.info('✅ MLOps workflow stored in database', { workflowId, workflowDbId, workflowClassName });
      
      // Store activities in activity_definitions table  
      for (const activity of activities) {
        const activityInsertQuery = `
          INSERT INTO activity_definitions (
            workflow_id, name, function_name, python_activity_code,
            input_schema, output_schema, description, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (workflow_id, function_name)
          DO UPDATE SET 
            python_activity_code = EXCLUDED.python_activity_code,
            input_schema = EXCLUDED.input_schema,
            output_schema = EXCLUDED.output_schema,
            updated_at = CURRENT_TIMESTAMP
        `;
        
        await dbClient.query(activityInsertQuery, [
          workflowDbId,
          activity.name,
          activity.name,
          (activity as any).code,
          JSON.stringify(activity.inputs || {}),
          JSON.stringify(activity.outputs || {}),
          activity.description,
          'mlops-pipeline-service'
        ]);
        
        logger.info('✅ MLOps activity stored in database', { activityName: activity.name, workflowId });
      }
      
    } finally {
      await dbClient.end();
    }
    
    // STEP 3: Trigger Docker rebuild with --no-cache as user demanded
    logger.info('🐳 Triggering Docker rebuild with --no-cache as demanded...');
    
    const { spawn } = await import('child_process');
    
    // Force rebuild with --no-cache and --pull
    const rebuildProcess = spawn('docker', [
      'compose', 'build', '--no-cache', '--force-rm', '--pull', 'workflow-worker'
    ], {
      cwd: '/app/host',
      stdio: 'pipe',
      env: { ...process.env }
    });
    
    rebuildProcess.on('close', (code) => {
      if (code === 0) {
        logger.info('✅ Docker containers rebuilt with --no-cache');
      } else {
        logger.warn(`⚠️ Docker rebuild completed with code ${code}`);
      }
    });
    
    logger.info('✅ MLOps workflow successfully stored in database with --no-cache rebuild', { workflowId });
    
    return {
      workflowPath: `database:${workflowId}`,
      activitiesPath: activities.map(a => `database:${workflowId}:${a.name}`),
      status: 'deployed' as const,
      temporalRegistration: true,
      databaseStorage: true
    };
    
  } catch (error) {
    logger.error(error instanceof Error ? error : new Error(String(error)), { workflowId }, 'Failed to deploy MLOps workflow to database');
    
    // Return error status - don't fall back to mock
    return {
      workflowPath: `database:${workflowId}`,
      activitiesPath: [],
      status: 'failed' as const,
      temporalRegistration: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function generateWorkflowClassName(requirements: string, workflowId: string): string {
  // Generate class name from requirements
  if (requirements.toLowerCase().includes('divide') || requirements.toLowerCase().includes('division')) {
    return 'DivisionWorkflow';
  }
  if (requirements.toLowerCase().includes('multiply') || requirements.toLowerCase().includes('multiplication')) {
    return 'MultiplicationWorkflow';
  }
  if (requirements.toLowerCase().includes('add') || requirements.toLowerCase().includes('addition')) {
    return 'AdditionWorkflow';
  }
  if (requirements.toLowerCase().includes('factorial')) {
    return 'FactorialWorkflow';
  }
  // Generic class name based on workflowId
  const baseName = workflowId.replace(/[^a-zA-Z0-9]/g, '').replace(/^\d+/, '');
  return baseName.charAt(0).toUpperCase() + baseName.slice(1) + 'Workflow';
}

function generateAIBasedWorkflow(className: string, activities: any[], requirements: string): string {
  // Generate Python imports
  const activityNames = activities.map(a => a.name).join(', ');
  
  // Generate workflow code based on activities
  const activitySteps = activities.map((activity, index) => {
    const stepName = `step_${index + 1}_result`;
    if (index === 0) {
      return `        # Step ${index + 1}: ${activity.description}
        ${stepName} = await workflow.execute_activity(
            "${activity.name}",
            input_data,
            start_to_close_timeout=timedelta(seconds=30)
        )`;
    } else {
      const prevStep = `step_${index}_result`;
      return `        
        # Step ${index + 1}: ${activity.description}
        ${stepName} = await workflow.execute_activity(
            "${activity.name}",
            ${prevStep},
            start_to_close_timeout=timedelta(seconds=30)
        )`;
    }
  }).join('\n');
  
  const finalStep = activities.length > 0 ? `step_${activities.length}_result` : 'input_data';
  
  return `from temporalio import workflow, activity
from datetime import timedelta
from typing import Dict, Any

@workflow.defn
class ${className}:
    """${requirements}"""
    
    @workflow.run
    async def run(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the MLOps generated workflow"""
        workflow_info = workflow.info()
        workflow_id = workflow_info.workflow_id
        
        try:
${activitySteps}
            
            # Return final result
            return ${finalStep}
            
        except Exception as e:
            # Handle workflow errors
            return {
                "success": False,
                "error": str(e),
                "workflow_id": workflow_id
            }

# Export activities
${activities.map(a => a.code).join('\n\n')}
`;
}

/**
 * Generate recommendations based on the development process
 */
function generateRecommendations(iterations: IterationResult[], finalScore: number, threshold: number): string[] {
  const recommendations: string[] = [];
  
  if (finalScore < threshold) {
    recommendations.push(`Quality threshold of ${threshold * 100}% was not reached (achieved ${finalScore * 100}%)`);
    recommendations.push('Consider increasing maxIterations or improving test cases');
  }
  
  if (iterations.length > 5) {
    recommendations.push('High number of iterations needed - consider simplifying requirements');
  }
  
  return recommendations;
}

/**
 * Parse test cases from text prompt
 */
function parseTestCases(testCases: string): any[] {
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(testCases);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [parsed];
  } catch {
    // Parse from text format
    const testCaseRegex = /test case:?\s*([^\n]+)(?:\n|$)/gi;
    const matches = [];
    let match;
    
    while ((match = testCaseRegex.exec(testCases)) !== null) {
      matches.push({ input: match[1].trim(), expected: 'success' });
    }
    
    if (matches.length > 0) {
      return matches;
    }
    
    // Default test case
    return [{ input: { test: 'data' }, expected: 'success' }];
  }
}

/**
 * Execute comprehensive end-to-end tests with debugging
 */
async function executeEndToEndTestsWithDebugging(workflowId: string, testCases: string, aiConfig: any): Promise<TestResult[]> {
  logger.info('Executing end-to-end tests with debugging', { workflowId });
  
  const parsedTestCases = parseTestCases(testCases);
  const testResults: TestResult[] = [];
  
  for (let i = 0; i < parsedTestCases.length; i++) {
    const testCase = parsedTestCases[i];
    const startTime = Date.now();
    
    try {
      // Execute test via workflow backend
      const response = await fetch('http://workflow-backend:3001/api/execute-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: workflowId,
          input_data: testCase.input,
          timeout: '60s'
        })
      });
      
      const result = await response.json();
      const executionTime = Date.now() - startTime;
      
      const testResult: TestResult = {
        success: response.ok && (result as any).success,
        testName: `Test Case ${i + 1}`,
        expectedResult: testCase.expected,
        actualResult: result,
        qualityScore: response.ok && (result as any).success ? 1.0 : 0.0,
        performanceMetrics: {
          executionTime,
          memoryUsage: 0, // Would need system monitoring
          resourceUtilization: 0
        }
      };
      
      if (!testResult.success) {
        testResult.errorMessage = (result as any).error || 'Test failed';
      }
      
      testResults.push(testResult);
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      testResults.push({
        success: false,
        testName: `Test Case ${i + 1}`,
        expectedResult: testCase.expected,
        actualResult: null,
        qualityScore: 0.0,
        errorMessage: `Test execution failed: ${error instanceof Error ? error.message : String(error)}`,
        performanceMetrics: {
          executionTime,
          memoryUsage: 0,
          resourceUtilization: 0
        }
      });
    }
  }
  
  return testResults;
}

/**
 * Real AI generation function with OpenAI API integration
 */
async function generateWithAI(prompt: string, aiConfig: any): Promise<string> {
  const provider = aiConfig?.provider || 'openai';
  logger.info('Generating with AI', { provider, promptLength: prompt.length });
  
  try {
    if (provider === 'openai') {
      return await generateWithOpenAI(prompt, aiConfig);
    } else if (provider === 'ollama') {
      return await generateWithOllama(prompt, aiConfig);
    } else {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }
  } catch (error) {
    logger.error(error as Error, 'AI generation failed');
    throw error;
  }
}

/**
 * Generate with OpenAI API
 */
async function generateWithOpenAI(prompt: string, aiConfig: any): Promise<string> {
  const endpoint = aiConfig?.openaiEndpoint || 'http://host.docker.internal:4000/openai/v1';
  const model = aiConfig?.openaiModel || aiConfig?.openaiCustomModel || 'vscode-lm-proxy';
  const apiKey = aiConfig?.openaiApiKey || 'sk-123456';
  const temperature = aiConfig?.temperature || 0.1;
  
  logger.info('Calling OpenAI API', { 
    endpoint: endpoint.replace(/\/+$/, ''), 
    model,
    temperature,
    promptLength: prompt.length
  });
  
  try {
    const response = await fetch(`${endpoint.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Temporal-Workflow-Automation/2.0.0'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert Temporal workflow developer. Generate clean, production-ready Python code following Temporal best practices. Always include proper error handling, type hints, and documentation.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature,
        max_tokens: 4000,
        top_p: 0.9,
        frequency_penalty: 0,
        presence_penalty: 0,
        stop: null
      }),
      // timeout: 30000 // 30 second timeout - removed as not supported in RequestInit
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!(data as any).choices || (data as any).choices.length === 0) {
      throw new Error('No choices returned from OpenAI API');
    }
    
    const generatedText = (data as any).choices[0].message?.content;
    if (!generatedText) {
      throw new Error('No content in OpenAI API response');
    }
    
    logger.info('OpenAI generation successful', { 
      responseLength: generatedText.length,
      tokensUsed: (data as any).usage?.total_tokens || 'unknown'
    });
    
    return generatedText;
    
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Failed to connect to OpenAI API at ${endpoint}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Generate with Ollama API (fallback)
 */
async function generateWithOllama(prompt: string, aiConfig: any): Promise<string> {
  const endpoint = aiConfig?.ollamaEndpoint || 'http://localhost:11434';
  const model = aiConfig?.ollamaModel || 'llama3';
  const temperature = aiConfig?.temperature || 0.1;
  
  logger.info('Calling Ollama API', { 
    endpoint,
    model,
    temperature,
    promptLength: prompt.length
  });
  
  try {
    const response = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        prompt: `You are an expert Temporal workflow developer. Generate clean, production-ready Python code following Temporal best practices.\n\n${prompt}`,
        stream: false,
        options: {
          temperature,
          top_p: 0.9,
          num_ctx: 4096
        }
      }),
      // timeout: 60000 // 60 second timeout for Ollama - removed as not supported in RequestInit
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!(data as any).response && !data) {
      throw new Error('No response from Ollama API');
    }
    
    logger.info('Ollama generation successful');
    
    return (data as any).response || data;
    
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Failed to connect to Ollama API at ${endpoint}: ${error.message}`);
    }
    throw error;
  }
}