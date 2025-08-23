/**
 * Editor Schema Generator Service
 * Generates drag-and-drop editor configuration schemas from successful workflow executions
 */

import { createServiceLogger } from '../shared-utils-local';
import { AutomationDatabase } from '../database/connection';

const logger = createServiceLogger('editor-schema-generator');

export interface WorkflowAnalysis {
  workflowName: string;
  activities: ActivityAnalysis[];
  inputParameters: ParameterSpec[];
  outputParameters: ParameterSpec[];
  dependencies: string[];
  complexity: number;
  executionTime: number;
}

export interface ActivityAnalysis {
  name: string;
  type: string;
  description: string;
  inputs: ParameterSpec[];
  outputs: ParameterSpec[];
  configuration: Record<string, any>;
  executionTime: number;
}

export interface ParameterSpec {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: any;
  enum?: any[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    format?: string;
  };
}

export interface EditorConfigurationSchema {
  schemaId?: string;
  componentType: 'activity' | 'workflow' | 'connector' | 'trigger';
  componentName: string;
  displayName: string;
  description: string;
  category: string;
  icon: string;
  configurationSchema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
  uiSchema: Record<string, any>;
  inputPorts: PortSpec[];
  outputPorts: PortSpec[];
  properties: {
    complexity: number;
    executionTime: number;
    successRate: number;
    dependencies: string[];
  };
}

export interface PortSpec {
  id: string;
  name: string;
  type: string;
  description: string;
  required: boolean;
  multiple: boolean;
}

export class EditorSchemaGenerator {
  constructor(private database: AutomationDatabase) {}

  /**
   * Generate editor configuration schemas from successful workflow execution
   */
  async generateSchemaFromWorkflowExecution(
    workflowId: string,
    executionId: string,
    workflowCode: string,
    executionResult: any
  ): Promise<EditorConfigurationSchema[]> {
    logger.info('Generating editor schemas for workflow ' + workflowId + ', execution ' + executionId);

    try {
      // Analyze the workflow code and execution results
      const analysis = await this.analyzeWorkflow(workflowCode, executionResult);
      
      const schemas: EditorConfigurationSchema[] = [];

      // Generate schema for the main workflow
      const workflowSchema = await this.generateWorkflowSchema(
        workflowId,
        executionId,
        analysis
      );
      schemas.push(workflowSchema);

      // Generate schemas for individual activities
      for (const activity of analysis.activities) {
        const activitySchema = await this.generateActivitySchema(
          workflowId,
          executionId,
          activity,
          analysis
        );
        schemas.push(activitySchema);
      }

      // Save schemas to database
      for (const schema of schemas) {
        await this.saveSchemaToDatabase(workflowId, executionId, schema);
      }

      logger.info('Generated ' + schemas.length + ' editor configuration schemas for workflow ' + workflowId);
      return schemas;

    } catch (error) {
      logger.error(error as Error, 'Failed to generate editor schemas for workflow ' + workflowId);
      throw error;
    }
  }

  /**
   * Analyze workflow code and extract component information
   */
  private async analyzeWorkflow(
    workflowCode: string,
    executionResult: any
  ): Promise<WorkflowAnalysis> {
    logger.info('Analyzing workflow code for schema generation');

    // Extract workflow name
    const workflowNameMatch = workflowCode.match(/export\s+async\s+function\s+(\w+)/);
    const workflowName = workflowNameMatch ? workflowNameMatch[1] : 'UnknownWorkflow';

    // Extract activities from workflow code
    const activities = this.extractActivities(workflowCode);
    
    // Extract input/output parameters
    const inputParameters = this.extractInputParameters(workflowCode);
    const outputParameters = this.extractOutputParameters(workflowCode, executionResult);
    
    // Extract dependencies
    const dependencies = this.extractDependencies(workflowCode);
    
    // Calculate complexity score
    const complexity = this.calculateComplexity(workflowCode, activities);
    
    // Get execution time from result
    const executionTime = executionResult?.execution_time_ms || 0;

    return {
      workflowName,
      activities,
      inputParameters,
      outputParameters,
      dependencies,
      complexity,
      executionTime
    };
  }

