/**
 * Workflow Importer - Imports generated workflows into the main workflow_chains table
 * This ensures generated workflows appear in the editors
 */

import { Client } from 'pg';
import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('workflow-importer');

export class WorkflowImporter {
  private targetDb: Client;

  constructor() {
    // Connect to the temporal database where editors expect workflows
    this.targetDb = new Client({
      host: process.env.POSTGRES_HOST || 'postgres',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: 'temporal', // The database the editors use
      user: process.env.POSTGRES_USER || 'temporal',
      password: process.env.POSTGRES_PASSWORD || 'temporal'
    });
  }

  async connect(): Promise<void> {
    await this.targetDb.connect();
    logger.info('Connected to temporal database for workflow import');
  }

  async importGeneratedWorkflow(data: {
    workflowId: string;
    requirements: string;
    temporalWorkflowClass: string;
    qualityScore: number;
    targetLanguage: string;
  }): Promise<void> {
    try {
      const chainId = `chain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create nodes and edges for the workflow
      const nodes = [
        {
          id: 'start_node',
          type: 'start',
          position: { x: 100, y: 200 },
          data: {
            label: 'Start',
            description: 'Workflow start'
          }
        },
        {
          id: 'main_activity',
          type: 'activity',
          position: { x: 300, y: 200 },
          data: {
            label: data.temporalWorkflowClass || 'Generated Activity',
            description: data.requirements,
            activityType: 'custom',
            config: {
              generated: true,
              sourceWorkflowId: data.workflowId,
              qualityScore: data.qualityScore,
              language: data.targetLanguage
            }
          }
        },
        {
          id: 'end_node',
          type: 'end',
          position: { x: 500, y: 200 },
          data: {
            label: 'End',
            description: 'Workflow end'
          }
        }
      ];
      
      const edges = [
        {
          id: 'edge_start_main',
          source: 'start_node',
          target: 'main_activity',
          type: 'default'
        },
        {
          id: 'edge_main_end',
          source: 'main_activity',
          target: 'end_node',
          type: 'default'
        }
      ];

      // Insert into workflow_chains table in temporal database
      await this.targetDb.query(`
        INSERT INTO workflow_chains (
          id, name, description, execution_mode, chain_definition,
          workflows, data_mapping, communication_patterns, metadata, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        chainId,
        data.temporalWorkflowClass || 'Generated Workflow',
        `Generated workflow: ${data.requirements}`,
        'sequential',
        JSON.stringify({ nodes, edges }),
        JSON.stringify([]),
        JSON.stringify({}),
        JSON.stringify({}),
        JSON.stringify({
          sourceWorkflowId: data.workflowId,
          qualityScore: data.qualityScore,
          targetLanguage: data.targetLanguage,
          generated: true,
          generatedAt: new Date().toISOString()
        }),
        'workflow_automation'
      ]);

      logger.info({ chainId, workflowId: data.workflowId }, 'Workflow imported to editors database');
    } catch (error) {
      logger.error(error as Error, 'Failed to import workflow to editors database');
      // Don't throw - let the workflow generation continue even if import fails
    }
  }

  async disconnect(): Promise<void> {
    await this.targetDb.end();
  }
}

export default WorkflowImporter;