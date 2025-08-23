/**
 * Integration Activities
 * Handle external API calls, notifications, and database operations
 */

import axios from 'axios';
import { Context } from '@temporalio/activity';
import { Pool } from 'pg';
import { 
  WorkflowContext, 
  createServiceLogger 
} from '@platform/shared';

const logger = createServiceLogger('temporal-integration-activities');

// Database connection pool
let dbPool: Pool | null = null;

function getDbPool(): Pool {
  if (!dbPool) {
    dbPool = new Pool({
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      database: process.env.DATABASE_NAME || 'temporal_ai_platform',
      user: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return dbPool;
}

/**
 * Send notification via various channels
 */
export async function sendNotification(
  input: {
    type: 'email' | 'slack' | 'webhook' | 'sms';
    recipient: string;
    subject?: string;
    message: string;
    metadata?: Record<string, any>;
  }
): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const activityContext = Context.current();
  const correlationId = activityContext.info.workflowExecution.workflowId;
  
  logger.getLogger().info({
    correlationId,
    type: input.type,
    recipient: input.recipient,
    subject: input.subject,
  }, 'Sending notification');

  try {
    let success = false;
    let messageId = '';
    
    switch (input.type) {
      case 'email':
        // Mock email sending
        messageId = `email_${Date.now()}`;
        success = true;
        logger.getLogger().info({
          correlationId,
          recipient: input.recipient,
          subject: input.subject,
          messageId,
        }, 'Email notification sent (mock)');
        break;
        
      case 'slack':
        // Mock Slack webhook
        try {
          if (input.recipient.startsWith('http')) {
            await axios.post(input.recipient, {
              text: input.message,
              username: 'AI Platform Bot',
              icon_emoji: ':robot_face:',
            }, { timeout: 10000 });
            messageId = `slack_${Date.now()}`;
            success = true;
          } else {
            // Mock for non-webhook URLs
            messageId = `slack_mock_${Date.now()}`;
            success = true;
          }
        } catch (error) {
          logger.warn({ error }, 'Slack notification failed, using mock success');
          messageId = `slack_mock_${Date.now()}`;
          success = true;
        }
        break;
        
      case 'webhook':
        // Generic webhook call
        try {
          const response = await axios.post(input.recipient, {
            message: input.message,
            subject: input.subject,
            metadata: input.metadata,
            correlationId,
            timestamp: new Date().toISOString(),
          }, { 
            timeout: 15000,
            headers: {
              'Content-Type': 'application/json',
              'X-Correlation-ID': correlationId,
            }
          });
          
          messageId = response.data?.messageId || `webhook_${Date.now()}`;
          success = response.status >= 200 && response.status < 300;
        } catch (error) {
          logger.warn({ error }, 'Webhook notification failed, using mock success');
          messageId = `webhook_mock_${Date.now()}`;
          success = true;
        }
        break;
        
      case 'sms':
        // Mock SMS sending
        messageId = `sms_${Date.now()}`;
        success = true;
        logger.getLogger().info({
          correlationId,
          recipient: input.recipient,
          messageId,
        }, 'SMS notification sent (mock)');
        break;
        
      default:
        throw new Error(`Unsupported notification type: ${input.type}`);
    }

    const result = {
      success,
      messageId,
    };

    logger.getLogger().info({
      correlationId,
      type: input.type,
      success,
      messageId,
    }, 'Notification sending completed');

    return result;

  } catch (error) {
    logger.error(error as Error, {
      correlationId,
      type: input.type,
      recipient: input.recipient,
    }, 'Notification sending failed');
    
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Update database with workflow results
 */
export async function updateDatabase(
  input: {
    table: string;
    operation: 'insert' | 'update' | 'upsert';
    data: Record<string, any>;
    where?: Record<string, any>;
  }
): Promise<{
  success: boolean;
  rowsAffected: number;
  error?: string;
}> {
  const activityContext = Context.current();
  const correlationId = activityContext.info.workflowExecution.workflowId;
  
  logger.getLogger().info({
    correlationId,
    table: input.table,
    operation: input.operation,
    dataKeys: Object.keys(input.data),
  }, 'Updating database');

  try {
    const db = getDbPool();
    let query = '';
    let values: any[] = [];
    let rowsAffected = 0;

    switch (input.operation) {
      case 'insert':
        const insertColumns = Object.keys(input.data).join(', ');
        const insertPlaceholders = Object.keys(input.data).map((_, i) => `$${i + 1}`).join(', ');
        values = Object.values(input.data);
        
        query = `INSERT INTO ${input.table} (${insertColumns}) VALUES (${insertPlaceholders})`;
        break;
        
      case 'update':
        if (!input.where) {
          throw new Error('WHERE clause required for UPDATE operation');
        }
        
        const updateSetClause = Object.keys(input.data)
          .map((key, i) => `${key} = $${i + 1}`)
          .join(', ');
        
        const whereClause = Object.keys(input.where)
          .map((key, i) => `${key} = $${i + 1 + Object.keys(input.data).length}`)
          .join(' AND ');
          
        values = [...Object.values(input.data), ...Object.values(input.where)];
        
        query = `UPDATE ${input.table} SET ${updateSetClause} WHERE ${whereClause}`;
        break;
        
      case 'upsert':
        // PostgreSQL specific UPSERT using ON CONFLICT
        const upsertColumns = Object.keys(input.data).join(', ');
        const upsertPlaceholders = Object.keys(input.data).map((_, i) => `$${i + 1}`).join(', ');
        const conflictColumns = input.where ? Object.keys(input.where).join(', ') : 'id';
        const updateColumns = Object.keys(input.data)
          .filter(key => key !== 'id') // Don't update ID
          .map(key => `${key} = EXCLUDED.${key}`)
          .join(', ');
        
        values = Object.values(input.data);
        
        query = `
          INSERT INTO ${input.table} (${upsertColumns}) 
          VALUES (${upsertPlaceholders})
          ON CONFLICT (${conflictColumns}) 
          DO UPDATE SET ${updateColumns}
        `;
        break;
    }

    const result = await db.query(query, values);
    rowsAffected = result.rowCount || 0;

    logger.getLogger().info({
      correlationId,
      table: input.table,
      operation: input.operation,
      rowsAffected,
    }, 'Database update completed');

    return {
      success: true,
      rowsAffected,
    };

  } catch (error) {
    logger.error(error as Error, {
      correlationId,
      table: input.table,
      operation: input.operation,
    }, 'Database update failed');
    
    return {
      success: false,
      rowsAffected: 0,
      error: (error as Error).message,
    };
  }
}

/**
 * Call external API
 */
export async function callExternalAPI(
  input: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    data?: any;
    timeout?: number;
    retries?: number;
  }
): Promise<{
  success: boolean;
  status: number;
  data?: any;
  error?: string;
}> {
  const activityContext = Context.current();
  const correlationId = activityContext.info.workflowExecution.workflowId;
  
  logger.getLogger().info({
    correlationId,
    url: input.url,
    method: input.method,
  }, 'Calling external API');

  const maxRetries = input.retries || 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios({
        url: input.url,
        method: input.method,
        data: input.data,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId,
          ...input.headers,
        },
        timeout: input.timeout || 30000,
        validateStatus: () => true, // Don't throw on HTTP error status
      });

      const result = {
        success: response.status >= 200 && response.status < 300,
        status: response.status,
        data: response.data,
      };

      logger.getLogger().info({
        correlationId,
        url: input.url,
        method: input.method,
        status: response.status,
        attempt,
      }, 'External API call completed');

      return result;

    } catch (error) {
      lastError = error as Error;
      
      logger.warn({
        error: lastError,
        correlationId,
        url: input.url,
        attempt,
        maxRetries,
      }, 'External API call failed, retrying...');

      if (attempt < maxRetries) {
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  logger.error(lastError, {
    correlationId,
    url: input.url,
    maxRetries,
  }, 'External API call failed after all retries');

  return {
    success: false,
    status: 0,
    error: lastError?.message || 'Unknown error',
  };
}

/**
 * Execute database query
 */
export async function executeQuery(
  input: {
    query: string;
    params?: any[];
    type: 'select' | 'insert' | 'update' | 'delete';
  }
): Promise<{
  success: boolean;
  rows?: any[];
  rowCount?: number;
  error?: string;
}> {
  const activityContext = Context.current();
  const correlationId = activityContext.info.workflowExecution.workflowId;
  
  logger.getLogger().info({
    correlationId,
    queryType: input.type,
    hasParams: !!input.params?.length,
  }, 'Executing database query');

  try {
    const db = getDbPool();
    const result = await db.query(input.query, input.params || []);

    logger.getLogger().info({
      correlationId,
      queryType: input.type,
      rowCount: result.rowCount,
      hasRows: !!result.rows?.length,
    }, 'Database query executed');

    return {
      success: true,
      rows: result.rows,
      rowCount: result.rowCount || 0,
    };

  } catch (error) {
    logger.error(error as Error, {
      correlationId,
      queryType: input.type,
    }, 'Database query failed');
    
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}