  /**
   * Extract activities from workflow code
   */
  private extractActivities(workflowCode: string): ActivityAnalysis[] {
    const activities: ActivityAnalysis[] = [];
    
    // Find all activity calls in the workflow
    const activityMatches = workflowCode.matchAll(/await\s+(\w+)\(\{([^}]*)\}\)/g);
    
    for (const match of activityMatches) {
      const activityName = match[1];
      const parametersStr = match[2];
      
      // Parse parameters
      const inputs = this.parseActivityParameters(parametersStr);
      
      activities.push({
        name: activityName,
        type: this.determineActivityType(activityName),
        description: this.generateActivityDescription(activityName),
        inputs,
        outputs: this.inferActivityOutputs(activityName),
        configuration: {},
        executionTime: 1000 // Default estimate
      });
    }

    return activities;
  }

  /**
   * Generate workflow-level configuration schema
   */
  private async generateWorkflowSchema(
    workflowId: string,
    executionId: string,
    analysis: WorkflowAnalysis
  ): Promise<EditorConfigurationSchema> {
    return {
      componentType: 'workflow',
      componentName: analysis.workflowName,
      displayName: this.formatDisplayName(analysis.workflowName),
      description: 'Workflow component for ' + analysis.workflowName,
      category: this.determineCategory(analysis.workflowName),
      icon: this.determineIcon(analysis.workflowName),
      configurationSchema: {
        type: 'object',
        properties: this.generateConfigurationProperties(analysis.inputParameters),
        required: analysis.inputParameters.filter(p => p.required).map(p => p.name)
      },
      uiSchema: this.generateUISchema(analysis.inputParameters),
      inputPorts: this.generateInputPorts(analysis.inputParameters),
      outputPorts: this.generateOutputPorts(analysis.outputParameters),
      properties: {
        complexity: analysis.complexity,
        executionTime: analysis.executionTime,
        successRate: 1.0, // Will be updated based on usage
        dependencies: analysis.dependencies
      }
    };
  }

  /**
   * Generate activity-level configuration schema
   */
  private async generateActivitySchema(
    workflowId: string,
    executionId: string,
    activity: ActivityAnalysis,
    workflowAnalysis: WorkflowAnalysis
  ): Promise<EditorConfigurationSchema> {
    return {
      componentType: 'activity',
      componentName: activity.name,
      displayName: this.formatDisplayName(activity.name),
      description: activity.description,
      category: this.determineActivityCategory(activity.type),
      icon: this.determineActivityIcon(activity.type),
      configurationSchema: {
        type: 'object',
        properties: this.generateConfigurationProperties(activity.inputs),
        required: activity.inputs.filter(p => p.required).map(p => p.name)
      },
      uiSchema: this.generateUISchema(activity.inputs),
      inputPorts: this.generateInputPorts(activity.inputs),
      outputPorts: this.generateOutputPorts(activity.outputs),
      properties: {
        complexity: Math.ceil(workflowAnalysis.complexity / workflowAnalysis.activities.length),
        executionTime: activity.executionTime,
        successRate: 1.0,
        dependencies: []
      }
    };
  }

  /**
   * Save schema to database
   */
  private async saveSchemaToDatabase(
    workflowId: string,
    executionId: string,
    schema: EditorConfigurationSchema
  ): Promise<void> {
    try {
      // Insert editor configuration schema
      const schemaResult = await this.database.query(`
        INSERT INTO editor_configuration_schemas (
          workflow_id, execution_id, component_type, component_name,
          display_name, description, category, icon,
          configuration_schema, ui_schema, input_ports, output_ports,
          properties, temporal_workflow_class
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING schema_id
      `, [
        workflowId,
        executionId,
        schema.componentType,
        schema.componentName,
        schema.displayName,
        schema.description,
        schema.category,
        schema.icon,
        JSON.stringify(schema.configurationSchema),
        JSON.stringify(schema.uiSchema),
        JSON.stringify(schema.inputPorts),
        JSON.stringify(schema.outputPorts),
        JSON.stringify(schema.properties),
        schema.componentName
      ]);

      const schemaId = schemaResult.rows[0].schema_id;

      // Insert workflow editor component
      await this.database.query(`
        INSERT INTO workflow_editor_components (
          schema_id, component_group, component_name, display_name,
          description, icon, complexity_level, dependencies
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        schemaId,
        schema.category,
        schema.componentName,
        schema.displayName,
        schema.description,
        schema.icon,
        schema.properties.complexity,
        schema.properties.dependencies
      ]);

      logger.info('Saved editor configuration schema for ' + schema.componentName + ' (' + schema.componentType + ')');

    } catch (error) {
      logger.error(error as Error, 'Failed to save schema for ' + schema.componentName);
      throw error;
    }
  }

  // Helper methods for code analysis and schema generation

  private extractInputParameters(workflowCode: string): ParameterSpec[] {
    // Extract parameters from function signature
    const functionMatch = workflowCode.match(/async\s+function\s+\w+\(([^)]*)\)/);
    if (!functionMatch) return [];

    const paramStr = functionMatch[1];
    const paramMatch = paramStr.match(/(\w+):\s*\{([^}]*)\}/);
    if (!paramMatch) return [];

    // Parse parameter properties
    const properties = paramMatch[2];
    const propMatches = properties.matchAll(/(\w+):\s*([^;,]+)/g);
    
    const parameters: ParameterSpec[] = [];
    for (const match of propMatches) {
      parameters.push({
        name: match[1],
        type: this.mapTypeScriptType(match[2]),
        description: 'Input parameter: ' + match[1],
        required: true
      });
    }

    return parameters;
  }

  private extractOutputParameters(workflowCode: string, executionResult: any): ParameterSpec[] {
    const parameters: ParameterSpec[] = [];

    // Extract return type from result
    if (executionResult && typeof executionResult === 'object') {
      for (const [key, value] of Object.entries(executionResult)) {
        if (key !== 'execution_time_ms') {
          parameters.push({
            name: key,
            type: typeof value as any,
            description: 'Output parameter: ' + key,
            required: false
          });
        }
      }
    }

    return parameters;
  }

  private extractDependencies(workflowCode: string): string[] {
    const dependencies: string[] = [];
    
    // Extract imports
    const importMatches = workflowCode.matchAll(/import\s+.*from\s+['"]([^'"]+)['"]/g);
    for (const match of importMatches) {
      dependencies.push(match[1]);
    }

    return dependencies;
  }

  private parseActivityParameters(parametersStr: string): ParameterSpec[] {
    const parameters: ParameterSpec[] = [];
    const paramMatches = parametersStr.matchAll(/(\w+):\s*([^,]+)/g);

    for (const match of paramMatches) {
      parameters.push({
        name: match[1],
        type: 'string', // Default type
        description: 'Parameter: ' + match[1],
        required: true
      });
    }

    return parameters;
  }

  private determineActivityType(activityName: string): string {
    if (activityName.toLowerCase().includes('payment')) return 'payment';
    if (activityName.toLowerCase().includes('inventory')) return 'inventory';
    if (activityName.toLowerCase().includes('notification')) return 'communication';
    if (activityName.toLowerCase().includes('shipment')) return 'logistics';
    if (activityName.toLowerCase().includes('data')) return 'data-processing';
    if (activityName.toLowerCase().includes('validate')) return 'validation';
    return 'general';
  }

  private generateActivityDescription(activityName: string): string {
    return 'Activity: ' + this.formatDisplayName(activityName);
  }

  private inferActivityOutputs(activityName: string): ParameterSpec[] {
    // Basic output inference based on activity type
    const outputs: ParameterSpec[] = [
      {
        name: 'success',
        type: 'boolean',
        description: 'Indicates if the activity completed successfully',
        required: true
      }
    ];

    if (activityName.toLowerCase().includes('payment')) {
      outputs.push({
        name: 'transactionId',
        type: 'string',
        description: 'Payment transaction ID',
        required: false
      });
    }

    return outputs;
  }

  private calculateComplexity(workflowCode: string, activities: ActivityAnalysis[]): number {
    let complexity = 1;
    
    // Add complexity for each activity
    complexity += activities.length;
    
    // Add complexity for control structures
    const controlStructures = (workflowCode.match(/if|for|while|try|catch/g) || []).length;
    complexity += controlStructures;
    
    // Add complexity for async operations
    const asyncOps = (workflowCode.match(/await/g) || []).length;
    complexity += Math.ceil(asyncOps / 2);
    
    return Math.min(complexity, 10); // Cap at 10
  }

  private generateConfigurationProperties(parameters: ParameterSpec[]): Record<string, any> {
    const properties: Record<string, any> = {};
    
    for (const param of parameters) {
      properties[param.name] = {
        type: param.type,
        description: param.description,
        ...(param.default !== undefined && { default: param.default }),
        ...(param.enum && { enum: param.enum }),
        ...(param.validation && param.validation)
      };
    }

    return properties;
  }

  private generateUISchema(parameters: ParameterSpec[]): Record<string, any> {
    const uiSchema: Record<string, any> = {};
    
    for (const param of parameters) {
      if (param.type === 'string' && param.validation?.format) {
        uiSchema[param.name] = {
          'ui:widget': param.validation.format === 'email' ? 'email' : 'text'
        };
      } else if (param.type === 'boolean') {
        uiSchema[param.name] = {
          'ui:widget': 'checkbox'
        };
      } else if (param.enum) {
        uiSchema[param.name] = {
          'ui:widget': 'select'
        };
      }
    }

    return uiSchema;
  }

  private generateInputPorts(parameters: ParameterSpec[]): PortSpec[] {
    return parameters.map(param => ({
      id: param.name,
      name: this.formatDisplayName(param.name),
      type: param.type,
      description: param.description,
      required: param.required,
      multiple: param.type === 'array'
    }));
  }

  private generateOutputPorts(parameters: ParameterSpec[]): PortSpec[] {
    return parameters.map(param => ({
      id: param.name,
      name: this.formatDisplayName(param.name),
      type: param.type,
      description: param.description,
      required: param.required,
      multiple: param.type === 'array'
    }));
  }

  private formatDisplayName(name: string): string {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  private determineCategory(workflowName: string): string {
    const name = workflowName.toLowerCase();
    if (name.includes('ecommerce') || name.includes('order')) return 'E-Commerce';
    if (name.includes('data') || name.includes('processing')) return 'Data Processing';
    if (name.includes('notification') || name.includes('communication')) return 'Communication';
    if (name.includes('payment') || name.includes('financial')) return 'Finance';
    return 'General';
  }

  private determineActivityCategory(activityType: string): string {
    const categoryMap: Record<string, string> = {
      'payment': 'Finance',
      'inventory': 'Inventory',
      'communication': 'Communication',
      'logistics': 'Logistics',
      'data-processing': 'Data Processing',
      'validation': 'Validation',
      'general': 'General'
    };
    return categoryMap[activityType] || 'General';
  }

  private determineIcon(workflowName: string): string {
    const name = workflowName.toLowerCase();
    if (name.includes('ecommerce') || name.includes('order')) return 'shopping-cart';
    if (name.includes('data') || name.includes('processing')) return 'database';
    if (name.includes('notification')) return 'bell';
    if (name.includes('payment')) return 'credit-card';
    return 'workflow';
  }

  private determineActivityIcon(activityType: string): string {
    const iconMap: Record<string, string> = {
      'payment': 'credit-card',
      'inventory': 'package',
      'communication': 'mail',
      'logistics': 'truck',
      'data-processing': 'database',
      'validation': 'check-circle',
      'general': 'cog'
    };
    return iconMap[activityType] || 'cog';
  }

  private mapTypeScriptType(tsType: string): ParameterSpec['type'] {
    const cleanType = tsType.trim().toLowerCase();
    if (cleanType.includes('string')) return 'string';
    if (cleanType.includes('number')) return 'number';
    if (cleanType.includes('boolean')) return 'boolean';
    if (cleanType.includes('array') || cleanType.includes('[]')) return 'array';
    if (cleanType.includes('object') || cleanType.includes('{')) return 'object';
    return 'string';
  }
}